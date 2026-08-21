// Worker do processamento de sinal. O vocoder de fase é pesado (uma FFT de
// 2048 pontos a cada 512 amostras), e rodar na thread principal travava a
// interface em áudios de mais de meio minuto.

import { processar } from './dsp.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.tipo !== 'processar') return;
  try {
    const canais = m.canais.map((b) => new Float32Array(b));
    const saida = processar(canais, m.taxa, m.opcoes, (p) => {
      self.postMessage({ tipo: 'progresso', reqId: m.reqId, valor: p });
    });
    // buffer exato: transferir um subarray levaria o buffer inteiro junto
    const buffers = saida.map((c) =>
      c.byteOffset === 0 && c.buffer.byteLength === c.byteLength ? c.buffer : c.slice().buffer
    );
    self.postMessage({ tipo: 'pronto', reqId: m.reqId, canais: buffers, taxa: m.taxa }, buffers);
  } catch (err) {
    self.postMessage({ tipo: 'erro', reqId: m.reqId, msg: String((err && err.message) || err) });
  }
};

self.postMessage({ tipo: 'worker-pronto' });
