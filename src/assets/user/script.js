document.addEventListener('DOMContentLoaded', () => {
    const userId = window.location.pathname.split('/')[1];

    // Set subscription links
    const xrayLink = document.getElementById('xray-link');
    const singboxLink = document.getElementById('singbox-link');
    const clashLink = document.getElementById('clash-link');

    const baseUrl = `${window.location.protocol}//${window.location.host}`;
    xrayLink.value = `${baseUrl}/xray/${userId}`;
    singboxLink.value = `${baseUrl}/sb/${userId}`;
    clashLink.value = `${baseUrl}/clash/${userId}`;

    // Copy button functionality
    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetInput = document.getElementById(button.dataset.target);
            targetInput.select();
            document.execCommand('copy');
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = 'Copy';
            }, 2000);
        });
    });

    // Fetch and display network info
    const refreshInfoBtn = document.getElementById('refresh-info-btn');
    refreshInfoBtn.addEventListener('click', fetchNetworkInfo);

    function fetchNetworkInfo() {
        // Reset fields
        document.getElementById('client-ip').textContent = 'Loading...';
        document.getElementById('client-isp').textContent = 'Loading...';
        document.getElementById('client-location').textContent = 'Loading...';
        document.getElementById('client-risk').textContent = 'Loading...';
        document.getElementById('proxy-ip').textContent = 'Loading...';

        fetch(`/${userId}/info`)
            .then(response => response.json())
            .then(data => {
                const { clientInfo, proxyInfo } = data;

                // Client info
                document.getElementById('client-ip').textContent = clientInfo.query || 'N/A';
                document.getElementById('client-isp').textContent = clientInfo.isp || 'N/A';
                document.getElementById('client-location').textContent = `${clientInfo.city || ''}, ${clientInfo.country || ''}`;
                const riskScore = clientInfo.risk === "high" ? `High (${clientInfo.risk_score})` : (clientInfo.risk || 'N/A');
                document.getElementById('client-risk').textContent = riskScore;


                // Proxy info
                document.getElementById('proxy-ip').textContent = proxyInfo.ip || 'N/A';
            })
            .catch(error => {
                console.error('Error fetching network info:', error);
                alert('Failed to load network information.');
            });
    }

    // Initial fetch
    fetchNetworkInfo();
});
