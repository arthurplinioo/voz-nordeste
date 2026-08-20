// Fachada do motor Piper na thread principal: fala com o worker por mensagens,
// controla a fila de geração e recicla o worker de tempos em tempos.
//
// A reciclagem não é frescura: o vits-web vaza uma InferenceSession por frase.
// O worker já reaproveita a sessão (ver piper-worker.src.js), mas o WASM ainda
// acumula arena de memória. Trocar o worker inteiro a cada N frases devolve
// tudo ao sistema operacional e é imperceptível para quem está usando.

const CAMINHO_WORKER = 'js/piper-worker.bundle.js';
const FRASES_ATE_RECICLAR = 40;

let worker = null;
let proximoId = 1;
let pendentes = new Map();
let frasesGeradas = 0;
let prontoResolve = null;
let pronto = null;

const ouvintes = { progressoDownload: [] };

function criarWorker() {
  worker = new Worker(CAMINHO_WORKER);
  pronto = new Promise((r) => { prontoResolve = r; });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.tipo === 'worker-pronto') {
      if (prontoResolve) prontoResolve();
      return;
    }
    if (m.tipo === 'progresso-download') {
      for (const fn of ouvintes.progressoDownload) fn(m);
      return;
    }
    const p = pendentes.get(m.reqId);
    if (!p) return;
    pendentes.delete(m.reqId);
    if (m.tipo === 'erro') p.rejeitar(Object.assign(new Error(m.msg), { incompativel: m.incompativel }));
    else p.resolver(m);
  };
  worker.onerror = (e) => {
    const erro = new Error('Falha no motor de voz: ' + (e.message || 'erro desconhecido'));
    for (const p of pendentes.values()) p.rejeitar(erro);
    pendentes.clear();
  };
}

async function enviar(mensagem, transferiveis) {
  if (!worker) criarWorker();
  await pronto;
  const reqId = proximoId++;
  return new Promise((resolver, rejeitar) => {
    pendentes.set(reqId, { resolver, rejeitar });
    worker.postMessage(Object.assign({ reqId }, mensagem), transferiveis || []);
  });
}

/** Derruba e recria o worker, devolvendo a memória do WASM. */
export function reciclar() {
  if (worker) {
    const erro = new Error('Geração interrompida.');
    for (const p of pendentes.values()) p.rejeitar(erro);
    pendentes.clear();
    worker.terminate();
    worker = null;
  }
  frasesGeradas = 0;
}

export function aoProgredirDownload(fn) {
  ouvintes.progressoDownload.push(fn);
  return () => {
    const i = ouvintes.progressoDownload.indexOf(fn);
    if (i >= 0) ouvintes.progressoDownload.splice(i, 1);
  };
}

export async function listarVozes() {
  const r = await enviar({ tipo: 'vozes' });
  return r.lista;
}

export async function vozesArmazenadas() {
  const r = await enviar({ tipo: 'armazenadas' });
  return r.ids;
}

export async function baixarVoz(vozId) {
  await enviar({ tipo: 'baixar', vozId });
}

export async function removerVoz(vozId) {
  const r = await enviar({ tipo: 'remover', vozId });
  if (r.restou) throw new Error('Não foi possível apagar o modelo agora. Recarregue a página e tente de novo.');
}

export async function limparTudo() {
  await enviar({ tipo: 'limpar-tudo' });
}

/**
 * Gera o WAV de um trecho de texto.
 * @returns {Promise<ArrayBuffer>}
 */
export async function gerar(texto, vozId) {
  if (frasesGeradas >= FRASES_ATE_RECICLAR) reciclar();
  const r = await enviar({ tipo: 'gerar', texto, vozId });
  frasesGeradas++;
  return r.buf;
}

/** Só para diagnóstico na tela de ajustes. */
export function estado() {
  return { ativo: !!worker, frasesGeradas, pendentes: pendentes.size };
}
