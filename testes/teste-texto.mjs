import { secao, teste, igual, verdade, fim } from './ajuda.mjs';
import {
  numeroPorExtenso, ordinalPorExtenso, normalizar, segmentar, lerPausa,
  limparMarcacao, dividirEmFrases, quebrarPorTamanho, estimarDuracao, formatarDuracao,
} from '../js/texto.js';

secao('número por extenso');
teste('zero', () => igual(numeroPorExtenso(0), 'zero'));
teste('unidades', () => igual(numeroPorExtenso(7), 'sete'));
teste('adolescentes', () => igual(numeroPorExtenso(15), 'quinze'));
teste('dezenas com unidade', () => igual(numeroPorExtenso(42), 'quarenta e dois'));
teste('cem exato', () => igual(numeroPorExtenso(100), 'cem'));
teste('cento e um', () => igual(numeroPorExtenso(101), 'cento e um'));
teste('duzentos e cinquenta', () => igual(numeroPorExtenso(250), 'duzentos e cinquenta'));
teste('mil', () => igual(numeroPorExtenso(1000), 'mil'));
teste('mil e um', () => igual(numeroPorExtenso(1001), 'mil e um'));
teste('mil duzentos e trinta e quatro', () =>
  igual(numeroPorExtenso(1234), 'mil duzentos e trinta e quatro'));
teste('dois mil e vinte e seis', () => igual(numeroPorExtenso(2026), 'dois mil e vinte e seis'));
teste('um milhão', () => igual(numeroPorExtenso(1000000), 'um milhão'));
teste('dois milhões', () => igual(numeroPorExtenso(2000000), 'dois milhões'));
teste('feminino muda um e dois', () => {
  igual(numeroPorExtenso(1, true), 'uma');
  igual(numeroPorExtenso(2, true), 'duas');
});
teste('duzentas no feminino', () => igual(numeroPorExtenso(200, true), 'duzentas'));

secao('ordinais');
teste('primeiro', () => igual(ordinalPorExtenso(1), 'primeiro'));
teste('segunda no feminino', () => igual(ordinalPorExtenso(2, true), 'segunda'));
teste('décimo terceiro', () => igual(ordinalPorExtenso(13), 'décimo terceiro'));
teste('vigésimo primeiro', () => igual(ordinalPorExtenso(21), 'vigésimo primeiro'));

secao('normalização');
teste('moeda', () =>
  verdade(normalizar('R$ 1.234,56').includes('mil duzentos e trinta e quatro reais e cinquenta e seis centavos')));
teste('um real no singular', () => verdade(normalizar('R$ 1,00').includes('um real')));
teste('porcentagem', () => verdade(normalizar('15%').includes('quinze por cento')));
teste('hora com minuto', () => verdade(normalizar('14h30').includes('catorze horas e trinta minutos')));
teste('hora cheia', () => verdade(normalizar('às 9h ').includes('nove horas')));
teste('data', () => verdade(normalizar('05/09/2026').includes('cinco de setembro de dois mil e vinte e seis')));
teste('dia primeiro', () => verdade(normalizar('01/01/2027').includes('primeiro de janeiro')));
teste('mês inválido não vira data', () => {
  const saida = normalizar('40/40/2020');
  verdade(!saida.includes('de janeiro') && !saida.includes('de dezembro'), 'veio: ' + saida);
});
teste('ordinal com marcador', () => verdade(normalizar('1º lugar').includes('primeiro lugar')));
teste('unidade de medida', () => verdade(normalizar('22km/h').includes('vinte e dois quilômetros por hora')));
teste('abreviação', () => verdade(normalizar('Dr. Silva').includes('doutor')));
teste('sigla soletrada', () => verdade(normalizar('meu CPF').includes('cê pê éfe')));
teste('sigla que é palavra não soletra', () => verdade(normalizar('a ONU disse').includes('ONU')));
teste('soletração pode ser desligada', () =>
  verdade(normalizar('meu CPF', { soletrarSiglas: false }).includes('CPF')));
teste('texto todo em caixa alta não vira soletração', () => {
  const saida = normalizar('ATENÇÃO TODOS OS ALUNOS DEVEM COMPARECER HOJE');
  verdade(saida.includes('ALUNOS'), 'veio: ' + saida);
});
teste('marcação de pausa sobrevive à normalização', () =>
  verdade(normalizar('Espere [pausa 500] e conte 10.').includes('[pausa 500]')));
teste('marcação não vira número por engano', () => {
  const saida = normalizar('a [pausa 500] b [pausa 900] c');
  verdade(saida.includes('[pausa 500]') && saida.includes('[pausa 900]'), 'veio: ' + saida);
});
teste('texto vazio', () => igual(normalizar(''), ''));

secao('leitura de pausa');
teste('sem valor usa o padrão', () => igual(lerPausa(), 600));
teste('milissegundos', () => igual(lerPausa('300'), 300));
teste('segundos', () => igual(lerPausa('1.5', 's'), 1500));
teste('vírgula decimal', () => igual(lerPausa('1,5', 's'), 1500));
teste('valor absurdo é limitado', () => igual(lerPausa('99999999'), 30000));
teste('valor inválido cai no padrão', () => igual(lerPausa('abc'), 600));

secao('limpeza de marcação');
teste('tira pausa e ênfase', () =>
  igual(limparMarcacao('Fale [pausa 500] *assim* agora'), 'Fale assim agora'));

secao('divisão em frases');
teste('divide em ponto final', () => igual(dividirEmFrases('Um. Dois. Três.').length, 3));
teste('abreviação não quebra a frase', () => {
  const f = dividirEmFrases('Falei com o Dr. Silva ontem. Ele concordou.');
  igual(f.length, 2, 'veio: ' + JSON.stringify(f.map((x) => x.texto)));
});
teste('vírgula só quebra quando pedido', () => {
  igual(dividirEmFrases('Um, dois, três.', false).length, 1);
  igual(dividirEmFrases('Um, dois, três.', true).length, 3);
});

secao('quebra por tamanho');
teste('frase curta fica inteira', () => igual(quebrarPorTamanho('Oi.', 100), ['Oi.']));
teste('frase longa é dividida', () => {
  const longa = 'palavra '.repeat(80).trim();
  const partes = quebrarPorTamanho(longa, 100);
  verdade(partes.length > 1);
  verdade(partes.every((p) => p.length <= 100), 'alguma parte passou de 100');
});
teste('palavra gigante não some', () => {
  const partes = quebrarPorTamanho('x'.repeat(500), 100);
  igual(partes.join('').length, 500);
});

secao('segmentação');
teste('conta os trechos', () => {
  const s = segmentar('Um. Dois.\n\nTrês.', {});
  igual(s.length, 3);
});
teste('pausa entre frases vem dos ajustes', () => {
  const s = segmentar('Um. Dois.', { pausaFrase: 500 });
  igual(s[0].pausaMs, 500);
});
teste('último trecho não tem pausa', () => {
  const s = segmentar('Um. Dois.', { pausaFrase: 500 });
  igual(s[s.length - 1].pausaMs, 0);
});
teste('pausa de parágrafo é maior', () => {
  const s = segmentar('Um.\n\nDois.', { pausaFrase: 300, pausaParagrafo: 1200 });
  igual(s[0].pausaMs, 1200);
});
teste('pausa explícita manda no ritmo', () => {
  const s = segmentar('Um [pausa 2s] dois.', { pausaFrase: 300 });
  igual(s[0].pausaMs, 2000);
});
teste('ênfase é reconhecida e o asterisco sai do texto', () => {
  const s = segmentar('*Atenção agora.*', {});
  igual(s[0].enfase, true);
  igual(s[0].texto, 'Atenção agora.');
});
teste('texto vazio dá zero trechos', () => igual(segmentar('   \n\n  ', {}).length, 0));
teste('só marcação não gera trecho mudo', () => igual(segmentar('[pausa 500]', {}).length, 0));

secao('estimativa');
teste('mais texto, mais tempo', () => {
  const curto = estimarDuracao(segmentar('Oi.', {}), 1);
  const longo = estimarDuracao(segmentar('Oi. '.repeat(50), {}), 1);
  verdade(longo > curto);
});
teste('velocidade maior encurta', () => {
  const s = segmentar('Uma frase de tamanho normal para medir.', {});
  verdade(estimarDuracao(s, 2) < estimarDuracao(s, 1));
});
teste('formata em minutos e segundos', () => igual(formatarDuracao(65000), '1:05'));

fim();
