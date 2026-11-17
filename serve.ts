// EMBERLINE — serve.ts: a tiny local static server for game/ (Node 22,
// standard library only). `node serve.ts [--port 8080]` then open
// http://localhost:8080. Development convenience only: it refuses paths
// outside game/ and sets the MIME types a browser game needs.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    const path = join(root, rel === '' ? 'index.html' : rel);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end('forbidden'); return; }
    const target = statSync(path).isDirectory() ? join(path, 'index.html') : path;
    response.writeHead(200, { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`EMBERLINE at http://localhost:${port}`));
