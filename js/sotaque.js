// Motor de sotaque nordestino.
//
// Não existe modelo neural aberto treinado com fala nordestina — o Piper só tem
// vozes pt-BR/pt-PT neutras. A forma honesta de chegar perto é reescrever o
// texto para a ORTOGRAFIA que produz a pronúncia desejada e deixar o
// phonemizador (eSpeak) fazer o resto: escrever "trabaio" faz o motor falar
// [tra'baju], que é exatamente o que um falante do Nordeste diz.
//
// O que esta abordagem alcança: apagamento de -r final, vocalização do "lh",
// monotongação, gerúndio em -no, diminutivo em -im, léxico e gírias regionais,
// concordância só no determinante.
//
// O que ela NÃO alcança (limitação real, documentada no README): a vogal
// pretônica aberta ([ɛ]/[ɔ] em "mEnino", "cOração"), que é o marcador mais
// forte do Nordeste. Não dá para forçar pela ortografia porque o acento agudo
// em português também desloca a tônica — escrever "ménino" faria o motor
// acentuar o "mé". Só um modelo treinado ou entrada em fonemas resolveria isso.

import { separarFrases } from './texto.js';

const COMBINANTES = /[̀-ͯ]/g;

/** Remove acentos para comparar com as listas de exceção. */
function semAcento(s) {
  return s.normalize('NFD').replace(COMBINANTES, '');
}

const VOGAIS = 'aeiouáéíóúâêôàãõü';

/**
 * A palavra resultante é pronunciável em português?
 *
 * Esta é a guarda que faltava. Toda regra daqui apaga letra, e toda uma classe
 * de defeitos vinha de apagar demais: "meses" virava "me", "pobres" virava
 * "pobr", "simples" virava "simpl". Cada caso desses foi descoberto por alguém
 * lendo uma frase em voz alta, e a resposta era sempre mais uma lista de
 * exceção — que nunca fica pronta.
 *
 * O critério aqui é estrutural, não lexical: em português nenhuma palavra
 * termina em grupo consonantal. Depois da última vogal cabe no máximo uma
 * consoante (flor, mês, mal), ou o par "ns"/"rs"/"ls" dos plurais (jovens).
 * "pobr" e "simpl" morrem nessa regra sem precisar estar em lista nenhuma.
 */
export function pronunciavel(palavra) {
  const bx = (palavra || '').toLowerCase();
  if (!bx) return false;
  // uma letra só é palavra quando é vogal: os artigos "a" e "o", a conjunção
  // "e". Rejeitá-las fazia a varredura acusar a frase inteira.
  if (bx.length === 1) return VOGAIS.includes(bx);

  let ultimaVogal = -1;
  for (let i = bx.length - 1; i >= 0; i--) {
    if (VOGAIS.includes(bx[i])) { ultimaVogal = i; break; }
  }
  if (ultimaVogal < 0) return false; // sem vogal nenhuma não é palavra

  const cauda = bx.slice(ultimaVogal + 1);
  if (cauda.length === 0) return true;
  if (cauda.length === 1) return 'lmnrszx'.includes(cauda);
  if (cauda.length === 2) return ['ns', 'rs', 'ls'].includes(cauda);
  return false;
}

/** Palavras em que a regra do "lh" quebraria o sentido. */
const LH_EXCECOES = new Set([
  'ilha', 'ilhas', 'milha', 'milhas', 'quilha', 'ilhota', 'ilheu', 'ilheus',
  'lhe', 'lhes', 'malha', 'malhas', 'julho', 'bilhete', 'bilhetes', 'talha',
]);

/**
 * Casos de "lh" com forma consagrada própria. As chaves são SEM acento (a
 * comparação normaliza), os valores levam o acento que fixa a tônica certa.
 */
const LH_ESPECIAIS = new Map([
  ['mulher', 'muié'], ['mulheres', 'muié'], ['melhor', 'mió'], ['melhores', 'mió'],
  ['filho', 'fío'], ['filhos', 'fío'], ['filha', 'fía'], ['filhas', 'fía'],
  ['velho', 'véi'], ['velhos', 'véi'], ['velha', 'véia'], ['velhas', 'véia'],
  ['olha', 'óia'], ['olhe', 'óia'], ['olho', 'óio'], ['olhos', 'óio'],
  ['trabalho', 'trabaio'], ['trabalha', 'trabaia'], ['trabalhar', 'trabaiá'],
  ['espelho', 'espeio'], ['joelho', 'joeio'], ['coelho', 'coeio'],
  ['orelha', 'oreia'], ['abelha', 'abeia'], ['telha', 'teia'], ['palha', 'paia'],
  ['agulha', 'aguia'], ['barulho', 'baruio'], ['orgulho', 'orguio'],
  ['espalhar', 'espaiá'], ['detalhe', 'detaie'], ['batalha', 'bataia'],
]);

/** Palavras terminadas em -ando/-endo/-indo que NÃO são gerúndio. */
const NAO_GERUNDIO = new Set([
  'mundo', 'fundo', 'segundo', 'profundo', 'vagabundo', 'moribundo', 'imundo',
  'bando', 'brando', 'comando', 'contrabando', 'lindo', 'findo', 'nefando',
  'tremendo', 'horrendo', 'estupendo', 'reverendo', 'brindo', 'oriundo',
  'remendo', 'estrondo',
]);

/** Palavras terminadas em -inho/-inha que não são diminutivo. */
const NAO_DIMINUTIVO = new Set([
  'caminho', 'caminhos', 'vinho', 'vinhos', 'moinho', 'ninho', 'ninhos',
  'pinho', 'linho', 'arminho', 'padrinho', 'focinho', 'espinho', 'espinhos',
  'carinho', 'sobrinho', 'banho', 'punho', 'sonho', 'sonhos', 'desenho',
  'vizinho', 'vizinhos', 'marinho', 'golfinho', 'golfinhos', 'molinho',
  'engenho', 'lenho', 'tamanho', 'estranho', 'rebanho', 'ganho', 'ganhos',
]);

/**
 * Palavras terminadas em -r que NÃO perdem o -r: monossílabos e formas cuja
 * queda deixaria a palavra irreconhecível. (Proparoxítonas e paroxítonas em -r
 * já são barradas pela checagem de acento gráfico.)
 */
const R_FINAL_EXCECOES = new Set([
  'por', 'per', 'ar', 'par', 'mar', 'ver', 'ser', 'ter', 'ir', 'dar', 'cor',
  'dor', 'sur', 'sr', 'dr', 'cur', 'for', 'sor', 'lar', 'bar', 'sur',
]);

/**
 * Substantivos e adjetivos terminados em -ar/-er/-ir/-or. No nível "leve" só o
 * infinitivo perde o -r, então esta lista evita que "melhor" vire "melhô" logo
 * na intensidade mais baixa. (Nos níveis 2 e 3 a queda é geral, como na fala.)
 */
const NAO_INFINITIVO = new Set([
  'melhor', 'menor', 'maior', 'pior', 'mulher', 'senhor', 'amor', 'calor',
  'valor', 'favor', 'doutor', 'professor', 'autor', 'ator', 'motor', 'setor',
  'vapor', 'humor', 'tumor', 'terror', 'horror', 'interior', 'superior',
  'exterior', 'anterior', 'posterior', 'lugar', 'altar', 'militar', 'popular',
  'particular', 'familiar', 'escolar', 'celular', 'singular', 'azar', 'sabor',
  'senhor', 'colher', 'poder', 'prazer', 'dever', 'saber', 'querer',
]);

/**
 * Palavras em que a monotongação criaria OUTRA palavra existente.
 *
 * "seixo" virava "sexo" e o app falava obscenidade em voz alta sem ninguém
 * perceber — a prévia mostra o texto todo, mas ninguém revisa palavra a palavra.
 * Qualquer regra que apague letra precisa desta guarda.
 */
const MONOTONGO_EXCECOES = new Set([
  'seixo', 'seixos', 'eixo', 'eixos', 'reixa', 'feixe', 'feixes',
  // "ou" sozinho é conjunção: virar "ô" trocava a alternativa da frase por uma
  // interjeição ("café ou chá" saía "café ô chá"). Dentro de palavra a
  // monotongação continua valendo — "outro" -> "ôtro", "sou" -> "sô".
  'ou',
]);

/**
 * Plurais em -es cujo singular leva acento. A regra geral de concordância
 * transformava "meses" em "me" e "países" em "paí", que não são fala
 * nordestina — são palavras destruídas.
 */
const PLURAIS_IRREGULARES = new Map([
  // chaves SEM acento: a busca normaliza antes de consultar
  ['meses', 'mês'], ['paises', 'país'], ['ingleses', 'inglês'],
  ['portugueses', 'português'], ['franceses', 'francês'], ['japoneses', 'japonês'],
  ['chineses', 'chinês'], ['fregueses', 'freguês'], ['burgueses', 'burguês'],
  ['reveses', 'revés'], ['deuses', 'deus'], ['gases', 'gás'], ['reis', 'rei'],
  ['raizes', 'raiz'], ['juizes', 'juiz'], ['cafes', 'café'], ['pes', 'pé'],
  // "mães" é a exceção da classe -ães: "pães"/"cães"/"alemães" viram -ão, esta
  // vira "mãe". Sem a entrada, "as mães" saía "as mão".
  ['maes', 'mãe'],
]);

/**
 * Palavras iguais no singular e no plural, e as que só existem no plural.
 * A guarda de pronunciabilidade não pega estas: "atla" e "pir" são
 * pronunciáveis, só não são palavras.
 */
const INVARIAVEIS = new Set([
  'pires', 'atlas', 'lapis', 'onibus', 'virus', 'tenis', 'bonus', 'oasis',
  'cais', 'simples', 'ourives', 'fenix', 'torax', 'climax', 'cutis',
  'oculos', 'ferias', 'fezes', 'nupcias', 'viveres', 'arredores', 'parabens',
  'costas', 'oleos', 'anais', 'funerais',
]);

/** Substituições de léxico. `nivel` = intensidade mínima em que a regra entra. */
const LEXICO = [
  // nível 1 — reduções que qualquer brasileiro faz na fala corrente
  { de: 'está', para: 'tá', nivel: 1 },
  { de: 'estão', para: 'tão', nivel: 1 },
  { de: 'estou', para: 'tô', nivel: 1 },
  { de: 'estava', para: 'tava', nivel: 1 },
  { de: 'estavam', para: 'tavam', nivel: 1 },
  { de: 'estamos', para: 'tamo', nivel: 1 },
  { de: 'para', para: 'pra', nivel: 1 },
  { de: 'para o', para: 'pro', nivel: 1 },
  { de: 'para a', para: 'pra', nivel: 1 },
  // nível 2 — marcas claras de fala nordestina
  { de: 'você', para: 'ocê', nivel: 2 },
  { de: 'vocês', para: 'ocês', nivel: 2 },
  { de: 'vamos', para: 'vamo', nivel: 2 },
  { de: 'nós', para: 'nóis', nivel: 2 },
  { de: 'mesmo', para: 'mermo', nivel: 2 },
  { de: 'mesma', para: 'merma', nivel: 2 },
  { de: 'muito', para: 'munto', nivel: 2 },
  { de: 'muita', para: 'munta', nivel: 2 },
  { de: 'muitos', para: 'muntos', nivel: 2 },
  { de: 'muitas', para: 'muntas', nivel: 2 },
  { de: 'senhor', para: 'sinhô', nivel: 2 },
  { de: 'senhora', para: 'sinhora', nivel: 2 },
  { de: 'através', para: 'atravéis', nivel: 2 },
  { de: 'talvez', para: 'talveis', nivel: 2 },
  { de: 'atrás', para: 'atráis', nivel: 2 },
  // nível 3 — fala bem marcada (alçamento de vogal pretônica lexicalizado)
  { de: 'menino', para: 'minino', nivel: 3 },
  { de: 'menina', para: 'minina', nivel: 3 },
  { de: 'meninos', para: 'mininos', nivel: 3 },
  { de: 'meninas', para: 'mininas', nivel: 3 },
  { de: 'bonito', para: 'bunito', nivel: 3 },
  { de: 'bonita', para: 'bunita', nivel: 3 },
  { de: 'comida', para: 'cumida', nivel: 3 },
  { de: 'começo', para: 'cumeço', nivel: 3 },
  { de: 'começar', para: 'cumeçá', nivel: 3 },
  { de: 'como', para: 'cumo', nivel: 3 },
  { de: 'perigo', para: 'pirigo', nivel: 3 },
  { de: 'porque', para: 'purque', nivel: 3 },
  { de: 'depois', para: 'dispois', nivel: 3 },
  { de: 'doente', para: 'duente', nivel: 3 },
  { de: 'dormir', para: 'durmi', nivel: 3 },
  { de: 'demorar', para: 'dimorá', nivel: 3 },
  { de: 'devagar', para: 'devagá', nivel: 3 },
  { de: 'cadeira', para: 'cadera', nivel: 3 },
  { de: 'coração', para: 'coração', nivel: 3 },
];

/**
 * Gírias: trocam o vocabulário, então ficam num botão à parte.
 *
 * Várias delas são homônimas de palavras comuns — "nossa" é possessivo, "cara"
 * é rosto, "legal" é jurídico, "puxa" é verbo. Trocar essas cegamente produzia
 * frase agramatical ("Nossa casa" virava "Vixe casa"). Por isso existe o campo
 * `soInterjeicao`: a troca só acontece quando a palavra vem seguida de vírgula,
 * exclamação, interrogação ou ponto, que é a posição de interjeição.
 */
const GIRIAS = [
  { de: 'muito bom', para: 'arretado' },
  { de: 'muito boa', para: 'arretada' },
  { de: 'de jeito nenhum', para: 'nem a pau' },
  { de: 'com certeza', para: 'com certeza, oxente' },
  { de: 'olha só', para: 'óia só' },
  { de: 'excelente', para: 'arretado da gota' },
  { de: 'ótimo', para: 'arretado' },
  { de: 'caramba', para: 'oxe' },
  { de: 'entendeu', para: 'visse' },
  { de: 'rápido', para: 'ligeiro' },
  { de: 'confusão', para: 'arrudia' },
  { de: 'teimoso', para: 'cabeça dura' },
  { de: 'nossa', para: 'vixe', soInterjeicao: true },
  { de: 'puxa', para: 'eita', soInterjeicao: true },
  { de: 'cara', para: 'mermão', soInterjeicao: true },
  { de: 'amigo', para: 'meu rei', soInterjeicao: true },
  { de: 'amiga', para: 'minha fía', soInterjeicao: true },
  { de: 'legal', para: 'massa', soInterjeicao: true },
];

/** Traços que variam por região. */
const VARIANTES = {
  generico: {
    rotulo: 'Nordeste geral',
    bordoes: ['Oxe,', 'Eita,', 'Rapaz,', 'Vixe,', 'Menino,'],
    fim: [', visse', ', rapaz', ', oxente'],
  },
  ceara: {
    rotulo: 'Ceará',
    bordoes: ['Oxe,', 'Eita,', 'Macho,', 'Rapaz,'],
    fim: [', rapaz', ', oxente', ', mah'],
  },
  pernambuco: {
    rotulo: 'Pernambuco',
    bordoes: ['Oxe,', 'Eita,', 'Vige,', 'Menino,'],
    fim: [', visse', ', meu rei', ', oxente'],
  },
  bahia: {
    rotulo: 'Bahia',
    bordoes: ['Ô,', 'Vixe,', 'Meu rei,', 'Eita,'],
    fim: [', meu rei', ', viu', ', ó'],
  },
};

// ---------------------------------------------------------------------------
// utilidades

const VOGAIS_FINAIS = { a: 'á', e: 'ê', i: 'i', o: 'ô', u: 'u' };
const TEM_ACENTO = /[áéíóúâêôàãõ]/;

/** Copia o padrão de maiúsculas de `molde` para `texto`. */
function manterCaixa(molde, texto) {
  if (!texto || !molde) return texto;
  const temLetraMaiuscula = molde !== molde.toLowerCase();
  if (molde.length > 1 && molde === molde.toUpperCase() && temLetraMaiuscula) {
    return texto.toUpperCase();
  }
  if (molde[0] === molde[0].toUpperCase() && molde[0] !== molde[0].toLowerCase()) {
    return texto[0].toUpperCase() + texto.slice(1);
  }
  // molde em minúscula: rebaixa a inicial da substituição. Importa no
  // dicionário do usuário, onde ele escreve "Chaomi" mas o texto traz "xiaomi".
  if (molde[0] === molde[0].toLowerCase() && texto[0] !== texto[0].toLowerCase()) {
    return texto[0].toLowerCase() + texto.slice(1);
  }
  return texto;
}

/** PRNG determinístico: a mesma frase gera sempre o mesmo bordão. */
function semente(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// regras de palavra

/** "trabalho" -> "trabaio": vocalização do /ʎ/. */
export function vocalizarLh(palavra) {
  const bx = palavra.toLowerCase();
  const chave = semAcento(bx);
  if (LH_ESPECIAIS.has(chave)) return manterCaixa(palavra, LH_ESPECIAIS.get(chave));
  if (LH_EXCECOES.has(chave) || !bx.includes('lh')) return palavra;

  // O acento em "ói"/"éi" marca a sílaba tônica. Numa oxítona ele cai na
  // sílaba errada: "colher" virava "cóier", que o motor lê CÓ-ier. Em palavra
  // terminada em r/l/z (oxítona pela regra do português) usamos a forma sem
  // acento e deixamos a tônica onde já estava.
  const oxitona = /[rlz]$/.test(bx) && !TEM_ACENTO.test(bx);
  const novo = bx
    .replace(/elh/g, 'ei')
    .replace(/olh/g, oxitona ? 'oi' : 'ói')
    .replace(/alh/g, 'ai')
    .replace(/ulh/g, 'ui')
    .replace(/ilh/g, 'i')
    .replace(/lh/g, 'i');
  return manterCaixa(palavra, novo);
}

/** "falar" -> "falá", "amor" -> "amô": apagamento do -r final. */
export function apagarRFinal(palavra, opcoes) {
  const soInfinitivo = !!(opcoes && opcoes.soInfinitivo);
  const bx = palavra.toLowerCase();
  if (!bx.endsWith('r') || bx.length < 4) return palavra;
  if (R_FINAL_EXCECOES.has(semAcento(bx))) return palavra;
  const semUltima = bx.slice(0, -1);
  // acento gráfico antes do -r => palavra não oxítona ("açúcar"): não mexe
  if (TEM_ACENTO.test(semUltima.slice(0, -1))) return palavra;
  if (soInfinitivo) {
    const infinitivo = /(ar|er|ir|or)$/.test(bx) && !NAO_INFINITIVO.has(semAcento(bx));
    if (!infinitivo) return palavra;
  }
  const vogal = semUltima.slice(-1);
  const acentuada = VOGAIS_FINAIS[vogal];
  if (!acentuada) return palavra;
  return manterCaixa(palavra, semUltima.slice(0, -1) + acentuada);
}

/** "falando" -> "falano": queda do /d/ no gerúndio. */
export function reduzirGerundio(palavra) {
  const bx = palavra.toLowerCase();
  if (!/(ando|endo|indo)$/.test(bx) || bx.length < 6) return palavra;
  if (NAO_GERUNDIO.has(semAcento(bx))) return palavra;
  // -ando -> -ano, -endo -> -eno, -indo -> -ino (cai o /d/, não o /n/)
  return manterCaixa(palavra, bx.replace(/([aei])ndo$/, '$1no'));
}

/** "bonitinho" -> "bonitim": diminutivo nasalizado. */
export function reduzirDiminutivo(palavra) {
  const bx = palavra.toLowerCase();
  if (!/inhos?$/.test(bx) || bx.length < 7) return palavra;
  if (NAO_DIMINUTIVO.has(semAcento(bx))) return palavra;
  return manterCaixa(palavra, bx.replace(/inhos?$/, 'im'));
}

/** "beijo" -> "bejo", "outro" -> "ôtro": monotongação. */
export function monotongar(palavra) {
  const bx = palavra.toLowerCase();
  if (MONOTONGO_EXCECOES.has(semAcento(bx))) return palavra;
  const novo = bx
    .replace(/ei(?=[rjx])/g, 'e')
    .replace(/ei(?=ch)/g, 'e')
    .replace(/ou/g, 'ô');
  if (novo === bx) return palavra;
  return manterCaixa(palavra, novo);
}

// O chiado de coda ("festa" -> [fɛʃta]), típico de Recife e Salvador, foi
// tentado aqui trocando o "s" por "x" antes de consoante. A ideia não se
// sustenta: "escola" virava "excola", que o eSpeak pode ler com /k/, e em
// "fexta" o "x" antes de "t" costuma soar /s/ mesmo, o que não muda nada.
// Como não há como conferir a saída fonética sem ouvir cada caso, a regra saiu.
// As variantes regionais continuam se distinguindo pelo léxico e pelos bordões.

// ---------------------------------------------------------------------------
// concordância

const DETERMINANTES_PLURAIS = new Set([
  'os', 'as', 'uns', 'umas', 'meus', 'minhas', 'seus', 'suas', 'nossos',
  'nossas', 'esses', 'essas', 'estes', 'estas', 'aqueles', 'aquelas', 'dois',
  'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'varios', 'varias', 'muitos', 'muitas', 'todos', 'todas', 'alguns', 'algumas',
  'muntos', 'muntas', 'nois',
]);

/**
 * "as casas bonitas" -> "as casa bonita": no Nordeste a marca de plural fica só
 * no primeiro elemento do sintagma. Só roda no nível 3.
 */
export function concordanciaDeSintagma(tokens) {
  let restam = 0;
  return tokens.map((t) => {
    if (t.tipo === 'pontuacao' && /[.!?;:]/.test(t.texto)) {
      restam = 0;
      return t;
    }
    if (t.tipo !== 'palavra') return t;
    const bx = t.texto.toLowerCase();
    if (DETERMINANTES_PLURAIS.has(semAcento(bx))) {
      restam = 3;
      return t;
    }
    if (restam <= 0) return t;
    restam--;
    const singular = paraSingular(bx);
    if (!singular || singular === bx) return t;
    return { tipo: t.tipo, texto: manterCaixa(t.texto, singular) };
  });
}

/**
 * Singular de um plural, ou string vazia quando não dá para ter certeza.
 *
 * Só mexe nos casos em que a forma é inequívoca: vogal + s ("casas" -> "casa")
 * e os plurais em -ões/-ães. Os demais (-eis, -is, -res, -zes) ficam como
 * estão: tentar reduzi-los produzia "papel" a partir de "papéis" e "paí" a
 * partir de "países". Errar para menos aqui é bem mais barato que errar
 * para mais.
 */
export function paraSingular(bx) {
  if (bx.length <= 3) return '';
  if (INVARIAVEIS.has(semAcento(bx))) return '';
  const irregular = PLURAIS_IRREGULARES.get(semAcento(bx));
  if (irregular) return irregular;
  if (/ões$/.test(bx)) return bx.replace(/ões$/, 'ão');
  if (/ães$/.test(bx)) return bx.replace(/ães$/, 'ão');
  // "lápis", "ônibus", "pires", "papéis", "animais": ou já são singulares, ou o
  // singular muda a última consoante. Não dá para adivinhar; ficam como estão.
  if (/(is|us)$/.test(bx)) return '';

  // gentílicos e afins: "holandeses" -> "holandês", com o acento que a forma
  // singular exige
  if (/eses$/.test(bx) && bx.length > 5) return bx.slice(0, -4) + 'ês';

  if (/es$/.test(bx) && bx.length > 4) {
    // "-es" é ambíguo: pode ser palavra terminada em vogal + s ("dente" ->
    // "dentes") ou terminada em consoante + es ("flor" -> "flores"). O radical
    // decide: se sobrar algo que termina palavra em português, era do segundo
    // tipo. "pobres" tem radical "pobr", que não termina palavra nenhuma —
    // então é do primeiro, e vira "pobre".
    const radical = bx.slice(0, -2);
    if (pronunciavel(radical)) return radical;
    return conferir(bx.slice(0, -1));
  }

  if (/[aeiouáéíóúâêôãõ]s$/.test(bx)) return conferir(bx.slice(0, -1));
  return '';
}

/** Só aceita o singular se o resultado ainda for uma palavra possível. */
function conferir(candidato) {
  return pronunciavel(candidato) ? candidato : '';
}

// ---------------------------------------------------------------------------
// tokenização

/**
 * Quebra o texto preservando pontuação, espaços e trechos protegidos
 * (marcações do app como [pausa 500], números, URLs, e-mails).
 */
export function tokenizar(texto) {
  const tokens = [];
  const re = /(\[[^\]]*\]|https?:\/\/\S+|\S+@\S+\.\S+|\d[\d.,:%º°ª/-]*)|([\p{L}\p{M}]+)|(\s+)|([^\s\p{L}\p{M}]+)/gu;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (m[1] !== undefined) tokens.push({ tipo: 'protegido', texto: m[1] });
    else if (m[2] !== undefined) tokens.push({ tipo: 'palavra', texto: m[2] });
    else if (m[3] !== undefined) tokens.push({ tipo: 'espaco', texto: m[3] });
    else tokens.push({ tipo: 'pontuacao', texto: m[4] });
  }
  return tokens;
}

export function juntar(tokens) {
  return tokens.map((t) => t.texto).join('');
}

// ---------------------------------------------------------------------------
// substituição por frase (gírias com espaço e dicionário do usuário)

function aplicarMapaDeFrases(texto, pares) {
  let saida = texto;
  // Do mais longo para o mais curto: com a ordem original, "para" casava antes
  // e a regra "para o -> pro" nunca chegava a rodar.
  const ordenados = pares.filter((p) => p && p.de).slice().sort((a, b) => b.de.length - a.de.length);
  for (const par of ordenados) {
    const escapado = par.de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b não funciona com acento; usamos limites por caractere de letra
    // O ponto final NÃO conta como posição de interjeição: com ele, "é um
    // documento legal." virava "documento massa.". Vírgula, exclamação,
    // interrogação e reticências, sim.
    const depois = par.soInterjeicao ? '(?=\\s*[,!?…])' : '(?![\\p{L}\\p{M}])';
    const re = new RegExp('(^|[^\\p{L}\\p{M}])(' + escapado + ')' + depois, 'giu');
    saida = saida.replace(re, (_m, antes, achado) => antes + manterCaixa(achado, par.para));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// API principal

export const NIVEIS = { desligado: 0, leve: 1, medio: 2, forte: 3 };

export function listarVariantes() {
  return Object.entries(VARIANTES).map(([id, v]) => ({ id, rotulo: v.rotulo }));
}

/**
 * Aplica o sotaque a um texto.
 *
 * @param {string} texto
 * @param {object} opcoes
 * @param {number} opcoes.nivel      0 a 3
 * @param {string} opcoes.variante   generico | ceara | pernambuco | bahia
 * @param {boolean} opcoes.girias    trocar vocabulário e inserir bordões
 * @param {Array<{de:string,para:string}>} opcoes.dicionario  regras do usuário
 * @returns {string}
 */
export function aplicarSotaque(texto, opcoes) {
  const o = opcoes || {};
  const nivel = o.nivel == null ? 0 : o.nivel;
  if (!texto) return texto;

  const variante = VARIANTES[o.variante] || VARIANTES.generico;
  const dicionario = o.dicionario || [];

  // O dicionário do usuário roda sempre, mesmo com o sotaque desligado: é onde
  // ele conserta pronúncia de nome próprio, sigla, marca, etc.
  let saida = dicionario.length ? aplicarMapaDeFrases(texto, dicionario) : texto;
  if (nivel <= 0 && !o.girias) return saida;

  if (o.girias) saida = aplicarMapaDeFrases(saida, GIRIAS);

  const lexicoAtivo = LEXICO.filter((r) => r.nivel <= nivel);
  saida = aplicarMapaDeFrases(saida, lexicoAtivo);

  let tokens = tokenizar(saida);

  tokens = tokens.map((t) => {
    if (t.tipo !== 'palavra') return t;
    let p = t.texto;
    // O "lh" vem primeiro: as formas consagradas ("melhor" -> "mió") já trazem
    // a queda do -r embutida, e rodar o apagamento antes as descaracterizava.
    if (nivel >= 2) p = vocalizarLh(p);
    if (nivel >= 1) {
      p = monotongar(p);
      p = apagarRFinal(p, { soInfinitivo: true });
    }
    if (nivel >= 2) {
      p = reduzirGerundio(p);
      p = reduzirDiminutivo(p);
      p = apagarRFinal(p, { soInfinitivo: false });
    }
    return { tipo: t.tipo, texto: p };
  });

  if (nivel >= 3) tokens = concordanciaDeSintagma(tokens);

  saida = juntar(tokens);

  if (o.girias) saida = inserirBordoes(saida, variante);

  return saida;
}

/**
 * A frase deixou de começar o período (ganhou um bordão na frente), então a
 * inicial desce. Palavra inteira em caixa alta fica como está: rebaixar só a
 * primeira letra de "NÃO" produzia "nÃO".
 */
function rebaixarInicial(f) {
  const primeira = (f.match(/^[\p{L}\p{M}]+/u) || [''])[0];
  if (primeira.length > 1 && primeira === primeira.toUpperCase()) return f;
  return f[0].toLowerCase() + f.slice(1);
}

/**
 * Coloca um bordão no começo de ~1 a cada 4 frases, de forma determinística.
 *
 * Junta as frases com o separador ORIGINAL de cada uma. Antes disso a função
 * juntava tudo com um espaço simples, o que engolia os `\n\n`: com as gírias
 * ligadas o texto inteiro virava um parágrafo só e o controle "pausa entre
 * parágrafos" deixava de ter qualquer efeito, sem nenhuma pista do porquê.
 */
export function inserirBordoes(texto, variante) {
  const v = variante || VARIANTES.generico;
  const frases = separarFrases(texto);
  const rnd = semente(texto);
  return frases
    .map((parte) => {
      const f = parte.texto;
      if (f.trim().length < 18) return f + parte.separador;
      const sorte = rnd();
      if (sorte < 0.26) {
        const b = v.bordoes[Math.floor(rnd() * v.bordoes.length)];
        return b + ' ' + rebaixarInicial(f) + parte.separador;
      }
      if (sorte > 0.88) {
        const fim = v.fim[Math.floor(rnd() * v.fim.length)];
        return f.replace(/([.!?…]+)\s*$/, fim + '$1') + parte.separador;
      }
      return f + parte.separador;
    })
    .join('');
}

/**
 * Lista legível das mudanças, para a tela de comparação.
 *
 * Precisa de alinhamento de verdade, não de comparação posição a posição: as
 * gírias inserem bordões e trocam uma palavra por duas, e a partir daí tudo
 * desloca. O resultado antigo era uma lista de pares falsos ("trabalho → o"),
 * que fazia o usuário achar que o motor estava quebrado. Aqui usamos a
 * subsequência comum mais longa para achar o que de fato casa, e reportamos só
 * o que sobrou entre as âncoras.
 */
export function diferencas(original, transformado) {
  const LIMITE = 400; // o LCS é O(n*m): num capítulo inteiro não vale a pena
  const a = tokenizar(original).filter((t) => t.tipo === 'palavra').map((t) => t.texto).slice(0, LIMITE);
  const b = tokenizar(transformado).filter((t) => t.tipo === 'palavra').map((t) => t.texto).slice(0, LIMITE);

  const igual = (x, y) => x.toLowerCase() === y.toLowerCase();
  const n = a.length;
  const m = b.length;

  // tabela do LCS
  const tab = [];
  for (let i = 0; i <= n; i++) tab.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tab[i][j] = igual(a[i], b[j])
        ? tab[i + 1][j + 1] + 1
        : Math.max(tab[i + 1][j], tab[i][j + 1]);
    }
  }

  const pares = [];
  const vistos = new Set();
  let i = 0;
  let j = 0;
  let removidas = [];
  let inseridas = [];

  const fechar = () => {
    // uma troca 1-para-1 é o caso interessante; o resto é inserção de bordão
    const quantas = Math.min(removidas.length, inseridas.length);
    for (let k = 0; k < quantas; k++) {
      const chave = removidas[k].toLowerCase() + '>' + inseridas[k].toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      pares.push({ de: removidas[k], para: inseridas[k] });
    }
    removidas = [];
    inseridas = [];
  };

  while (i < n && j < m) {
    if (igual(a[i], b[j])) {
      fechar();
      i++;
      j++;
    } else if (tab[i + 1][j] >= tab[i][j + 1]) {
      removidas.push(a[i++]);
    } else {
      inseridas.push(b[j++]);
    }
    if (pares.length >= 40) return pares;
  }
  while (i < n) removidas.push(a[i++]);
  while (j < m) inseridas.push(b[j++]);
  fechar();

  return pares.slice(0, 40);
}

export const _internos = {
  LEXICO, GIRIAS, VARIANTES, manterCaixa, aplicarMapaDeFrases, semAcento,
};
