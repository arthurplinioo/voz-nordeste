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
    // sem isto o erro do worker também subia como "Uncaught" na página, mesmo
    // já estando tratado aqui
    if (e.preventDefault) e.preventDefault();
    const erro = new Error('Falha no motor de voz: ' + (e.message || 'erro desconhecido'));
    for (const p of pendentes.values()) p.rejeitar(erro);
    pendentes.clear();
    // worker morto: a próxima chamada precisa criar um novo
    try { worker.terminate(); } catch (err) { /* já morto */ }
    worker = null;
  };
}

async function enviar(mensagem, transferiveis) {
  if (!worker) criarWorker();
  await pronto;
  // Entre o `await` e o envio, um reciclar() concorrente pode ter zerado o
  // worker; sem esta segunda checagem o postMessage estourava TypeError.
  if (!worker) {
    criarWorker();
    await pronto;
  }
  const alvo = worker;
  const reqId = proximoId++;
  return new Promise((resolver, rejeitar) => {
    pendentes.set(reqId, { resolver, rejeitar });
    alvo.postMessage(Object.assign({ reqId }, mensagem), transferiveis || []);
  });
}

/** Derruba e recria o worker, devolvendo a memória do WASM. */
export function reciclar() {
  if (worker) {
    // marcado como interrompido para o retry não tentar de novo: reciclar é
    // uma decisão nossa, não uma falha de rede
    const erro = Object.assign(new Error('Geração interrompida.'), { interrompido: true });
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
 *
 * As chamadas são serializadas de propósito. Há um worker só, e as duas abas do
 * app podem pedir geração ao mesmo tempo: sem a fila, os dois fluxos disputavam
 * o mesmo `frasesGeradas` e a reciclagem automática derrubava o worker no meio
 * da requisição do outro.
 *
 * @returns {Promise<ArrayBuffer>}
 */
export function gerar(texto, vozId) {
  const proxima = fila.then(
    () => gerarAgora(texto, vozId),
    () => gerarAgora(texto, vozId) // falha anterior não cancela a próxima
  );
  fila = proxima.catch(() => {});
  return proxima;
}

let fila = Promise.resolve();

const TENTATIVAS = 3;

async function gerarAgora(texto, vozId) {
  if (frasesGeradas >= FRASES_ATE_RECICLAR) reciclar();

  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const r = await enviar({ tipo: 'gerar', texto, vozId });
      frasesGeradas++;
      return r.buf;
    } catch (e) {
      ultimoErro = e;
      // Determinísticos: repetir não muda nada. Voz incompatível é erro de
      // modelo; "interrompido" é o usuário mandando parar — insistir aí
      // custava três tentativas e quase dois segundos de espera antes de dar
      // uma mensagem falsa sobre a conexão.
      if (e.incompativel || e.interrompido) throw e;
      if (tentativa === TENTATIVAS) break;
      // O phonemizador e o runtime do WASM vêm de CDN e são buscados durante a
      // inferência. Uma falha de rede ali derrubava a geração inteira no meio,
      // perdendo tudo que já tinha sido sintetizado. Recicla e tenta de novo.
      reciclar();
      await esperar(600 * tentativa);
    }
  }
  throw new Error(
    'Não consegui gerar este trecho depois de ' + TENTATIVAS + ' tentativas. ' +
    'Verifique a conexão. (' + (ultimoErro && ultimoErro.message) + ')'
  );
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Só para diagnóstico na tela de ajustes. */
export function estado() {
  return { ativo: !!worker, frasesGeradas, pendentes: pendentes.size };
}
