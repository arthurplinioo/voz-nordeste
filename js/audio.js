// Leitura, montagem e exportação de áudio.
//
// O Piper devolve um WAV por frase. Para virar um arquivo só, com as pausas que
// o usuário pediu, é preciso decodificar, inserir silêncio e recodificar — é o
// que este módulo faz, sem depender de nenhuma biblioteca externa.

/** Lê o cabeçalho de um WAV PCM e devolve os canais em Float32. */
export function lerWav(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const texto = (pos) => String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3));
  if (texto(0) !== 'RIFF' || texto(8) !== 'WAVE') throw new Error('Arquivo WAV inválido.');

  let pos = 12;
  let formato = 1;
  let canais = 1;
  let taxa = 22050;
  let bits = 16;
  let dados = null;

  while (pos + 8 <= dv.byteLength) {
    const id = texto(pos);
    const tam = dv.getUint32(pos + 4, true);
    const corpo = pos + 8;
    if (id === 'fmt ') {
      formato = dv.getUint16(corpo, true);
      canais = dv.getUint16(corpo + 2, true);
      taxa = dv.getUint32(corpo + 4, true);
      bits = dv.getUint16(corpo + 14, true);
    } else if (id === 'data') {
      dados = { inicio: corpo, tam: Math.min(tam, dv.byteLength - corpo) };
    }
    pos = corpo + tam + (tam % 2); // blocos têm padding par
  }
  if (!dados) throw new Error('WAV sem bloco de dados.');

  const quadros = Math.floor(dados.tam / (canais * (bits / 8)));
  const saida = [];
  for (let c = 0; c < canais; c++) saida.push(new Float32Array(quadros));

  for (let i = 0; i < quadros; i++) {
    for (let c = 0; c < canais; c++) {
      const off = dados.inicio + (i * canais + c) * (bits / 8);
      let v = 0;
      if (formato === 3 && bits === 32) v = dv.getFloat32(off, true);
      else if (bits === 16) v = dv.getInt16(off, true) / 32768;
      else if (bits === 8) v = (dv.getUint8(off) - 128) / 128;
      else if (bits === 24) {
        const b0 = dv.getUint8(off), b1 = dv.getUint8(off + 1), b2 = dv.getUint8(off + 2);
        let n = (b2 << 16) | (b1 << 8) | b0;
        if (n & 0x800000) n |= ~0xffffff;
        v = n / 8388608;
      } else if (bits === 32) v = dv.getInt32(off, true) / 2147483648;
      saida[c][i] = v;
    }
  }
  return { canais: saida, taxa };
}

/** Escreve canais Float32 num WAV PCM 16 bits. */
export function escreverWav(canais, taxa) {
  const nCanais = canais.length;
  const quadros = canais[0].length;
  const bytesDados = quadros * nCanais * 2;
  const buf = new ArrayBuffer(44 + bytesDados);
  const dv = new DataView(buf);

  const escreverTexto = (pos, s) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(pos + i, s.charCodeAt(i));
  };

  escreverTexto(0, 'RIFF');
  dv.setUint32(4, 36 + bytesDados, true);
  escreverTexto(8, 'WAVE');
  escreverTexto(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, nCanais, true);
  dv.setUint32(24, taxa, true);
  dv.setUint32(28, taxa * nCanais * 2, true);
  dv.setUint16(32, nCanais * 2, true);
  dv.setUint16(34, 16, true);
  escreverTexto(36, 'data');
  dv.setUint32(40, bytesDados, true);

  let pos = 44;
  for (let i = 0; i < quadros; i++) {
    for (let c = 0; c < nCanais; c++) {
      let v = canais[c][i];
      v = v > 1 ? 1 : v < -1 ? -1 : v;
      dv.setInt16(pos, Math.round(v * 32767), true);
      pos += 2;
    }
  }
  return buf;
}

/** Silêncio de `ms` milissegundos, com o mesmo número de canais. */
export function silencio(ms, taxa, nCanais) {
  const quadros = Math.max(0, Math.round((taxa * ms) / 1000));
  const canais = [];
  for (let c = 0; c < (nCanais || 1); c++) canais.push(new Float32Array(quadros));
  return canais;
}

/**
 * Emenda vários trechos num só. Trechos com taxas diferentes são reamostrados
 * para a taxa do primeiro — misturar taxas era o que fazia o áudio final sair
 * acelerado quando o usuário trocava de motor no meio.
 */
export function emendar(trechos, taxaAlvo) {
  const validos = trechos.filter((t) => t && t.canais && t.canais[0] && t.canais[0].length >= 0);
  if (!validos.length) return { canais: [new Float32Array(0)], taxa: taxaAlvo || 22050 };

  const taxa = taxaAlvo || validos[0].taxa;
  const nCanais = Math.max(...validos.map((t) => t.canais.length));

  const ajustados = validos.map((t) => {
    let canais = t.canais;
    if (t.taxa !== taxa) canais = canais.map((c) => reamostrarLinear(c, t.taxa, taxa));
    while (canais.length < nCanais) canais = canais.concat([canais[0]]);
    return canais;
  });

  const total = ajustados.reduce((s, c) => s + c[0].length, 0);
  const saida = [];
  for (let c = 0; c < nCanais; c++) saida.push(new Float32Array(total));

  let pos = 0;
  for (const canais of ajustados) {
    for (let c = 0; c < nCanais; c++) saida[c].set(canais[c], pos);
    pos += canais[0].length;
  }
  return { canais: saida, taxa };
}

export function reamostrarLinear(canal, de, para) {
  if (de === para) return canal.slice();
  const razao = de / para;
  const tam = Math.max(1, Math.round(canal.length / razao));
  const saida = new Float32Array(tam);
  for (let i = 0; i < tam; i++) {
    const pos = i * razao;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = canal[Math.min(canal.length - 1, i0)];
    const b = canal[Math.min(canal.length - 1, i0 + 1)];
    saida[i] = a + (b - a) * frac;
  }
  return saida;
}

/** Duração em segundos. */
export function duracao(canais, taxa) {
  return canais[0].length / taxa;
}

/** Converte para mono somando os canais (usado antes do processamento). */
export function paraMono(canais) {
  if (canais.length === 1) return canais;
  const n = canais[0].length;
  const saida = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const c of canais) s += c[i];
    saida[i] = s / canais.length;
  }
  return [saida];
}

/** Corta silêncio do começo e do fim (o Piper deixa uma sobra em cada frase). */
export function aparar(canais, limiarDb, margemMs, taxa) {
  const limiar = Math.pow(10, (limiarDb == null ? -50 : limiarDb) / 20);
  const n = canais[0].length;
  const margem = Math.round((taxa * (margemMs == null ? 30 : margemMs)) / 1000);

  let inicio = 0;
  let fim = n - 1;
  const pico = (i) => {
    let m = 0;
    for (const c of canais) { const a = Math.abs(c[i]); if (a > m) m = a; }
    return m;
  };
  while (inicio < n && pico(inicio) < limiar) inicio++;
  while (fim > inicio && pico(fim) < limiar) fim--;
  if (inicio >= fim) return canais;

  inicio = Math.max(0, inicio - margem);
  fim = Math.min(n - 1, fim + margem);
  return canais.map((c) => c.slice(inicio, fim + 1));
}

/**
 * Desenha a forma de onda num canvas. Serve tanto para o player quanto para a
 * comparação antes/depois na aba de voz.
 */
export function desenharOnda(canvas, canais, cor, progresso) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const larguraCss = canvas.clientWidth || 600;
  const alturaCss = canvas.clientHeight || 80;
  if (canvas.width !== larguraCss * dpr || canvas.height !== alturaCss * dpr) {
    canvas.width = larguraCss * dpr;
    canvas.height = alturaCss * dpr;
  }
  const L = canvas.width;
  const A = canvas.height;
  ctx.clearRect(0, 0, L, A);
  if (!canais || !canais[0] || !canais[0].length) return;

  const dados = canais[0];
  const passo = Math.max(1, Math.floor(dados.length / L));
  const meio = A / 2;

  ctx.fillStyle = cor || '#f0a04b';
  for (let x = 0; x < L; x++) {
    const ini = x * passo;
    let min = 0;
    let max = 0;
    for (let i = 0; i < passo && ini + i < dados.length; i++) {
      const v = dados[ini + i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = meio - max * meio * 0.92;
    const y2 = meio - min * meio * 0.92;
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }

  if (progresso != null && progresso > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(0, 0, L * Math.min(1, progresso), A);
  }
}

/** Codifica em MP3 se o lamejs estiver carregado; senão devolve null. */
export function escreverMp3(canais, taxa, kbps) {
  const Lame = globalThis.lamejs;
  if (!Lame || !Lame.Mp3Encoder) return null;
  const nCanais = Math.min(2, canais.length);
  const enc = new Lame.Mp3Encoder(nCanais, taxa, kbps || 128);
  const bloco = 1152;
  const pedacos = [];

  const paraInt16 = (c) => {
    const out = new Int16Array(c.length);
    for (let i = 0; i < c.length; i++) {
      const v = c[i] > 1 ? 1 : c[i] < -1 ? -1 : c[i];
      out[i] = Math.round(v * 32767);
    }
    return out;
  };

  const esq = paraInt16(canais[0]);
  const dir = nCanais === 2 ? paraInt16(canais[1]) : null;

  for (let i = 0; i < esq.length; i += bloco) {
    const fatiaE = esq.subarray(i, i + bloco);
    const buf = dir
      ? enc.encodeBuffer(fatiaE, dir.subarray(i, i + bloco))
      : enc.encodeBuffer(fatiaE);
    if (buf.length) pedacos.push(new Uint8Array(buf));
  }
  const fim = enc.flush();
  if (fim.length) pedacos.push(new Uint8Array(fim));

  const total = pedacos.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) { saida.set(p, pos); pos += p.length; }
  return saida.buffer;
}

/** Decodifica qualquer formato que o navegador entenda (mp3, m4a, ogg, wav). */
export async function decodificarArquivo(arquivo, contexto) {
  const buf = await arquivo.arrayBuffer();
  const ctx = contexto || new (window.AudioContext || window.webkitAudioContext)();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  const canais = [];
  for (let c = 0; c < audio.numberOfChannels; c++) canais.push(audio.getChannelData(c).slice());
  return { canais, taxa: audio.sampleRate };
}

export function baixar(buffer, nome, tipo) {
  const blob = new Blob([buffer], { type: tipo || 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
