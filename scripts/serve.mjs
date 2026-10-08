#!/usr/bin/env node
// Minimal static file server for previewing the production build.
//   node scripts/serve.mjs [port] [dir]
// Use Vite's dev server for development; this helper serves a built dist/ directory.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const port = Number(process.argv[2] || 8080);
const root = process.argv[3] || 'dist';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = join(root, normalize(decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) { path = join(path, 'index.html'); info = await stat(path).catch(() => null); }
    if (!info) { res.writeHead(404).end('Not found'); return; }

    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Content-Length': body.length,
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
