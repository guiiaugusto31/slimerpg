'use strict';
// Gera preview/slime-io-teste.html: um único arquivo com o jogo inteiro, para testar sem instalar nada.
// O servidor (server.js) roda dentro da página e alguns slimes-robô fazem companhia.
// Uso: npm run preview   (depois é só abrir o arquivo gerado no navegador)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rd = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const html = rd('public', 'index.html');
const a = html.indexOf('<body>'), b = html.indexOf('<script>var module');
if (a < 0 || b < 0) throw new Error('index.html mudou: não achei <body> ou o primeiro <script>.');
let body = html.slice(a + 6, b).trim();
const STATUS = '<p id="status" class="status" role="status"></p>';
if (!body.includes(STATUS)) throw new Error('index.html mudou: não achei o parágrafo #status.');
body = body.replace(STATUS, STATUS + '\n    <p class="muted" id="previewNote">Versão de teste: o servidor roda dentro desta página e cinco slimes-robô entram na floresta com você, e alguns partem para cima de quem chegar perto (o PvP está ligado). No jogo online, os outros slimes são jogadores de verdade.</p>');

const fonts = (html.match(/<link href="https:\/\/fonts\.googleapis[^>]*>/) || [''])[0];

const imgs = {};
const imgDir = path.join(root, 'public', 'img');
if (fs.existsSync(imgDir)) {
  fs.readdirSync(imgDir).forEach((f) => {
    const m = /\.(png|jpe?g|webp)$/i.exec(f);
    if (m) imgs[f] = 'data:' + MIME[m[1].toLowerCase()] + ';base64,' + fs.readFileSync(path.join(imgDir, f)).toString('base64');
  });
}

const css = rd('public', 'style.css') + `
:root { color-scheme: dark; }
#previewNote { font-size: .85rem; line-height: 1.35; margin: 10px 0 0; }
`;

const out = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<title>SlimeRPG Teste</title>',
  '<meta name="theme-color" content="#0b140f">',
  fonts,
  '<style>' + css + '</style>',
  body,
  '<script>var module = { exports: {} };</script>',
  '<script>' + safe(rd('game-data.js')) + '</script>',
  '<script>window.__IMGS = ' + JSON.stringify(imgs) + '; window.__SLIME_BOTS = 5;</script>',
  '<script>' + safe(rd('tools', 'preview-shim.js')) + '</script>',
  '<script>__slimeStartServer(function (require, module, exports, process, __dirname) {\n' + safe(rd('server.js')) + '\n});</script>',
  '<script>' + safe(rd('public', 'art.js')) + '</script>',
  '<script>' + safe(rd('public', 'fx.js')) + '</script>',
  '<script>' + safe(rd('public', 'conta.js')) + '</script>',
  '<script>' + safe(rd('public', 'qr.js')) + '</script>',
  '<script>' + safe(rd('public', 'loja.js')) + '</script>',
  '<script>' + safe(rd('public', 'audio.js')) + '</script>',
  '<script>' + safe(rd('public', 'game.js')) + '</script>'
].join('\n');

const dir = path.join(root, 'preview');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'slime-io-teste.html');
fs.writeFileSync(file, out);
console.log('Gerado: preview/slime-io-teste.html (' + Math.round(out.length / 1024) + ' KB, ' + Object.keys(imgs).length + ' imagens embutidas)');
