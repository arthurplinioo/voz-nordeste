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
  ['ltda.', 'limitada'], ['tel.', 'telefone'],
]);

// Só entram aqui unidades que a expressão de medida realmente procura; hora
// tem regra própria, mais acima.
const UNIDADES_MEDIDA = new Map([
  ['km/h', 'quilômetros por hora'], ['km', 'quilômetros'], ['m', 'metros'],
  ['cm', 'centímetros'], ['mm', 'milímetros'], ['kg', 'quilos'],
  ['g', 'gramas'], ['mg', 'miligramas'], ['l', 'litros'], ['ml', 'mililitros'],
  ['min', 'minutos'], ['°c', 'graus'], ['ºc', 'graus'],
  ['mb', 'megabytes'], ['gb', 'gigabytes'], ['kb', 'kilobytes'],
]);

/** Sequência de letras maiúsculas que se lê letra a letra ("CPF" -> "cê pê éfe"). */
const NOME_DAS_LETRAS = {
  a: 'á', b: 'bê', c: 'cê', d: 'dê', e: 'é', f: 'éfe', g: 'gê', h: 'agá',
  i: 'i', j: 'jota', k: 'cá', l: 'éle', m: 'ême', n: 'êne', o: 'ó', p: 'pê',
  q: 'quê', r: 'érre', s: 'ésse', t: 'tê', u: 'u', v: 'vê', w: 'dábliu',
  x: 'xis', y: 'ípsilon', z: 'zê',
};

/** Siglas que já se leem como palavra — nunca soletrar. */
const SIGLAS_FALADAS = new Set([
  'ONU', 'OTAN', 'PIB', 'MEC', 'IBGE', 'USP', 'UFPE', 'UFC', 'SUS', 'FIES',
  'ENEM', 'SENAI', 'SESC', 'CEP', 'PIX', 'COVID', 'AIDS', 'NASA', 'FIFA',
  'ONG', 'UTI', 'DETRAN', 'SEBRAE', 'INSS', 'IPVA', 'IPTU', 'PIS',
]);

/**
 * Siglas com vogal que ainda assim se soletram. A regra automática abaixo só
 * pega as sem vogal; estas precisam ser nomeadas uma a uma.
 */
const SIGLAS_SOLETRADAS = new Set([
  'OAB', 'CNH', 'URL', 'PDF', 'DVD', 'USB', 'ATM', 'EUA', 'CIA', 'FBI',
  'HD', 'TI', 'RH', 'BO', 'AI', 'IA',
]);

/**
 * Decide se uma palavra em caixa alta é sigla para soletrar.
 *
 * O padrão foi invertido: antes soletrava tudo que estivesse em maiúsculas e
 * abria exceção para as siglas conhecidas. Só que o caso comum de caixa alta em
 * texto é ÊNFASE, não sigla — "PARE" saía "pê á érre é" e "SIM" saía "ésse i
 * ême". Agora só soletra o que é reconhecidamente sigla:
 *
 *   - está na lista de siglas soletradas conhecidas; ou
 *   - não tem nenhuma vogal (CPF, RG, TV, CNPJ, SP); ou
 *   - tem três ou mais consoantes seguidas, que não formam sílaba portuguesa.
 *
 * Palavra com acento nunca é soletrada: sigla não leva acento, e o resultado
 * saía ininteligível de qualquer jeito.
 */
function ehSigla(palavra) {
  if (SIGLAS_FALADAS.has(palavra)) return false;
  if (SIGLAS_SOLETRADAS.has(palavra)) return true;
  if (/[^A-Z]/.test(palavra)) return false; // acento, cedilha, número
  if (!/[AEIOU]/.test(palavra)) return true;
  // Três consoantes seguidas não formam sílaba em português, mas só valem como
  // pista de sigla em palavra curta: "COMPRE" tem MPR e é palavra.
  return palavra.length <= 5 && /[^AEIOU]{3}/.test(palavra);
}

function soletrar(sigla) {
  return sigla
    .toLowerCase()
    .split('')
    .map((c) => NOME_DAS_LETRAS[c] || c)
    .join(' ');
}

/** "123.456.789-00" -> "um dois três, quatro cinco seis, ...". */
function soletrarDigitos(txt) {
  const partes = String(txt).split(/[^\d]+/).filter(Boolean);
  return partes
    .map((grupo) => grupo.split('').map((d) => UNIDADES[+d]).join(' '))
    .join(', ');
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

  // Documentos e telefones. Precisa vir antes de tudo: sem esta regra,
  // "123.456.789-00" era lido como "cento e vinte e três milhões...".
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (m) => soletrarDigitos(m));            // CPF
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (m) => soletrarDigitos(m));     // CNPJ
  t = t.replace(/\b\d{5}-\d{3}\b/g, (m) => soletrarDigitos(m));                           // CEP
  t = t.replace(/\(\s*\d{2}\s*\)\s*9?\d{4}[-\s]?\d{4}\b/g, (m) => soletrarDigitos(m));    // telefone com DDD

  // Intervalo de anos, antes do telefone: "1939-1945" tem a mesma forma de um
  // telefone fixo e saía soletrado dígito a dígito.
  t = t.replace(/\b(1\d{3}|20\d{2})\s*[-–—]\s*(1\d{3}|20\d{2})\b/g, (_m, a, b) =>
    numeroPorExtenso(parseInt(a, 10)) + ' a ' + numeroPorExtenso(parseInt(b, 10))
  );

  // Telefone sem DDD só com o 9 inicial dos celulares. A forma \d{4}-\d{4}
  // sozinha é ambígua demais: casava com qualquer par de números com hífen.
  t = t.replace(/\b9\d{4}-\d{4}\b/g, (m) => soletrarDigitos(m));

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

  // Unidades de medida. Precisa vir ANTES do ordinal: a regra de ordinal casa
  // o "°" de "30°C" e devolvia "trigésimoC", deixando as entradas de grau do
  // mapa de unidades inalcançáveis.
  t = t.replace(/\b(\d+(?:,\d+)?)\s*(km\/h|km|cm|mm|kg|mg|ml|mb|gb|kb|[°º]\s*[cC]|min|[mgl])\b/g, (_m, n, un) => {
    const chave = un.toLowerCase().replace(/\s+/g, '');
    const nome = UNIDADES_MEDIDA.get(chave);
    if (!nome) return _m;
    return lerDecimal(n) + ' ' + nome;
  });

  // ordinal: 1º, 2ª, 3o
  t = t.replace(/\b(\d+)\s*([ºª°])/g, (_m, n, marca) =>
    ordinalPorExtenso(parseInt(n, 10), marca === 'ª')
  );

  // abreviações
  t = t.replace(/\b([A-Za-zÀ-ÿ]{1,5}\.º?|nº)/g, (m) => {
    const alvo = ABREVIACOES.get(m.toLowerCase());
    return alvo ? alvo : m;
  });

  // siglas em caixa alta (3+ letras) que não se leem como palavra
  // Soletração de siglas. A regra é conservadora de propósito: ver ehSigla.
  if (o.soletrarSiglas !== false && !predominaCaixaAlta(t)) {
    // \b é ASCII: em "ATENÇÃO" ele enxergava fronteira antes do "Ç" e soletrava
    // só o "ATEN", deixando "ÇÃO" grudado. Limites por caractere de letra
    // Unicode fazem a palavra ser tratada inteira.
    t = t.replace(
      /(^|[^\p{L}\p{M}\p{N}])(\p{Lu}{2,6})(?![\p{L}\p{M}\p{N}])/gu,
      (_m, antes, palavra) => antes + (ehSigla(palavra) ? soletrar(palavra) : palavra)
    );
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
 * deixaria a fala ininteligível ("BOM DIA" virava "bê ó ême dê i á").
 *
 * Dois gatilhos, porque um só não dava conta. Se TODAS as palavras estão em
 * caixa alta, é um título e a soletração sai — vale mesmo em texto de duas
 * palavras. Acima disso, a proporção de 40% só é confiável com texto
 * suficiente, senão "meu CPF" (metade em caixa alta) desligaria a soletração
 * justamente no caso em que ela é desejada.
 */
function predominaCaixaAlta(t) {
  // Sem \b, que é ASCII: com ele "JÁ" não contava como palavra (o Á quebrava a
  // fronteira) e um título de três palavras passava por dois.
  const palavras = t.match(/[\p{L}\p{M}]{2,}/gu) || [];
  // Precisa de três palavras longas para caracterizar um título. Com duas, uma
  // frase como "a OAB e a ONU" — cujas únicas palavras longas são siglas —
  // seria confundida com título e a soletração morreria justo onde é desejada.
  if (palavras.length < 3) return false;
  // Só o critério "tudo em caixa alta". A proporção de 40% que existia aqui
  // fazia mais mal do que bem depois que a soletração passou a ser
  // conservadora: "meu CPF e meu RG" tem metade das palavras em caixa alta e
  // deixava de ser soletrado.
  return palavras.every((p) => p === p.toUpperCase() && p !== p.toLowerCase());
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
  { marca: '*assim*', efeito: 'ênfase: o trecho sai mais alto' },
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

/** Marcador interno de quebra: não aparece em texto digitado. */
const MARCA = '⁣QUEBRA⁣';

/**
 * Separa em frases devolvendo, junto de cada uma, o espaço que a seguia.
 *
 * Existe por dois motivos. O primeiro é compatibilidade: a versão anterior
 * usava lookbehind (`(?<=[.!?…])`), que o Safari só passou a entender na 16.4 —
 * antes disso o módulo nem carregava, e o app abria em tela branca sem
 * mensagem nenhuma. O segundo é que guardar o separador permite recompor o
 * texto exatamente como estava, inclusive as quebras de parágrafo: juntar tudo
 * com um espaço simples apagava os `\n\n` e a pausa de parágrafo sumia.
 *
 * Vale a garantia: `separarFrases(t).map(f => f.texto + f.separador).join('')`
 * devolve `t` sem perder um caractere.
 *
 * @returns {Array<{texto:string, separador:string}>}
 */
export function separarFrases(t) {
  const frases = [];
  const FINAIS = '.!?…';
  let atual = '';
  for (let i = 0; i < t.length; i++) {
    atual += t[i];
    if (!FINAIS.includes(t[i])) continue;
    while (i + 1 < t.length && FINAIS.includes(t[i + 1])) atual += t[++i];
    let separador = '';
    while (i + 1 < t.length && /\s/.test(t[i + 1])) separador += t[++i];
    frases.push({ texto: atual, separador });
    atual = '';
  }
  if (atual) frases.push({ texto: atual, separador: '' });
  return frases;
}

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
  // "*Frase inteira.*" tem o asterisco de fechamento depois do ponto, então a
  // divisão por frase separava o par e a ênfase se perdia. Trazer a pontuação
  // para fora do par resolve sem mudar o que o usuário escreveu.
  const comEnfaseNormalizada = texto.replace(/\*([^*\n]*?)([.!?…]+)\*/g, '*$1*$2');
  const paragrafos = comEnfaseNormalizada.split(/\n\s*\n+/);

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
          // A ênfase vira segmento próprio. Antes exigia-se que o trecho INTEIRO
          // estivesse entre asteriscos, então o uso documentado — marcar uma
          // palavra no meio da frase — não fazia nada: os asteriscos eram
          // removidos em silêncio.
          const trechosEnfase = dividirEnfase(bruto);
          trechosEnfase.forEach((trecho, iTrecho) => {
            const ultimoTrecho = iTrecho === trechosEnfase.length - 1;
            segmentos.push({
              texto: trecho.texto,
              pausaMs: ultimoTrecho ? Math.max(0, pausa) : 0,
              enfase: trecho.enfase,
              indice: segmentos.length,
            });
          });
        });
      });
    });
  });

  return segmentos.filter((s) => s.texto.length > 0);
}

/**
 * Separa os trechos marcados com *asteriscos* do resto da frase.
 *
 * @returns {Array<{texto:string, enfase:boolean}>}
 */
export function dividirEnfase(txt) {
  if (!txt.includes('*')) return [{ texto: txt, enfase: false }];
  const partes = [];
  const re = /\*([^*]+)\*/g;
  let ultimo = 0;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const antes = txt.slice(ultimo, m.index).trim();
    if (antes) partes.push({ texto: antes, enfase: false });
    const dentro = m[1].trim();
    if (dentro) partes.push({ texto: dentro, enfase: true });
    ultimo = m.index + m[0].length;
  }
  const resto = txt.slice(ultimo).trim();
  if (resto) {
    // sobra só de pontuação não vira segmento próprio (geraria um áudio mudo
    // com uma respiração no meio); cola na parte anterior
    if (partes.length && /^[^\p{L}\p{N}]+$/u.test(resto)) {
      partes[partes.length - 1].texto += resto;
    } else {
      partes.push({ texto: resto, enfase: false });
    }
  }
  // asterisco solto, sem par: não é marcação, é pontuação do usuário
  if (!partes.length) {
    const limpo = txt.replace(/\*/g, '').trim();
    return limpo ? [{ texto: limpo, enfase: false }] : [];
  }
  return partes;
}

function num(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

/** Divide em frases respeitando abreviações e reticências. */
export function dividirEmFrases(texto, quebrarVirgula) {
  const frases = [];
  const bruto = separarFrases(texto).map((x) => x.texto);
  for (const f of bruto) {
    if (!f.trim()) continue;
    // "Dr. Silva" não é fim de frase: cola no próximo pedaço
    if (frases.length && ABREV_SEM_QUEBRA.test(frases[frases.length - 1].texto.trim())) {
      frases[frases.length - 1].texto += ' ' + f;
      continue;
    }
    if (quebrarVirgula) {
      const sub = f.replace(/,\s+/g, ',' + MARCA).split(MARCA);
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
  // Sem lookbehind, pelo mesmo motivo explicado em separarFrases.
  const pedacos = t
    .replace(/([,;:])\s+/g, '$1' + MARCA)
    .replace(/\s+(?=(?:e|mas|porém|então|que|porque|quando)\s)/gi, MARCA)
    .split(MARCA);
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
