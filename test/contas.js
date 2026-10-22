'use strict';
// Testes das contas por e-mail: API (arquivo e Postgres de mentira) e integração com o jogo (login pelo WebSocket, progresso no servidor).
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-contas-'));
process.env.DATA_DIR = path.join(TMP, 'jogo');
process.env.PORT = '3977';
const { create, FileStore } = require('../accounts');

let oks = 0, fails = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(c, msg) { if (c) { oks++; console.log('  ok  ', msg); } else { fails++; console.log('  FALHA', msg); } }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// servidor HTTP só com as contas, numa porta qualquer
function serve(acc) {
  const srv = http.createServer((req, res) => { if (!acc.handle(req, res, req.url.split('?')[0])) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}
async function call(base, method, url, body, token, ip) {
  const r = await fetch(base + url, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}, ip ? { 'X-Forwarded-For': ip } : {}),
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const codeOf = (mail) => /\b(\d{6})\b/.exec(mail.text)[1];

async function suite(label, makeStore, reopen) {
  console.log('Contas (' + label + ')');
  const sent = [];
  const mailer = async (to, subject, text) => { sent.push({ to, subject, text }); };
  const store = await makeStore();
  const acc = create({ store, mailer, trustProxy: true, limits: { register: [500, 1], login: [500, 1], loginIp: [500, 1], code: [500, 1], forgot: [500, 1], forgotMail: [500, 1], resend: [500, 1] } });
  const { srv, base } = await serve(acc);
  const P = (u, b, t) => call(base, 'POST', u, b, t, '10.0.0.' + (1 + Math.floor(Math.random() * 200)));

  const cfg = await call(base, 'GET', '/api/config');
  ok(cfg.status === 200 && cfg.body.mail === true && cfg.body.persistent === (label === 'postgres'), 'config informa e-mail ligado e se o armazenamento é permanente (' + JSON.stringify(cfg.body) + ')');
  ok((await P('/api/register', { email: 'sem-arroba', password: '12345678' })).status === 400, 'cadastro recusa e-mail inválido');
  ok((await P('/api/register', { email: 'a@b.com', password: '123' })).status === 400, 'cadastro recusa senha curta');

  let r = await P('/api/register', { email: 'Ana@Teste.com ', password: 'senha-forte-1' });
  ok(r.status === 200 && r.body.token && r.body.email === 'ana@teste.com' && r.body.verified === false, 'cadastro cria conta não confirmada (e-mail em minúsculas)');
  const tok1 = r.body.token;
  ok(sent.length === 1 && sent[0].to === 'ana@teste.com' && /^\d{6}$/.test(codeOf(sent[0])), 'código de 6 dígitos enviado por e-mail');
  ok(!JSON.stringify(sent[0]).includes('senha-forte-1'), 'a senha nunca vai no e-mail');

  r = await P('/api/register', { email: 'ana@teste.com', password: 'outra-senha-9' });
  const tok2 = r.body.token;
  ok(r.status === 200 && tok2 && tok2 !== tok1, 'cadastro não confirmado pode ser refeito (evita roubar e-mail dos outros)');
  ok((await call(base, 'GET', '/api/me', null, tok1)).status === 401 && (await call(base, 'GET', '/api/me', null, tok2)).status === 200, 'o login antigo caiu e o novo funciona');

  ok((await P('/api/verify', { code: '000000' }, tok2)).status === 400, 'código errado é recusado');
  r = await P('/api/verify', { code: codeOf(sent[sent.length - 1]) }, tok2);
  ok(r.status === 200 && r.body.verified === true, 'código certo confirma o e-mail');
  ok((await P('/api/register', { email: 'ana@teste.com', password: 'qualquer-coisa' })).status === 409, 'e-mail confirmado não pode ser cadastrado de novo');

  ok((await P('/api/login', { email: 'ana@teste.com', password: 'errada-123' })).status === 401, 'login com senha errada falha');
  ok((await P('/api/login', { email: 'ninguem@teste.com', password: 'errada-123' })).status === 401, 'login de e-mail inexistente dá a mesma resposta');
  r = await P('/api/login', { email: 'ANA@teste.com', password: 'outra-senha-9' });
  ok(r.status === 200 && r.body.verified === true && r.body.token, 'login certo funciona');
  const tok3 = r.body.token;
  r = await call(base, 'GET', '/api/me', null, tok3);
  ok(r.status === 200 && r.body.email === 'ana@teste.com' && r.body.hasSave === false, '/api/me mostra a conta');

  // progresso fica no armazenamento e sobrevive a "reiniciar o servidor"
  const accRow = await store.byEmail('ana@teste.com');
  acc.saveProgress(accRow.id, { items: ['espada_1', 'vital_2'], equip: { w: ['espada_1', null], a: 'vital_2' }, kills: { lobo: 3 }, pk: 0, done: ['q_arco'] });
  await acc.flush();
  const store2 = await reopen(store);
  const acc2 = create({ store: store2, mailer });
  const back = await acc2.auth(tok3);
  const sv = back && (await acc2.loadSave(back));
  ok(back && back.email === 'ana@teste.com' && sv && sv.items.join() === 'espada_1,vital_2' && sv.kills.lobo === 3, 'progresso e login sobrevivem a um reinício do servidor');
  await acc2.close();

  // recuperação de senha
  sent.length = 0;
  r = await P('/api/forgot', { email: 'ninguem@teste.com' });
  ok(r.status === 200 && sent.length === 0, 'esqueci a senha: e-mail desconhecido responde igual e não envia nada');
  r = await P('/api/forgot', { email: 'ana@teste.com' });
  ok(r.status === 200 && sent.length === 1, 'esqueci a senha: e-mail conhecido recebe o código');
  const rc = codeOf(sent[0]);
  ok((await P('/api/reset', { email: 'ana@teste.com', code: '111111' === rc ? '222222' : '111111', password: 'nova-senha-77' })).status === 400, 'redefinir com código errado falha');
  r = await P('/api/reset', { email: 'ana@teste.com', code: rc, password: 'nova-senha-77' });
  ok(r.status === 200, 'redefinir com o código certo funciona');
  ok((await P('/api/login', { email: 'ana@teste.com', password: 'outra-senha-9' })).status === 401, 'a senha antiga deixou de valer');
  ok((await call(base, 'GET', '/api/me', null, tok3)).status === 401, 'quem estava logado precisa entrar de novo depois de trocar a senha');
  r = await P('/api/login', { email: 'ana@teste.com', password: 'nova-senha-77' });
  ok(r.status === 200, 'login com a senha nova');
  const tok4 = r.body.token;
  ok((await P('/api/reset', { email: 'ana@teste.com', code: rc, password: 'terceira-senha-1' })).status === 400, 'o código de recuperação só vale uma vez');

  // tentativas de código
  r = await P('/api/register', { email: 'bia@teste.com', password: 'senha-da-bia-1' });
  const tb = r.body.token, realCode = codeOf(sent[sent.length - 1]);
  for (let i = 0; i < 5; i++) await P('/api/verify', { code: realCode === '123456' ? '654321' : '123456' }, tb);
  ok((await P('/api/verify', { code: realCode }, tb)).status === 400, 'depois de 5 erros o código é invalidado, até o certo');

  // sair e excluir
  await P('/api/logout', {}, tok4);
  ok((await call(base, 'GET', '/api/me', null, tok4)).status === 401, 'sair derruba o login');
  r = await P('/api/login', { email: 'ana@teste.com', password: 'nova-senha-77' });
  const tok5 = r.body.token;
  ok((await P('/api/delete', { password: 'errada' }, tok5)).status === 401, 'excluir conta pede a senha');
  ok((await P('/api/delete', { password: 'nova-senha-77' }, tok5)).status === 200 && (await store.byEmail('ana@teste.com')) === null, 'excluir conta apaga tudo');
  ok((await P('/api/login', { email: 'ana@teste.com', password: 'nova-senha-77' })).status === 401, 'conta excluída não entra mais');

  // login vencido
  r = await P('/api/register', { email: 'caio@teste.com', password: 'senha-do-caio-1' });
  await store.putSession(sha(r.body.token), (await store.byEmail('caio@teste.com')).id, Date.now() - 1000);
  ok((await acc.auth(r.body.token)) === null, 'login vencido não vale');
  ok((await acc.auth('lixo')) === null && (await acc.auth(undefined)) === null, 'token inválido não vale');

  // senha guardada com hash
  const row = await store.byEmail('caio@teste.com');
  ok(/^scrypt1\$/.test(row.pass) && !row.pass.includes('senha-do-caio-1'), 'a senha é guardada só como hash (scrypt)');

  srv.close(); await acc.close();
}

async function limitsAndNoMail() {
  console.log('Contas (limites e sem e-mail)');
  const dir = path.join(TMP, 'lim');
  const acc = create({ store: new FileStore(dir), mailer: null, trustProxy: true, limits: { login: [3, 60000], register: [2, 60000] } });
  const { srv, base } = await serve(acc);
  let r = await call(base, 'POST', '/api/register', { email: 'x@teste.com', password: 'senha-do-x-123' }, null, '9.9.9.9');
  ok(r.status === 200 && r.body.verified === true && r.body.mail === false, 'sem e-mail configurado a conta já nasce confirmada');
  r = await call(base, 'POST', '/api/forgot', { email: 'x@teste.com' }, null, '9.9.9.9');
  ok(r.status === 501, 'sem e-mail, recuperar senha fica desligado');
  let last = 0;
  for (let i = 0; i < 5; i++) last = (await call(base, 'POST', '/api/login', { email: 'x@teste.com', password: 'errada-12345' }, null, '9.9.9.8')).status;
  ok(last === 429, 'muitas tentativas de login seguidas são bloqueadas (429)');
  ok((await call(base, 'POST', '/api/login', { email: 'x@teste.com', password: 'senha-do-x-123' }, null, '9.9.9.7')).status === 200, 'o bloqueio é por origem: outro IP entra normalmente');
  await call(base, 'POST', '/api/register', { email: 'y1@teste.com', password: 'senha-12345' }, null, '9.9.9.6');
  await call(base, 'POST', '/api/register', { email: 'y2@teste.com', password: 'senha-12345' }, null, '9.9.9.6');
  ok((await call(base, 'POST', '/api/register', { email: 'y3@teste.com', password: 'senha-12345' }, null, '9.9.9.6')).status === 429, 'muitos cadastros do mesmo IP são bloqueados');
  r = await call(base, 'POST', '/api/register', { email: 'z@teste.com', password: 'x'.repeat(5000) }, null, '9.9.9.5');
  ok(r.status === 400, 'pedido grande demais é recusado');
  srv.close(); await acc.close();
}

// ---- integração com o jogo (server.js de verdade) ----
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const c = { ws, msgs: [], me: null, closed: false };
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); c.msgs.push(m); if (m.t === 'me') c.me = m; });
  ws.on('close', () => { c.closed = true; });
  c.open = new Promise((r) => ws.on('open', r));
  c.has = (t) => c.msgs.find((m) => m.t === t);
  c.wait = async (t, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = c.has(t); if (m) return m; await sleep(30); } return null; };
  return c;
}
async function game() {
  console.log('Contas no jogo');
  const S = require('../server');
  await sleep(300);
  const acc = S.getAccounts();
  const port = 3977, base = 'http://127.0.0.1:' + port;
  ok(acc && acc.status().kind === 'arquivo', 'o servidor sobe com o armazenamento em arquivo quando não há DATABASE_URL');
  const cfg = await call(base, 'GET', '/api/config');
  ok(cfg.status === 200 && cfg.body.mail === false && cfg.body.persistent === false && cfg.body.import === true, 'GET /api/config responde no servidor do jogo');
  let r = await call(base, 'POST', '/api/register', { email: 'jogador@teste.com', password: 'senha-do-jogo-1' });
  const token = r.body.token;
  ok(r.status === 200 && token, 'cadastro pelo servidor do jogo');

  // 1ª entrada: conta nova importa o progresso do navegador (uma vez)
  const local = { items: ['espada_1', 'nao_existe'], equip: { w: ['espada_1', null], a: 'vital_0' }, kills: { lobo: 2 }, pk: 0, done: [] };
  let c1 = client(port); await c1.open;
  c1.ws.send(JSON.stringify({ t: 'join', name: 'Ana', color: '#ff00aa', token, save: local }));
  const init1 = await c1.wait('init');
  ok(init1 && init1.acct === 'jogador@teste.com', 'entrar com token loga na conta (init traz o e-mail)');
  await sleep(200);
  ok(c1.me && c1.me.inv.join() === 'espada_1', 'conta nova importou o progresso do navegador, já validado');
  const p1 = [...S.rooms[0].players.values()].find((p) => p.acct);
  ok(p1 && p1.acct.email === 'jogador@teste.com', 'o jogador fica ligado à conta no servidor');

  // joga um pouco: ganha item e missão; sair grava
  p1.inv.push('maca_2'); p1.kills.javali = 7; p1.saveDirty = true;
  c1.ws.close(); await sleep(300); await acc.flush();
  const row = await acc.store.byEmail('jogador@teste.com');
  ok(row.save && row.save.items.includes('maca_2') && row.save.items.includes('espada_1') && row.save.kills.javali === 7, 'ao sair, o progresso vai para o servidor');
  ok(!S.online.has(row.id), 'a conta é liberada ao sair');

  // 2ª entrada, em "outro navegador": o servidor vale mais que o save local
  const c2 = client(port); await c2.open;
  c2.ws.send(JSON.stringify({ t: 'join', name: 'Ana', color: '#ff00aa', token, save: { items: ['arco_5'], equip: {}, kills: {}, pk: 0, done: [] } }));
  await c2.wait('init'); await sleep(200);
  ok(c2.me.inv.includes('maca_2') && c2.me.inv.includes('espada_1') && !c2.me.inv.includes('arco_5'), 'o progresso da conta vale mais que o save do navegador (não dá para editar o localStorage)');
  ok(!c2.msgs.some((m) => m.t === 'save'), 'jogador com conta não recebe save no navegador');

  // mesma conta em dois lugares: o antigo é derrubado
  const c3 = client(port); await c3.open;
  c3.ws.send(JSON.stringify({ t: 'join', name: 'Ana2', color: '#00ffaa', token }));
  await c3.wait('init'); await sleep(200);
  ok(c2.has('kicked') && c2.closed, 'a conta aberta em outro lugar derruba a sessão anterior');
  ok(c3.me.inv.includes('maca_2'), 'a sessão nova continua com o progresso');
  ok([...S.rooms[0].players.values()].filter((p) => p.acct).length === 1, 'só um jogador por conta na sala');
  c3.ws.close(); await sleep(200);

  // token ruim e sem token
  const c4 = client(port); await c4.open;
  c4.ws.send(JSON.stringify({ t: 'join', name: 'X', color: '#ffffff', token: 'f'.repeat(64) }));
  const af = await c4.wait('authfail');
  ok(af && !af.retry && !c4.has('init'), 'token inválido recebe authfail e não entra no jogo');
  const c5 = client(port); await c5.open;
  c5.ws.send(JSON.stringify({ t: 'join', name: 'Visitante', color: '#ffffff', save: { items: ['faca_1', 'martelo_1'], equip: {}, kills: {}, pk: 0, done: [] } }));
  await c5.wait('init'); await sleep(2500);
  ok(c5.me.inv.includes('martelo_1') && c5.has('save'), 'sem conta continua como antes: progresso no navegador');
  c5.ws.close();

  // excluir conta derruba quem está jogando
  const c6 = client(port); await c6.open;
  c6.ws.send(JSON.stringify({ t: 'join', name: 'Ana', color: '#ff00aa', token }));
  await c6.wait('init');
  r = await call(base, 'POST', '/api/delete', { password: 'senha-do-jogo-1' }, token);
  await sleep(300);
  ok(r.status === 200 && c6.has('kicked') && (await acc.store.byEmail('jogador@teste.com')) === null, 'excluir a conta tira o jogador do jogo e apaga os dados');
}

async function main() {
  await suite('arquivo', async () => { const s = new FileStore(path.join(TMP, 'a1')); await s.init(); return s; },
    async (s) => { s.flush(); const n = new FileStore(path.join(TMP, 'a1')); await n.init(); return n; });
  let pgOk = true, mem;
  try {
    const { newDb } = require('pg-mem');
    mem = newDb();
    const { PgStore } = require('../accounts');
    await suite('postgres', async () => { const { Pool } = mem.adapters.createPg(); const s = new PgStore(new Pool()); await s.init(); return s; },
      async (s) => s);
  } catch (e) { pgOk = false; console.log('  FALHA suíte do Postgres:', e && e.stack || e); fails++; }
  await limitsAndNoMail();
  await game();
  console.log('\n' + oks + ' ok, ' + fails + ' falhas');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
