// Worker do motor Piper (vits-web): a síntese neural roda toda aqui, fora da
// thread principal, para a interface não travar enquanto gera.
//
// ATENÇÃO — limitação conhecida do vits-web 1.0.3: predict() cria uma
// InferenceSession nova a cada frase e nunca a libera; a biblioteca não expõe
// release/dispose. Cada sessão segura o modelo (~60 MB) no heap do WASM, então
// depois de algumas dezenas de frases o navegador mata a aba. Duas defesas:
// (1) o patch abaixo, que reaproveita UMA sessão por voz; (2) a reciclagem
// periódica do worker feita pela thread principal (ver piper.js).
import * as tts from '@diffusionstudio/vits-web';
import * as ort from 'onnxruntime-web';

const post = (m, t) => self.postMessage(m, t || []);

let vozCorrente = null;
let sessaoCache = null; // {vozId, sessao}
let patchAplicado = false;
let reaproveitou = false;

function aplicarPatchSessao() {
  try {
    const alvo = ort && ort.InferenceSession;
    if (!alvo || typeof alvo.create !== 'function') return false;
    const criarOriginal = alvo.create.bind(alvo);
    alvo.create = async (modelo, opcoes) => {
      const vozId = vozCorrente;
      if (sessaoCache && sessaoCache.vozId === vozId && vozId != null) {
        reaproveitou = true;
        return sessaoCache.sessao;
      }
      reaproveitou = false;
      if (sessaoCache && sessaoCache.sessao && sessaoCache.sessao.release) {
        try { await sessaoCache.sessao.release(); } catch (e) { /* já liberada */ }
      }
      sessaoCache = null;
      const sessao = await criarOriginal(modelo, opcoes);
      sessaoCache = { vozId, sessao };
      return sessao;
    };
    return true;
  } catch (e) {
    return false;
  }
}

async function liberarSessao() {
  if (sessaoCache && sessaoCache.sessao && sessaoCache.sessao.release) {
    try { await sessaoCache.sessao.release(); } catch (e) { /* já liberada */ }
  }
  sessaoCache = null;
}

// Vozes pt que o vits-web não consegue sintetizar: o phonemizador usa a tabela
// de fonemas padrão do Piper e ignora o phoneme_id_map do modelo, então modelos
// com tabela menor estouram no nó Gather do encoder.
const INCOMPATIVEIS = new Set(['pt_BR-edresson-low']);

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === 'vozes') {
      let lista = [];
      let completa = false;
      try {
        const todas = await tts.voices();
        lista = todas
          .filter((v) => /^pt_(BR|PT)/.test(v.key || ''))
          .map((v) => ({ id: v.key, nome: v.name || v.key, qualidade: v.quality || '' }));
        completa = lista.length > 0;
      } catch (err) {
        // offline: cai na lista mínima conhecida
      }
      if (!lista.length) {
        lista = [
          { id: 'pt_BR-faber-medium', nome: 'Faber', qualidade: 'medium' },
          { id: 'pt_PT-tugão-medium', nome: 'Tugão', qualidade: 'medium' },
        ];
      }
      lista = lista.filter((v) => !INCOMPATIVEIS.has(v.id));
      post({ tipo: 'vozes', reqId: m.reqId, lista, completa });

    } else if (m.tipo === 'armazenadas') {
      const ids = await tts.stored();
      post({ tipo: 'armazenadas', reqId: m.reqId, ids });

    } else if (m.tipo === 'baixar') {
      await tts.download(m.vozId, (p) => {
        post({ tipo: 'progresso-download', vozId: m.vozId, carregado: p.loaded, total: p.total });
      });
      post({ tipo: 'download-pronto', reqId: m.reqId, vozId: m.vozId });

    } else if (m.tipo === 'remover') {
      // soltar o modelo antes de apagar, senão o arquivo fica preso no OPFS
      if (vozCorrente === m.vozId) { await liberarSessao(); vozCorrente = null; }
      await tts.remove(m.vozId);
      const restou = (await tts.stored()).includes(m.vozId);
      post({ tipo: 'removida', reqId: m.reqId, vozId: m.vozId, restou });

    } else if (m.tipo === 'limpar-tudo') {
      await liberarSessao();
      vozCorrente = null;
      await tts.flush();
      post({ tipo: 'limpo', reqId: m.reqId });

    } else if (m.tipo === 'gerar') {
      if (INCOMPATIVEIS.has(m.vozId)) {
        throw new Error('A voz ' + m.vozId + ' não funciona neste motor.');
      }
      if (!patchAplicado) patchAplicado = aplicarPatchSessao();
      if (vozCorrente !== m.vozId) await liberarSessao();
      vozCorrente = m.vozId;
      reaproveitou = false;
      const wav = await tts.predict({ text: m.texto, voiceId: m.vozId });
      const buf = await wav.arrayBuffer();
      post({ tipo: 'wav', reqId: m.reqId, buf, sessaoReaproveitada: reaproveitou }, [buf]);
    }
  } catch (err) {
    const msg = String((err && err.message) || err);
    const incompativel = /out of data bounds|enc_p\/emb\/Gather/i.test(msg);
    post({
      tipo: 'erro',
      reqId: m.reqId,
      incompativel,
      msg: incompativel ? 'Esta voz não é compatível com o motor neural.' : msg,
    });
  }
};

post({ tipo: 'worker-pronto' });
