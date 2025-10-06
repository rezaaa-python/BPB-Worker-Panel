export async function handleDoH(request) {
    const { method, headers, body } = request;
    const upstream = 'https://1.1.1.1/dns-query'; // Using Cloudflare's resolver

    // The client can send a POST with the query in the body
    // or a GET with the query in the `dns` query parameter.
    const searchParams = new URL(request.url).searchParams;

    let dohRequest;
    if (method === 'POST') {
        dohRequest = new Request(upstream, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/dns-message',
                'Accept': 'application/dns-message',
            },
            body,
        });
    } else if (searchParams.has('dns')) {
        const newUrl = new URL(upstream);
        newUrl.searchParams.set('dns', searchParams.get('dns'));
        dohRequest = new Request(newUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/dns-json',
            },
        });
    } else {
        return new Response('Invalid DoH request', { status: 400 });
    }

    try {
        const response = await fetch(dohRequest);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
        });
    } catch (e) {
        console.error('DoH upstream fetch failed:', e);
        return new Response('Failed to connect to DoH upstream', { status: 502 });
    }
}
