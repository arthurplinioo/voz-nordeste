// Motor opcional na nuvem (ElevenLabs), para quem quiser qualidade de estúdio.
//
// Por que existe: o Piper roda offline e é gratuito, mas é um modelo de 2023 de
// 60 MB — soa bem, não soa humano. E não há modelo aberto com fala nordestina.
// Quem tem uma chave da ElevenLabs consegue duas coisas que o Piper não faz:
//
//   - clonar uma voz a partir de 1 a 5 minutos de áudio. É AQUI que se consegue
//     sotaque nordestino de verdade: grave um falante do Nordeste e clone;
//   - conversão fala->fala (speech-to-speech), que mantém a entonação e o ritmo
//     do áudio original e troca só o timbre. É o que os apps de "voice changer"
//     com IA fazem por dentro.
//
// A chave fica só no navegador do usuário e vai direto para a API. Este app não
// tem servidor: não há para onde mais ela ir. Ainda assim, uma chave num
// navegador é uma chave exposta — a interface avisa isso.

const BASE = 'https://api.elevenlabs.io/v1';

export const MODELOS = [
  { id: 'eleven_multilingual_v2', nome: 'Multilingual v2 — mais natural', descricao: 'Melhor qualidade em português. Mais lento.' },
  { id: 'eleven_turbo_v2_5', nome: 'Turbo v2.5 — mais rápido', descricao: 'Bem mais rápido, qualidade um pouco abaixo.' },
  { id: 'eleven_flash_v2_5', nome: 'Flash v2.5 — tempo real', descricao: 'O mais rápido; use para testar rápido.' },
];

function cabecalhos(chave, extra) {
  return Object.assign({ 'xi-api-key': chave }, extra || {});
}

async function erroDaResposta(resposta) {
  let detalhe = '';
  try {
    const j = await resposta.json();
    detalhe = (j.detail && (j.detail.message || j.detail.status)) || j.message || '';
  } catch (e) {
    detalhe = await resposta.text().catch(() => '');
  }
  const mapa = {
    401: 'Chave inválida ou sem permissão.',
    402: 'Créditos esgotados na conta ElevenLabs.',
    422: 'A requisição foi recusada: ' + detalhe,
    429: 'Limite de uso atingido. Espere um pouco e tente de novo.',
  };
  return new Error(mapa[resposta.status] || ('Erro ' + resposta.status + (detalhe ? ': ' + detalhe : '')));
}

/** Confere a chave e devolve o nome do plano. */
export async function verificarChave(chave) {
  const r = await fetch(BASE + '/user/subscription', { headers: cabecalhos(chave) });
  if (!r.ok) throw await erroDaResposta(r);
  const j = await r.json();
  return {
    plano: j.tier || 'desconhecido',
    usados: j.character_count,
    limite: j.character_limit,
  };
}

/** Lista as vozes da conta (inclui as clonadas pelo usuário). */
export async function listarVozes(chave) {
  const r = await fetch(BASE + '/voices', { headers: cabecalhos(chave) });
  if (!r.ok) throw await erroDaResposta(r);
  const j = await r.json();
  return (j.voices || []).map((v) => ({
    id: v.voice_id,
    nome: v.name,
    categoria: v.category,
    previa: v.preview_url,
    idiomas: (v.labels && v.labels.language) || '',
    descricao: (v.labels && v.labels.description) || '',
  }));
}

/**
 * Texto -> fala.
 * @returns {Promise<ArrayBuffer>} MP3
 */
export async function falar(chave, vozId, texto, opcoes) {
  const o = opcoes || {};
  const corpo = {
    text: texto,
    model_id: o.modelo || 'eleven_multilingual_v2',
    voice_settings: {
      stability: o.estabilidade == null ? 0.45 : o.estabilidade,
      similarity_boost: o.similaridade == null ? 0.8 : o.similaridade,
      style: o.estilo == null ? 0.35 : o.estilo,
      use_speaker_boost: true,
    },
  };
  if (o.velocidade && Math.abs(o.velocidade - 1) > 0.01) {
    // aceito a partir do multilingual v2; se o modelo ignorar, não quebra nada
    corpo.voice_settings.speed = Math.min(1.2, Math.max(0.7, o.velocidade));
  }

  const r = await fetch(BASE + '/text-to-speech/' + encodeURIComponent(vozId) + '?output_format=mp3_44100_128', {
    method: 'POST',
    headers: cabecalhos(chave, { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }),
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw await erroDaResposta(r);
  return r.arrayBuffer();
}

/**
 * Fala -> fala: mantém a entonação do áudio original e troca o timbre.
 * É a conversão de voz de verdade — não passa por texto.
 *
 * @param {Blob} audio  gravação ou arquivo do usuário
 */
export async function converterFala(chave, vozId, audio, opcoes) {
  const o = opcoes || {};
  const form = new FormData();
  form.append('audio', audio, 'entrada.' + (audio.type.includes('mp4') ? 'm4a' : audio.type.includes('wav') ? 'wav' : 'webm'));
  form.append('model_id', o.modelo || 'eleven_multilingual_sts_v2');
  form.append('remove_background_noise', o.limparRuido ? 'true' : 'false');
  form.append(
    'voice_settings',
    JSON.stringify({
      stability: o.estabilidade == null ? 0.4 : o.estabilidade,
      similarity_boost: o.similaridade == null ? 0.85 : o.similaridade,
      style: o.estilo == null ? 0.2 : o.estilo,
      use_speaker_boost: true,
    })
  );

  const r = await fetch(BASE + '/speech-to-speech/' + encodeURIComponent(vozId) + '?output_format=mp3_44100_128', {
    method: 'POST',
    headers: cabecalhos(chave, { Accept: 'audio/mpeg' }),
    body: form,
  });
  if (!r.ok) throw await erroDaResposta(r);
  return r.arrayBuffer();
}

/**
 * Clonagem instantânea: cria uma voz nova a partir de amostras.
 * Para sotaque nordestino, mande de 1 a 5 minutos de fala limpa de um falante
 * da região — é o caminho que realmente entrega o sotaque.
 *
 * @param {Blob[]} amostras
 */
export async function clonarVoz(chave, nome, amostras, descricao) {
  const form = new FormData();
  form.append('name', nome);
  if (descricao) form.append('description', descricao);
  amostras.forEach((a, i) => {
    const ext = a.type.includes('mp3') || a.type.includes('mpeg') ? 'mp3' : a.type.includes('wav') ? 'wav' : 'webm';
    form.append('files', a, 'amostra' + (i + 1) + '.' + ext);
  });

  const r = await fetch(BASE + '/voices/add', {
    method: 'POST',
    headers: cabecalhos(chave),
    body: form,
  });
  if (!r.ok) throw await erroDaResposta(r);
  const j = await r.json();
  return j.voice_id;
}

export async function apagarVoz(chave, vozId) {
  const r = await fetch(BASE + '/voices/' + encodeURIComponent(vozId), {
    method: 'DELETE',
    headers: cabecalhos(chave),
  });
  if (!r.ok) throw await erroDaResposta(r);
}
