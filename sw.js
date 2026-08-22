// Service worker: deixa o app abrir sem internet.
//
// Duas políticas. A concha do app (HTML, CSS, JS) é pré-cacheada na instalação
// e servida do cache — é o que garante abrir offline. As dependências de CDN do
// motor neural (onnxruntime e o phonemizador) e os modelos de voz são grandes e
// imutáveis, então vão para um cache separado, gravado na primeira vez que
// forem pedidos.

// Suba este número a cada publicação: é ele que descarta o cache velho.
const VERSAO = 'v3';
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

  // Modelos de voz e runtime do WASM: são imutáveis e enormes. Cache primeiro,
  // sempre — nunca mudam de conteúdo sob a mesma URL.
  if (HOSTS_MOTOR.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(cacheDepoisRede(req, CACHE_MOTOR));
    return;
  }

  // A concha do app usa stale-while-revalidate: responde na hora com o que tem
  // e atualiza o cache em segundo plano. Com a política anterior (cache
  // primeiro, sem hash no nome dos arquivos), publicar uma correção não chegava
  // a ninguém que já tivesse aberto o site — a versão velha ficava presa até a
  // pessoa limpar o armazenamento na mão.
  if (url.origin === location.origin) {
    e.respondWith(cacheEnquantoRevalida(req, CACHE_CONCHA));
  }
});

async function cacheEnquantoRevalida(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(req);

  const daRede = fetch(req)
    .then((resposta) => {
      if (resposta && resposta.ok && resposta.status !== 206) {
        cache.put(req, resposta.clone()).catch(() => {});
        if (guardado) avisarSeMudou(req, guardado, resposta.clone());
      }
      return resposta;
    })
    .catch(() => null);

  if (guardado) return guardado;
  const resposta = await daRede;
  if (resposta) return resposta;
  if (req.mode === 'navigate') {
    const inicio = await cache.match('index.html');
    if (inicio) return inicio;
  }
  return new Response('Sem conexão e sem cópia guardada.', { status: 504 });
}

/** Avisa as abas abertas quando um arquivo da concha mudou de verdade. */
async function avisarSeMudou(req, antiga, nova) {
  try {
    const [a, b] = await Promise.all([antiga.clone().text(), nova.text()]);
    if (a === b) return;
    const clientes = await self.clients.matchAll({ type: 'window' });
    for (const c of clientes) c.postMessage({ tipo: 'nova-versao' });
  } catch (e) {
    // resposta binária ou já consumida: sem aviso, o cache já foi atualizado
  }
}

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
