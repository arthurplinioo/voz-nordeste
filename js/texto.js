// Preparação do texto antes da síntese: normalização (números, siglas, moeda),
// leitura das marcações do usuário ([pausa], *ênfase*) e quebra em segmentos.
//
// Por que normalizar: o eSpeak lê "R$ 1.234,56" como "erre cifrão um ponto dois
// três quatro vírgula cinco seis". Escrever por extenso antes resolve, e ainda
// deixa o texto disponível para o motor de sotaque trabalhar em cima.

// ---------------------------------------------------------------------------
// número por extenso (pt-BR)

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const ESCALAS = [
  { valor: 1000000000000, sing: 'trilhão', plur: 'trilhões' },
  { valor: 1000000000, sing: 'bilhão', plur: 'bilhões' },
  { valor: 1000000, sing: 'milhão', plur: 'milhões' },
  { valor: 1000, sing: 'mil', plur: 'mil' },
];

/** Converte um inteiro (0 a 999 trilhões) para extenso em pt-BR. */
export function numeroPorExtenso(n, feminino) {
  n = Math.trunc(Math.abs(n));
  if (n === 0) return 'zero';
  if (n < 10) {
    if (feminino && n === 1) return 'uma';
    if (feminino && n === 2) return 'duas';
    return UNIDADES[n];
  }
  if (n < 20) return DEZ_A_DEZENOVE[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return DEZENAS[d] + (u ? ' e ' + numeroPorExtenso(u, feminino) : '');
  }
  if (n < 1000) {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100);
    const r = n % 100;
    let cab = CENTENAS[c];
    if (feminino && c === 2) cab = 'duzentas';
    if (feminino && c === 3) cab = 'trezentas';
    if (feminino && c >= 4 && c !== 5) cab = cab.replace(/os$/, 'as');
    if (feminino && c === 5) cab = 'quinhentas';
    return cab + (r ? ' e ' + numeroPorExtenso(r, feminino) : '');
  }
  for (const esc of ESCALAS) {
    if (n >= esc.valor) {
      const qtd = Math.floor(n / esc.valor);
      const resto = n % esc.valor;
      let cab;
      if (esc.valor === 1000) {
        cab = qtd === 1 ? 'mil' : numeroPorExtenso(qtd, feminino) + ' mil';
      } else {
        cab = numeroPorExtenso(qtd, false) + ' ' + (qtd === 1 ? esc.sing : esc.plur);
      }
      if (!resto) return cab;
      // "e" só entra quando o resto é menor que cem ou múltiplo redondo
      const liga = resto < 100 || resto % 100 === 0 ? ' e ' : ' ';
      return cab + liga + numeroPorExtenso(resto, feminino);
    }
  }
  return String(n);
}

const ORDINAIS_UNI = ['', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'oitavo', 'nono'];
const ORDINAIS_DEZ = ['', 'décimo', 'vigésimo', 'trigésimo', 'quadragésimo', 'quinquagésimo', 'sexagésimo', 'septuagésimo', 'octogésimo', 'nonagésimo'];
const ORDINAIS_CEM = ['', 'centésimo', 'ducentésimo', 'tricentésimo', 'quadringentésimo', 'quingentésimo', 'sexcentésimo', 'septingentésimo', 'octingentésimo', 'noningentésimo'];

export function ordinalPorExtenso(n, feminino) {
  n = Math.trunc(Math.abs(n));
  if (n <= 0 || n > 999) return numeroPorExtenso(n, feminino);
  const partes = [];
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  if (c) partes.push(ORDINAIS_CEM[c]);
  if (d) partes.push(ORDINAIS_DEZ[d]);
  if (u) partes.push(ORDINAIS_UNI[u]);
  const txt = partes.join(' ');
  return feminino ? txt.replace(/o\b/g, 'a') : txt;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Abreviações comuns; a chave é comparada em minúsculas com o ponto. */
const ABREVIACOES = new Map([
  ['dr.', 'doutor'], ['dra.', 'doutora'], ['sr.', 'senhor'], ['sra.', 'senhora'],
  ['srta.', 'senhorita'], ['prof.', 'professor'], ['profa.', 'professora'],
  ['av.', 'avenida'], ['r.', 'rua'], ['pça.', 'praça'], ['ed.', 'edifício'],
  ['apto.', 'apartamento'], ['nº', 'número'], ['n.º', 'número'],
  ['etc.', 'etcétera'], ['pág.', 'página'], ['págs.', 'páginas'],
  ['obs.', 'observação'], ['ex.', 'exemplo'], ['cia.', 'companhia'],
  ['ltda.', 'limitada'], ['tel.', 'telefone'], ['cep', 'cêpe'],
]);

const UNIDADES_MEDIDA = new Map([
  ['km/h', 'quilômetros por hora'], ['km', 'quilômetros'], ['m', 'metros'],
  ['cm', 'centímetros'], ['mm', 'milímetros'], ['kg', 'quilos'],
  ['g', 'gramas'], ['mg', 'miligramas'], ['l', 'litros'], ['ml', 'mililitros'],
  ['h', 'horas'], ['min', 'minutos'], ['s', 'segundos'], ['°c', 'graus'],
  ['ºc', 'graus'], ['mb', 'megabytes'], ['gb', 'gigabytes'], ['kb', 'kilobytes'],
]);

/** Sequência de letras maiúsculas que se lê letra a letra ("CPF" -> "cê pê éfe"). */
const NOME_DAS_LETRAS = {
  a: 'á', b: 'bê', c: 'cê', d: 'dê', e: 'é', f: 'éfe', g: 'gê', h: 'agá',
  i: 'i', j: 'jota', k: 'cá', l: 'éle', m: 'ême', n: 'êne', o: 'ó', p: 'pê',
  q: 'quê', r: 'érre', s: 'ésse', t: 'tê', u: 'u', v: 'vê', w: 'dábliu',
  x: 'xis', y: 'ípsilon', z: 'zê',
};

/** Siglas que já se leem como palavra — não soletrar. */
const SIGLAS_FALADAS = new Set([
  'ONU', 'OTAN', 'PIB', 'MEC', 'IBGE', 'USP', 'UFPE', 'UFC', 'SUS', 'FIES',
  'ENEM', 'SENAI', 'SESC', 'CEP', 'PIX', 'COVID', 'AIDS', 'NASA', 'FIFA',
]);

function soletrar(sigla) {
  return sigla
    .toLowerCase()
    .split('')
    .map((c) => NOME_DAS_LETRAS[c] || c)
    .join(' ');
}

/**
 * Reescreve números, moedas, datas, horas, siglas e abreviações por extenso.
 * Trechos entre [colchetes] são preservados (são marcações do app).
 */
export function normalizar(texto, opcoes) {
  const o = opcoes || {};
  if (!texto) return '';
  const protegidos = [];
  let t = texto.replace(/\[[^\]]*\]/g, (m) => {
    protegidos.push(m);
    return 'xqprotx' + (protegidos.length - 1) + 'x';
  });

  // moeda: R$ 1.234,56
  t = t.replace(/R\$\s*([\d.]+)(?:,(\d{1,2}))?/gi, (_m, inteiro, cent) => {
    const reais = parseInt(inteiro.replace(/\./g, ''), 10) || 0;
    const centavos = cent ? parseInt(cent.padEnd(2, '0'), 10) : 0;
    let s = numeroPorExtenso(reais) + (reais === 1 ? ' real' : ' reais');
    if (centavos) s += ' e ' + numeroPorExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    return s;
  });

  // porcentagem
  t = t.replace(/(\d+(?:,\d+)?)\s*%/g, (_m, n) => {
    const [i, d] = n.split(',');
    let s = numeroPorExtenso(parseInt(i, 10));
    if (d) s += ' vírgula ' + d.split('').map((c) => UNIDADES[+c]).join(' ');
    return s + ' por cento';
  });

  // hora: 14h30 / 14:30
  t = t.replace(/\b(\d{1,2})\s*[h:]\s*(\d{2})\b/g, (_m, h, min) => {
    const hh = parseInt(h, 10);
    const mm = parseInt(min, 10);
    let s = numeroPorExtenso(hh, true) + (hh === 1 ? ' hora' : ' horas');
    if (mm) s += ' e ' + numeroPorExtenso(mm) + (mm === 1 ? ' minuto' : ' minutos');
    return s;
  });
  t = t.replace(/\b(\d{1,2})h\b/g, (_m, h) => {
    const hh = parseInt(h, 10);
    return numeroPorExtenso(hh, true) + (hh === 1 ? ' hora' : ' horas');
  });

  // data: 05/09/2026
  t = t.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, (_m, d, mes, a) => {
    const dia = parseInt(d, 10);
    const mi = parseInt(mes, 10) - 1;
    if (mi < 0 || mi > 11) return _m;
    const ano = parseInt(a.length === 2 ? '20' + a : a, 10);
    const diaTxt = dia === 1 ? 'primeiro' : numeroPorExtenso(dia);
    return diaTxt + ' de ' + MESES[mi] + ' de ' + numeroPorExtenso(ano);
  });

  // ordinal: 1º, 2ª, 3o
  t = t.replace(/\b(\d+)\s*([ºª°])/g, (_m, n, marca) =>
    ordinalPorExtenso(parseInt(n, 10), marca === 'ª')
  );

  // unidades de medida coladas no número
  t = t.replace(/\b(\d+(?:,\d+)?)\s*(km\/h|km|cm|mm|kg|mg|ml|mb|gb|kb|[°º]c|min)\b/gi, (_m, n, un) => {
    const chave = un.toLowerCase();
    const nome = UNIDADES_MEDIDA.get(chave);
    if (!nome) return _m;
    return lerDecimal(n) + ' ' + nome;
  });

  // abreviações
  t = t.replace(/\b([A-Za-zÀ-ÿ]{1,5}\.º?|nº)/g, (m) => {
    const alvo = ABREVIACOES.get(m.toLowerCase());
    return alvo ? alvo : m;
  });

  // siglas em caixa alta (3+ letras) que não se leem como palavra
  if (o.soletrarSiglas !== false && !predominaCaixaAlta(t)) {
    t = t.replace(/\b([A-ZÀ-Ý]{2,6})\b/g, (m) => (SIGLAS_FALADAS.has(m) ? m : soletrar(m)));
  }

  // números soltos (inteiros e decimais)
  t = t.replace(/\b\d[\d.]*(?:,\d+)?\b/g, (m) => lerDecimal(m));

  // símbolos residuais
  t = t
    .replace(/&/g, ' e ')
    .replace(/\+/g, ' mais ')
    .replace(/=/g, ' igual a ')
    .replace(/@/g, ' arroba ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s{2,}/g, ' ');

  return t.replace(/xqprotx(\d+)x/g, (_m, i) => protegidos[+i]);
}

/**
 * Um texto escrito todo em maiúsculas não é uma sigla — soletrar tudo ali
 * deixaria a fala ininteligível. Acima de 40% de palavras em caixa alta,
 * desligamos a soletração.
 */
function predominaCaixaAlta(t) {
  const palavras = t.match(/\b[\p{L}]{2,}\b/gu) || [];
  if (palavras.length < 4) return false;
  const altas = palavras.filter((p) => p === p.toUpperCase() && p !== p.toLowerCase()).length;
  return altas / palavras.length > 0.4;
}

function lerDecimal(txt) {
  const limpo = String(txt).replace(/\.(?=\d{3}\b)/g, '');
  const [inteiro, decimal] = limpo.split(',');
  const i = parseInt(inteiro, 10);
  if (Number.isNaN(i)) return txt;
  let s = numeroPorExtenso(i);
  if (decimal) s += ' vírgula ' + decimal.split('').map((c) => UNIDADES[+c] || c).join(' ');
  return s;
}

// ---------------------------------------------------------------------------
// marcações do usuário

/**
 * Marcações aceitas no editor:
 *   [pausa 500]   pausa de 500 ms
 *   [pausa 1.5s]  pausa de 1,5 s
 *   [pausa]       pausa média (600 ms)
 *   *palavra*     ênfase (fala um pouco mais devagar e mais alto)
 */
export const AJUDA_MARCACAO = [
  { marca: '[pausa]', efeito: 'pausa média (600 ms)' },
  { marca: '[pausa 300]', efeito: 'pausa de 300 milissegundos' },
  { marca: '[pausa 2s]', efeito: 'pausa de 2 segundos' },
  { marca: '*assim*', efeito: 'ênfase: mais devagar e mais alto' },
];

const RE_PAUSA = /\[\s*pausa(?:\s+(\d+(?:[.,]\d+)?)\s*(ms|s)?)?\s*\]/gi;

/** Lê "[pausa 1.5s]" e devolve a duração em milissegundos. */
export function lerPausa(valor, unidade) {
  if (valor == null || valor === '') return 600;
  const n = parseFloat(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 600;
  const ms = (unidade || '').toLowerCase() === 's' ? n * 1000 : n;
  return Math.min(30000, Math.round(ms));
}

/** Remove as marcações, deixando só o texto que vai ser falado. */
export function limparMarcacao(texto) {
  return texto.replace(RE_PAUSA, ' ').replace(/\*(.+?)\*/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// segmentação

const ABREV_SEM_QUEBRA = /\b(sr|sra|dr|dra|prof|profa|etc|ex|obs|pág|av|ltda|cia|jr|vs|ed|apto)\.$/i;

/**
 * Quebra o texto em segmentos faláveis. Cada segmento vira uma chamada ao motor
 * de voz; a pausa vai como silêncio inserido entre os áudios.
 *
 * @returns {Array<{texto:string, pausaMs:number, enfase:boolean, indice:number}>}
 */
export function segmentar(texto, opcoes) {
  const o = opcoes || {};
  const pausaFrase = num(o.pausaFrase, 350);
  const pausaParagrafo = num(o.pausaParagrafo, 900);
  const pausaVirgula = num(o.pausaVirgula, 0);
  const maxChars = num(o.maxChars, 320);

  const segmentos = [];
  const paragrafos = texto.split(/\n\s*\n+/);

  paragrafos.forEach((paragrafo, iPar) => {
    const linhas = paragrafo.split(/\n+/).join(' ').trim();
    if (!linhas) return;

    // as pausas explícitas viram fronteiras de segmento
    const pedacos = [];
    let ultimo = 0;
    let m;
    RE_PAUSA.lastIndex = 0;
    while ((m = RE_PAUSA.exec(linhas)) !== null) {
      pedacos.push({ texto: linhas.slice(ultimo, m.index), pausaMs: lerPausa(m[1], m[2]) });
      ultimo = m.index + m[0].length;
    }
    pedacos.push({ texto: linhas.slice(ultimo), pausaMs: null });

    pedacos.forEach((pedaco, iPedaco) => {
      const frases = dividirEmFrases(pedaco.texto, pausaVirgula > 0);
      frases.forEach((frase, iFrase) => {
        const partes = quebrarPorTamanho(frase.texto, maxChars);
        partes.forEach((parte, iParte) => {
          const ultimaParte = iParte === partes.length - 1;
          const ultimaFrase = ultimaParte && iFrase === frases.length - 1;
          const ultimoPedaco = ultimaFrase && iPedaco === pedacos.length - 1;

          let pausa;
          if (!ultimaParte) pausa = 120;
          else if (!ultimaFrase) pausa = frase.tipo === 'virgula' ? pausaVirgula : pausaFrase;
          else if (!ultimoPedaco) pausa = pedaco.pausaMs != null ? pedaco.pausaMs : pausaFrase;
          else pausa = iPar === paragrafos.length - 1 ? 0 : pausaParagrafo;

          // a pausa explícita do pedaço vale mais que a pausa automática
          if (ultimaParte && ultimaFrase && pedaco.pausaMs != null) pausa = pedaco.pausaMs;

          const bruto = parte.trim();
          if (!bruto) return;
          const enfase = /^\*.*\*$/.test(bruto);
          segmentos.push({
            texto: bruto.replace(/\*/g, '').trim(),
            pausaMs: Math.max(0, pausa),
            enfase,
            indice: segmentos.length,
          });
        });
      });
    });
  });

  return segmentos.filter((s) => s.texto.length > 0);
}

function num(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

/** Divide em frases respeitando abreviações e reticências. */
export function dividirEmFrases(texto, quebrarVirgula) {
  const frases = [];
  const bruto = texto.split(/(?<=[.!?…])\s+/);
  for (const f of bruto) {
    if (!f.trim()) continue;
    // "Dr. Silva" não é fim de frase: cola no próximo pedaço
    if (frases.length && ABREV_SEM_QUEBRA.test(frases[frases.length - 1].texto.trim())) {
      frases[frases.length - 1].texto += ' ' + f;
      continue;
    }
    if (quebrarVirgula) {
      const sub = f.split(/(?<=,)\s+/);
      sub.forEach((s, i) => {
        if (!s.trim()) return;
        frases.push({ texto: s, tipo: i < sub.length - 1 ? 'virgula' : 'frase' });
      });
    } else {
      frases.push({ texto: f, tipo: 'frase' });
    }
  }
  return frases;
}

/**
 * Frases muito longas travam o Piper (o modelo degrada e o tempo de geração
 * explode). Quebramos em vírgulas/conjunções e, no pior caso, em espaço.
 */
export function quebrarPorTamanho(texto, max) {
  const t = texto.trim();
  if (t.length <= max) return [t];
  const partes = [];
  let atual = '';
  const pedacos = t.split(/(?<=[,;:])\s+|\s+(?=(?:e|mas|porém|então|que|porque|quando)\s)/i);
  for (const p of pedacos) {
    if ((atual + ' ' + p).trim().length <= max) {
      atual = (atual + ' ' + p).trim();
    } else {
      if (atual) partes.push(atual);
      if (p.length <= max) {
        atual = p;
      } else {
        // último recurso: corta em espaços
        const palavras = p.split(/\s+/);
        atual = '';
        for (const w of palavras) {
          if ((atual + ' ' + w).trim().length <= max) atual = (atual + ' ' + w).trim();
          else {
            if (atual) partes.push(atual);
            atual = w;
          }
        }
      }
    }
  }
  if (atual) partes.push(atual);
  return partes;
}

/** Estimativa de duração para mostrar antes de gerar. */
export function estimarDuracao(segmentos, velocidade) {
  const v = velocidade || 1;
  let ms = 0;
  for (const s of segmentos) {
    // ~14,5 caracteres por segundo é a taxa média do Piper em pt-BR a 1,0x
    ms += (s.texto.length / 14.5) * 1000 / v + s.pausaMs;
  }
  return Math.round(ms);
}

export function formatarDuracao(ms) {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}
