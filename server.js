// server.js — Combined static file server + Oura CORS proxy
// Run: node server.js
// Serves the app on http://localhost:5000
// Routes /api/oura/* requests to api.ouraring.com (CORS proxy)
// Opens Chrome automatically on first run

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT          = 5000;
const OURA_HOSTNAME = 'api.ouraring.com';
const ROOT_DIR      = __dirname;

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res) {
  let filePath = path.join(ROOT_DIR, req.url === '/' ? 'index.html' : req.url);

  // Remove query string
  filePath = filePath.split('?')[0];

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    // If file not found or is directory, serve index.html (SPA fallback)
    if (err || stats.isDirectory()) {
      filePath = path.join(ROOT_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

function proxyOura(req, res) {
  // Strip /api/oura prefix to get the real Oura API path
  const ouraPath = req.url.replace(/^\/api\/oura/, '');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const options = {
    hostname: OURA_HOSTNAME,
    path:     ouraPath,
    method:   req.method,
    headers:  {
      ...req.headers,
      host: OURA_HOSTNAME
    }
  };

  const proxyReq = https.request(options, (apiRes) => {
    const passHeaders = { ...apiRes.headers };
    delete passHeaders['access-control-allow-origin'];
    res.writeHead(apiRes.statusCode, passHeaders);
    apiRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[server] Oura proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/oura')) {
    proxyOura(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`ResonanceHRV running at http://localhost:${PORT}`);

  // Open Chrome automatically
  const { exec } = require('child_process');
  exec(`start chrome http://localhost:${PORT}`);
});
