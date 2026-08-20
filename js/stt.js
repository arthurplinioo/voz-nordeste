// Captura de microfone e transcrição.
//
// A transcrição usa a Web Speech API (SpeechRecognition). Duas coisas que o
// usuário precisa saber, e que a interface avisa:
//   1. só existe no Chrome, no Edge e no Safari — no Firefox não há;
//   2. ela NÃO roda no aparelho: o navegador manda o áudio para o servidor do
//      fabricante. Por isso ela fica desligada por padrão e o resto do app
//      continua funcionando 100% offline.
//
// Ela também só escuta o microfone. Não dá para transcrever um arquivo de áudio
// por esse caminho — para arquivo, a aba de efeitos processa o som direto, e o
// motor na nuvem faz a conversão de voz completa.

export function suportaReconhecimento() {
  return !!(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);
}

export function suportaGravacao() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && globalThis.MediaRecorder);
}

/**
 * Grava o microfone. Devolve um controlador com parar() -> Blob.
 */
export async function gravar(aoNivel) {
  if (!suportaGravacao()) throw new Error('Este navegador não grava áudio.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const tipo = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  const pedacos = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) pedacos.push(e.data); };
  rec.start(200);

  // medidor de nível, só para a interface mostrar que está captando
  let ctx = null;
  let raf = 0;
  if (aoNivel) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const fonte = ctx.createMediaStreamSource(stream);
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    fonte.connect(analisador);
    const dados = new Uint8Array(analisador.fftSize);
    const medir = () => {
      analisador.getByteTimeDomainData(dados);
      let soma = 0;
      for (let i = 0; i < dados.length; i++) {
        const v = (dados[i] - 128) / 128;
        soma += v * v;
      }
      aoNivel(Math.sqrt(soma / dados.length));
      raf = requestAnimationFrame(medir);
    };
    medir();
  }

  const inicio = Date.now();
  return {
    get duracaoMs() { return Date.now() - inicio; },
    parar() {
      return new Promise((resolver) => {
        rec.onstop = () => {
          if (raf) cancelAnimationFrame(raf);
          if (ctx) ctx.close();
          stream.getTracks().forEach((t) => t.stop());
          resolver(new Blob(pedacos, { type: rec.mimeType || 'audio/webm' }));
        };
        if (rec.state !== 'inactive') rec.stop();
        else rec.onstop();
      });
    },
    cancelar() {
      if (raf) cancelAnimationFrame(raf);
      if (ctx) ctx.close();
      stream.getTracks().forEach((t) => t.stop());
      if (rec.state !== 'inactive') rec.stop();
    },
  };
}

/**
 * Escuta o microfone e vai devolvendo o texto reconhecido.
 *
 * @param {object} cb
 * @param {(parcial:string)=>void} cb.aoParcial   trecho ainda em análise
 * @param {(final:string)=>void}   cb.aoFinal     trecho fechado
 * @param {(erro:Error)=>void}     cb.aoErro
 * @param {()=>void}               cb.aoFim
 */
export function reconhecer(cb, idioma) {
  const Rec = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!Rec) throw new Error('Este navegador não tem reconhecimento de fala. Use o Chrome, o Edge ou o Safari.');

  const rec = new Rec();
  rec.lang = idioma || 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let parado = false;

  rec.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const txt = r[0].transcript;
      if (r.isFinal) {
        if (cb.aoFinal) cb.aoFinal(txt.trim());
      } else {
        parcial += txt;
      }
    }
    if (parcial && cb.aoParcial) cb.aoParcial(parcial.trim());
  };

  rec.onerror = (e) => {
    if (parado) return;
    const mapa = {
      'not-allowed': 'Permissão de microfone negada. Libere o microfone nas configurações do navegador.',
      'service-not-allowed': 'O navegador bloqueou o serviço de reconhecimento.',
      'no-speech': 'Não ouvi nada. Fale mais perto do microfone.',
      network: 'O reconhecimento precisa de internet e não conseguiu conectar.',
      'audio-capture': 'Nenhum microfone encontrado.',
      aborted: 'Reconhecimento interrompido.',
    };
    if (cb.aoErro) cb.aoErro(new Error(mapa[e.error] || ('Falha no reconhecimento: ' + e.error)));
  };

  rec.onend = () => {
    // o Chrome encerra sozinho depois de um tempo em silêncio; religa se o
    // usuário ainda não mandou parar
    if (!parado) {
      try { rec.start(); return; } catch (err) { /* já estava rodando */ }
    }
    if (cb.aoFim) cb.aoFim();
  };

  rec.start();

  return {
    parar() {
      parado = true;
      try { rec.stop(); } catch (e) { /* já parado */ }
    },
  };
}
