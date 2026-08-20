// Testes do processamento de sinal. Aqui não dá para "ouvir e ver se ficou
// bom", então medimos: altura por autocorrelação normalizada e formante por
// envelope cepstral. É o que prova que o vocoder separa mesmo as duas coisas.

import { secao, teste, igual, verdade, perto, fim } from './ajuda.mjs';
import { fft, envelopeCepstral, deslocarFormantes, reamostrar, transformarVoz, biquad, normalizar, anel, comprimir } from '../js/dsp.js';

const TAXA = 22050;

/** Onda periódica com harmônicos, parecida com uma vogal. */
function vogal(f0, segundos, formantes) {
  const n = Math.round(TAXA * segundos);
  const s = new Float32Array(n);
  const picos = formantes || [700, 1200, 2600];
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let h = 1; h <= 30; h++) {
      const f = f0 * h;
      if (f > TAXA / 2) break;
      // envelope de formantes: cada pico é uma ressonância
      let ganho = 0.02;
      for (const p of picos) {
        const largura = p * 0.35;
        ganho += Math.exp(-Math.pow((f - p) / largura, 2));
      }
      v += (ganho / h) * Math.sin((2 * Math.PI * f * i) / TAXA);
    }
    s[i] = v * 0.1;
  }
  return s;
}

/**
 * Altura por autocorrelação normalizada, em Hz.
 *
 * A autocorrelação crua escolhe com frequência o atraso DOBRADO (o sinal se
 * repete tão bem em dois períodos quanto em um), e aí a medida cai uma oitava.
 * Normalizando pela energia e pegando o PRIMEIRO atraso que chega perto do
 * máximo, o período fundamental é o que ganha.
 */
function alturaHz(sinal, minHz, maxHz) {
  const ini = Math.floor(TAXA / (maxHz || 500));
  const fimAtraso = Math.floor(TAXA / (minHz || 60));
  // usa um pedaço estável do meio, longe das bordas do vocoder
  const off = Math.floor(sinal.length * 0.35);
  const tam = Math.min(4096, sinal.length - off - fimAtraso - 1);
  if (tam < 256) return 0;

  const valores = [];
  let maior = 0;
  for (let atraso = ini; atraso <= fimAtraso; atraso++) {
    let soma = 0;
    let ea = 0;
    let eb = 0;
    for (let i = 0; i < tam; i++) {
      const a = sinal[off + i];
      const b = sinal[off + i + atraso];
      soma += a * b;
      ea += a * a;
      eb += b * b;
    }
    const n = ea > 0 && eb > 0 ? soma / Math.sqrt(ea * eb) : 0;
    valores.push(n);
    if (n > maior) maior = n;
  }

  const limiar = maior * 0.92;
  for (let i = 1; i < valores.length - 1; i++) {
    const ehPico = valores[i] >= valores[i - 1] && valores[i] >= valores[i + 1];
    if (ehPico && valores[i] >= limiar) return TAXA / (ini + i);
  }
  return TAXA / (ini + valores.indexOf(maior));
}

/**
 * Frequência do primeiro formante, em Hz, por envelope cepstral.
 *
 * Média móvel da magnitude linear não serve: um único harmônico forte domina a
 * janela e o "pico" acaba sendo a massa espectral, não a ressonância. O cepstro
 * separa envelope de harmônicos, que é justamente o que se quer medir aqui.
 * O teste logo abaixo confere o medidor contra uma vogal de formante conhecido.
 */
function primeiroFormante(sinal, deHz, ateHz) {
  const N = 2048;
  const off = Math.floor(sinal.length * 0.4);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    re[i] = (sinal[off + i] || 0) * w;
  }
  fft(re, im, false);

  const mag = new Float32Array(N);
  for (let k = 0; k <= N / 2; k++) {
    mag[k] = Math.hypot(re[k], im[k]);
    if (k > 0 && k < N / 2) mag[N - k] = mag[k];
  }

  const buffers = { re: new Float32Array(N), im: new Float32Array(N), env: new Float32Array(N) };
  const env = envelopeCepstral(mag, 90, buffers);

  const kIni = Math.max(1, Math.round(((deHz || 300) * N) / TAXA));
  const kFim = Math.min(N / 2 - 1, Math.round(((ateHz || 2000) * N) / TAXA));
  let melhor = kIni;
  for (let k = kIni; k <= kFim; k++) if (env[k] > env[melhor]) melhor = k;
  return (melhor * TAXA) / N;
}

/** Centroide espectral: sobe quando os formantes sobem. */
function centroide(sinal) {
  const N = 4096;
  const off = Math.floor(sinal.length * 0.4);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    re[i] = (sinal[off + i] || 0) * w;
  }
  fft(re, im, false);
  let soma = 0;
  let peso = 0;
  for (let k = 1; k < N / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    const f = (k * TAXA) / N;
    soma += m * f;
    peso += m;
  }
  return peso > 0 ? soma / peso : 0;
}

function semitons(a, b) {
  return 12 * Math.log2(a / b);
}

secao('FFT');
teste('ida e volta devolve o sinal', () => {
  const N = 256;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const original = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    original[i] = Math.sin((2 * Math.PI * 7 * i) / N) + 0.3 * Math.cos((2 * Math.PI * 19 * i) / N);
    re[i] = original[i];
  }
  fft(re, im, false);
  fft(re, im, true);
  let maiorErro = 0;
  for (let i = 0; i < N; i++) maiorErro = Math.max(maiorErro, Math.abs(re[i] - original[i]));
  verdade(maiorErro < 1e-4, 'erro máximo ' + maiorErro);
});

teste('acha a raia certa', () => {
  const N = 512;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = Math.sin((2 * Math.PI * 13 * i) / N);
  fft(re, im, false);
  let maior = 0;
  let raia = 0;
  for (let k = 1; k < N / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    if (m > maior) { maior = m; raia = k; }
  }
  igual(raia, 13);
});

secao('reamostragem');
teste('metade da velocidade dobra o tamanho', () => {
  const e = new Float32Array(1000);
  igual(reamostrar(e, 0.5).length, 2000);
});
teste('razão 1 devolve cópia igual', () => {
  const e = vogal(120, 0.05);
  const s = reamostrar(e, 1);
  igual(s.length, e.length);
  verdade(s !== e, 'deve ser uma cópia, não a mesma referência');
});

secao('medidores dos próprios testes');
const base = vogal(120, 0.7);
teste('a vogal sintética tem 120 Hz', () => perto(alturaHz(base), 120, 3));

secao('deslocamento de altura');
teste('+12 semitons dobra a frequência', () => {
  const s = transformarVoz(base, { semitons: 12 });
  perto(alturaHz(s, 60, 500), 240, 8, 'altura');
});
teste('-5 semitons desce o esperado', () => {
  const s = transformarVoz(base, { semitons: -5 });
  perto(semitons(alturaHz(s, 40, 400), 120), -5, 0.6, 'semitons');
});
teste('a duração não muda quando só o tom muda', () => {
  const s = transformarVoz(base, { semitons: 7 });
  perto(s.length / base.length, 1, 0.06, 'razão de duração');
});

secao('deslocamento de formante');
teste('o medidor acha o primeiro formante da vogal sintética', () =>
  perto(primeiroFormante(base), 700, 90));

teste('formante sobe sem mexer na altura', () => {
  const s = transformarVoz(base, { semitons: 0, formante: 6 });
  perto(alturaHz(s, 60, 400), 120, 5, 'a altura tem de ficar onde estava');
  // +6 semitons = fator 1,414: o primeiro formante deve sair de ~700 para ~990
  perto(semitons(primeiroFormante(s, 300, 2400), primeiroFormante(base)), 6, 1.6, 'formante');
});

teste('formante desce sem mexer na altura', () => {
  const s = transformarVoz(base, { semitons: 0, formante: -6 });
  perto(alturaHz(s, 60, 400), 120, 5, 'altura');
  perto(semitons(primeiroFormante(s, 200, 2000), primeiroFormante(base)), -6, 1.6, 'formante');
});
teste('altura e formante juntos (voz masculina -> feminina)', () => {
  const s = transformarVoz(base, { semitons: 7, formante: 4.5 });
  perto(semitons(alturaHz(s, 60, 600), 120), 7, 0.8, 'altura');
  verdade(centroide(s) > centroide(base), 'formantes também devem subir');
});

secao('velocidade');
teste('2x encurta pela metade e mantém a altura', () => {
  const s = transformarVoz(base, { velocidade: 2 });
  perto(s.length / base.length, 0.5, 0.06, 'razão de duração');
  perto(alturaHz(s, 60, 400), 120, 5, 'altura');
});
teste('0,8x alonga e mantém a altura', () => {
  const s = transformarVoz(base, { velocidade: 0.8 });
  perto(s.length / base.length, 1.25, 0.08, 'razão de duração');
  perto(alturaHz(s, 60, 400), 120, 5, 'altura');
});

secao('atalho de identidade');
teste('sem mudança nenhuma, devolve cópia do original', () => {
  const s = transformarVoz(base, { semitons: 0, formante: 0, velocidade: 1 });
  igual(s.length, base.length);
  verdade(s[1000] === base[1000], 'as amostras devem ser idênticas');
});

secao('efeitos');
teste('passa-baixa derruba o agudo', () => {
  const agudo = new Float32Array(4096);
  for (let i = 0; i < agudo.length; i++) agudo[i] = Math.sin((2 * Math.PI * 6000 * i) / TAXA);
  const s = biquad(agudo, TAXA, 'passa-baixa', 800, 0.707, 0);
  let picoAntes = 0;
  let picoDepois = 0;
  for (let i = 2000; i < 4000; i++) {
    picoAntes = Math.max(picoAntes, Math.abs(agudo[i]));
    picoDepois = Math.max(picoDepois, Math.abs(s[i]));
  }
  verdade(picoDepois < picoAntes * 0.15, 'atenuação insuficiente: ' + picoDepois.toFixed(3));
});

teste('normalizar leva o pico ao alvo', () => {
  const c = [new Float32Array([0.1, -0.2, 0.05])];
  normalizar(c, -6);
  let pico = 0;
  for (const v of c[0]) pico = Math.max(pico, Math.abs(v));
  perto(pico, Math.pow(10, -6 / 20), 0.01);
});

teste('normalizar não amplifica silêncio a ponto de virar ruído', () => {
  const c = [new Float32Array([0.00001, -0.00001])];
  normalizar(c, -1);
  verdade(Math.abs(c[0][0]) < 0.001, 'não devia ter amplificado');
});

teste('modulação em anel muda o sinal', () => {
  const s = anel(base, TAXA, 50);
  verdade(s.length === base.length);
  verdade(s[5000] !== base[5000]);
});

teste('compressor reduz o pico', () => {
  const alto = new Float32Array(TAXA / 2);
  for (let i = 0; i < alto.length; i++) alto[i] = 0.9 * Math.sin((2 * Math.PI * 200 * i) / TAXA);
  const s = comprimir(alto, TAXA, -18, 4);
  let picoDepois = 0;
  for (let i = Math.floor(alto.length / 2); i < alto.length; i++) {
    picoDepois = Math.max(picoDepois, Math.abs(s[i]));
  }
  verdade(picoDepois < 0.5, 'pico depois: ' + picoDepois.toFixed(3));
});

secao('robustez');
teste('sinal mais curto que a janela não quebra', () => {
  const curto = new Float32Array(500);
  const s = transformarVoz(curto, { semitons: 5 });
  verdade(s.length > 0);
});
teste('silêncio absoluto não vira NaN', () => {
  const mudo = new Float32Array(TAXA);
  const s = transformarVoz(mudo, { semitons: 4, formante: 3 });
  for (let i = 0; i < s.length; i++) {
    if (!Number.isFinite(s[i])) throw new Error('NaN na amostra ' + i);
  }
});

fim();
