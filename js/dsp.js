// Processamento de sinal: é daqui que sai a variedade de vozes.
//
// O Piper só oferece duas vozes portuguesas, ambas masculinas. Para virar um
// banco de vozes de verdade, o áudio gerado passa por um vocoder de fase que
// separa DUAS coisas que normalmente andam juntas:
//
//   - altura (pitch): a frequência da vibração das pregas vocais;
//   - formantes: as ressonâncias do trato vocal, que dizem o "tamanho" da
//     pessoa e são o que faz uma voz soar adulta, infantil, masculina ou
//     feminina.
//
// Um pitch shifter comum (esticar no tempo + reamostrar) move os dois juntos —
// por isso soa "esquilo". Aqui o envelope espectral é achatado por cepstro,
// deformado pelo fator de formante e recolocado, então dá para subir a altura
// sem virar desenho animado, ou mudar só o timbre mantendo a altura.
//
// Tudo aqui é função pura sobre Float32Array: roda igual no worker e nos testes.

// ---------------------------------------------------------------------------
// FFT radix-2 iterativa

/** Tabelas de twiddle e bit-reverse ficam em cache por tamanho. */
const cacheFFT = new Map();

function preparar(n) {
  let c = cacheFFT.get(n);
  if (c) return c;
  const cos = new Float32Array(n / 2);
  const sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.log2(n) | 0;
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
    rev[i] = r;
  }
  c = { cos, sin, rev };
  cacheFFT.set(n, c);
  return c;
}

/** FFT no lugar. `inverso` divide por n no fim. */
export function fft(re, im, inverso) {
  const n = re.length;
  const { cos, sin, rev } = preparar(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const meio = tam >> 1;
    const passo = n / tam;
    for (let i = 0; i < n; i += tam) {
      for (let j = 0, k = 0; j < meio; j++, k += passo) {
        const c = cos[k];
        const s = inverso ? -sin[k] : sin[k];
        const a = i + j;
        const b = a + meio;
        const tr = re[b] * c - im[b] * s;
        const ti = re[b] * s + im[b] * c;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  if (inverso) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// ---------------------------------------------------------------------------
// envelope espectral por cepstro

/**
 * Achata o espectro para obter só as ressonâncias (formantes), sem a estrutura
 * fina dos harmônicos. Faz isso cortando o cepstro acima de `quefrencia`
 * amostras, que é o divisor clássico entre "envelope" e "excitação".
 */
export function envelopeCepstral(mag, quefrencia, buffers) {
  const n = mag.length; // n = tamanho da FFT (espectro completo)
  const re = buffers.re;
  const im = buffers.im;
  for (let i = 0; i < n; i++) {
    re[i] = Math.log(mag[i] + 1e-10);
    im[i] = 0;
  }
  fft(re, im, true); // cepstro real
  for (let i = quefrencia; i < n - quefrencia + 1; i++) {
    if (i < n) { re[i] = 0; im[i] = 0; }
  }
  fft(re, im, false);
  const env = buffers.env;
  for (let i = 0; i < n; i++) env[i] = Math.exp(re[i]);
  return env;
}

/**
 * Move as ressonâncias do trato vocal sem tocar nos harmônicos.
 *
 * Divide o espectro pelo envelope (sobra a excitação, que carrega a altura),
 * reamostra o envelope pelo fator pedido e multiplica de volta. O resultado tem
 * a mesma altura e um "tamanho de trato vocal" diferente.
 *
 * @param {Float32Array} mag       magnitudes do quadro, espectro COMPLETO (N)
 * @param {Float32Array} saida     onde escrever (só 0..N/2 é preenchido)
 * @param {number} fator           >1 formantes mais altos (trato mais curto)
 */
export function deslocarFormantes(mag, saida, fator, quefrencia, buffers) {
  const N = mag.length;
  const env = envelopeCepstral(mag, quefrencia, buffers);
  const ultimo = N / 2;
  for (let k = 0; k <= ultimo; k++) {
    const origem = k / fator;
    const i0 = Math.floor(origem);
    const frac = origem - i0;
    const e0 = i0 <= ultimo ? env[i0] : env[ultimo];
    const e1 = i0 + 1 <= ultimo ? env[i0 + 1] : env[ultimo];
    const envNova = e0 + (e1 - e0) * frac;
    const envVelha = env[k];
    // Sem o piso, bandas onde o envelope some (agudos quase mudos) viravam
    // divisão por quase-zero e estouravam o ganho num apito.
    const razao = envNova / Math.max(envVelha, 1e-7);
    saida[k] = mag[k] * Math.min(8, Math.max(0.02, razao));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// vocoder de fase

const TAM_JANELA = 2048;
const SALTO_ANALISE = TAM_JANELA / 4;

function janelaHann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

function principal(x) {
  return x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
}

/**
 * Estica no tempo mantendo a altura, e opcionalmente desloca os formantes.
 *
 * @param {Float32Array} entrada
 * @param {number} fatorTempo   >1 alonga, <1 encurta
 * @param {number} fatorFormante  >1 trato vocal maior (voz mais "grossa")
 * @param {(p:number)=>void} [progresso]
 */
export function esticar(entrada, fatorTempo, fatorFormante, progresso) {
  const N = TAM_JANELA;
  const Ha = SALTO_ANALISE;
  const Hs = Math.round(Ha * fatorTempo);
  if (entrada.length < N) return entrada.slice();

  const janela = janelaHann(N);
  const quadros = Math.floor((entrada.length - N) / Ha) + 1;
  const saida = new Float32Array(quadros * Hs + N);
  const pesos = new Float32Array(saida.length);

  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const mag = new Float32Array(N);
  const faseAnterior = new Float32Array(N / 2 + 1);
  const faseAcumulada = new Float32Array(N / 2 + 1);
  const buffers = { re: new Float32Array(N), im: new Float32Array(N), env: new Float32Array(N) };
  const magDeslocada = new Float32Array(N);

  const omega = new Float32Array(N / 2 + 1);
  for (let k = 0; k <= N / 2; k++) omega[k] = (2 * Math.PI * Ha * k) / N;

  const mexeFormante = Math.abs(fatorFormante - 1) > 0.005;
  // Corte do cepstro: precisa ficar abaixo do pico de F0 (que numa voz de 110
  // Hz a 22 kHz cai perto da amostra 200) para separar envelope de harmônicos,
  // e alto o bastante para o envelope ainda resolver formantes vizinhos —
  // em 48 os picos de 700 e 1200 Hz viravam um borrão só e o deslocamento
  // quase não se ouvia.
  const quefrencia = 90;

  for (let q = 0; q < quadros; q++) {
    const inicio = q * Ha;
    for (let i = 0; i < N; i++) {
      re[i] = entrada[inicio + i] * janela[i];
      im[i] = 0;
    }
    fft(re, im, false);

    for (let k = 0; k <= N / 2; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      // o cepstro precisa do espectro inteiro: espelha a metade positiva
      if (k > 0 && k < N / 2) mag[N - k] = mag[k];
    }

    if (mexeFormante) {
      deslocarFormantes(mag, magDeslocada, fatorFormante, quefrencia, buffers);
    }

    for (let k = 0; k <= N / 2; k++) {
      const fase = Math.atan2(im[k], re[k]);
      const desvio = principal(fase - faseAnterior[k] - omega[k]);
      faseAnterior[k] = fase;
      const freqReal = omega[k] + desvio;
      faseAcumulada[k] = q === 0 ? fase : faseAcumulada[k] + (freqReal * Hs) / Ha;

      const m = mexeFormante ? magDeslocada[k] : mag[k];
      const c = Math.cos(faseAcumulada[k]);
      const s = Math.sin(faseAcumulada[k]);
      re[k] = m * c;
      im[k] = m * s;
      if (k > 0 && k < N / 2) {
        re[N - k] = m * c;
        im[N - k] = -m * s;
      }
    }
    im[0] = 0;
    im[N / 2] = 0;

    fft(re, im, true);

    const destino = q * Hs;
    for (let i = 0; i < N; i++) {
      saida[destino + i] += re[i] * janela[i];
      pesos[destino + i] += janela[i] * janela[i];
    }

    if (progresso && (q & 63) === 0) progresso(q / quadros);
  }

  for (let i = 0; i < saida.length; i++) {
    if (pesos[i] > 1e-6) saida[i] /= pesos[i];
  }

  // O buffer de saída termina com uma janela inteira de cauda, que não escala
  // junto com o alongamento. Em áudio longo isso é irrelevante, mas em trechos
  // curtos jogava a duração fora — e o pitch shifter depende da razão exata,
  // porque ele estica e reamostra na sequência. Cortamos no tamanho teórico.
  const alvo = Math.max(1, Math.round((entrada.length * Hs) / Ha));
  return alvo < saida.length ? saida.subarray(0, alvo) : saida;
}

/** Reamostragem com interpolação cúbica (Catmull-Rom). */
export function reamostrar(entrada, razao) {
  if (Math.abs(razao - 1) < 1e-6) return entrada.slice();
  const tam = Math.max(1, Math.floor(entrada.length / razao));
  const saida = new Float32Array(tam);
  const n = entrada.length;
  for (let i = 0; i < tam; i++) {
    const pos = i * razao;
    const i1 = Math.floor(pos);
    const t = pos - i1;
    const p0 = entrada[Math.max(0, i1 - 1)];
    const p1 = entrada[Math.min(n - 1, i1)];
    const p2 = entrada[Math.min(n - 1, i1 + 1)];
    const p3 = entrada[Math.min(n - 1, i1 + 2)];
    saida[i] =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  return saida;
}

/**
 * Transformação de voz completa num canal.
 *
 * @param {Float32Array} canal
 * @param {object} opcoes
 * @param {number} opcoes.semitons     deslocamento de altura, em semitons
 * @param {number} opcoes.formante     deslocamento de formante, em semitons
 * @param {number} opcoes.velocidade   1 = normal, 1.2 = 20% mais rápido
 */
export function transformarVoz(canal, opcoes, progresso) {
  const o = opcoes || {};
  const semitons = o.semitons || 0;
  const formanteSemi = o.formante || 0;
  const velocidade = o.velocidade && o.velocidade > 0 ? o.velocidade : 1;

  const P = Math.pow(2, semitons / 12);        // razão de altura desejada
  const F = Math.pow(2, formanteSemi / 12);    // razão de formante desejada

  const nada = Math.abs(P - 1) < 0.002 && Math.abs(F - 1) < 0.002 && Math.abs(velocidade - 1) < 0.002;
  if (nada) return canal.slice();

  // Ver o cabeçalho: reamostrar por P devolve a altura, então o vocoder tem de
  // esticar por P/velocidade, e o envelope precisa ser deformado por F/P para
  // que, depois da reamostragem, os formantes caiam exatamente em F.
  const fatorTempo = P / velocidade;
  const fatorFormante = F / P;

  const esticado = esticar(canal, fatorTempo, fatorFormante, progresso);
  return reamostrar(esticado, P);
}

// ---------------------------------------------------------------------------
// efeitos simples sobre amostras

/** Normaliza para um pico alvo (em dBFS), sem estourar. */
export function normalizar(canais, picoAlvoDb) {
  const alvo = Math.pow(10, (picoAlvoDb == null ? -1 : picoAlvoDb) / 20);
  let pico = 0;
  for (const c of canais) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > pico) pico = a;
  }
  if (pico < 1e-6) return canais;
  const g = alvo / pico;
  if (g > 8) return canais; // silêncio quase total: amplificar só traria ruído
  for (const c of canais) for (let i = 0; i < c.length; i++) c[i] *= g;
  return canais;
}

/** Corta trechos abaixo do limiar (remove chiado de microfone entre falas). */
export function portaDeRuido(canal, limiarDb, taxa) {
  const limiar = Math.pow(10, (limiarDb == null ? -45 : limiarDb) / 20);
  const ataque = Math.max(1, Math.round((taxa || 22050) * 0.005));
  const saida = new Float32Array(canal.length);
  let ganho = 0;
  for (let i = 0; i < canal.length; i++) {
    const alvo = Math.abs(canal[i]) > limiar ? 1 : 0;
    ganho += (alvo - ganho) / ataque;
    saida[i] = canal[i] * ganho;
  }
  return saida;
}

/** Modulação em anel: dá o timbre metálico de robô. */
export function anel(canal, taxa, freq) {
  const saida = new Float32Array(canal.length);
  const w = (2 * Math.PI * (freq || 40)) / taxa;
  for (let i = 0; i < canal.length; i++) saida[i] = canal[i] * Math.cos(w * i);
  return saida;
}

/** Eco simples com realimentação. */
export function eco(canal, taxa, atrasoMs, retorno, mistura) {
  const atraso = Math.max(1, Math.round((taxa * (atrasoMs || 220)) / 1000));
  const fb = Math.min(0.85, retorno == null ? 0.3 : retorno);
  const mix = mistura == null ? 0.25 : mistura;
  const saida = new Float32Array(canal.length);
  for (let i = 0; i < canal.length; i++) {
    const atrasado = i >= atraso ? saida[i - atraso] : 0;
    saida[i] = canal[i] + atrasado * fb;
  }
  for (let i = 0; i < canal.length; i++) {
    saida[i] = canal[i] * (1 - mix) + saida[i] * mix;
  }
  return saida;
}

/**
 * Trêmulo lento — dá a impressão de voz idosa/trêmula quando combinado com
 * pitch baixo.
 */
export function tremulo(canal, taxa, freq, profundidade) {
  const saida = new Float32Array(canal.length);
  const w = (2 * Math.PI * (freq || 5.5)) / taxa;
  const d = profundidade == null ? 0.2 : profundidade;
  for (let i = 0; i < canal.length; i++) {
    saida[i] = canal[i] * (1 - d + d * (0.5 + 0.5 * Math.cos(w * i)));
  }
  return saida;
}

/** Filtro biquad de um polo/dois polos, usado para brilho e corpo. */
export function biquad(canal, taxa, tipo, freq, q, ganhoDb) {
  const A = Math.pow(10, (ganhoDb || 0) / 40);
  const w0 = (2 * Math.PI * freq) / taxa;
  const alpha = Math.sin(w0) / (2 * (q || 0.707));
  const cosw = Math.cos(w0);
  let b0, b1, b2, a0, a1, a2;

  if (tipo === 'passa-baixa') {
    b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (tipo === 'passa-alta') {
    b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2;
    a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
  } else if (tipo === 'realce') {
    b0 = 1 + alpha * A; b1 = -2 * cosw; b2 = 1 - alpha * A;
    a0 = 1 + alpha / A; a1 = -2 * cosw; a2 = 1 - alpha / A;
  } else if (tipo === 'prateleira-alta') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cosw + s);
    b1 = -2 * A * (A - 1 + (A + 1) * cosw);
    b2 = A * (A + 1 + (A - 1) * cosw - s);
    a0 = A + 1 - (A - 1) * cosw + s;
    a1 = 2 * (A - 1 - (A + 1) * cosw);
    a2 = A + 1 - (A - 1) * cosw - s;
  } else if (tipo === 'prateleira-baixa') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cosw + s);
    b1 = 2 * A * (A - 1 - (A + 1) * cosw);
    b2 = A * (A + 1 - (A - 1) * cosw - s);
    a0 = A + 1 + (A - 1) * cosw + s;
    a1 = -2 * (A - 1 + (A + 1) * cosw);
    a2 = A + 1 + (A - 1) * cosw - s;
  } else {
    return canal.slice();
  }

  const saida = new Float32Array(canal.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < canal.length; i++) {
    const x0 = canal[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    saida[i] = y0;
  }
  return saida;
}

/** Compressor simples, para deixar a fala com volume mais parelho. */
export function comprimir(canal, taxa, limiarDb, razao) {
  const limiar = Math.pow(10, (limiarDb == null ? -18 : limiarDb) / 20);
  const r = razao || 3;
  const ataque = Math.exp(-1 / (taxa * 0.005));
  const solta = Math.exp(-1 / (taxa * 0.12));
  const saida = new Float32Array(canal.length);
  let env = 0;
  for (let i = 0; i < canal.length; i++) {
    const a = Math.abs(canal[i]);
    env = a > env ? ataque * env + (1 - ataque) * a : solta * env + (1 - solta) * a;
    let g = 1;
    if (env > limiar) g = (limiar + (env - limiar) / r) / env;
    saida[i] = canal[i] * g;
  }
  return saida;
}

/** Aplica a cadeia de efeitos de um preset a um canal já transformado. */
export function aplicarEfeitos(canal, taxa, efeitos) {
  const e = efeitos || {};
  let s = canal;
  if (e.porta) s = portaDeRuido(s, e.porta, taxa);
  if (e.corpo) s = biquad(s, taxa, 'prateleira-baixa', 220, 0.707, e.corpo);
  if (e.presenca) s = biquad(s, taxa, 'realce', 2800, 1.1, e.presenca);
  if (e.brilho) s = biquad(s, taxa, 'prateleira-alta', 5200, 0.707, e.brilho);
  if (e.abafado) s = biquad(s, taxa, 'passa-baixa', e.abafado, 0.707, 0);
  if (e.radio) {
    s = biquad(s, taxa, 'passa-alta', 400, 0.9, 0);
    s = biquad(s, taxa, 'passa-baixa', 3200, 0.9, 0);
    s = biquad(s, taxa, 'realce', 1800, 1.4, 6);
  }
  if (e.anel) s = anel(s, taxa, e.anel);
  if (e.tremulo) s = tremulo(s, taxa, e.tremulo.freq, e.tremulo.profundidade);
  if (e.comprimir) s = comprimir(s, taxa, e.comprimir.limiar, e.comprimir.razao);
  if (e.eco) s = eco(s, taxa, e.eco.atraso, e.eco.retorno, e.eco.mistura);
  return s;
}

/** Pipeline completo: transformação de voz + efeitos + normalização. */
export function processar(canais, taxa, opcoes, progresso) {
  const o = opcoes || {};
  const saida = canais.map((c, i) => {
    const t = transformarVoz(c, o, i === 0 ? progresso : null);
    return aplicarEfeitos(t, taxa, o.efeitos);
  });
  if (o.normalizar !== false) normalizar(saida, o.picoAlvoDb);
  return saida;
}
