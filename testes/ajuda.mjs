// Mini-arcabouço de teste, para não trazer dependência só por isso.

let passaram = 0;
const falhas = [];
let grupo = '';

export function secao(nome) {
  grupo = nome;
  console.log('\n— ' + nome);
}

export function teste(nome, fn) {
  try {
    fn();
    passaram++;
    console.log('  ok  ' + nome);
  } catch (e) {
    falhas.push({ grupo, nome, erro: e });
    console.log('  FALHOU  ' + nome + '\n        ' + (e.message || e));
  }
}

export function igual(recebido, esperado, contexto) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    throw new Error((contexto ? contexto + ': ' : '') + 'esperava ' + b + ', veio ' + a);
  }
}

export function verdade(valor, contexto) {
  if (!valor) throw new Error((contexto || 'esperava verdadeiro') + ' — veio ' + valor);
}

export function perto(recebido, esperado, tolerancia, contexto) {
  if (!(Math.abs(recebido - esperado) <= tolerancia)) {
    throw new Error(
      (contexto ? contexto + ': ' : '') +
      'esperava ' + esperado + ' ± ' + tolerancia + ', veio ' + recebido
    );
  }
}

export function fim() {
  console.log('\n' + passaram + ' passaram, ' + falhas.length + ' falharam.');
  if (falhas.length) process.exit(1);
}
