import { isValidUUID } from "#common/handlers";
export const globalConfig = {
	assets: {}
};
export const httpConfig = {};
export const wsConfig = {};

export function init(request, env, assets) {
    const { pathname } = new URL(request.url);
    const { UUID, TR_PASS, FALLBACK, DOH_URL } = env;

    if (!isValidUUID(env.UUID)) {
        throw new Error(`Invalid or missing UUID. Please set a valid UUID in your environment variables. You can generate one at https://www.uuidgenerator.net/`, { cause: "init" });
    }

    Object.assign(globalConfig, {
        env,
		assets,
        pathName: pathname,
        uuid: env.UUID,
        trojanPass: TR_PASS || '',
        fallbackDomain: FALLBACK || "www.google.com",
        dohURL: DOH_URL || "https://1.1.1.1/dns-query"
    });
}

export function initWs(env) {
    Object.assign(wsConfig, {
        defaultProxyIPs: [atob('YnBiLnlvdXNlZi5pc2VnYXJvLmNvbQ==')],
        defaultPrefixes: [
            'WzJhMDI6ODk4OjE0Njo2NDo6XQ==',
            'WzI2MDI6ZmM1OTpiMDo2NDo6XQ==',
            'WzI2MDI6ZmM1OToxMTo2NDo6XQ=='
        ].map(atob),
        envProxyIPs: env.PROXY_IP,
        envPrefixes: env.PREFIX
    });
}

export function initHttp(request, env) {
    const { pathname, origin, search } = new URL(request.url);
    const { SUB_PATH, kv } = env;
    const { uuid, trojanPass } = globalConfig;
    const searchParams = new URLSearchParams(search);

    if (!['/secrets', '/favicon.ico'].includes(pathname)) {
        if (!uuid || !trojanPass) throw new Error(`Please set UUID and ${atob('VHJvamFu')} password first. Please visit <a href="${origin}/secrets" target="_blank">here</a> to generate them.`, { cause: "init" });
        if (typeof kv !== 'object') throw new Error(`KV Dataset is not properly set! Please refer to <a href="${atob('aHR0cHM6Ly9iaWEtcGFpbi1iYWNoZS5naXRodWIuaW8vQlBCLVdvcmtlci1QYW5lbC8=')}" target="_blank">tutorials</a>.`, { cause: "init" });
    }

    Object.assign(httpConfig, {
        panelVersion: __VERSION__,
        defaultHttpPorts: [80, 8080, 2052, 2082, 2086, 2095, 8880],
        defaultHttpsPorts: [443, 8443, 2053, 2083, 2087, 2096],
        hostName: request.headers.get('Host'),
        client: searchParams.get('app'),
        urlOrigin: origin,
        subPath: SUB_PATH || uuid
    });
}