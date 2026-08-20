// Servidor estático de desenvolvimento. O app é só arquivos, mas precisa ser
// servido por HTTP: módulos ES, service worker e OPFS não funcionam em file://.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = Number(process.env.PORTA) || 4173;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
};

createServer(async (req, res) => {
  try {
    const caminhoUrl = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let alvo = normalize(join(RAIZ, caminhoUrl));
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end('403');
      return;
    }
    let info = await stat(alvo).catch(() => null);
    if (info && info.isDirectory()) {
      alvo = join(alvo, 'index.html');
      info = await stat(alvo).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    const corpo = await readFile(alvo);
    res.writeHead(200, {
      'Content-Type': TIPOS[extname(alvo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(corpo);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(e.message || e));
  }
}).listen(PORTA, () => {
  console.log('Voz Nordeste em http://localhost:' + PORTA);
});
