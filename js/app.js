// Interface do Voz Nordeste: liga os controles da tela aos módulos de motor,
// sotaque, processamento e armazenamento.

import * as piper from './piper.js';
import * as nuvem from './nuvem.js';
import * as audio from './audio.js';
import * as bd from './bd.js';
import * as stt from './stt.js';
import * as sintese from './sintese.js';
import * as texto from './texto.js';
import { aplicarSotaque, diferencas, listarVariantes } from './sotaque.js';
import { VOZES, acharVoz, modelosUsados, EFEITOS_RAPIDOS } from './vozes.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// estado

let ajustes = bd.lerAjustes();
let dicionario = bd.lerDicionario();
let modelosBaixados = new Set();
let vozesNuvem = [];
let cancelador = null;

let resultadoTexto = null; // {canais, taxa}
let entradaVoz = null;     // {canais, taxa, blob}
let resultadoVoz = null;   // {canais, taxa}
let gravacao = null;
let reconhecimento = null;

// ---------------------------------------------------------------------------
// recados

function recado(msg, tipo, segundos) {
  const div = document.createElement('div');
  div.className = 'recado' + (tipo ? ' ' + tipo : '');
  div.textContent = msg;
  $('avisos').appendChild(div);
  setTimeout(() => {
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 250);
  }, (segundos || 4) * 1000);
}

function contarErro(e) {
  if (sintese.foiCancelado(e)) return;
  console.error(e);
  recado(e.message || String(e), 'erro', 7);
}

// ---------------------------------------------------------------------------
// tocador

let ctxAudio = null;
function contexto() {
  if (!ctxAudio) ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
  if (ctxAudio.state === 'suspended') ctxAudio.resume();
  return ctxAudio;
}

class Tocador {
  constructor(idCanvas, idBotao, idTempo) {
    this.canvas = $(idCanvas);
    this.botao = $(idBotao);
    this.rotuloTempo = $(idTempo);
    this.buffer = null;
    this.fonte = null;
    this.tocando = false;
    this.inicioCtx = 0;
    this.deslocamento = 0;
    this.animacao = 0;

    this.botao.addEventListener('click', () => this.alternar());
    this.canvas.addEventListener('click', (e) => {
      if (!this.buffer) return;
      const r = this.canvas.getBoundingClientRect();
      this.buscar(((e.clientX - r.left) / r.width) * this.buffer.duration);
    });
    window.addEventListener('resize', () => this.desenhar());
  }

  carregar(canais, taxa) {
    this.parar();
    const ctx = contexto();
    const buf = ctx.createBuffer(canais.length, canais[0].length, taxa);
    for (let c = 0; c < canais.length; c++) buf.copyToChannel(canais[c], c);
    this.buffer = buf;
    this.canais = canais;
    this.deslocamento = 0;
    this.botao.disabled = false;
    this.desenhar();
    this.atualizarTempo();
  }

  limpar() {
    this.parar();
    this.buffer = null;
    this.canais = null;
    this.botao.disabled = true;
    this.desenhar();
    this.atualizarTempo();
  }

  alternar() {
    if (this.tocando) this.pausar();
    else this.tocar();
  }

  tocar() {
    if (!this.buffer || this.tocando) return;
    const ctx = contexto();
    const fonte = ctx.createBufferSource();
    fonte.buffer = this.buffer;
    fonte.connect(ctx.destination);
    fonte.onended = () => {
      if (!this.tocando) return;
      // fim natural: volta para o começo
      this.tocando = false;
      this.deslocamento = 0;
      this.fonte = null;
      this.botao.textContent = '▶';
      this.desenhar();
      this.atualizarTempo();
      cancelAnimationFrame(this.animacao);
    };
    fonte.start(0, Math.min(this.deslocamento, this.buffer.duration - 0.01));
    this.fonte = fonte;
    this.inicioCtx = ctx.currentTime;
    this.tocando = true;
    this.botao.textContent = '❚❚';
    this.animar();
  }

  pausar() {
    if (!this.tocando) return;
    this.deslocamento = this.posicao();
    this.pararFonte();
    this.tocando = false;
    this.botao.textContent = '▶';
    cancelAnimationFrame(this.animacao);
    this.desenhar();
    this.atualizarTempo();
  }

  parar() {
    this.pararFonte();
    this.tocando = false;
    this.deslocamento = 0;
    if (this.botao) this.botao.textContent = '▶';
    cancelAnimationFrame(this.animacao);
  }

  pararFonte() {
    if (this.fonte) {
      this.fonte.onended = null;
      try { this.fonte.stop(); } catch (e) { /* já parada */ }
      this.fonte = null;
    }
  }

  buscar(segundos) {
    const estava = this.tocando;
    this.pararFonte();
    this.tocando = false;
    cancelAnimationFrame(this.animacao);
    this.deslocamento = Math.max(0, Math.min(segundos, this.buffer.duration - 0.05));
    if (estava) this.tocar();
    else { this.desenhar(); this.atualizarTempo(); }
  }

  posicao() {
    if (!this.buffer) return 0;
    if (!this.tocando) return this.deslocamento;
    return Math.min(this.buffer.duration, this.deslocamento + (contexto().currentTime - this.inicioCtx));
  }

  animar() {
    const passo = () => {
      this.desenhar();
      this.atualizarTempo();
      if (this.tocando) this.animacao = requestAnimationFrame(passo);
    };
    passo();
  }

  desenhar() {
    const fracao = this.buffer ? this.posicao() / this.buffer.duration : 0;
    audio.desenharOnda(this.canvas, this.canais, corAcento(), fracao);
  }

  atualizarTempo() {
    const d = this.buffer ? this.buffer.duration : 0;
    this.rotuloTempo.textContent = mmss(this.posicao()) + ' / ' + mmss(d);
  }
}

function mmss(seg) {
  const s = Math.max(0, Math.floor(seg || 0));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function corAcento() {
  return getComputedStyle(document.documentElement).getPropertyValue('--acento').trim() || '#f0a04b';
}

let tocadorTexto = null;
let tocadorEntrada = null;
let tocadorSaida = null;

// ---------------------------------------------------------------------------
// abas

function ligarAbas() {
  const pares = [
    ['aba-texto', 'painel-texto'],
    ['aba-voz', 'painel-voz'],
    ['aba-vozes', 'painel-vozes'],
    ['aba-ajustes', 'painel-ajustes'],
  ];
  for (const [idAba, idPainel] of pares) {
    $(idAba).addEventListener('click', () => {
      for (const [a, p] of pares) {
        const ativo = a === idAba;
        $(a).classList.toggle('ativa', ativo);
        $(a).setAttribute('aria-selected', String(ativo));
        $(p).classList.toggle('ativo', ativo);
        $(p).hidden = !ativo;
      }
      if (idPainel === 'painel-vozes') atualizarPainelVozes();
      // os canvas ficam com largura 0 enquanto escondidos
      requestAnimationFrame(() => {
        tocadorTexto.desenhar();
        tocadorEntrada.desenhar();
        tocadorSaida.desenhar();
      });
    });
  }
}

// ---------------------------------------------------------------------------
// aba texto

const EXEMPLO =
  'O sol do sertão nasce cedo e não pede licença a ninguém.\n\n' +
  'Seu Zé acordou, olhou o céu limpo e disse: hoje o trabalho vai render. ' +
  '[pausa 700] A chuva prometida não veio, mas o povo daqui já aprendeu a *esperar* sem desanimar.\n\n' +
  'Foram 12 dias de espera, R$ 340,00 gastos em água, e nem por isso a fé diminuiu.';

function montarGradeVozes() {
  const grade = $('grade-vozes');
  grade.innerHTML = '';
  for (const v of VOZES) {
    const b = document.createElement('button');
    b.className = 'cartao-voz' + (v.id === ajustes.vozId ? ' ativo' : '');
    b.type = 'button';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = v.nome;
    b.querySelector('span').textContent = v.genero;
    b.addEventListener('click', () => {
      ajustes.vozId = v.id;
      salvar();
      montarGradeVozes();
      $('dica-voz').textContent = v.descricao;
      if (v.sotaqueSugerido) sugerirSotaque(v);
      atualizarPrevia();
    });
    grade.appendChild(b);
  }
  const atual = acharVoz(ajustes.vozId);
  $('dica-voz').textContent = atual.descricao;
}

function sugerirSotaque(voz) {
  const s = voz.sotaqueSugerido;
  ajustes.sotaqueNivel = s.nivel;
  ajustes.sotaqueVariante = s.variante || ajustes.sotaqueVariante;
  if (s.girias != null) ajustes.sotaqueGirias = s.girias;
  $('sotaque-nivel').value = String(ajustes.sotaqueNivel);
  $('sotaque-variante').value = ajustes.sotaqueVariante;
  $('sotaque-girias').checked = !!ajustes.sotaqueGirias;
  rotularSotaque();
  salvar();
}

const NOMES_NIVEL = ['Desligado', 'Leve', 'Médio', 'Forte'];
function rotularSotaque() {
  $('rotulo-sotaque').textContent = NOMES_NIVEL[ajustes.sotaqueNivel] || 'Médio';
}

let temporizadorPrevia = 0;
function agendarPrevia() {
  clearTimeout(temporizadorPrevia);
  temporizadorPrevia = setTimeout(atualizarPrevia, 220);
}

function atualizarPrevia() {
  const bruto = $('entrada-texto').value;
  $('contador').textContent = bruto.length.toLocaleString('pt-BR') + ' caracteres';

  if (!bruto.trim()) {
    $('texto-previa').textContent = '';
    $('mudancas').innerHTML = '';
    $('resumo-previa').textContent = '';
    $('estimativa').textContent = '';
    return;
  }

  const comAjustes = Object.assign({}, ajustes, { dicionario });
  const plano = sintese.planejar(bruto, comAjustes);
  $('texto-previa').textContent = plano.preparado;

  const comSotaque = aplicarSotaque(bruto, {
    nivel: ajustes.sotaqueNivel,
    variante: ajustes.sotaqueVariante,
    girias: ajustes.sotaqueGirias,
    dicionario,
  });
  const mudou = diferencas(bruto, comSotaque);
  $('mudancas').innerHTML = '';
  for (const m of mudou.slice(0, 24)) {
    const span = document.createElement('span');
    span.className = 'mudanca';
    span.innerHTML = '<i></i> → <b></b>';
    span.querySelector('i').textContent = m.de;
    span.querySelector('b').textContent = m.para;
    $('mudancas').appendChild(span);
  }
  $('resumo-previa').textContent =
    plano.segmentos.length + ' trecho' + (plano.segmentos.length === 1 ? '' : 's') +
    (mudou.length ? ' · ' + mudou.length + ' palavra' + (mudou.length === 1 ? '' : 's') + ' com sotaque' : '');

  const ms = texto.estimarDuracao(plano.segmentos, ajustes.velocidade);
  $('estimativa').textContent = 'cerca de ' + texto.formatarDuracao(ms) + ' de áudio';
}

/** Garante que o modelo da voz escolhida está no aparelho. */
async function garantirModelo(modelo, aoProgresso) {
  if (modelosBaixados.has(modelo)) return;
  const ids = await piper.vozesArmazenadas();
  modelosBaixados = new Set(ids);
  if (modelosBaixados.has(modelo)) return;

  recado('Baixando o modelo de voz (uma vez só, ~60 MB).', null, 6);
  const solta = piper.aoProgredirDownload((p) => {
    if (aoProgresso && p.total) aoProgresso(p.carregado / p.total, 'Baixando modelo de voz');
  });
  try {
    await piper.baixarVoz(modelo);
    modelosBaixados.add(modelo);
  } finally {
    solta();
  }
}

function mostrarProgresso(idBarra, idPreenchida, idRotulo) {
  return (fracao, rotulo) => {
    $(idBarra).classList.remove('escondido');
    $(idPreenchida).style.width = Math.round(fracao * 100) + '%';
    $(idRotulo).textContent = (rotulo || '') + ' · ' + Math.round(fracao * 100) + '%';
  };
}

function esconderProgresso(idBarra) {
  $(idBarra).classList.add('escondido');
}

async function gerarTexto(textoBruto, ehAmostra) {
  const bruto = (textoBruto != null ? textoBruto : $('entrada-texto').value).trim();
  if (!bruto) {
    recado('Escreva alguma coisa primeiro.', 'erro');
    return;
  }

  cancelador = sintese.novoCancelador();
  $('btn-gerar').disabled = true;
  $('btn-amostra').disabled = true;
  $('btn-cancelar').classList.remove('escondido');
  const avisar = mostrarProgresso('barra-progresso', 'barra-preenchida', 'barra-rotulo');
  avisar(0, 'Preparando');

  try {
    const comAjustes = Object.assign({}, ajustes, {
      dicionario,
      nuvem: dadosNuvem(),
    });

    if (ajustes.motor !== 'nuvem') {
      await garantirModelo(acharVoz(ajustes.vozId).base, avisar);
    }
    cancelador.conferir();

    const r = await sintese.gerarFala(bruto, comAjustes, { aoProgresso: avisar, cancelador });
    resultadoTexto = { canais: r.canais, taxa: r.taxa };
    tocadorTexto.carregar(r.canais, r.taxa);
    habilitarExportacaoTexto(true);
    if (!ehAmostra) recado('Áudio pronto: ' + mmss(r.canais[0].length / r.taxa) + '.', 'ok');
    tocadorTexto.tocar();
  } catch (e) {
    contarErro(e);
  } finally {
    esconderProgresso('barra-progresso');
    $('btn-gerar').disabled = false;
    $('btn-amostra').disabled = false;
    $('btn-cancelar').classList.add('escondido');
    cancelador = null;
  }
}

function habilitarExportacaoTexto(ligado) {
  $('btn-baixar-wav').disabled = !ligado;
  $('btn-baixar-mp3').disabled = !ligado || !globalThis.lamejs;
  $('btn-salvar-audio').disabled = !ligado;
}

function ligarAbaTexto() {
  const campo = $('entrada-texto');

  campo.addEventListener('input', agendarPrevia);

  $('btn-exemplo').addEventListener('click', () => {
    campo.value = EXEMPLO;
    atualizarPrevia();
  });

  $('btn-limpar').addEventListener('click', () => {
    campo.value = '';
    atualizarPrevia();
    campo.focus();
  });

  $('btn-inserir-pausa').addEventListener('click', () => {
    inserirNoCursor(campo, ' [pausa 600] ');
    atualizarPrevia();
  });

  $('btn-inserir-enfase').addEventListener('click', () => {
    const ini = campo.selectionStart;
    const fim = campo.selectionEnd;
    if (ini === fim) {
      inserirNoCursor(campo, '**');
      campo.selectionStart = campo.selectionEnd = ini + 1;
    } else {
      const sel = campo.value.slice(ini, fim);
      campo.setRangeText('*' + sel + '*', ini, fim, 'end');
    }
    campo.focus();
    atualizarPrevia();
  });

  // sotaque
  $('sotaque-variante').innerHTML = '';
  for (const v of listarVariantes()) {
    const op = document.createElement('option');
    op.value = v.id;
    op.textContent = v.rotulo;
    $('sotaque-variante').appendChild(op);
  }

  ligarFaixa('sotaque-nivel', 'sotaqueNivel', (v) => { rotularSotaque(); return parseInt(v, 10); });
  $('sotaque-variante').addEventListener('change', (e) => {
    ajustes.sotaqueVariante = e.target.value;
    salvar();
    atualizarPrevia();
  });
  $('sotaque-girias').addEventListener('change', (e) => {
    ajustes.sotaqueGirias = e.target.checked;
    salvar();
    atualizarPrevia();
  });

  ligarFaixa('velocidade', 'velocidade', (v) => {
    $('rotulo-velocidade').textContent = Number(v).toFixed(2).replace('.', ',') + '×';
    return parseFloat(v);
  });
  ligarFaixa('tom', 'tom', (v) => {
    $('rotulo-tom').textContent = Number(v).toFixed(1).replace('.', ',');
    return parseFloat(v);
  });
  ligarFaixa('formante', 'formante', (v) => {
    $('rotulo-formante').textContent = Number(v).toFixed(1).replace('.', ',');
    return parseFloat(v);
  });
  ligarFaixa('pausa-frase', 'pausaFrase', (v) => {
    $('rotulo-pausa-frase').textContent = v;
    return parseInt(v, 10);
  });
  ligarFaixa('pausa-paragrafo', 'pausaParagrafo', (v) => {
    $('rotulo-pausa-paragrafo').textContent = v;
    return parseInt(v, 10);
  });
  ligarFaixa('pausa-virgula', 'pausaVirgula', (v) => {
    $('rotulo-pausa-virgula').textContent = v;
    return parseInt(v, 10);
  });

  $('btn-gerar').addEventListener('click', () => gerarTexto());
  $('btn-amostra').addEventListener('click', () => gerarTexto(sintese.FRASE_AMOSTRA, true));
  $('btn-cancelar').addEventListener('click', () => {
    if (cancelador) cancelador.cancelar();
    piper.reciclar();
  });

  $('btn-baixar-wav').addEventListener('click', () => baixarResultado(resultadoTexto, 'wav'));
  $('btn-baixar-mp3').addEventListener('click', () => baixarResultado(resultadoTexto, 'mp3'));
  $('btn-salvar-audio').addEventListener('click', () => salvarNoApp(resultadoTexto, $('entrada-texto').value));

  // presets
  $('btn-salvar-preset').addEventListener('click', () => {
    const nome = $('nome-preset').value.trim();
    if (!nome) { recado('Dê um nome ao preset.', 'erro'); return; }
    bd.salvarPreset(nome, Object.assign({}, ajustes));
    $('nome-preset').value = '';
    montarPresets();
    recado('Preset “' + nome + '” salvo.', 'ok');
  });
  $('btn-aplicar-preset').addEventListener('click', () => {
    const nome = $('lista-presets').value;
    const p = bd.lerPresets().find((x) => x.nome === nome);
    if (!p) return;
    ajustes = Object.assign({}, bd.AJUSTES_PADRAO, p.ajustes);
    salvar();
    aplicarAjustesNaTela();
    recado('Preset “' + nome + '” aplicado.', 'ok');
  });
  $('btn-apagar-preset').addEventListener('click', () => {
    const nome = $('lista-presets').value;
    if (!nome) return;
    bd.apagarPreset(nome);
    montarPresets();
    recado('Preset apagado.');
  });
}

function ligarFaixa(id, chave, aoMudar) {
  const el = $(id);
  el.addEventListener('input', (e) => {
    ajustes[chave] = aoMudar(e.target.value);
    salvar();
    agendarPrevia();
  });
}

function inserirNoCursor(campo, txt) {
  const ini = campo.selectionStart;
  campo.setRangeText(txt, ini, campo.selectionEnd, 'end');
  campo.focus();
}

function montarPresets() {
  const sel = $('lista-presets');
  const atual = sel.value;
  sel.innerHTML = '<option value="">— escolher —</option>';
  for (const p of bd.lerPresets()) {
    const op = document.createElement('option');
    op.value = p.nome;
    op.textContent = p.nome;
    sel.appendChild(op);
  }
  sel.value = atual;
}

// ---------------------------------------------------------------------------
// exportação

function nomeArquivo(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'voz-nordeste-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + ext;
}

function baixarResultado(resultado, formato) {
  if (!resultado) return;
  if (formato === 'mp3') {
    const mp3 = audio.escreverMp3(resultado.canais, resultado.taxa, 128);
    if (!mp3) { recado('O codificador MP3 não carregou. Baixe em WAV.', 'erro'); return; }
    audio.baixar(mp3, nomeArquivo('mp3'), 'audio/mpeg');
  } else {
    audio.baixar(audio.escreverWav(resultado.canais, resultado.taxa), nomeArquivo('wav'), 'audio/wav');
  }
}

async function salvarNoApp(resultado, rotulo) {
  if (!resultado) return;
  try {
    const wav = audio.escreverWav(resultado.canais, resultado.taxa);
    await bd.guardarAudio({
      titulo: (rotulo || '').trim().slice(0, 60) || 'Sem título',
      voz: acharVoz(ajustes.vozId).nome,
      duracao: resultado.canais[0].length / resultado.taxa,
      blob: new Blob([wav], { type: 'audio/wav' }),
    });
    recado('Salvo em “Meus áudios”.', 'ok');
  } catch (e) {
    contarErro(e);
  }
}

// ---------------------------------------------------------------------------
// aba voz -> voz

function modoVoz() {
  const marcado = document.querySelector('input[name="modo-voz"]:checked');
  return marcado ? marcado.value : 'efeitos';
}

const ajustesVoz = { tom: 0, formante: 0, velocidade: 1, efeitos: {}, presetId: 'nenhum' };

function montarGradeEfeitos() {
  const grade = $('grade-efeitos');
  grade.innerHTML = '';
  for (const p of EFEITOS_RAPIDOS) {
    const b = document.createElement('button');
    b.className = 'cartao-voz' + (p.id === ajustesVoz.presetId ? ' ativo' : '');
    b.type = 'button';
    b.innerHTML = '<b></b>';
    b.querySelector('b').textContent = p.nome;
    b.addEventListener('click', () => {
      ajustesVoz.presetId = p.id;
      ajustesVoz.tom = p.semitons;
      ajustesVoz.formante = p.formante;
      ajustesVoz.efeitos = Object.assign({}, p.efeitos);
      $('tom-voz').value = String(p.semitons);
      $('formante-voz').value = String(p.formante);
      $('rotulo-tom-voz').textContent = p.semitons.toFixed(1).replace('.', ',');
      $('rotulo-formante-voz').textContent = p.formante.toFixed(1).replace('.', ',');
      montarGradeEfeitos();
    });
    grade.appendChild(b);
  }
}

function definirEntrada(canais, taxa, blob, descricao) {
  entradaVoz = { canais, taxa, blob };
  tocadorEntrada.carregar(canais, taxa);
  $('info-entrada').textContent = descricao + ' · ' + mmss(canais[0].length / taxa);
  $('btn-transformar').disabled = false;
}

async function transformarVoz() {
  const modo = modoVoz();

  if (modo === 'refalar') {
    const txt = $('texto-transcrito').value.trim();
    if (!txt) { recado('Não há texto transcrito para falar.', 'erro'); return; }
    await gerarRefalado(txt);
    return;
  }

  if (!entradaVoz) { recado('Grave ou carregue um áudio primeiro.', 'erro'); return; }

  const avisar = mostrarProgresso('barra-progresso-voz', 'barra-preenchida-voz', 'barra-rotulo-voz');
  $('btn-transformar').disabled = true;
  avisar(0, 'Processando');

  try {
    if (modo === 'nuvem') {
      const dados = dadosNuvem();
      if (!dados.chave) throw new Error('Configure a chave da nuvem em Ajustes.');
      const vozId = $('voz-nuvem-sts').value;
      if (!vozId) throw new Error('Escolha a voz de destino.');
      avisar(0.3, 'Enviando para a nuvem');
      const blob = entradaVoz.blob || new Blob([audio.escreverWav(entradaVoz.canais, entradaVoz.taxa)], { type: 'audio/wav' });
      const mp3 = await nuvem.converterFala(dados.chave, vozId, blob, {
        limparRuido: $('nuvem-limpar-ruido').checked,
      });
      avisar(0.85, 'Decodificando');
      const r = await sintese.decodificarBuffer(mp3);
      concluirVoz(r.canais, r.taxa);
    } else {
      const r = await sintese.transformarAudio(entradaVoz.canais, entradaVoz.taxa, {
        tom: ajustesVoz.tom,
        formante: ajustesVoz.formante,
        velocidade: ajustesVoz.velocidade,
        efeitos: Object.assign({}, ajustesVoz.efeitos, $('limpar-ruido').checked ? { porta: -42 } : {}),
        ganhoDb: ajustes.ganhoDb,
      }, { aoProgresso: (p) => avisar(p, 'Processando') });
      concluirVoz(r.canais, r.taxa);
    }
    recado('Pronto.', 'ok');
  } catch (e) {
    contarErro(e);
  } finally {
    esconderProgresso('barra-progresso-voz');
    $('btn-transformar').disabled = false;
  }
}

async function gerarRefalado(txt) {
  const avisar = mostrarProgresso('barra-progresso-voz', 'barra-preenchida-voz', 'barra-rotulo-voz');
  $('btn-transformar').disabled = true;
  cancelador = sintese.novoCancelador();
  try {
    const comAjustes = Object.assign({}, ajustes, { dicionario, nuvem: dadosNuvem() });
    if (ajustes.motor !== 'nuvem') await garantirModelo(acharVoz(ajustes.vozId).base, avisar);
    const r = await sintese.gerarFala(txt, comAjustes, { aoProgresso: avisar, cancelador });
    concluirVoz(r.canais, r.taxa);
    recado('Pronto.', 'ok');
  } catch (e) {
    contarErro(e);
  } finally {
    esconderProgresso('barra-progresso-voz');
    $('btn-transformar').disabled = false;
    cancelador = null;
  }
}

function concluirVoz(canais, taxa) {
  resultadoVoz = { canais, taxa };
  tocadorSaida.carregar(canais, taxa);
  $('btn-baixar-wav-voz').disabled = false;
  $('btn-baixar-mp3-voz').disabled = !globalThis.lamejs;
  $('btn-salvar-audio-voz').disabled = false;
  tocadorSaida.tocar();
}

function ligarAbaVoz() {
  montarGradeEfeitos();

  document.querySelectorAll('input[name="modo-voz"]').forEach((r) => {
    r.addEventListener('change', () => {
      const m = modoVoz();
      $('bloco-efeitos').hidden = m !== 'efeitos';
      $('bloco-refalar').hidden = m !== 'refalar';
      $('bloco-nuvem').hidden = m !== 'nuvem';
      $('btn-transformar').disabled = m === 'refalar' ? !$('texto-transcrito').value.trim() : !entradaVoz;
      if (m === 'nuvem') atualizarVozesNuvemSts();
    });
  });

  $('btn-gravar').addEventListener('click', async () => {
    try {
      $('medidor').classList.remove('escondido');
      gravacao = await stt.gravar((n) => {
        $('medidor-nivel').style.width = Math.min(100, n * 240) + '%';
      });
      $('btn-gravar').disabled = true;
      $('btn-parar-gravacao').disabled = false;
      recado('Gravando. Fale e depois clique em Parar.');
    } catch (e) {
      $('medidor').classList.add('escondido');
      contarErro(e);
    }
  });

  $('btn-parar-gravacao').addEventListener('click', async () => {
    if (!gravacao) return;
    try {
      const blob = await gravacao.parar();
      gravacao = null;
      $('btn-gravar').disabled = false;
      $('btn-parar-gravacao').disabled = true;
      $('medidor').classList.add('escondido');
      const r = await audio.decodificarArquivo(blob, contexto());
      definirEntrada(r.canais, r.taxa, blob, 'Gravação do microfone');
    } catch (e) {
      contarErro(e);
    }
  });

  $('arquivo-audio').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const r = await audio.decodificarArquivo(f, contexto());
      definirEntrada(r.canais, r.taxa, f, f.name);
    } catch (err) {
      recado('Não consegui ler esse arquivo de áudio.', 'erro');
    }
    e.target.value = '';
  });

  $('btn-tocar-entrada').addEventListener('click', () => {});

  const faixa = (id, chave, rotulo, formatar) => {
    $(id).addEventListener('input', (e) => {
      ajustesVoz[chave] = parseFloat(e.target.value);
      $(rotulo).textContent = formatar(e.target.value);
      ajustesVoz.presetId = '';
      montarGradeEfeitos();
    });
  };
  faixa('tom-voz', 'tom', 'rotulo-tom-voz', (v) => Number(v).toFixed(1).replace('.', ','));
  faixa('formante-voz', 'formante', 'rotulo-formante-voz', (v) => Number(v).toFixed(1).replace('.', ','));
  faixa('velocidade-voz', 'velocidade', 'rotulo-velocidade-voz', (v) => Number(v).toFixed(2).replace('.', ',') + '×');

  $('btn-transcrever').addEventListener('click', () => {
    if (!stt.suportaReconhecimento()) {
      recado('Este navegador não tem reconhecimento de fala. Use o Chrome, o Edge ou o Safari.', 'erro', 7);
      return;
    }
    const campo = $('texto-transcrito');
    let base = campo.value;
    try {
      reconhecimento = stt.reconhecer({
        aoParcial: (p) => { campo.value = (base + ' ' + p).trim(); },
        aoFinal: (f) => {
          base = (base + ' ' + f).trim();
          campo.value = base;
          $('btn-transformar').disabled = false;
        },
        aoErro: (e) => recado(e.message, 'erro', 6),
        aoFim: () => {
          $('btn-transcrever').disabled = false;
          $('btn-parar-transcricao').disabled = true;
        },
      });
      $('btn-transcrever').disabled = true;
      $('btn-parar-transcricao').disabled = false;
      recado('Pode falar.');
    } catch (e) {
      contarErro(e);
    }
  });

  $('btn-parar-transcricao').addEventListener('click', () => {
    if (reconhecimento) reconhecimento.parar();
    reconhecimento = null;
    $('btn-transcrever').disabled = false;
    $('btn-parar-transcricao').disabled = true;
  });

  $('texto-transcrito').addEventListener('input', () => {
    if (modoVoz() === 'refalar') $('btn-transformar').disabled = !$('texto-transcrito').value.trim();
  });

  $('btn-transformar').addEventListener('click', transformarVoz);
  $('btn-cancelar-voz').addEventListener('click', () => { if (cancelador) cancelador.cancelar(); });

  $('btn-baixar-wav-voz').addEventListener('click', () => baixarResultado(resultadoVoz, 'wav'));
  $('btn-baixar-mp3-voz').addEventListener('click', () => baixarResultado(resultadoVoz, 'mp3'));
  $('btn-salvar-audio-voz').addEventListener('click', () => salvarNoApp(resultadoVoz, 'Voz transformada'));
}

// ---------------------------------------------------------------------------
// aba vozes

async function atualizarPainelVozes() {
  const lista = $('lista-modelos');
  lista.innerHTML = '<p class="dica">Consultando…</p>';
  try {
    const ids = await piper.vozesArmazenadas();
    modelosBaixados = new Set(ids);
  } catch (e) {
    modelosBaixados = new Set();
  }

  lista.innerHTML = '';
  for (const modelo of modelosUsados()) {
    const baixado = modelosBaixados.has(modelo);
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML =
      '<div class="item-texto"><b></b><span></span></div>' +
      '<span class="selo"></span>' +
      '<button class="botao pequeno"></button>';
    item.querySelector('b').textContent = modelo;
    item.querySelector('.item-texto span').textContent = baixado
      ? 'Pronto para usar sem internet.'
      : 'Ainda não baixado (~60 MB).';
    const selo = item.querySelector('.selo');
    selo.textContent = baixado ? 'no aparelho' : 'na nuvem';
    selo.classList.toggle('ok', baixado);

    const botao = item.querySelector('button');
    botao.textContent = baixado ? 'Apagar' : 'Baixar';
    botao.classList.toggle('perigo', baixado);
    botao.addEventListener('click', async () => {
      botao.disabled = true;
      try {
        if (baixado) {
          await piper.removerVoz(modelo);
          recado('Modelo apagado.');
        } else {
          const solta = piper.aoProgredirDownload((p) => {
            if (p.total) botao.textContent = Math.round((p.carregado / p.total) * 100) + '%';
          });
          try { await piper.baixarVoz(modelo); } finally { solta(); }
          recado('Modelo baixado.', 'ok');
        }
        atualizarPainelVozes();
      } catch (e) {
        contarErro(e);
        botao.disabled = false;
      }
    });
    lista.appendChild(item);
  }

  const uso = await bd.espacoUsado();
  $('espaco-usado').textContent = uso
    ? 'Este app usa ' + bd.formatarBytes(uso.usado) + ' do aparelho.'
    : '';

  montarListaVozesDetalhe();
  montarListaAudios();
}

function montarListaVozesDetalhe() {
  const alvo = $('lista-vozes-detalhe');
  alvo.innerHTML = '';
  for (const v of VOZES) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML =
      '<div class="item-texto"><b></b><span></span></div>' +
      '<span class="selo"></span>' +
      '<button class="botao pequeno">Ouvir</button>';
    item.querySelector('b').textContent = v.nome;
    item.querySelector('.item-texto span').textContent = v.descricao;
    item.querySelector('.selo').textContent = v.genero;
    item.querySelector('button').addEventListener('click', async () => {
      ajustes.vozId = v.id;
      salvar();
      montarGradeVozes();
      aplicarAjustesNaTela();
      recado('Gerando amostra de ' + v.nome + '…');
      await gerarTexto(sintese.FRASE_AMOSTRA, true);
    });
    alvo.appendChild(item);
  }
}

async function montarListaAudios() {
  const alvo = $('lista-audios');
  let lista = [];
  try { lista = await bd.listarAudios(); } catch (e) { lista = []; }
  if (!lista.length) {
    alvo.innerHTML = '<p class="dica">Nada salvo ainda.</p>';
    return;
  }
  alvo.innerHTML = '';
  for (const a of lista) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML =
      '<div class="item-texto"><b></b><span></span></div>' +
      '<button class="botao pequeno">Baixar</button>' +
      '<button class="botao pequeno perigo">Apagar</button>';
    item.querySelector('b').textContent = a.titulo;
    item.querySelector('.item-texto span').textContent =
      a.voz + ' · ' + mmss(a.duracao) + ' · ' + new Date(a.criadoEm).toLocaleString('pt-BR');
    const [baixar, apagar] = item.querySelectorAll('button');
    baixar.addEventListener('click', async () => {
      audio.baixar(await a.blob.arrayBuffer(), nomeArquivo('wav'), 'audio/wav');
    });
    apagar.addEventListener('click', async () => {
      await bd.apagarAudio(a.id);
      montarListaAudios();
    });
    alvo.appendChild(item);
  }
}

// ---------------------------------------------------------------------------
// aba ajustes

function dadosNuvem() {
  const c = bd.lerChaveNuvem();
  return {
    chave: c.chave,
    vozId: $('voz-nuvem') ? $('voz-nuvem').value : c.vozId,
    modelo: $('modelo-nuvem') ? $('modelo-nuvem').value : 'eleven_multilingual_v2',
  };
}

function montarDicionario() {
  const alvo = $('lista-dicionario');
  alvo.innerHTML = '';
  if (!dicionario.length) {
    alvo.innerHTML = '<p class="dica">Nenhuma regra ainda.</p>';
    return;
  }
  for (const r of dicionario) {
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = '<div class="item-texto"><b></b><span></span></div><button class="botao pequeno perigo">Remover</button>';
    item.querySelector('b').textContent = r.de + ' → ' + r.para;
    item.querySelector('.item-texto span').textContent = 'sempre que aparecer no texto';
    item.querySelector('button').addEventListener('click', () => {
      dicionario = dicionario.filter((x) => x !== r);
      bd.salvarDicionario(dicionario);
      montarDicionario();
      atualizarPrevia();
    });
    alvo.appendChild(item);
  }
}

function montarModelosNuvem() {
  const sel = $('modelo-nuvem');
  sel.innerHTML = '';
  for (const m of nuvem.MODELOS) {
    const op = document.createElement('option');
    op.value = m.id;
    op.textContent = m.nome;
    sel.appendChild(op);
  }
  const guardado = bd.lerChaveNuvem();
  if (guardado.modelo) sel.value = guardado.modelo;
}

function preencherVozesNuvem() {
  for (const idSel of ['voz-nuvem', 'voz-nuvem-sts']) {
    const sel = $(idSel);
    if (!sel) continue;
    const atual = sel.value;
    sel.innerHTML = '<option value="">— nenhuma —</option>';
    for (const v of vozesNuvem) {
      const op = document.createElement('option');
      op.value = v.id;
      op.textContent = v.nome + (v.categoria === 'cloned' ? ' (clonada)' : '');
      sel.appendChild(op);
    }
    const guardado = bd.lerChaveNuvem();
    sel.value = atual || guardado.vozId || '';
  }
}

function atualizarVozesNuvemSts() {
  const dados = bd.lerChaveNuvem();
  $('aviso-nuvem').textContent = dados.chave
    ? 'Usando a chave configurada em Ajustes. A conversão gasta créditos da sua conta.'
    : 'Configure a chave em Ajustes para usar este modo.';
  if (dados.chave && !vozesNuvem.length) carregarVozesNuvem(dados.chave).catch(() => {});
}

async function carregarVozesNuvem(chave) {
  vozesNuvem = await nuvem.listarVozes(chave);
  preencherVozesNuvem();
}

function ligarAbaAjustes() {
  montarDicionario();
  montarModelosNuvem();

  $('btn-add-dic').addEventListener('click', () => {
    const de = $('dic-de').value.trim();
    const para = $('dic-para').value.trim();
    if (!de || !para) { recado('Preencha os dois campos.', 'erro'); return; }
    dicionario = dicionario.filter((r) => r.de.toLowerCase() !== de.toLowerCase());
    dicionario.push({ de, para });
    bd.salvarDicionario(dicionario);
    $('dic-de').value = '';
    $('dic-para').value = '';
    montarDicionario();
    atualizarPrevia();
  });

  $('normalizar-texto').addEventListener('change', (e) => {
    ajustes.normalizarTexto = e.target.checked;
    salvar();
    atualizarPrevia();
  });
  $('soletrar-siglas').addEventListener('change', (e) => {
    ajustes.soletrarSiglas = e.target.checked;
    salvar();
    atualizarPrevia();
  });

  $('chave-nuvem').addEventListener('change', (e) => {
    const dados = bd.lerChaveNuvem();
    dados.chave = e.target.value.trim();
    bd.salvarChaveNuvem(dados);
  });

  $('btn-verificar-chave').addEventListener('click', async () => {
    const chave = $('chave-nuvem').value.trim();
    if (!chave) { recado('Cole a chave primeiro.', 'erro'); return; }
    $('status-nuvem').textContent = 'Consultando…';
    try {
      const info = await nuvem.verificarChave(chave);
      const dados = bd.lerChaveNuvem();
      dados.chave = chave;
      bd.salvarChaveNuvem(dados);
      await carregarVozesNuvem(chave);
      $('status-nuvem').textContent =
        'Chave válida. Plano ' + info.plano + '. ' +
        (info.limite ? info.usados.toLocaleString('pt-BR') + ' de ' + info.limite.toLocaleString('pt-BR') + ' caracteres usados.' : '');
      ajustes.motor = 'piper';
      recado('Chave verificada. ' + vozesNuvem.length + ' vozes disponíveis.', 'ok');
    } catch (e) {
      $('status-nuvem').textContent = e.message;
      recado(e.message, 'erro', 7);
    }
  });

  $('btn-apagar-chave').addEventListener('click', () => {
    bd.apagarChaveNuvem();
    $('chave-nuvem').value = '';
    vozesNuvem = [];
    preencherVozesNuvem();
    $('status-nuvem').textContent = 'Chave apagada deste navegador.';
    if (ajustes.motor === 'nuvem') { ajustes.motor = 'piper'; salvar(); }
  });

  $('voz-nuvem').addEventListener('change', (e) => {
    const dados = bd.lerChaveNuvem();
    dados.vozId = e.target.value;
    bd.salvarChaveNuvem(dados);
    ajustes.motor = e.target.value ? 'nuvem' : 'piper';
    salvar();
    recado(ajustes.motor === 'nuvem' ? 'A aba Texto → Voz vai usar a nuvem.' : 'Voltando ao motor offline.');
  });

  $('modelo-nuvem').addEventListener('change', (e) => {
    const dados = bd.lerChaveNuvem();
    dados.modelo = e.target.value;
    bd.salvarChaveNuvem(dados);
  });

  let arquivosClone = [];
  $('arquivos-clone').addEventListener('change', (e) => {
    arquivosClone = Array.from(e.target.files || []);
    $('status-clone').textContent = arquivosClone.length + ' arquivo(s) escolhido(s).';
  });

  $('btn-clonar').addEventListener('click', async () => {
    const chave = bd.lerChaveNuvem().chave;
    const nome = $('nome-clone').value.trim();
    if (!chave) { recado('Configure a chave primeiro.', 'erro'); return; }
    if (!nome) { recado('Dê um nome à voz.', 'erro'); return; }
    if (!arquivosClone.length) { recado('Escolha ao menos um arquivo de áudio.', 'erro'); return; }
    $('status-clone').textContent = 'Enviando amostras…';
    try {
      const id = await nuvem.clonarVoz(chave, nome, arquivosClone, 'Criada pelo Voz Nordeste');
      await carregarVozesNuvem(chave);
      $('voz-nuvem').value = id;
      const dados = bd.lerChaveNuvem();
      dados.vozId = id;
      bd.salvarChaveNuvem(dados);
      $('status-clone').textContent = 'Voz “' + nome + '” criada e selecionada.';
      recado('Voz clonada.', 'ok');
    } catch (e) {
      $('status-clone').textContent = e.message;
      recado(e.message, 'erro', 7);
    }
  });

  $('tema').addEventListener('change', (e) => {
    ajustes.tema = e.target.value;
    salvar();
    aplicarTema();
  });

  $('btn-exportar-config').addEventListener('click', () => {
    const pacote = {
      versao: 1,
      ajustes,
      dicionario,
      presets: bd.lerPresets(),
    };
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voz-nordeste-ajustes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('importar-config').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const dados = JSON.parse(await f.text());
      if (dados.ajustes) {
        ajustes = Object.assign({}, bd.AJUSTES_PADRAO, dados.ajustes);
        salvar();
      }
      if (Array.isArray(dados.dicionario)) {
        dicionario = dados.dicionario;
        bd.salvarDicionario(dicionario);
      }
      if (Array.isArray(dados.presets)) {
        for (const p of dados.presets) bd.salvarPreset(p.nome, p.ajustes);
      }
      aplicarAjustesNaTela();
      montarDicionario();
      montarPresets();
      recado('Ajustes importados.', 'ok');
    } catch (err) {
      recado('Arquivo de ajustes inválido.', 'erro');
    }
    e.target.value = '';
  });

  $('sobre-texto').textContent =
    'Voz Nordeste roda inteiro no navegador. O motor offline é o Piper (VITS), ' +
    'e o sotaque é feito reescrevendo o texto para a grafia que produz a pronúncia ' +
    'nordestina. Nenhum texto ou áudio sai do aparelho, exceto quando você usa a ' +
    'transcrição do navegador ou o motor na nuvem — os dois avisam antes.';
}

// ---------------------------------------------------------------------------
// tema e persistência

function aplicarTema() {
  const t = ajustes.tema || 'escuro';
  if (t === 'sistema') {
    const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-tema', escuro ? 'escuro' : 'claro');
  } else {
    document.documentElement.setAttribute('data-tema', t);
  }
  if (tocadorTexto) {
    tocadorTexto.desenhar();
    tocadorEntrada.desenhar();
    tocadorSaida.desenhar();
  }
}

let temporizadorSalvar = 0;
function salvar() {
  clearTimeout(temporizadorSalvar);
  temporizadorSalvar = setTimeout(() => bd.salvarAjustes(ajustes), 200);
}

function aplicarAjustesNaTela() {
  $('sotaque-nivel').value = String(ajustes.sotaqueNivel);
  $('sotaque-variante').value = ajustes.sotaqueVariante;
  $('sotaque-girias').checked = !!ajustes.sotaqueGirias;
  $('velocidade').value = String(ajustes.velocidade);
  $('tom').value = String(ajustes.tom);
  $('formante').value = String(ajustes.formante);
  $('pausa-frase').value = String(ajustes.pausaFrase);
  $('pausa-paragrafo').value = String(ajustes.pausaParagrafo);
  $('pausa-virgula').value = String(ajustes.pausaVirgula);
  $('normalizar-texto').checked = ajustes.normalizarTexto !== false;
  $('soletrar-siglas').checked = ajustes.soletrarSiglas !== false;
  $('tema').value = ajustes.tema || 'escuro';

  rotularSotaque();
  $('rotulo-velocidade').textContent = Number(ajustes.velocidade).toFixed(2).replace('.', ',') + '×';
  $('rotulo-tom').textContent = Number(ajustes.tom).toFixed(1).replace('.', ',');
  $('rotulo-formante').textContent = Number(ajustes.formante).toFixed(1).replace('.', ',');
  $('rotulo-pausa-frase').textContent = ajustes.pausaFrase;
  $('rotulo-pausa-paragrafo').textContent = ajustes.pausaParagrafo;
  $('rotulo-pausa-virgula').textContent = ajustes.pausaVirgula;

  montarGradeVozes();
  aplicarTema();
  atualizarPrevia();
}

// ---------------------------------------------------------------------------
// início

function iniciar() {
  tocadorTexto = new Tocador('onda', 'btn-tocar', 'tempo');
  tocadorEntrada = new Tocador('onda-entrada', 'btn-tocar-entrada', 'tempo-entrada');
  tocadorSaida = new Tocador('onda-saida', 'btn-tocar-saida', 'tempo-saida');

  ligarAbas();
  ligarAbaTexto();
  ligarAbaVoz();
  ligarAbaAjustes();

  const chave = bd.lerChaveNuvem();
  if (chave.chave) {
    $('chave-nuvem').value = chave.chave;
    carregarVozesNuvem(chave.chave).catch(() => {
      $('status-nuvem').textContent = 'Não consegui falar com a nuvem agora.';
    });
  }

  montarPresets();
  aplicarAjustesNaTela();

  if (!globalThis.lamejs) {
    // sem o codificador o botão de MP3 fica desligado, mas o WAV continua
    console.warn('lamejs não carregou; exportação em MP3 desativada.');
  }

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (ajustes.tema === 'sistema') aplicarTema();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // aquece a lista de modelos em segundo plano
  piper.vozesArmazenadas().then((ids) => { modelosBaixados = new Set(ids); }).catch(() => {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
