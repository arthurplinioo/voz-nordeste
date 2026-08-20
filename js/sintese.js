// Orquestra a geração: texto -> sotaque -> normalização -> segmentos -> motor
// de voz -> emenda com as pausas -> transformação de timbre.
//
// Tudo passa por aqui para que a aba de texto e a de voz produzam exatamente o
// mesmo resultado a partir dos mesmos ajustes.

import * as piper from './piper.js';
import * as nuvem from './nuvem.js';
import * as audio from './audio.js';
import * as texto from './texto.js';
import { aplicarSotaque } from './sotaque.js';
import { acharVoz, combinar } from './vozes.js';

// ---------------------------------------------------------------------------
// worker de processamento

let dspWorker = null;
let dspProximoId = 1;
const dspPendentes = new Map();

function garantirDsp() {
  if (dspWorker) return dspWorker;
  try {
    dspWorker = new Worker('js/dsp-worker.js', { type: 'module' });
    dspWorker.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'worker-pronto') return;
      const p = dspPendentes.get(m.reqId);
      if (!p) return;
      if (m.tipo === 'progresso') { if (p.aoProgresso) p.aoProgresso(m.valor); return; }
      dspPendentes.delete(m.reqId);
      if (m.tipo === 'erro') p.rejeitar(new Error(m.msg));
      else p.resolver({ canais: m.canais.map((b) => new Float32Array(b)), taxa: m.taxa });
    };
    dspWorker.onerror = () => {
      // navegador sem worker de módulo: cai para a thread principal
      dspWorker = null;
      for (const p of dspPendentes.values()) p.rejeitar(new Error('worker-indisponivel'));
      dspPendentes.clear();
    };
  } catch (e) {
    dspWorker = null;
  }
  return dspWorker;
}

/** Processa no worker; se não houver worker, processa aqui mesmo. */
async function processarAudio(canais, taxa, opcoes, aoProgresso) {
  const w = garantirDsp();
  if (w) {
    const reqId = dspProximoId++;
    const buffers = canais.map((c) => c.buffer.slice(0));
    try {
      return await new Promise((resolver, rejeitar) => {
        dspPendentes.set(reqId, { resolver, rejeitar, aoProgresso });
        w.postMessage({ tipo: 'processar', reqId, canais: buffers, taxa, opcoes }, buffers);
      });
    } catch (e) {
      if (e.message !== 'worker-indisponivel') throw e;
    }
  }
  const { processar } = await import('./dsp.js');
  return { canais: processar(canais.map((c) => c.slice()), taxa, opcoes, aoProgresso), taxa };
}

// ---------------------------------------------------------------------------
// preparação do texto

/** Aplica sotaque e normalização; é o texto que o motor vai realmente falar. */
export function prepararTexto(bruto, ajustes) {
  const a = ajustes || {};
  let t = bruto;
  t = aplicarSotaque(t, {
    nivel: a.sotaqueNivel || 0,
    variante: a.sotaqueVariante,
    girias: !!a.sotaqueGirias,
    dicionario: a.dicionario || [],
  });
  if (a.normalizarTexto !== false) {
    t = texto.normalizar(t, { soletrarSiglas: a.soletrarSiglas !== false });
  }
  return t;
}

export function planejar(bruto, ajustes) {
  const a = ajustes || {};
  const voz = acharVoz(a.vozId);
  const extra = voz.pausaExtra || 1;
  const preparado = prepararTexto(bruto, a);
  const segmentos = texto.segmentar(preparado, {
    pausaFrase: (a.pausaFrase == null ? 350 : a.pausaFrase) * extra,
    pausaParagrafo: (a.pausaParagrafo == null ? 900 : a.pausaParagrafo) * extra,
    pausaVirgula: (a.pausaVirgula || 0) * extra,
  });
  return { voz, preparado, segmentos };
}

// ---------------------------------------------------------------------------
// geração

class Cancelado extends Error {
  constructor() {
    super('Geração cancelada.');
    this.cancelado = true;
  }
}

export function novoCancelador() {
  const estado = { cancelado: false };
  return {
    estado,
    cancelar() { estado.cancelado = true; },
    conferir() { if (estado.cancelado) throw new Cancelado(); },
  };
}

export function foiCancelado(erro) {
  return !!(erro && erro.cancelado);
}

/**
 * Gera o áudio completo de um texto.
 *
 * @param {string} bruto
 * @param {object} ajustes
 * @param {object} cb  { aoProgresso(fracao, rotulo), cancelador }
 * @returns {Promise<{canais:Float32Array[], taxa:number, preparado:string, segmentos:Array}>}
 */
export async function gerarFala(bruto, ajustes, cb) {
  const c = cb || {};
  const cancelador = c.cancelador || novoCancelador();
  const avisar = (f, r) => { if (c.aoProgresso) c.aoProgresso(Math.max(0, Math.min(1, f)), r); };

  const { voz, preparado, segmentos } = planejar(bruto, ajustes);
  if (!segmentos.length) throw new Error('Não há texto para falar.');

  const trechos = [];
  let taxa = 22050;

  if (ajustes.motor === 'nuvem') {
    const conf = ajustes.nuvem || {};
    if (!conf.chave) throw new Error('Configure a chave do motor na nuvem em Ajustes.');
    if (!conf.vozId) throw new Error('Escolha uma voz da nuvem em Ajustes.');
    // a nuvem cuida da prosódia inteira: mandamos o texto todo de uma vez e só
    // as pausas explícitas viram silêncio no meio
    for (let i = 0; i < segmentos.length; i++) {
      cancelador.conferir();
      avisar(i / segmentos.length, 'Gerando na nuvem ' + (i + 1) + '/' + segmentos.length);
      const mp3 = await nuvem.falar(conf.chave, conf.vozId, segmentos[i].texto, {
        modelo: conf.modelo,
        velocidade: ajustes.velocidade,
        estabilidade: conf.estabilidade,
        similaridade: conf.similaridade,
        estilo: conf.estilo,
      });
      const decodificado = await decodificarBuffer(mp3);
      taxa = decodificado.taxa;
      trechos.push(decodificado);
      if (segmentos[i].pausaMs > 0) {
        trechos.push({ canais: audio.silencio(segmentos[i].pausaMs, taxa, decodificado.canais.length), taxa });
      }
    }
    const emendado = audio.emendar(trechos, taxa);
    avisar(1, 'Pronto');
    return { canais: emendado.canais, taxa: emendado.taxa, preparado, segmentos };
  }

  // motor local (Piper)
  const total = segmentos.length;
  for (let i = 0; i < total; i++) {
    cancelador.conferir();
    const s = segmentos[i];
    avisar((i / total) * 0.8, 'Falando trecho ' + (i + 1) + ' de ' + total);
    const buf = await piper.gerar(s.texto, voz.base);
    const wav = audio.lerWav(buf);
    taxa = wav.taxa;
    let canais = audio.aparar(wav.canais, -50, 25, taxa);
    if (s.enfase) canais = realcar(canais);
    trechos.push({ canais, taxa });
    if (s.pausaMs > 0) {
      trechos.push({ canais: audio.silencio(s.pausaMs, taxa, canais.length), taxa });
    }
  }

  cancelador.conferir();
  const emendado = audio.emendar(trechos, taxa);

  const opcoes = combinar(voz, {
    tom: ajustes.tom,
    formante: ajustes.formante,
    velocidade: ajustes.velocidade,
    picoAlvoDb: ajustes.ganhoDb,
  });

  avisar(0.82, 'Ajustando o timbre');
  const processado = await processarAudio(emendado.canais, emendado.taxa, opcoes, (p) =>
    avisar(0.82 + p * 0.17, 'Ajustando o timbre')
  );

  cancelador.conferir();
  avisar(1, 'Pronto');
  return { canais: processado.canais, taxa: processado.taxa, preparado, segmentos };
}

/** Ênfase: um empurrão de ganho no trecho marcado com *asteriscos*. */
function realcar(canais) {
  return canais.map((c) => {
    const s = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) s[i] = Math.max(-1, Math.min(1, c[i] * 1.28));
    return s;
  });
}

// ---------------------------------------------------------------------------
// voz -> voz

/**
 * Aplica só a transformação de timbre a um áudio já existente (gravação ou
 * arquivo). Não passa por texto: preserva a entonação original.
 */
export async function transformarAudio(canais, taxa, ajustes, cb) {
  const c = cb || {};
  const opcoes = {
    semitons: ajustes.tom || 0,
    formante: ajustes.formante || 0,
    velocidade: ajustes.velocidade || 1,
    efeitos: ajustes.efeitos || {},
    normalizar: ajustes.normalizar !== false,
    picoAlvoDb: ajustes.ganhoDb,
  };
  return processarAudio(canais, taxa, opcoes, c.aoProgresso);
}

// ---------------------------------------------------------------------------
// utilidades

let ctxDecodificacao = null;

export async function decodificarBuffer(arrayBuffer) {
  if (!ctxDecodificacao) {
    ctxDecodificacao = new (window.AudioContext || window.webkitAudioContext)();
  }
  const ab = await ctxDecodificacao.decodeAudioData(arrayBuffer.slice(0));
  const canais = [];
  for (let i = 0; i < ab.numberOfChannels; i++) canais.push(ab.getChannelData(i).slice());
  return { canais, taxa: ab.sampleRate };
}

/** Amostra curta para o usuário ouvir a voz antes de gerar o texto inteiro. */
export const FRASE_AMOSTRA =
  'Rapaz, o sol do sertão é quente, mas o povo daqui é mais quente ainda.';
