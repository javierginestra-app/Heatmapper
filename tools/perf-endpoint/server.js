/**
 * Reference owned test endpoint for Heat Mapper Live (protocol hm-perf v1).
 * No dependencies. Run on a LAN machine or a server you control:
 *   node tools/perf-endpoint/server.js [port]      (default 8787)
 * Endpoints: GET /hm/v1/info, GET /hm/v1/ping, GET /hm/v1/download?bytes=N, POST /hm/v1/upload
 */
const http = require('http');
const os = require('os');

const MAX_BYTES = 200 * 1024 * 1024;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Random ASCII so transparent compression cannot inflate the measured throughput.
const BLOCK = Buffer.from(Array.from({ length: 64 * 1024 }, () => ALPHABET[Math.floor(Math.random() * 64)]).join(''), 'ascii');

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

function createPerfServer({ endpointId = os.hostname() } = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/hm/v1/info') {
      return send(res, 200, JSON.stringify({ protocol: 'hm-perf', version: 1, endpointId }), 'application/json');
    }
    if (req.method === 'GET' && url.pathname === '/hm/v1/ping') return send(res, 200, 'pong', 'text/plain');
    if (req.method === 'GET' && url.pathname === '/hm/v1/download') {
      const bytes = Number(url.searchParams.get('bytes'));
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) return send(res, 400, 'bad bytes', 'text/plain');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes, 'Cache-Control': 'no-store' });
      let left = bytes;
      const pump = () => {
        while (left > 0) {
          const chunk = BLOCK.subarray(0, Math.min(left, BLOCK.length));
          left -= chunk.length;
          if (!res.write(chunk)) return res.once('drain', pump);
        }
        res.end();
      };
      return pump();
    }
    if (req.method === 'POST' && url.pathname === '/hm/v1/upload') {
      let received = 0;
      req.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_BYTES) req.destroy();
      });
      req.on('end', () => send(res, 200, JSON.stringify({ received }), 'application/json'));
      return undefined;
    }
    return send(res, 404, 'not found', 'text/plain');
  });
}

module.exports = { createPerfServer };

if (require.main === module) {
  const port = Number(process.argv[2] ?? 8787);
  createPerfServer().listen(port, () => console.warn(`hm-perf v1 endpoint listening on port ${port}`));
}
