// Gera os ícones do PWA sem depender de nenhuma biblioteca: desenha os pixels
// à mão e escreve o PNG (só precisa do zlib que já vem no Node).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SAIDA = new URL('../icones/', import.meta.url);

function crc32(buf) {
  let c;
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = tabela[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function escreverPng(largura, altura, rgba) {
  const linhas = Buffer.alloc((largura * 4 + 1) * altura);
  for (let y = 0; y < altura; y++) {
    linhas[y * (largura * 4 + 1)] = 0; // filtro "none"
    rgba.copy(linhas, y * (largura * 4 + 1) + 1, y * largura * 4, (y + 1) * largura * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Desenha o ícone: fundo escuro (ou cheio, na versão mascarável) com uma onda
 * sonora em ocre, que é o assunto do app.
 */
function desenhar(tam, mascaravel) {
  const px = Buffer.alloc(tam * tam * 4);
  const raio = tam * 0.22;
  const centro = tam / 2;

  const por = (x, y, r, g, b, a) => {
    const i = (y * tam + x) * 4;
    const af = a / 255;
    px[i] = Math.round(px[i] * (1 - af) + r * af);
    px[i + 1] = Math.round(px[i + 1] * (1 - af) + g * af);
    px[i + 2] = Math.round(px[i + 2] * (1 - af) + b * af);
    px[i + 3] = Math.max(px[i + 3], a);
  };

  // fundo
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      let dentro = true;
      if (!mascaravel) {
        // canto arredondado
        const dx = Math.max(raio - x, x - (tam - raio), 0);
        const dy = Math.max(raio - y, y - (tam - raio), 0);
        dentro = dx * dx + dy * dy <= raio * raio;
      }
      if (!dentro) continue;
      // leve gradiente do topo para a base
      const t = y / tam;
      por(x, y, Math.round(30 - 8 * t), Math.round(26 - 7 * t), Math.round(22 - 6 * t), 255);
    }
  }

  // barras de onda sonora
  const margem = mascaravel ? tam * 0.3 : tam * 0.2;
  const util = tam - margem * 2;
  const nBarras = 7;
  const largura = util / (nBarras * 2 - 1);
  const alturas = [0.28, 0.55, 0.86, 1, 0.86, 0.55, 0.28];

  for (let b = 0; b < nBarras; b++) {
    const x0 = Math.round(margem + b * largura * 2);
    const x1 = Math.round(x0 + largura);
    const alt = alturas[b] * util * 0.62;
    const y0 = Math.round(centro - alt / 2);
    const y1 = Math.round(centro + alt / 2);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (x < 0 || y < 0 || x >= tam || y >= tam) continue;
        // pontas arredondadas
        const dTopo = y - y0;
        const dBase = y1 - 1 - y;
        const meia = largura / 2;
        const dx = Math.abs(x - (x0 + meia) + 0.5);
        if (dTopo < meia && dx * dx + (meia - dTopo) * (meia - dTopo) > meia * meia) continue;
        if (dBase < meia && dx * dx + (meia - dBase) * (meia - dBase) > meia * meia) continue;
        const mistura = b / (nBarras - 1);
        por(x, y, Math.round(240 - 20 * mistura), Math.round(160 - 20 * mistura), Math.round(75 - 15 * mistura), 255);
      }
    }
  }

  return escreverPng(tam, tam, px);
}

mkdirSync(SAIDA, { recursive: true });
writeFileSync(new URL('icone-192.png', SAIDA), desenhar(192, false));
writeFileSync(new URL('icone-512.png', SAIDA), desenhar(512, false));
writeFileSync(new URL('icone-mascara.png', SAIDA), desenhar(512, true));
console.log('ícones gerados em icones/');
