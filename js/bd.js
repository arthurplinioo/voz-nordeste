// Persistência local. Nada sai do aparelho: ajustes e presets ficam no
// localStorage e os áudios salvos no IndexedDB.

const CHAVE = 'voz-nordeste:';
const BANCO = 'voz-nordeste';
const LOJA = 'audios';

// ---------------------------------------------------------------------------
// ajustes e listas simples

function ler(nome, padrao) {
  try {
    const bruto = localStorage.getItem(CHAVE + nome);
    if (bruto == null) return padrao;
    return JSON.parse(bruto);
  } catch (e) {
    return padrao;
  }
}

function gravar(nome, valor) {
  try {
    localStorage.setItem(CHAVE + nome, JSON.stringify(valor));
    return true;
  } catch (e) {
    // cota estourada: o app continua funcionando, só não guarda a preferência
    return false;
  }
}

export const AJUSTES_PADRAO = {
  vozId: 'ze-sertao',
  tom: 0,
  formante: 0,
  velocidade: 1,
  ganhoDb: -1,
  pausaFrase: 350,
  pausaParagrafo: 900,
  pausaVirgula: 0,
  sotaqueNivel: 2,
  sotaqueVariante: 'generico',
  sotaqueGirias: false,
  normalizarTexto: true,
  soletrarSiglas: true,
  motor: 'piper',
  tema: 'escuro',
};

export function lerAjustes() {
  return Object.assign({}, AJUSTES_PADRAO, ler('ajustes', {}));
}

export function salvarAjustes(ajustes) {
  return gravar('ajustes', ajustes);
}

// ---------------------------------------------------------------------------
// rascunho do editor
//
// Guardado a cada digitada (com folga) para que um F5 ou um fechamento
// acidental da aba não leve embora o texto que a pessoa escreveu.

export function lerRascunho() {
  const t = ler('rascunho', '');
  return typeof t === 'string' ? t : '';
}

export function salvarRascunho(txt) {
  return gravar('rascunho', String(txt || '').slice(0, 60000));
}

// ---------------------------------------------------------------------------
// presets do usuário

export function lerPresets() {
  const lista = ler('presets', []);
  return Array.isArray(lista) ? lista : [];
}

export function salvarPreset(nome, ajustes) {
  const lista = lerPresets().filter((p) => p.nome !== nome);
  lista.push({ nome, ajustes, criadoEm: Date.now() });
  gravar('presets', lista);
  return lista;
}

export function apagarPreset(nome) {
  const lista = lerPresets().filter((p) => p.nome !== nome);
  gravar('presets', lista);
  return lista;
}

// ---------------------------------------------------------------------------
// dicionário de pronúncia

export function lerDicionario() {
  const lista = ler('dicionario', []);
  return Array.isArray(lista) ? lista.filter((r) => r && r.de) : [];
}

export function salvarDicionario(lista) {
  return gravar('dicionario', lista.filter((r) => r && r.de));
}

// ---------------------------------------------------------------------------
// chave do motor na nuvem
//
// Fica só neste navegador e vai direto para o provedor escolhido. O app não tem
// servidor próprio, então não há para onde mais ela ir.

export function lerChaveNuvem() {
  return ler('chaveNuvem', { provedor: 'elevenlabs', chave: '', vozId: '' });
}

export function salvarChaveNuvem(dados) {
  return gravar('chaveNuvem', dados);
}

export function apagarChaveNuvem() {
  localStorage.removeItem(CHAVE + 'chaveNuvem');
}

// ---------------------------------------------------------------------------
// áudios salvos (IndexedDB)

let bancoPromessa = null;

function abrir() {
  if (bancoPromessa) return bancoPromessa;
  bancoPromessa = new Promise((resolver, rejeitar) => {
    if (!globalThis.indexedDB) {
      rejeitar(new Error('Este navegador não tem IndexedDB.'));
      return;
    }
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: 'id', autoIncrement: true });
        loja.createIndex('criadoEm', 'criadoEm');
      }
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rejeitar(req.error || new Error('Não foi possível abrir o banco local.'));
  });
  return bancoPromessa;
}

function transacao(modo) {
  return abrir().then((db) => db.transaction(LOJA, modo).objectStore(LOJA));
}

function comoPromessa(req) {
  return new Promise((resolver, rejeitar) => {
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rejeitar(req.error);
  });
}

export async function guardarAudio(registro) {
  const loja = await transacao('readwrite');
  return comoPromessa(loja.add(Object.assign({ criadoEm: Date.now() }, registro)));
}

export async function listarAudios() {
  const loja = await transacao('readonly');
  const todos = await comoPromessa(loja.getAll());
  return todos.sort((a, b) => b.criadoEm - a.criadoEm);
}

export async function apagarAudio(id) {
  const loja = await transacao('readwrite');
  return comoPromessa(loja.delete(id));
}

export async function espacoUsado() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usado: e.usage || 0, total: e.quota || 0 };
  } catch (err) {
    return null;
  }
}

export function formatarBytes(n) {
  if (!n) return '0 B';
  const un = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(un.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + un[i];
}
