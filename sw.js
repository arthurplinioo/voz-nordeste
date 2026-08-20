// Service worker: deixa o app abrir sem internet.
//
// Duas políticas. A concha do app (HTML, CSS, JS) é pré-cacheada na instalação
// e servida do cache — é o que garante abrir offline. As dependências de CDN do
// motor neural (onnxruntime e o phonemizador) e os modelos de voz são grandes e
// imutáveis, então vão para um cache separado, gravado na primeira vez que
// forem pedidos.

const VERSAO = 'v1';
const CACHE_CONCHA = 'voz-nordeste-concha-' + VERSAO;
const CACHE_MOTOR = 'voz-nordeste-motor-' + VERSAO;

const CONCHA = [
  './',
  'index.html',
  'css/estilo.css',
  'js/app.js',
  'js/audio.js',
  'js/bd.js',
  'js/dsp.js',
  'js/dsp-worker.js',
  'js/nuvem.js',
  'js/piper.js',
  'js/piper-worker.bundle.js',
  'js/sintese.js',
  'js/sotaque.js',
  'js/stt.js',
  'js/texto.js',
  'js/vozes.js',
  'vendor/lame.min.js',
  'manifest.webmanifest',
  'icones/icone-192.png',
  'icones/icone-512.png',
];

const HOSTS_MOTOR = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.hf.co',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_CONCHA).then(async (cache) => {
      // addAll aborta tudo se um único arquivo falhar; guardamos um a um para
      // que uma falha isolada não deixe o app sem cache nenhum
      await Promise.all(
        CONCHA.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      );
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(async (chaves) => {
      await Promise.all(
        chaves
          .filter((c) => c.startsWith('voz-nordeste-') && c !== CACHE_CONCHA && c !== CACHE_MOTOR)
          .map((c) => caches.delete(c))
      );
      await self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // a API da ElevenLabs nunca deve ser cacheada
  if (url.hostname.endsWith('elevenlabs.io')) return;

  if (HOSTS_MOTOR.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(cacheDepoisRede(req, CACHE_MOTOR));
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(cacheDepoisRede(req, CACHE_CONCHA));
  }
});

async function cacheDepoisRede(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(req, { ignoreSearch: false });
  if (guardado) return guardado;

  try {
    const resposta = await fetch(req);
    // respostas parciais (206) não podem ir para o cache
    if (resposta && (resposta.ok || resposta.type === 'opaque') && resposta.status !== 206) {
      cache.put(req, resposta.clone()).catch(() => {});
    }
    return resposta;
  } catch (e) {
    const alternativa = await cache.match(req, { ignoreSearch: true });
    if (alternativa) return alternativa;
    if (req.mode === 'navigate') {
      const inicio = await cache.match('index.html');
      if (inicio) return inicio;
    }
    throw e;
  }
}
