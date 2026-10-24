'use strict';
// PWA: manifesto, ícones, service worker e ligações no index.html. Só confere arquivos, sem subir o servidor.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pub = (...p) => path.join(root, 'public', ...p);
let falhas = 0;
function ok(cond, msg) { console.log((cond ? '  ok   ' : '  FALHA ') + msg); if (!cond) falhas++; }
function pngSize(f) { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }

console.log('PWA');
const man = JSON.parse(fs.readFileSync(pub('manifest.webmanifest'), 'utf8'));
ok(man.name && man.short_name && man.start_url === '/' && man.scope === '/', 'manifesto tem nome, início e escopo');
ok(['standalone', 'fullscreen', 'minimal-ui'].includes(man.display), 'manifesto abre como app (' + man.display + ')');
ok(/^#[0-9a-f]{6}$/i.test(man.theme_color) && /^#[0-9a-f]{6}$/i.test(man.background_color), 'manifesto tem cor do tema e do fundo');
const tem = (size, purpose) => man.icons.some((i) => i.sizes === size && i.type === 'image/png' && (i.purpose || 'any').split(' ').includes(purpose));
ok(tem('192x192', 'any') && tem('512x512', 'any'), 'ícones 192 e 512 declarados');
ok(tem('512x512', 'maskable'), 'ícone maskable declarado');
man.icons.forEach((i) => {
  const f = pub(i.src), sz = fs.existsSync(f) && pngSize(f), [w, h] = i.sizes.split('x').map(Number);
  ok(sz && sz[0] === w && sz[1] === h, 'arquivo ' + i.src + ' existe e tem ' + i.sizes);
});
const apple = pngSize(pub('icons', 'apple-touch-icon.png'));
ok(apple && apple[0] === 180 && apple[1] === 180, 'apple-touch-icon tem 180x180');

const html = fs.readFileSync(pub('index.html'), 'utf8');
ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'index.html liga o manifesto');
ok(/rel="apple-touch-icon"/.test(html) && /rel="icon"/.test(html), 'index.html tem ícone e ícone da Apple');
ok(/<script src="pwa\.js"><\/script>/.test(html), 'index.html carrega pwa.js');
ok(/id="installBtn"[^>]*hidden/.test(html), 'botão de instalar começa escondido');

const sw = fs.readFileSync(pub('sw.js'), 'utf8');
ok(/addEventListener\('fetch'/.test(sw), 'service worker tem o fetch (exigido para instalar)');
ok(/api\\\/\|admin\\\/\|status\$\|data\\\.json\$/.test(sw), 'contas, admin, status e dados vivos nunca ficam guardados');
ok(/if \(req\.method !== 'GET'\) return;/.test(sw), 'só guarda GET');
ok(/fetch\(req\)\.then/.test(sw) && /\.catch\(function \(\) \{\s*return caches\.match\(req\)/.test(sw), 'rede primeiro, guardado só se a rede falhar');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
ok(/'\.webmanifest': 'application\/manifest\+json'/.test(srv), 'servidor entrega o manifesto com o tipo certo');

if (falhas) { console.log('\n' + falhas + ' falha(s)'); process.exit(1); }
console.log('\nTudo certo (PWA)');
