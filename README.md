# Voz Nordeste

Estúdio de voz que roda inteiro no navegador. Transforma **texto em fala** e
**fala em outra voz**, com sotaque nordestino simulado, controle de pausas,
velocidade, tom e timbre.

Não precisa instalar nada, não tem servidor e não tem conta. Depois de baixar o
modelo de voz uma vez (~60 MB), funciona sem internet.

**App:** https://arthurplinioo.github.io/voz-nordeste/

---

## O que ele faz

### Texto → Voz
- Editor com marcações: `[pausa 800]` para uma pausa de 800 ms, `[pausa 2s]`
  para 2 segundos, e `*assim*` para dar ênfase a um trecho.
- Prévia lado a lado: você vê exatamente o texto que vai ser falado, com as
  palavras que o sotaque mudou destacadas.
- Números, valores, datas, horas, siglas e abreviações lidos por extenso
  (`R$ 1.234,56` vira "mil duzentos e trinta e quatro reais e cinquenta e seis
  centavos").
- Pausas ajustáveis entre frases, entre parágrafos e em vírgulas.
- Velocidade, tom (altura) e timbre (formante) com controle contínuo.
- Exportação em WAV e MP3, e uma biblioteca local de áudios salvos.
- Presets: salve uma combinação de voz + sotaque + pausas e reutilize.

### Voz → Voz
Três caminhos, do mais simples ao mais poderoso:

1. **Trocar o timbre** (offline) — grave pelo microfone ou carregue um arquivo e
   troque a voz mantendo a sua entonação e o seu ritmo. Dez efeitos rápidos
   (mais grave, para feminina, criança, gigante, telefone, anônimo…) além dos
   controles finos.
2. **Transcrever e refalar** — sua fala vira texto, você corrige, e uma voz do
   app fala o texto corrigido.
3. **Conversão na nuvem** — fala → fala com IA de verdade, inclusive com voz
   clonada. Precisa de chave própria (veja abaixo).

### Sotaque nordestino
Quatro intensidades (desligado, leve, médio, forte) e quatro regiões (Nordeste
geral, Ceará, Pernambuco, Bahia), com um botão à parte para gírias e bordões.

O que o motor faz, por nível:

| Traço | Exemplo | Nível |
|---|---|---|
| Monotongação | peixe → pexe, outro → ôtro | 1 |
| Queda do -r no infinitivo | falar → falá | 1 |
| Reduções da fala corrente | está → tá, para → pra | 1 |
| Vocalização do /ʎ/ | trabalho → trabaio, mulher → muié | 2 |
| Queda do -r geral | amor → amô | 2 |
| Gerúndio sem /d/ | falando → falano | 2 |
| Diminutivo nasal | devagarinho → devagarim | 2 |
| Léxico regional | você → ocê, mesmo → mermo | 2 |
| Alçamento pretônico | menino → minino, comida → cumida | 3 |
| Plural só no determinante | as casas bonitas → as casa bonita | 3 |

---

## O que ele **não** faz (e por quê)

Vale ler antes de esperar demais do app.

**Não existe voz neural nordestina de código aberto.** O Piper, o único motor
neural que roda dentro do navegador, tem duas vozes portuguesas utilizáveis —
`pt_BR-faber-medium` e `pt_PT-tugão-medium` — as duas masculinas e de sotaque
neutro. Uma terceira, `pt_BR-edresson-low`, é incompatível com este motor
(o phonemizador usa a tabela de fonemas padrão e ignora a do modelo, o que
estoura no encoder).

**O sotaque é simulado por reescrita, não por um modelo treinado.** Reescrever
"trabalho" como "trabaio" faz o phonemizador produzir [tra'baju], que é o que um
falante do Nordeste diz. Isso cobre muita coisa (a tabela acima), mas deixa de
fora o traço mais forte de todos: **a vogal pretônica aberta** — o [ɛ] de
"mEnino" e o [ɔ] de "cOração". Não dá para forçar pela ortografia, porque em
português o acento agudo também desloca a tônica: escrever "ménino" faria o
motor acentuar o "mé". Só um modelo treinado com fala nordestina, ou entrada
direta em fonemas, resolveria.

**As outras vozes vêm de processamento, não de outros modelos.** Dona Maria,
Luana, Juca e as demais saem todas do mesmo Faber, com altura e formantes
deslocados de forma independente (veja abaixo). Funciona bem, mas não é a mesma
coisa que uma atriz gravando.

**"Extremamente natural" tem teto aqui.** O Piper é um VITS pequeno: soa bem,
não soa humano. Se você precisa de qualidade de estúdio ou de sotaque nordestino
de verdade, o caminho é a nuvem — está descrito logo abaixo.

**O chiado de coda de Recife e Salvador ficou de fora.** Trocar o "s" por "x"
antes de consoante ("festa" → "fexta") parecia resolver, mas não se sustenta:
"escola" viraria "excola", que o eSpeak pode ler com /k/, e o "x" antes de "t"
costuma soar /s/ mesmo. Como não há como conferir a saída fonética sem ouvir
caso a caso, a regra saiu. As variantes regionais se distinguem pelo léxico e
pelos bordões.

**Transcrever arquivo de áudio não funciona offline.** A Web Speech API só
escuta o microfone. Para arquivo, use a aba de efeitos (que processa o som
direto) ou a conversão na nuvem.

**Há um teto de 20 mil caracteres por geração.** Acima disso o navegador fica
sem memória: o áudio emendado é um único bloco contíguo de floats, e uma hora e
meia de fala passa de meio gigabyte só no primeiro buffer. Textos maiores
precisam ser gerados em partes.

---

## O caminho para sotaque nordestino de verdade

O app tem um motor opcional na nuvem (ElevenLabs, chave sua). Com ele dá para:

1. **Clonar uma voz** a partir de 1 a 5 minutos de fala limpa. Grave um falante
   do Nordeste — ou você mesmo — e o modelo aprende o sotaque junto com o
   timbre. É o único caminho realmente eficaz para sotaque regional.
2. **Converter fala em fala** (speech-to-speech): sua entonação e seu ritmo são
   preservados, só o timbre muda. É o que os apps comerciais de "voice changer"
   fazem por dentro.

A chave fica guardada **só no seu navegador** e vai direto para a API — este app
não tem servidor, então não há para onde mais ela ir. Ainda assim, chave em
navegador é chave exposta: use uma com permissão restrita e apague quando não
precisar mais. E só clone a voz de alguém com autorização de quem falou.

---

## Como as vozes são feitas

Altura e formantes normalmente andam juntos. Um pitch shifter comum (esticar no
tempo, depois reamostrar) move os dois — por isso soa "esquilo" quando você sobe
a voz de um homem.

Aqui um vocoder de fase separa os dois:

- o espectro de cada quadro é dividido pelo seu **envelope**, obtido por cepstro
  (que é justamente a parte que descreve as ressonâncias do trato vocal);
- o envelope é reamostrado pelo fator de formante pedido e recolocado;
- só então vem o alongamento no tempo e a reamostragem que deslocam a altura.

O resultado: dá para subir 7 semitons de altura e 4,5 de formante e obter uma
voz feminina convincente, ou subir a altura sem mexer no formante e obter a
mesma pessoa falando mais agudo.

Referência prática: voz masculina adulta fica perto de 110 Hz, feminina adulta
perto de 200 Hz (~10 semitons acima), com formantes cerca de 15% mais altos
(~2,5 semitons) por causa do trato vocal mais curto.

---

## Privacidade

Por padrão, **nada sai do aparelho**: o texto, o áudio gravado e o áudio gerado
ficam todos no navegador. As duas exceções avisam antes de agir:

- **transcrição**: a Web Speech API manda o áudio do microfone para o servidor
  do fabricante do navegador;
- **motor na nuvem**: o texto ou o áudio vai para a ElevenLabs, com a sua chave.

O modelo de voz é baixado do Hugging Face na primeira vez e fica guardado no
OPFS do navegador.

---

## Rodando localmente

```bash
npm install
npm run bundle
npm start
```

Depois abra http://localhost:4173. O `npm run bundle` empacota o worker do Piper;
só precisa rodar de novo se `src-worker/` mudar.

Testes:

```bash
npm test
```

São 248 testes cobrindo as regras de sotaque, a normalização de texto, a
segmentação, o vocoder de fase (medindo altura por autocorrelação e formante por
envelope cepstral) e a montagem do WAV.

O arquivo `testes/teste-vocabulario.mjs` merece nota: em vez de caçar palavra
quebrada uma a uma, ele passa um vocabulário de uso comum pelos três níveis de
sotaque e cobra que toda saída continue pronunciável em português — nenhuma
palavra termina em grupo consonantal, e nenhuma vira outra palavra da lista.
Foi assim que a classe inteira de defeitos ("meses" virando "me", "pobres"
virando "pobr") deixou de depender de listas de exceção crescentes.

---

## Estrutura

```
index.html              tela única com quatro abas
css/estilo.css
js/app.js               liga a interface aos módulos
js/sintese.js           orquestra texto → segmentos → motor → emenda → timbre
js/sotaque.js           motor de sotaque nordestino
js/texto.js             normalização, marcações e segmentação
js/dsp.js               FFT, vocoder de fase, formantes, efeitos
js/dsp-worker.js        processamento fora da thread principal
js/piper.js             fachada do motor neural
js/piper-worker.bundle.js  gerado por `npm run bundle`
js/nuvem.js             ElevenLabs (opcional)
js/audio.js             WAV, MP3, emenda, forma de onda
js/stt.js               microfone e transcrição
js/bd.js                ajustes, presets, dicionário, áudios salvos
sw.js                   service worker (funciona offline)
src-worker/             fonte do worker do Piper
testes/                 suíte de testes
ferramentas/            gerador de ícones e servidor de desenvolvimento
```

---

## Créditos e licenças

- Motor de voz: [Piper](https://github.com/rhasspy/piper) via
  [@diffusionstudio/vits-web](https://www.npmjs.com/package/@diffusionstudio/vits-web) (MIT).
- Modelos de voz: [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices).
- Codificador MP3: [lamejs](https://github.com/gideonstele/lamejs) (LGPL),
  incluído em `vendor/`.
