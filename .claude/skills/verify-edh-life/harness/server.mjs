// Serves the life-tracker folder over plain HTTP on 127.0.0.1. Each verification run gets its own server on a free
// port, so two runs, or a run and the dev server on 8766, never share an origin or its localStorage.
import http from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
};

export async function serve(root, port = 0) {
  root = path.resolve(root);
  const server = http.createServer(async (req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    try {
      const st = await fs.stat(file);
      if (!st.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      createReadStream(file).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((ok, fail) => server.once('error', fail).listen(port, '127.0.0.1', ok));
  const actual = server.address().port;
  return { url: `http://127.0.0.1:${actual}/`, port: actual, close: () => new Promise(r => server.close(r)) };
}
