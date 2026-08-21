import { secao, teste, igual, verdade, fim } from './ajuda.mjs';
import {
  aplicarSotaque, vocalizarLh, apagarRFinal, reduzirGerundio,
  reduzirDiminutivo, monotongar, paraSingular, concordanciaDeSintagma, tokenizar,
  diferencas, listarVariantes,
} from '../js/sotaque.js';

secao('vocalização do lh');
teste('trabalho vira trabaio', () => igual(vocalizarLh('trabalho'), 'trabaio'));
teste('mulher tem forma própria', () => igual(vocalizarLh('mulher'), 'muié'));
teste('melhor tem forma própria', () => igual(vocalizarLh('melhor'), 'mió'));
teste('espelho vira espeio', () => igual(vocalizarLh('espelho'), 'espeio'));
teste('ilha não muda (quebraria o sentido)', () => igual(vocalizarLh('ilha'), 'ilha'));
teste('julho não muda', () => igual(vocalizarLh('julho'), 'julho'));
teste('mantém a maiúscula', () => igual(vocalizarLh('Trabalho'), 'Trabaio'));

secao('apagamento do -r final');
teste('falar vira falá', () => igual(apagarRFinal('falar'), 'falá'));
teste('comer vira comê', () => igual(apagarRFinal('comer'), 'comê'));
teste('dormir vira dormi', () => igual(apagarRFinal('dormir'), 'dormi'));
teste('amor vira amô', () => igual(apagarRFinal('amor'), 'amô'));
teste('açúcar não perde o r (paroxítona)', () => igual(apagarRFinal('açúcar'), 'açúcar'));
teste('mar é monossílabo, não muda', () => igual(apagarRFinal('mar'), 'mar'));
teste('no modo leve, melhor não muda', () =>
  igual(apagarRFinal('melhor', { soInfinitivo: true }), 'melhor'));
teste('no modo leve, falar muda', () =>
  igual(apagarRFinal('falar', { soInfinitivo: true }), 'falá'));

secao('gerúndio');
teste('falando vira falano', () => igual(reduzirGerundio('falando'), 'falano'));
teste('correndo vira correno', () => igual(reduzirGerundio('correndo'), 'correno'));
teste('dormindo vira dormino', () => igual(reduzirGerundio('dormindo'), 'dormino'));
teste('mundo não é gerúndio', () => igual(reduzirGerundio('mundo'), 'mundo'));
teste('lindo não é gerúndio', () => igual(reduzirGerundio('lindo'), 'lindo'));

secao('diminutivo');
teste('bonitinho vira bonitim', () => igual(reduzirDiminutivo('bonitinho'), 'bonitim'));
teste('devagarinho vira devagarim', () => igual(reduzirDiminutivo('devagarinho'), 'devagarim'));
teste('caminho não é diminutivo', () => igual(reduzirDiminutivo('caminho'), 'caminho'));
teste('vinho não é diminutivo', () => igual(reduzirDiminutivo('vinho'), 'vinho'));

secao('monotongação');
teste('peixe vira pexe', () => igual(monotongar('peixe'), 'pexe'));
teste('dinheiro vira dinhero', () => igual(monotongar('dinheiro'), 'dinhero'));
teste('outro vira ôtro', () => igual(monotongar('outro'), 'ôtro'));
teste('leite não muda (ei antes de t)', () => igual(monotongar('leite'), 'leite'));

secao('concordância só no determinante');
teste('as casas bonitas vira as casa bonita', () => {
  const saida = concordanciaDeSintagma(tokenizar('as casas bonitas'));
  igual(saida.map((t) => t.texto).join(''), 'as casa bonita');
});
teste('pontuação encerra o sintagma', () => {
  const saida = concordanciaDeSintagma(tokenizar('os meninos. as flores amarelas'));
  igual(saida.map((t) => t.texto).join(''), 'os menino. as flor amarela');
});

secao('níveis');
const FRASE = 'Você está trabalhando muito rápido e vai comer o peixe do primeiro dia.';
teste('nível 0 não mexe em nada', () => igual(aplicarSotaque(FRASE, { nivel: 0 }), FRASE));
teste('nível 1 já reduz "está"', () => verdade(aplicarSotaque(FRASE, { nivel: 1 }).includes('tá ')));
teste('nível 1 não vocaliza o lh', () =>
  verdade(aplicarSotaque(FRASE, { nivel: 1 }).includes('trabalhando')));
teste('nível 2 vocaliza e reduz gerúndio', () =>
  verdade(aplicarSotaque(FRASE, { nivel: 2 }).includes('trabaiano')));
teste('nível 3 mexe na concordância', () =>
  verdade(aplicarSotaque('Os meninos bonitos correram.', { nivel: 3 }).includes('Os minino bonito')));

secao('proteções');
teste('marcação de pausa sobrevive', () =>
  verdade(aplicarSotaque('Fale [pausa 800] agora, você.', { nivel: 3 }).includes('[pausa 800]')));
teste('número sobrevive', () =>
  verdade(aplicarSotaque('Custa 1.234,56 reais.', { nivel: 3 }).includes('1.234,56')));
teste('URL sobrevive', () => {
  const saida = aplicarSotaque('Veja em https://exemplo.com/trabalho agora.', { nivel: 3 });
  verdade(saida.includes('https://exemplo.com/trabalho'), 'URL intacta: ' + saida);
});

secao('dicionário do usuário');
teste('roda mesmo com sotaque desligado', () =>
  igual(aplicarSotaque('Use o Xiaomi.', { nivel: 0, dicionario: [{ de: 'Xiaomi', para: 'Chaomi' }] }),
    'Use o Chaomi.'));
teste('respeita a caixa', () =>
  igual(aplicarSotaque('xiaomi', { nivel: 0, dicionario: [{ de: 'Xiaomi', para: 'Chaomi' }] }),
    'chaomi'));

secao('gírias');
teste('são determinísticas', () => {
  const a = aplicarSotaque(FRASE, { nivel: 2, girias: true });
  const b = aplicarSotaque(FRASE, { nivel: 2, girias: true });
  igual(a, b);
});
teste('trocam vocabulário', () =>
  verdade(aplicarSotaque('Isso é muito bom mesmo.', { nivel: 1, girias: true }).includes('arretado')));

secao('variantes');
teste('há quatro regiões', () => igual(listarVariantes().length, 4));
teste('a variante muda os bordões, não a fonética', () => {
  const pe = aplicarSotaque('A festa de ontem foi muito boa mesmo.', { nivel: 2, variante: 'pernambuco', girias: true });
  const ba = aplicarSotaque('A festa de ontem foi muito boa mesmo.', { nivel: 2, variante: 'bahia', girias: true });
  verdade(pe.includes('festa') && ba.includes('festa'), 'a grafia da palavra não muda');
  verdade(pe !== ba, 'os bordões regionais devem diferir');
});

secao('diferenças');
teste('lista os pares trocados', () => {
  const pares = diferencas('Você está falando', aplicarSotaque('Você está falando', { nivel: 2 }));
  verdade(pares.length >= 2, 'esperava ao menos 2 pares, veio ' + pares.length);
});

// ---------------------------------------------------------------------------
// Regressões: cada caso aqui é um defeito que chegou a existir e que só
// apareceu quando alguém leu uma frase inteira em voz alta. Testar as regras
// isoladamente não pegava nenhum deles.

secao('regressões: palavras que a regra destruía');

teste('seixo não vira sexo', () => {
  const saida = aplicarSotaque('O seixo do rio brilhava.', { nivel: 1 });
  verdade(!/\bsexo\b/i.test(saida), 'saída: ' + saida);
  verdade(saida.includes('seixo'), 'saída: ' + saida);
});

teste('eixo continua eixo', () =>
  verdade(aplicarSotaque('O eixo da roda.', { nivel: 2 }).includes('eixo')));

teste('meses não vira "me"', () => {
  const saida = aplicarSotaque('Foram três meses difíceis.', { nivel: 3 });
  verdade(saida.includes('mês'), 'saída: ' + saida);
});

teste('países não vira "paí"', () => {
  const saida = aplicarSotaque('Visitei dois países novos.', { nivel: 3 });
  verdade(saida.includes('país'), 'saída: ' + saida);
});

teste('papéis não vira "papel" solto no plural', () => {
  const saida = aplicarSotaque('Ele pegou os papéis e os lápis.', { nivel: 3 });
  verdade(saida.includes('papéis') && saida.includes('lápis'), 'saída: ' + saida);
});

teste('colher não vira cóier (tônica errada)', () => {
  const saida = aplicarSotaque('Pegue a colher.', { nivel: 2 });
  verdade(!saida.includes('cóier'), 'saída: ' + saida);
});

secao('regressões: singularização');
teste('casas vira casa', () => igual(paraSingular('casas'), 'casa'));
teste('flores vira flor', () => igual(paraSingular('flores'), 'flor'));
teste('dentes vira dente', () => igual(paraSingular('dentes'), 'dente'));
teste('vezes vira vez', () => igual(paraSingular('vezes'), 'vez'));
teste('meses vira mês, com acento', () => igual(paraSingular('meses'), 'mês'));
teste('cafés vira café', () => igual(paraSingular('cafés'), 'café'));
teste('pães vira pão', () => igual(paraSingular('pães'), 'pão'));
teste('lápis fica como está', () => igual(paraSingular('lápis'), ''));
teste('animais fica como está', () => igual(paraSingular('animais'), ''));

secao('regressões: gírias homônimas');
teste('"nossa" possessivo não vira interjeição', () => {
  const saida = aplicarSotaque('Nossa casa fica na rua de trás.', { nivel: 1, girias: true });
  verdade(saida.toLowerCase().includes('nossa casa'), 'saída: ' + saida);
});
teste('"nossa" interjeição vira sim', () =>
  verdade(aplicarSotaque('Nossa, que casa bonita!', { nivel: 1, girias: true }).toLowerCase().includes('vixe')));
teste('"cara" substantivo não vira mermão', () => {
  const saida = aplicarSotaque('A cara dela mudou de cor.', { nivel: 1, girias: true });
  verdade(saida.includes('cara dela'), 'saída: ' + saida);
});
teste('"legal" jurídico não vira massa', () => {
  const saida = aplicarSotaque('É um documento legal.', { nivel: 1, girias: true });
  verdade(saida.includes('legal'), 'saída: ' + saida);
});
teste('"legal!" exclamativo vira massa', () =>
  verdade(aplicarSotaque('Que legal!', { nivel: 1, girias: true }).includes('massa')));

secao('regressões: estrutura do texto');
teste('gírias não apagam a quebra de parágrafo', () => {
  const original = 'Primeiro parágrafo com bastante texto escrito aqui.\n\nSegundo parágrafo com bastante texto escrito aqui.';
  const saida = aplicarSotaque(original, { nivel: 2, girias: true });
  verdade(saida.includes('\n\n'), 'a quebra de parágrafo sumiu: ' + JSON.stringify(saida));
});
teste('"para o" vira "pro" (a regra mais longa vence)', () => {
  const saida = aplicarSotaque('Vou para o trabalho.', { nivel: 1 });
  verdade(saida.includes('pro trabalho'), 'saída: ' + saida);
});

secao('regressões: lista de mudanças');
teste('não inventa pares quando o número de palavras muda', () => {
  const original = 'O trabalho estava muito bom ontem.';
  const saida = aplicarSotaque(original, { nivel: 2, girias: true });
  const pares = diferencas(original, saida);
  for (const par of pares) {
    verdade(
      par.de.toLowerCase() !== 'trabalho' || par.para.toLowerCase() === 'trabaio',
      'par desalinhado: ' + JSON.stringify(par) + ' em ' + JSON.stringify(pares)
    );
  }
});
teste('alinha mesmo com bordão inserido no começo', () => {
  const original = 'Isso é muito bom.';
  const saida = aplicarSotaque(original, { nivel: 2, girias: true });
  const pares = diferencas(original, saida);
  verdade(
    pares.every((p) => p.de.toLowerCase() !== 'isso'),
    'não deveria reportar "Isso" como trocado: ' + JSON.stringify(pares)
  );
});

secao('robustez');
teste('texto vazio', () => igual(aplicarSotaque('', { nivel: 3 }), ''));
teste('só pontuação', () => igual(aplicarSotaque('...!?', { nivel: 3 }), '...!?'));
teste('texto longo não trava', () => {
  const longo = FRASE.repeat(400);
  const t0 = Date.now();
  aplicarSotaque(longo, { nivel: 3, girias: true });
  verdade(Date.now() - t0 < 4000, 'demorou demais');
});

fim();
