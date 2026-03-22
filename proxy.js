// proxy.js — Minimal Node.js CORS proxy for Oura API
// Run: node proxy.js
// Use only if direct browser fetch from localhost:5000 is blocked by CORS.
// Proxies requests to api.ouraring.com, adding CORS headers for localhost:5000.
// Runs on port 5001 (separate from `npx serve` on port 5000).
//
// Usage:
//   1. Start this proxy: node proxy.js
//   2. In browser console, call: import('/js/oura.js').then(m => m.setProxyBase('http://localhost:5001'))
//   3. Then call getHrvData() as normal — all requests route through this proxy transparently.

const http  = require('http');
const https = require('https');

const PROXY_PORT    = 5001;
const OURA_HOSTNAME = 'api.ouraring.com';
const ALLOWED_ORIGIN = 'http://localhost:5000';

http.createServer((req, res) => {
  // CORS preflight + headers on every response
  res.setHeader('Access-Control-Allow-Origin',  ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Forward request to Oura API over HTTPS
  const options = {
    hostname: OURA_HOSTNAME,
    path:     req.url,
    method:   req.method,
    headers:  {
      ...req.headers,
      host: OURA_HOSTNAME  // override host header for correct virtual hosting
    }
  };

  const proxyReq = https.request(options, (apiRes) => {
    // Pass through status and headers from Oura (minus CORS — we set our own)
    const passHeaders = { ...apiRes.headers };
    delete passHeaders['access-control-allow-origin'];  // we set our own above

    res.writeHead(apiRes.statusCode, passHeaders);
    apiRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy.js] Upstream error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
}).listen(PROXY_PORT, () => {
  console.log(`Oura CORS proxy running on http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding to: https://${OURA_HOSTNAME}`);
  console.log('');
  console.log('To use: call setProxyBase("http://localhost:5001") in oura.js before fetching');
});
