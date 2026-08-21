import { secao, teste, igual, verdade, perto, fim } from './ajuda.mjs';
import {
  lerWav, escreverWav, silencio, emendar, reamostrarLinear, duracao,
  paraMono, aparar, escreverMp3,
} from '../js/audio.js';

const TAXA = 22050;

function tom(freq, segundos, amplitude, taxa) {
  const t = taxa || TAXA;
  const n = Math.round(t * segundos);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s[i] = (amplitude == null ? 0.5 : amplitude) * Math.sin((2 * Math.PI * freq * i) / t);
  }
  return s;
}

secao('WAV: escrever e ler de volta');
teste('mono sobrevive à ida e volta', () => {
  const original = tom(440, 0.05);
  const { canais, taxa } = lerWav(escreverWav([original], TAXA));
  igual(taxa, TAXA);
  igual(canais.length, 1);
  igual(canais[0].length, original.length);
  let maiorErro = 0;
  for (let i = 0; i < original.length; i++) {
    maiorErro = Math.max(maiorErro, Math.abs(canais[0][i] - original[i]));
  }
  // 16 bits: o erro tem de caber num passo de quantização
  verdade(maiorErro < 1 / 32000, 'erro máximo ' + maiorErro);
});

teste('estéreo mantém os dois canais separados', () => {
  const e = tom(440, 0.02);
  const d = tom(880, 0.02);
  const { canais } = lerWav(escreverWav([e, d], TAXA));
  igual(canais.length, 2);
  verdade(Math.abs(canais[0][100] - e[100]) < 1e-3);
  verdade(Math.abs(canais[1][100] - d[100]) < 1e-3);
});

teste('o cabeçalho declara o tamanho certo', () => {
  const buf = escreverWav([tom(440, 0.01)], TAXA);
  const dv = new DataView(buf);
  igual(dv.getUint32(4, true), buf.byteLength - 8);
  igual(dv.getUint32(40, true), buf.byteLength - 44);
});

teste('valores fora de faixa são limitados, não estouram', () => {
  const alto = new Float32Array([2, -2, 0]);
  const { canais } = lerWav(escreverWav([alto], TAXA));
  perto(canais[0][0], 1, 0.001);
  perto(canais[0][1], -1, 0.001);
});

teste('arquivo que não é WAV dá erro claro', () => {
  const lixo = new ArrayBuffer(64);
  let mensagem = '';
  try { lerWav(lixo); } catch (e) { mensagem = e.message; }
  verdade(mensagem.includes('WAV'), 'mensagem: ' + mensagem);
});

secao('regressões: cabeçalho corrompido');

/** Copia um WAV válido e adultera um campo do cabeçalho. */
function wavAdulterado(campo, valor) {
  const buf = escreverWav([tom(440, 0.02)], TAXA);
  const dv = new DataView(buf);
  const posicoes = { canais: [22, 16], bits: [34, 16], taxa: [24, 32] };
  const [pos, bits] = posicoes[campo];
  if (bits === 16) dv.setUint16(pos, valor, true);
  else dv.setUint32(pos, valor, true);
  return buf;
}

teste('zero canais é recusado, não devolve lista vazia', () => {
  let mensagem = '';
  try { lerWav(wavAdulterado('canais', 0)); } catch (e) { mensagem = e.message; }
  verdade(mensagem.includes('canais'), 'esperava erro sobre canais, veio: ' + mensagem);
});

teste('profundidade de bits estranha é recusada', () => {
  let mensagem = '';
  try { lerWav(wavAdulterado('bits', 7)); } catch (e) { mensagem = e.message; }
  verdade(mensagem.includes('bits'), 'esperava erro sobre bits, veio: ' + mensagem);
});

teste('taxa de amostragem zero é recusada', () => {
  let mensagem = '';
  try { lerWav(wavAdulterado('taxa', 0)); } catch (e) { mensagem = e.message; }
  verdade(mensagem.includes('amostragem'), 'esperava erro sobre taxa, veio: ' + mensagem);
});

teste('exportar sem áudio dá mensagem, não TypeError', () => {
  let mensagem = '';
  try { escreverWav([], TAXA); } catch (e) { mensagem = e.message; }
  verdade(mensagem.includes('áudio'), 'mensagem: ' + mensagem);
});

secao('silêncio');
teste('duração pedida em milissegundos', () => {
  const s = silencio(500, TAXA, 1);
  igual(s[0].length, Math.round(TAXA * 0.5));
});
teste('respeita a contagem de canais', () => igual(silencio(100, TAXA, 2).length, 2));
teste('está mesmo mudo', () => {
  const s = silencio(50, TAXA, 1);
  verdade(s[0].every((v) => v === 0));
});

secao('emenda');
teste('soma as durações', () => {
  const a = { canais: [tom(440, 0.1)], taxa: TAXA };
  const b = { canais: [tom(660, 0.2)], taxa: TAXA };
  const r = emendar([a, b], TAXA);
  perto(duracao(r.canais, r.taxa), 0.3, 0.001);
});

teste('mantém a ordem dos trechos', () => {
  const a = { canais: [new Float32Array([1, 1, 1])], taxa: TAXA };
  const b = { canais: [new Float32Array([-1, -1])], taxa: TAXA };
  const r = emendar([a, b], TAXA);
  igual(Array.from(r.canais[0]), [1, 1, 1, -1, -1]);
});

teste('trecho com taxa diferente é reamostrado, não colado cru', () => {
  const a = { canais: [tom(440, 0.1)], taxa: TAXA };
  const b = { canais: [tom(440, 0.1, 0.5, 44100)], taxa: 44100 };
  const r = emendar([a, b], TAXA);
  igual(r.taxa, TAXA);
  // colado cru, o trecho de 44,1 kHz ocuparia 0,2 s e o total daria 0,3 s
  perto(duracao(r.canais, r.taxa), 0.2, 0.005);
});

teste('lista vazia não quebra', () => {
  const r = emendar([], TAXA);
  igual(r.canais[0].length, 0);
});

teste('mistura de mono e estéreo dá um resultado consistente', () => {
  const mono = { canais: [new Float32Array(10)], taxa: TAXA };
  const est = { canais: [new Float32Array(10), new Float32Array(10)], taxa: TAXA };
  const r = emendar([mono, est], TAXA);
  igual(r.canais.length, 2);
  igual(r.canais[0].length, 20);
  igual(r.canais[1].length, 20);
});

secao('reamostragem linear');
teste('dobrar a taxa dobra as amostras', () => {
  const s = reamostrarLinear(new Float32Array(100), TAXA, TAXA * 2);
  igual(s.length, 200);
});
teste('mesma taxa devolve cópia', () => {
  const e = tom(440, 0.01);
  const s = reamostrarLinear(e, TAXA, TAXA);
  igual(s.length, e.length);
  verdade(s !== e);
});

secao('mono');
teste('dois canais viram a média', () => {
  const r = paraMono([new Float32Array([1, 1]), new Float32Array([-1, 0])]);
  igual(r.length, 1);
  igual(Array.from(r[0]), [0, 0.5]);
});
teste('mono continua mono', () => igual(paraMono([new Float32Array(4)])[0].length, 4));

secao('aparar silêncio');
teste('corta o silêncio das pontas', () => {
  const meio = tom(440, 0.2);
  const inteiro = new Float32Array(TAXA * 0.6);
  inteiro.set(meio, Math.round(TAXA * 0.2));
  const cortado = aparar([inteiro], -50, 0, TAXA);
  perto(cortado[0].length / TAXA, 0.2, 0.02);
});

teste('a margem devolve um respiro', () => {
  const meio = tom(440, 0.2);
  const inteiro = new Float32Array(TAXA * 0.6);
  inteiro.set(meio, Math.round(TAXA * 0.2));
  const semMargem = aparar([inteiro], -50, 0, TAXA);
  const comMargem = aparar([inteiro], -50, 50, TAXA);
  verdade(comMargem[0].length > semMargem[0].length);
});

teste('áudio todo mudo não é apagado', () => {
  const mudo = new Float32Array(1000);
  const r = aparar([mudo], -50, 20, TAXA);
  igual(r[0].length, 1000);
});

teste('áudio sem silêncio nas pontas fica quase igual', () => {
  const cheio = tom(440, 0.1);
  const r = aparar([cheio], -50, 0, TAXA);
  perto(r[0].length, cheio.length, 60);
});

secao('MP3');
teste('sem o lamejs carregado, devolve null em vez de quebrar', () => {
  const anterior = globalThis.lamejs;
  delete globalThis.lamejs;
  igual(escreverMp3([tom(440, 0.05)], TAXA, 128), null);
  if (anterior) globalThis.lamejs = anterior;
});

fim();
