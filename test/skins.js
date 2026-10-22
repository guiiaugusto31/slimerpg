'use strict';
// Testes da loja de skins: Pix (CRC e campos), códigos de rede, posse/equipar validados no servidor, liberação manual (admin), persistência e jogo.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-skins-'));
process.env.DATA_DIR = path.join(TMP, 'jogo');
process.env.PORT = '3978';
process.env.ADMIN_TOKEN = 'token-de-teste-0123456789';
const D = require('../game-data');
const pix = require('../pix');
const { create, FileStore, PgStore } = require('../accounts');

let oks = 0, fails = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(c, msg) { if (c) { oks++; console.log('  ok  ', msg); } else { fails++; console.log('  FALHA', msg); } }
function serve(acc) {
  const srv = http.createServer((req, res) => { if (!acc.handle(req, res, req.url.split('?')[0])) { res.writeHead(404); res.end(); } });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, base: 'http://127.0.0.1:' + srv.address().port })));
}
async function call(base, method, url, body, token) {
  const r = await fetch(base + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: method === 'POST' ? JSON.stringify(body || {}) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const ADM = 'token-de-teste-0123456789';

function pure() {
  console.log('Pix e códigos');
  ok(pix.crc16('123456789') === '29B1', 'CRC16-CCITT bate com o vetor padrão (29B1)');
  const code = pix.brcode({ key: 'Teste@Exemplo.com', name: 'Maria da Silva', city: 'São Paulo', amount: 5, txid: 'SLIME-OURO' });
  const f = pix.parse(code);
  ok(f.crcOk && f['54'] === '5.00' && f['53'] === '986' && f['58'] === 'BR' && f['59'] === 'MARIA DA SILVA' && f['60'] === 'SAO PAULO', 'BR Code tem CRC certo, valor, moeda e nome sem acento');
  ok(f['26'].includes('br.gov.bcb.pix') && f['26'].includes('teste@exemplo.com') && f['62'] === '0509SLIMEOURO', 'chave Pix em minúsculas e txid só com letras e números');
  let bad = 0; for (const a of [0, -1, NaN, 1e6]) { try { pix.brcode({ key: 'a@b.com', amount: a }); } catch (e) { bad++; } }
  ok(bad === 4, 'valor inválido é recusado');
  let rt = true;
  for (const id of Object.keys(D.SKINS)) { const eq = D.skinEmpty(); eq[D.SKINS[id].slot] = id; const n = D.skinCode(eq); if (!n || D.skinDecode(n)[D.SKINS[id].slot] !== id) rt = false; }
  ok(rt && D.skinCode(D.skinEmpty()) === 0 && D.skinDecode(0).head === null && D.skinDecode(999).head === null && D.skinDecode('x').head === null, 'código de rede de cada skin vai e volta; valores estranhos viram "nenhum"');
  ok(!D.skinClean({ head: 'mago' }, []).head && D.skinClean({ head: 'mago' }, ['mago']).head === 'mago' && !D.skinClean({ head: 'toString' }, null).head && !D.skinClean({ head: { a: 1 } }, null).head, 'skinClean exige que a conta possua e ignora ids inventados');
  ok(Object.values(D.SKIN_PACKS).every((p) => p.skins.every((id) => D.SKINS[id])) && D.SKIN_PACKS.tudo.skins.length === Object.keys(D.SKINS).length, 'todos os pacotes só têm skins que existem e "Tudo" tem todas');
  ok(D.SKIN_PACKS.chapeus.price === 2 && D.SKIN_PACKS.mago.price === 5 && D.SKIN_PACKS.pirata.price === 5 && D.SKIN_PACKS.tudo.price === 10, 'preços: R$ 2, 5, 5 e 10');
}

async function suite(label, makeStore, reopen) {
  console.log('Skins (' + label + ')');
  let store = await makeStore();
  const granted = [];
  const acc = create({ store, mailer: null, env: { ADMIN_TOKEN: ADM }, onSkins: (id, sk) => granted.push([id, sk.own.slice()]) });
  const { srv, base } = await serve(acc);

  const loja = await call(base, 'GET', '/api/loja');
  ok(loja.status === 200 && loja.body.packs.length === 4 && loja.body.contato === 'guiiaugusto_32@outlook.com', 'GET /api/loja lista os 4 pacotes e o contato');
  ok(loja.body.packs.every((p) => p.code && pix.parse(p.code).crcOk && pix.parse(p.code)['54'] === p.price.toFixed(2)), 'cada pacote traz um Pix com o valor certo');
  ok(loja.body.packs.every((p) => pix.parse(p.code)['26'].includes('guiiaugusto_32@outlook.com')), 'a chave Pix é o e-mail combinado');

  const r = await call(base, 'POST', '/api/register', { email: 'Cli@Teste.com', password: 'senha-forte-1' });
  const tok = r.body.token;
  ok(r.status === 200 && tok, 'cadastro da cliente');
  ok((await call(base, 'GET', '/api/skins')).status === 401, 'ver skins exige login');
  let s = await call(base, 'GET', '/api/skins', null, tok);
  ok(s.status === 200 && s.body.own.length === 0 && s.body.eq.head === null, 'conta nova não tem skins');
  ok((await call(base, 'POST', '/api/skins/equip', { eq: { head: 'mago' } }, tok)).status === 403, 'equipar skin que a conta não possui é recusado');
  ok((await call(base, 'POST', '/api/skins/equip', { eq: { head: 'inventada' } }, tok)).status === 403, 'skin inexistente também');
  ok((await call(base, 'POST', '/api/skins/equip', { eq: { head: 'mago' } })).status === 401, 'equipar sem login é recusado');

  // administrador
  ok((await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'tudo' })).status === 401, 'liberar sem senha: 401');
  ok((await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'tudo' }, 'senha-errada')).status === 401, 'liberar com senha errada: 401');
  ok((await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'tudo' }, tok)).status === 401, 'o login de um jogador não vale como senha de administrador');
  ok((await call(base, 'GET', '/admin/skin')).status === 405, 'só aceita POST');
  s = await call(base, 'GET', '/api/skins', null, tok);
  ok(s.body.own.length === 0, 'nada foi liberado pelas tentativas recusadas');
  ok((await call(base, 'POST', '/admin/skin', { email: 'nao@existe.com', pack: 'mago' }, ADM)).status === 404, 'e-mail sem conta: 404');
  ok((await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'xyz' }, ADM)).status === 400, 'pacote inexistente: 400');
  ok((await call(base, 'POST', '/admin/skin', { email: 'sem-arroba', pack: 'mago' }, ADM)).status === 400, 'e-mail inválido: 400');
  let g = await call(base, 'POST', '/admin/skin', { email: ' CLI@teste.com ', pack: 'mago' }, ADM);
  ok(g.status === 200 && g.body.skins.join() === 'mago' && granted.length === 1 && granted[0][1].join() === 'mago', 'liberar o pacote Mago funciona (e avisa o jogo online)');
  g = await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'mago' }, ADM);
  ok(g.status === 200 && g.body.skins.join() === 'mago', 'liberar de novo não duplica');
  g = await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'chapeus' }, ADM);
  ok(g.body.skins.length === 5, 'pacote Chapéus soma 4 skins à que já tinha');
  g = await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'tudo' }, ADM);
  ok(g.body.skins.length === 6, 'pacote Tudo completa as 6');

  // equipar
  let e = await call(base, 'POST', '/api/skins/equip', { eq: { head: 'mago' } }, tok);
  ok(e.status === 200 && e.body.eq.head === 'mago', 'equipar skin que possui funciona');
  e = await call(base, 'POST', '/api/skins/equip', { eq: { head: null } }, tok);
  ok(e.status === 200 && e.body.eq.head === null, 'tirar o chapéu funciona');
  await call(base, 'POST', '/api/skins/equip', { eq: { head: 'pirata' } }, tok);
  g = await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'pirata', remover: true }, ADM);
  s = await call(base, 'GET', '/api/skins', null, tok);
  ok(g.status === 200 && !s.body.own.includes('pirata') && s.body.eq.head === null, 'remover um pacote tira a skin e desequipa');
  await call(base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'pirata' }, ADM);
  await call(base, 'POST', '/api/skins/equip', { eq: { head: 'cartola' } }, tok);

  // persistência
  await acc.flush(); store = await reopen(store);
  const acc2 = create({ store, mailer: null, env: { ADMIN_TOKEN: ADM } }); const srv2 = await serve(acc2);
  s = await call(srv2.base, 'GET', '/api/skins', null, tok);
  ok(s.status === 200 && s.body.own.length === 6 && s.body.eq.head === 'cartola', 'skins e equipado sobrevivem a reiniciar');
  ok(acc2.skinsOf({ skins: { own: ['mago', 'fantasma'], eq: { head: 'fantasma' } } }).own.join() === 'mago', 'skin que deixou de existir é ignorada');

  // limite de tentativas do admin
  const lim = create({ store, mailer: null, env: { ADMIN_TOKEN: ADM }, limits: { admin: [3, 60000] } }); const sl = await serve(lim);
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call(sl.base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'mago' }, 'errada-' + i)).status);
  ok(codes.join() === '401,401,401,429,429', 'depois de 3 senhas erradas, as tentativas são bloqueadas (' + codes.join() + ')');
  ok((await call(sl.base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'mago' }, ADM)).status === 429, 'durante o bloqueio nem a senha certa passa');

  // sem ADMIN_TOKEN (ou curto) a liberação fica desligada
  for (const env of [{}, { ADMIN_TOKEN: 'curto' }]) {
    const off = create({ store, mailer: null, env }); const so = await serve(off);
    const x = await call(so.base, 'POST', '/admin/skin', { email: 'cli@teste.com', pack: 'tudo' }, env.ADMIN_TOKEN || 'qualquer');
    ok(x.status === 503, 'sem ADMIN_TOKEN forte, /admin/skin responde 503 (' + JSON.stringify(env) + ')');
    so.srv.close();
  }
  await call(srv2.base, 'POST', '/api/delete', { password: 'senha-forte-1' }, tok);
  ok((await store.byEmail('cli@teste.com')) === null, 'excluir a conta apaga tudo, inclusive as skins');
  srv.close(); srv2.srv.close(); sl.srv.close();
}

function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const c = { ws, msgs: [], closed: false };
  ws.on('message', (d) => { c.msgs.push(JSON.parse(d.toString())); });
  ws.on('close', () => { c.closed = true; });
  c.open = new Promise((r) => ws.on('open', r));
  c.has = (t) => c.msgs.find((m) => m.t === t);
  c.wait = async (t, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end) { const m = c.has(t); if (m) return m; await sleep(30); } return null; };
  return c;
}

async function game() {
  console.log('Skins no jogo');
  require('../server');
  await sleep(300);
  const base = 'http://127.0.0.1:3978';
  const A = await call(base, 'POST', '/api/register', { email: 'ana@teste.com', password: 'senha-do-jogo-1' });
  const B = await call(base, 'POST', '/api/register', { email: 'bia@teste.com', password: 'senha-do-jogo-2' });
  await call(base, 'POST', '/admin/skin', { email: 'ana@teste.com', pack: 'mago' }, ADM);
  await call(base, 'POST', '/api/skins/equip', { eq: { head: 'mago' } }, A.body.token);
  const ca = client(3978), cb = client(3978); await ca.open; await cb.open;
  cb.ws.send(JSON.stringify({ t: 'join', name: 'Bia', color: '#00ffaa', token: B.body.token })); await cb.wait('init');
  ca.ws.send(JSON.stringify({ t: 'join', name: 'Ana', color: '#ff00aa', token: A.body.token }));
  const ia = await ca.wait('init'); await sleep(400);
  ok(ca.has('skins') && ca.has('skins').eq.head === 'mago' && ca.has('skins').own.join() === 'mago', 'quem entra recebe a lista de skins e o equipado');
  const pj = cb.msgs.find((m) => m.t === 'pj' && m.name === 'Ana');
  ok(pj && pj.sk === D.SKINS.mago.code, 'os outros jogadores recebem o chapéu de quem entrou (pj.sk)');
  ok(ia.roster.every((r) => typeof r.sk === 'number'), 'o roster inicial traz o campo sk');
  await sleep(500);
  const snap = cb.msgs.filter((m) => m.t === 's').pop();
  const rowA = snap && snap.p.find((p) => p.k);
  ok(rowA && rowA.k === D.SKINS.mago.code && snap.p.every((p) => p.i !== undefined && p.x !== undefined), 'o snapshot leva k (no fim da linha do jogador); os campos antigos seguem iguais');
  ok(snap.p.filter((p) => p.k === undefined).length >= 1, 'quem não usa skin não gasta bytes no snapshot');
  const before = cb.msgs.length;
  const eq = await call(base, 'POST', '/api/skins/equip', { eq: { head: null } }, A.body.token);
  await sleep(300);
  ok(eq.status === 200 && cb.msgs.slice(before).some((m) => m.t === 'sk' && m.k === 0) && ca.msgs.filter((m) => m.t === 'skins').pop().eq.head === null, 'trocar o chapéu durante o jogo avisa a sala (sk) e o dono (skins)');
  await call(base, 'POST', '/admin/skin', { email: 'ana@teste.com', pack: 'tudo' }, ADM); await sleep(300);
  ok(ca.msgs.filter((m) => m.t === 'skins').pop().own.length === 6, 'liberação manual chega ao jogador que já está online');
  const cv = client(3978); await cv.open;
  cv.ws.send(JSON.stringify({ t: 'join', name: 'Visita', color: '#ffffff', save: { items: [] }, sk: 5, skins: { head: 'mago' } })); await cv.wait('init'); await sleep(500);
  const sv = cb.msgs.filter((m) => m.t === 's').pop();
  ok(!cv.has('skins') && sv.p.filter((p) => p.k).length === 0, 'visitante não consegue enviar skin pelo join (o servidor ignora)');
  ca.ws.close(); cb.ws.close(); cv.ws.close(); await sleep(200);
}

async function main() {
  pure();
  await suite('arquivo', async () => { const s = new FileStore(path.join(TMP, 'a1')); await s.init(); return s; },
    async (s) => { s.flush(); const n = new FileStore(path.join(TMP, 'a1')); await n.init(); return n; });
  try {
    const { newDb } = require('pg-mem');
    const mem = newDb();
    await suite('postgres', async () => { const { Pool } = mem.adapters.createPg(); const s = new PgStore(new Pool()); await s.init(); return s; }, async (s) => s);
  } catch (e) { console.log('  FALHA suíte do Postgres:', e && e.stack || e); fails++; }
  await game();
  console.log('\n' + oks + ' ok, ' + fails + ' falhas');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
