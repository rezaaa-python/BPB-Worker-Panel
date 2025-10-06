import { globalConfig, init, initHttp, initWs } from './common/init';
import { fallback, serveIcon, renderSecrets, handlePanel, handleSubscriptions, handleLogin, handleError, handleWebsocket as handleWs } from './common/handlers';
import { logout } from './auth';
import panel from "./assets/panel/index.html";
import secrets_page from "./assets/secrets/index.html";
import secrets_script from "./assets/secrets/script.js";
import secrets_style from "./assets/secrets/style.css";
import admin_page from "./assets/admin/index.html";
import admin_script from "./assets/admin/script.js";
import admin_style from "./assets/admin/style.css";
import user_page from "./assets/user/index.html";
import user_script from "./assets/user/script.js";
import user_style from "./assets/user/style.css";
import { get_clash_config, get_sing_box_config, get_xray_config } from './configs/utils';
import { handleDoH } from './doh';

const Touched = Symbol.for("Touched");

async function handleAdmin(url, request, env) {
	const adminApiRegex = /^\/admin\/api\/(.*)$/;
	const adminApiMatch = url.pathname.match(adminApiRegex);

	if (adminApiMatch) {
		return handleAdminApi(request, env, adminApiMatch[1]);
	}

	switch (url.pathname) {
		case "/admin/":
		case "/admin":
			return new Response(admin_page, {
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		case "/admin/script.js":
			return new Response(admin_script, {
				status: 200,
				headers: { "Content-Type": "application/javascript; charset=utf-8" },
			});
		case "/admin/style.css":
			return new Response(admin_style, {
				status: 200,
				headers: { "Content-Type": "text/css; charset=utf-8" },
			});
		default:
			return new Response("Not Found", { status: 404 });
	}
}

async function handleAdminApi(request, env, apiPath) {
	const { D1, ADMIN_KEY, KV } = env;

	// Authentication
	const authHeader = request.headers.get("Authorization") || "";
	if (authHeader !== `Bearer ${ADMIN_KEY}`) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	const userIdRegex = /^users\/(.*)$/;
	const userIdMatch = apiPath.match(userIdRegex);

	try {
		// Ensure table exists
		await D1.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				expiration_timestamp INTEGER NOT NULL,
				status TEXT NOT NULL,
				notes TEXT,
				created_at INTEGER NOT NULL
			);
		`);

		if (apiPath === "users" && request.method === "GET") {
			const { results } = await D1.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
			return new Response(JSON.stringify(results), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		if (apiPath === "users" && request.method === "POST") {
			const { id, expiration_timestamp, notes } = await request.json();
			const userId = id || crypto.randomUUID();
			const now = Math.floor(Date.now() / 1000);
			const status = expiration_timestamp > now ? "active" : "expired";

			// Check if user exists for upsert
			const existingUser = await D1.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();

			if (existingUser) {
				await D1.prepare(
					"UPDATE users SET expiration_timestamp = ?, status = ?, notes = ? WHERE id = ?"
				).bind(expiration_timestamp, status, notes, userId).run();
			} else {
				await D1.prepare(
					"INSERT INTO users (id, expiration_timestamp, status, notes, created_at) VALUES (?, ?, ?, ?, ?)"
				).bind(userId, expiration_timestamp, status, notes, now).run();
			}
			
			// Invalidate KV cache
			await KV.delete(`user:${userId}`);

			return new Response(JSON.stringify({ success: true, id: userId }), { status: 201 });
		}

		if (userIdMatch && request.method === "DELETE") {
			const userId = userIdMatch[1];
			await D1.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
			// Also invalidate KV cache
			await KV.delete(`user:${userId}`);
			return new Response(null, { status: 204 });
		}

		return new Response(JSON.stringify({ error: "Not Found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		});
	} catch (e) {
		console.error("D1 Error:", e);
		return new Response(JSON.stringify({ error: e.message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}

async function handleUserPage(url, env, userId) {
	switch (url.pathname) {
		case `/${userId}`:
		case `/${userId}/`:
			return new Response(user_page, {
				status: 200,
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		case `/${userId}/script.js`:
			return new Response(user_script, {
				status: 200,
				headers: { "Content-Type": "application/javascript; charset=utf-8" },
			});
		case `/${userId}/style.css`:
			return new Response(user_style, {
				status: 200,
				headers: { "Content-Type": "text/css; charset=utf-8" },
			});
		case `/${userId}/info`: {
			const clientIp = globalConfig.clientIp;
			const res = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,message,country,regionName,city,isp,org,as,query,risk`);
			const clientInfo = await res.json();
			const proxyInfo = {
				ip: globalConfig.proxyIP,
			};
			return new Response(JSON.stringify({ clientInfo, proxyInfo }), {
				headers: { "Content-Type": "application/json" },
			});
		}
		case `/xray/${userId}`:
			return new Response(get_xray_config(userId, env));
		case `/sb/${userId}`:
			return new Response(get_sing_box_config(userId, env));
		case `/clash/${userId}`:
			return new Response(get_clash_config(userId, env));
		default:
			return null;
	}
}

async function isValidUser(uuid, env) {
	const { KV, D1 } = env;
	const cacheKey = `user:${uuid}`;

	// 1. Check KV cache first
	const cachedStatus = await KV.get(cacheKey);
	if (cachedStatus) {
		return cachedStatus === 'valid';
	}

	// 2. If not in cache, query D1
	try {
		const user = await D1.prepare("SELECT expiration_timestamp, status FROM users WHERE id = ?").bind(uuid).first();

		if (!user) {
			await KV.put(cacheKey, 'invalid', { expiration: 3600 }); // Cache invalid for 1 hour
			return false;
		}

		const isExpired = user.expiration_timestamp < Math.floor(Date.now() / 1000);
		const isActive = user.status === 'active';

		if (!isExpired && isActive) {
			const remainingTime = user.expiration_timestamp - Math.floor(Date.now() / 1000);
			await KV.put(cacheKey, 'valid', { expiration: Math.max(60, remainingTime) }); // Cache for remaining time
			return true;
		} else {
			await KV.put(cacheKey, 'invalid', { expiration: 3600 }); // Cache invalid for 1 hour
			return false;
		}
	} catch (e) {
		console.error("D1 validation error:", e);
		return false; // Fail closed
	}
}

async function handleWebsocket(request, env) {
	const url = new URL(request.url);
	const userID = url.pathname.match
		(
			/^\/([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})$/
		)?.[1];

	if (!userID || !(await isValidUser(userID, env))) {
		return new Response('Unauthorized', { status: 401 });
	}
	
	return handleWs(request);
}

export default {
	async fetch(request, env, ctx) {
		try {
			const upgradeHeader = request.headers.get('Upgrade');
			init(request, env);

			if (upgradeHeader === 'websocket') {
				initWs(env);
				return await handleWebsocket(request, env);
			} else {
				initHttp(request, env);
				const url = new URL(request.url);
				const path = url.pathname;

				if (path.startsWith('/admin')) return await handleAdmin(url, request, env);
				if (path.startsWith('/dns-query')) return await handleDoH(request);
				
				const userIdMatch = path.match(/^\/([0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12})/);
				if (userIdMatch) {
					const userResponse = await handleUserPage(url, env, userIdMatch[1]);
					if (userResponse) return userResponse;
				}
				
				// Legacy paths
				if (path.startsWith('/panel')) return await handlePanel(request, env);
				if (path.startsWith('/sub')) return await handleSubscriptions(request, env);
				if (path.startsWith('/login')) return await handleLogin(request, env);
				if (path.startsWith('/logout')) return await logout(request, env);
				if (path.startsWith('/secrets')) return await renderSecrets();
				if (path.startsWith('/favicon.ico')) return await serveIcon();
				
				return await fallback(request);
			}

		} catch (error) {
			return await handleError(error);
		}
	}
}