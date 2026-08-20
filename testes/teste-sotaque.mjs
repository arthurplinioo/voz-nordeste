import { secao, teste, igual, verdade, fim } from './ajuda.mjs';
import {
  aplicarSotaque, vocalizarLh, apagarRFinal, reduzirGerundio,
  reduzirDiminutivo, monotongar, chiar, concordanciaDeSintagma, tokenizar,
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

secao('chiado de coda (PE/BA)');
teste('festa vira fexta', () => igual(chiar('festa'), 'fexta'));
teste('casa não muda (s entre vogais)', () => igual(chiar('casa'), 'casa'));

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
teste('só PE e BA têm chiado', () => {
  const pe = aplicarSotaque('A festa foi boa.', { nivel: 2, variante: 'pernambuco' });
  const ce = aplicarSotaque('A festa foi boa.', { nivel: 2, variante: 'ceara' });
  verdade(pe.includes('fexta'), 'PE: ' + pe);
  verdade(ce.includes('festa'), 'CE: ' + ce);
});

secao('diferenças');
teste('lista os pares trocados', () => {
  const pares = diferencas('Você está falando', aplicarSotaque('Você está falando', { nivel: 2 }));
  verdade(pares.length >= 2, 'esperava ao menos 2 pares, veio ' + pares.length);
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
