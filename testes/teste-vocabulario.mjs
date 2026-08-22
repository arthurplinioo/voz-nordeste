// Não-regressão de vocabulário.
//
// Os defeitos mais graves deste app não foram de lógica: foram palavras
// destruídas por uma regra que apagou letra demais. "meses" virava "me",
// "pobres" virava "pobr", "seixo" virava "sexo". Cada um foi descoberto por
// alguém lendo uma frase em voz alta, e a resposta era sempre mais uma entrada
// numa lista de exceção — que nunca fica pronta.
//
// Este arquivo troca a caça caso a caso por uma varredura: passa um vocabulário
// comum pelos três níveis de sotaque e cobra duas coisas de cada saída.
//
//   1. continua pronunciável em português (nenhuma palavra termina em grupo
//      consonantal, e toda palavra tem vogal);
//   2. não virou uma OUTRA palavra da lista — que é o caso "seixo/sexo", o mais
//      perigoso de todos, porque não parece defeito nenhum na tela.

import { secao, teste, verdade, igual, fim } from './ajuda.mjs';
import { aplicarSotaque, pronunciavel, tokenizar } from '../js/sotaque.js';
import { normalizar } from '../js/texto.js';

/** Vocabulário de alta frequência, escolhido para cutucar todas as regras. */
const PALAVRAS = `
a agora água ajuda alegre alegres algum amanhã amigo amor andando ano anos antes
aqui árvore assim atrás azul bairro banho barulho bastante bem boa bom bonito
bonitos braço branco brasil cabeça cachorro cada cadeira café cafés caminho campo
casa casas cedo cheio chuva cidade cidades claro coisa coisas colher começar comer
comida como conta contra copo coração cores correndo costas couro criança crianças
cuidado dado dedo dentes dentro depois dever deveres devagar dia dias difícil
dinheiro dizer doente dois dona dormindo dormir dose durante duro elas eles embaixo
entrada entre escola escolas escrever espelho esperar esse esta estrada exemplo
falando falar família favor fazer febre febres feira feliz férias festa fila filho
filhos fim fita flor flores fogo folha fome fora força forte foto frente fresco
frio fruta fundo galho ganhar gente golfinho grande grandes guarda homem hora horas
hoje ideia igreja ilha inteiro irmão irmãos janela jardim jovem jovens juiz juízes
lado lápis largo leite lembrar leve levar limpo livre livres livro logo longe lugar
luz luzes maçã madeira mãe mães mais mal mano mão mãos mar mares mesa meses mesmo
metade metro milho minuto moça moço molho momento montanha morar motor mulher
mulheres mundo muro música nada nome nossa nova novo noite noites número obra
óculos olho olhos onda ontem ordem orelha ouro outro ovo pai pais país países palavra
palha pão pães papel papéis parede parte passo pé pedra peixe pele pena pequeno
perto peso pires plano pobre pobres poder poderes ponte ponto porta prato preço
preto primeiro problema pronto próprio quarto quase quatro queijo quente querer
rapaz razão rede remendo resto rio roda ronda roupa rua sábado saber sacola saída
sal sangue seco segundo seixo sem semana sempre senhor ser sério silêncio simples
sobre sol som sonho sorte sozinho suave sujo tanto tarde tempo terra teto tigre
tigres tijolo tinta tio todo tomar trabalho tranquilo três trigo triste tudo último
único vaca vaga vale vazio velho vento verde vez vezes viagem vida vidro vinho
vizinho voz vozes
`.trim().split(/\s+/);

/** Palavras que a mudança NÃO pode produzir: são outras palavras do idioma. */
const PROIBIDAS = new Set([
  'sexo', 'sexos', 'cu', 'cus', 'caralho', 'merda', 'porra', 'buceta',
  // homônimos indesejados que já apareceram ou que a regra poderia criar
  'mao', 'mão', 'pau',
]);

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

secao('a guarda de pronunciabilidade');
teste('aceita palavra normal', () => verdade(pronunciavel('casa') && pronunciavel('flor')));
teste('aceita final em consoante única', () =>
  verdade(pronunciavel('mar') && pronunciavel('mês') && pronunciavel('mal') && pronunciavel('paz')));
teste('aceita plural em -ns', () => verdade(pronunciavel('jovens')));
teste('recusa grupo consonantal final', () => {
  verdade(!pronunciavel('pobr'), 'pobr');
  verdade(!pronunciavel('simpl'), 'simpl');
  verdade(!pronunciavel('mestr'), 'mestr');
});
teste('recusa palavra sem vogal', () => verdade(!pronunciavel('mst')));
teste('recusa letra solta', () => verdade(!pronunciavel('m')));

secao('varredura do vocabulário pelos três níveis');

for (const nivel of [1, 2, 3]) {
  teste('nível ' + nivel + ': nenhuma palavra sai impronunciável', () => {
    const quebradas = [];
    for (const p of PALAVRAS) {
      const saida = aplicarSotaque(p, { nivel });
      for (const t of tokenizar(saida)) {
        if (t.tipo !== 'palavra') continue;
        if (!pronunciavel(t.texto)) quebradas.push(p + ' -> ' + saida);
      }
    }
    igual(quebradas, [], 'palavras quebradas');
  });

  teste('nível ' + nivel + ': nenhuma palavra vira palavra proibida', () => {
    const colisoes = [];
    for (const p of PALAVRAS) {
      const saida = aplicarSotaque(p, { nivel }).toLowerCase();
      // só interessa quando a regra MUDOU a palavra: "mão" já é "mão" na
      // entrada, e não é a regra que a produziu
      if (saida === p.toLowerCase()) continue;
      if (PROIBIDAS.has(saida) || PROIBIDAS.has(semAcento(saida))) {
        colisoes.push(p + ' -> ' + saida);
      }
    }
    igual(colisoes, [], 'colisões');
  });

  teste('nível ' + nivel + ': nenhuma palavra some', () => {
    const vazias = PALAVRAS.filter((p) => !aplicarSotaque(p, { nivel }).trim());
    igual(vazias, [], 'palavras que sumiram');
  });
}

secao('varredura em frase, com gírias e concordância');

teste('sintagma no plural não destrói nenhuma palavra', () => {
  const quebradas = [];
  for (const p of PALAVRAS) {
    // o determinante plural é o que liga a regra de concordância do nível 3
    const saida = aplicarSotaque('as ' + p + ' bonitas', { nivel: 3 });
    for (const t of tokenizar(saida)) {
      if (t.tipo === 'palavra' && !pronunciavel(t.texto)) {
        quebradas.push(p + ' -> ' + saida);
      }
    }
  }
  igual(quebradas, [], 'palavras quebradas no sintagma');
});

teste('com gírias ligadas também', () => {
  const quebradas = [];
  for (const p of PALAVRAS) {
    const saida = aplicarSotaque('Olha a ' + p + ' ali, meu amigo.', { nivel: 3, girias: true });
    for (const t of tokenizar(saida)) {
      if (t.tipo === 'palavra' && !pronunciavel(t.texto)) quebradas.push(p + ' -> ' + saida);
    }
  }
  igual(quebradas, [], 'palavras quebradas com gírias');
});

secao('normalização não destrói vocabulário');

teste('nenhuma palavra comum é soletrada por engano', () => {
  const soletradas = [];
  for (const p of PALAVRAS) {
    const maiuscula = p.toUpperCase();
    const saida = normalizar('Veja ' + maiuscula + ' aqui');
    // uma palavra soletrada vira letras separadas por espaço
    if (!saida.includes(maiuscula)) soletradas.push(maiuscula + ' -> ' + saida);
  }
  igual(soletradas, [], 'palavras soletradas por engano');
});

teste('a normalização preserva o texto de palavras comuns', () => {
  const alteradas = [];
  for (const p of PALAVRAS) {
    const saida = normalizar(p);
    if (saida.trim() !== p) alteradas.push(p + ' -> ' + saida);
  }
  igual(alteradas, [], 'palavras alteradas');
});

fim();
