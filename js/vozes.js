// Banco de vozes.
//
// Cada voz aqui é uma receita: um modelo base do Piper mais um deslocamento de
// altura, um deslocamento de formante (o "tamanho" do trato vocal) e uma cadeia
// de efeitos. Como altura e formante são independentes no vocoder (ver dsp.js),
// dá para tirar timbres bem diferentes dos dois únicos modelos portugueses
// disponíveis, incluindo vozes femininas e infantis.
//
// Os valores estão em semitons. Referência: uma voz masculina adulta fica perto
// de 110 Hz e uma feminina adulta perto de 200 Hz — cerca de 10 semitons acima,
// com formantes uns 15% mais altos (~2,5 semitons) por causa do trato vocal
// mais curto. Subir só a altura sem mexer no formante soa como homem falando
// fino; é a combinação que convence.

export const MODELO_BR = 'pt_BR-faber-medium';
export const MODELO_PT = 'pt_PT-tugão-medium';

export const VOZES = [
  {
    id: 'original',
    nome: 'Faber (original)',
    descricao: 'O modelo pt-BR sem nenhum processamento. Referência para comparar.',
    base: MODELO_BR,
    semitons: 0,
    formante: 0,
    velocidade: 1,
    genero: 'masculina',
    efeitos: {},
  },
  {
    id: 'ze-sertao',
    nome: 'Zé do Sertão',
    descricao: 'Homem maduro, fala pausada e peito cheio. Casa bem com sotaque forte.',
    base: MODELO_BR,
    semitons: -2,
    formante: -1.5,
    velocidade: 0.94,
    genero: 'masculina',
    sotaqueSugerido: { nivel: 3, variante: 'generico' },
    efeitos: { corpo: 2.5, presenca: 1.5, comprimir: { limiar: -20, razao: 2.5 } },
  },
  {
    id: 'cabra-da-peste',
    nome: 'Cabra da Peste',
    descricao: 'Homem jovem, animado e ligeiro. Bom para vídeo curto e narração solta.',
    base: MODELO_BR,
    semitons: 1.5,
    formante: 1,
    velocidade: 1.1,
    genero: 'masculina',
    sotaqueSugerido: { nivel: 2, variante: 'ceara', girias: true },
    efeitos: { presenca: 2, brilho: 1.5 },
  },
  {
    id: 'seu-zeca',
    nome: 'Seu Zeca',
    descricao: 'Voz bem grave, de peito. Para avisos e abertura de vinheta.',
    base: MODELO_BR,
    semitons: -5,
    formante: -3.5,
    velocidade: 0.9,
    genero: 'masculina',
    efeitos: { corpo: 4, presenca: 1, comprimir: { limiar: -22, razao: 3 } },
  },
  {
    id: 'dona-maria',
    nome: 'Dona Maria',
    descricao: 'Feminina adulta, tom acolhedor. Altura e formante subidos juntos.',
    base: MODELO_BR,
    semitons: 6.5,
    formante: 4,
    velocidade: 0.98,
    genero: 'feminina',
    sotaqueSugerido: { nivel: 2, variante: 'bahia' },
    efeitos: { brilho: 2, presenca: 1 },
  },
  {
    id: 'luana',
    nome: 'Luana',
    descricao: 'Feminina jovem, mais clara e rápida. Boa para conteúdo do dia a dia.',
    base: MODELO_BR,
    semitons: 8.5,
    formante: 5.5,
    velocidade: 1.05,
    genero: 'feminina',
    sotaqueSugerido: { nivel: 2, variante: 'pernambuco' },
    efeitos: { brilho: 3, presenca: 1.5 },
  },
  {
    id: 'juca',
    nome: 'Juca (criança)',
    descricao: 'Trato vocal curto e altura alta — a combinação que soa infantil.',
    base: MODELO_BR,
    semitons: 11,
    formante: 8,
    velocidade: 1.08,
    genero: 'infantil',
    efeitos: { brilho: 3 },
  },
  {
    id: 'locutor-am',
    nome: 'Locutor de AM',
    descricao: 'Banda estreita e compressão pesada, do jeito que sai no rádio.',
    base: MODELO_BR,
    semitons: -3,
    formante: -2,
    velocidade: 1,
    genero: 'masculina',
    efeitos: { radio: true, comprimir: { limiar: -20, razao: 4.5 } },
  },
  {
    id: 'narrador',
    nome: 'Narrador',
    descricao: 'Grave leve, ritmo lento, presença controlada. Para documentário.',
    base: MODELO_BR,
    semitons: -1.5,
    formante: -1,
    velocidade: 0.88,
    genero: 'masculina',
    pausaExtra: 1.35,
    efeitos: { corpo: 2, presenca: 1.5, comprimir: { limiar: -18, razao: 3 } },
  },
  {
    id: 'vovo',
    nome: 'Vovó Chiquinha',
    descricao: 'Idosa: trêmulo lento, agudos abafados e fala arrastada.',
    base: MODELO_BR,
    semitons: 4.5,
    formante: 3,
    velocidade: 0.84,
    genero: 'feminina',
    efeitos: { tremulo: { freq: 5.5, profundidade: 0.22 }, abafado: 6200, corpo: 1 },
  },
  {
    id: 'robo',
    nome: 'Robô',
    descricao: 'Modulação em anel sobre a voz original.',
    base: MODELO_BR,
    semitons: 0,
    formante: -1,
    velocidade: 1,
    genero: 'efeito',
    efeitos: { anel: 55, radio: true },
  },
  {
    id: 'assombro',
    nome: 'Voz do Além',
    descricao: 'Grave, abafada e com eco longo.',
    base: MODELO_BR,
    semitons: -7,
    formante: -4,
    velocidade: 0.85,
    genero: 'efeito',
    efeitos: { eco: { atraso: 280, retorno: 0.45, mistura: 0.4 }, abafado: 4200 },
  },
  {
    id: 'tugao',
    nome: 'Tugão (Portugal)',
    descricao: 'Modelo pt-PT. Serve de contraste para ouvir o sotaque brasileiro.',
    base: MODELO_PT,
    semitons: 0,
    formante: 0,
    velocidade: 1,
    genero: 'masculina',
    efeitos: {},
  },
];

export function acharVoz(id) {
  return VOZES.find((v) => v.id === id) || VOZES[0];
}

/** Modelos do Piper que o banco de vozes usa (para a tela de download). */
export function modelosUsados() {
  return [...new Set(VOZES.map((v) => v.base))];
}

/**
 * Junta os ajustes da voz com os ajustes manuais do usuário. Os controles da
 * tela são relativos à voz escolhida: mexer no tom desloca a partir do timbre
 * da voz, não do modelo cru.
 */
export function combinar(voz, ajustes) {
  const a = ajustes || {};
  return {
    semitons: (voz.semitons || 0) + (a.tom || 0),
    formante: (voz.formante || 0) + (a.formante || 0),
    velocidade: (voz.velocidade || 1) * (a.velocidade || 1),
    efeitos: Object.assign({}, voz.efeitos, a.efeitos),
    normalizar: a.normalizar !== false,
    picoAlvoDb: a.picoAlvoDb,
  };
}

/** Presets de ajuste rápido para a aba de efeitos (voz -> voz). */
export const EFEITOS_RAPIDOS = [
  { id: 'nenhum', nome: 'Sem efeito', semitons: 0, formante: 0, efeitos: {} },
  { id: 'grave', nome: 'Mais grave', semitons: -4, formante: -2.5, efeitos: { corpo: 2 } },
  { id: 'agudo', nome: 'Mais agudo', semitons: 4, formante: 2.5, efeitos: { brilho: 2 } },
  { id: 'feminina', nome: 'Para feminina', semitons: 7, formante: 4.5, efeitos: { brilho: 2 } },
  { id: 'masculina', nome: 'Para masculina', semitons: -6, formante: -4, efeitos: { corpo: 2.5 } },
  { id: 'crianca', nome: 'Criança', semitons: 10, formante: 7.5, efeitos: { brilho: 3 } },
  { id: 'gigante', nome: 'Gigante', semitons: -9, formante: -6, efeitos: { corpo: 5, eco: { atraso: 120, retorno: 0.2, mistura: 0.18 } } },
  { id: 'anonimo', nome: 'Anônimo', semitons: -3.5, formante: 2.5, efeitos: { anel: 28, radio: true } },
  { id: 'telefone', nome: 'Telefone', semitons: 0, formante: 0, efeitos: { radio: true } },
  { id: 'caverna', nome: 'Caverna', semitons: -2, formante: -1, efeitos: { eco: { atraso: 320, retorno: 0.5, mistura: 0.45 }, abafado: 5200 } },
];
