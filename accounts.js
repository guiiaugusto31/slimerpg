'use strict';
// SlimeRPG — contas por e-mail: cadastro, login, confirmação por código, recuperação de senha e progresso salvo no servidor.
//
// Onde os dados ficam:
//  - DATABASE_URL (Postgres: Neon, Supabase, Render...) => guardado de verdade, sobrevive a reinícios e deploys.
//  - sem DATABASE_URL => arquivo data/contas.json. Serve para testar no computador; na Render grátis o disco é apagado a cada
//    deploy/reinício, então lá as contas somem (a tela de contas avisa quando é este o caso).
// E-mail (código de confirmação e recuperação de senha): RESEND_API_KEY (+ MAIL_FROM) ou SMTP_URL (+ MAIL_FROM), por exemplo
//    SMTP_URL=smtps://seuemail%40gmail.com:SENHA_DE_APP@smtp.gmail.com. Sem nenhum dos dois, o e-mail não é confirmado
//    e a recuperação de senha fica desligada.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const D = require('./game-data');
const pix = require('./pix');

const DAY = 86400000;
const SESSION_MS = 90 * DAY;      // login dura 90 dias (renova quando o jogador volta)
const CODE_MS = 15 * 60000;       // código de 6 dígitos vale 15 minutos
const MAX_TRIES = 5;              // tentativas de código antes de invalidar
const EMAIL_RE = /^[^\s@<>"',;:()\\]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const LIMITS = { // [tentativas, janela em ms]
  admin: [8, 900000], register: [6, 3600000], login: [10, 600000], loginIp: [40, 600000], code: [12, 600000], forgot: [5, 3600000], forgotMail: [3, 3600000], resend: [5, 3600000]
};

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ senha ------------------------------ */
function scrypt(pw, salt) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return 'scrypt1$' + salt.toString('hex') + '$' + (await scrypt(pw, salt)).toString('hex');
}
async function checkPw(pw, stored) {
  const [tag, s, h] = String(stored).split('$');
  if (tag !== 'scrypt1' || !s || !h) return false;
  const k = await scrypt(pw, Buffer.from(s, 'hex')), a = Buffer.from(h, 'hex');
  return a.length === k.length && crypto.timingSafeEqual(a, k);
}

/* ------------------------------ armazenamento: arquivo ------------------------------ */
class FileStore {
  constructor(dir) {
    this.kind = 'arquivo'; this.persistent = false; this.file = path.join(dir, 'contas.json');
    this.accs = new Map(); this.emails = new Map(); this.sess = new Map(); this.hall = new Map(); this.next = 1; this.timer = null;
  }
  async init() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.next = j.next || 1;
      for (const a of j.accounts || []) { this.accs.set(a.id, a); this.emails.set(a.email, a.id); }
      for (const [h, s] of Object.entries(j.sessions || {})) this.sess.set(h, s);
      for (const r of j.hall || []) this.hall.set(r.acc, r);
    } catch (e) { /* primeira vez: arquivo ainda não existe */ }
  }
  _dirty() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 250);
    if (this.timer.unref) this.timer.unref();
  }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const j = { next: this.next, accounts: [...this.accs.values()], sessions: Object.fromEntries(this.sess), hall: [...this.hall.values()] };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(j)); fs.renameSync(tmp, this.file);
  }
  async byEmail(email) { const id = this.emails.get(email); return id ? { ...this.accs.get(id) } : null; }
  async byId(id) { const a = this.accs.get(id); return a ? { ...a } : null; }
  async insert(a) {
    if (this.emails.has(a.email)) { const e = new Error('duplicado'); e.code = 'DUP'; throw e; }
    const acc = { ...a, id: this.next++ };
    this.accs.set(acc.id, acc); this.emails.set(acc.email, acc.id); this._dirty();
    return { ...acc };
  }
  async update(id, patch) {
    const a = this.accs.get(id); if (!a) return null;
    Object.assign(a, patch); this._dirty();
    return { ...a };
  }
  async remove(id) {
    const a = this.accs.get(id); if (!a) return;
    this.accs.delete(id); this.emails.delete(a.email); this.hall.delete(id);
    for (const [h, s] of this.sess) if (s.acc === id) this.sess.delete(h);
    this._dirty();
  }
  // rankings (ranking.js): uma linha por conta
  async hallAll() { return [...this.hall.values()].map((r) => JSON.parse(JSON.stringify(r))); }
  async hallPut(r) { if (!this.accs.has(r.acc)) return; this.hall.set(r.acc, JSON.parse(JSON.stringify(r))); this._dirty(); }
  async hallDel(id) { this.hall.delete(id); this._dirty(); }
  async putSession(hash, acc, exp) { this.sess.set(hash, { acc, exp }); this._dirty(); }
  async getSession(hash) { const s = this.sess.get(hash); return s ? { ...s } : null; }
  async delSession(hash) { this.sess.delete(hash); this._dirty(); }
  async delSessionsOf(acc) { for (const [h, s] of this.sess) if (s.acc === acc) this.sess.delete(h); this._dirty(); }
  async purge() { const now = Date.now(); for (const [h, s] of this.sess) if (s.exp < now) this.sess.delete(h); this._dirty(); }
  async close() { if (this.timer) this.flush(); }
}

/* ------------------------------ armazenamento: Postgres ------------------------------ */
const toAcc = (r) => !r ? null : { id: r.id, email: r.email, pass: r.pass, verified: !!r.verified, created: Number(r.created), save: r.save || null, saveAt: r.save_at == null ? 0 : Number(r.save_at), code: r.code || null, skins: r.skins || null };
const COLS = { pass: 'pass', verified: 'verified', save: 'save', saveAt: 'save_at', code: 'code', skins: 'skins' };
const JSONCOLS = new Set(['save', 'code', 'skins']);
class PgStore {
  constructor(pool) { this.kind = 'postgres'; this.persistent = true; this.pool = pool; }
  async ensure(sql) { // "já existe" não é erro (vale também se dois servidores subirem juntos)
    try { await this.pool.query(sql); } catch (e) { if (!(e && (e.code === '42P07' || /already exists/i.test(e.message || '')))) throw e; }
  }
  async init() {
    await this.ensure('create table accounts (id serial primary key, email text unique not null, pass text not null, verified boolean not null default false, created bigint not null, save jsonb, save_at bigint, code jsonb)');
    await this.ensure('alter table accounts add column skins jsonb'); // bancos criados antes da loja de skins
    await this.ensure('create table sessions (hash text primary key, acc integer not null references accounts(id) on delete cascade, exp bigint not null)');
    await this.ensure('create table hall (acc integer primary key references accounts(id) on delete cascade, data jsonb not null)');
    await this.purge();
  }
  async byEmail(email) { return toAcc((await this.pool.query('select * from accounts where email = $1', [email])).rows[0]); }
  async byId(id) { return toAcc((await this.pool.query('select * from accounts where id = $1', [id])).rows[0]); }
  async insert(a) {
    try {
      const r = await this.pool.query('insert into accounts (email, pass, verified, created, save, save_at, code) values ($1,$2,$3,$4,$5,$6,$7) returning *',
        [a.email, a.pass, !!a.verified, a.created, a.save ? JSON.stringify(a.save) : null, a.saveAt || null, a.code ? JSON.stringify(a.code) : null]);
      return toAcc(r.rows[0]);
    } catch (e) { if (e && (e.code === '23505' || /duplicate|unique/i.test(e.message))) { const d = new Error('duplicado'); d.code = 'DUP'; throw d; } throw e; }
  }
  async update(id, patch) {
    const sets = [], vals = [id];
    for (const k of Object.keys(patch)) {
      if (!COLS[k]) continue;
      vals.push(JSONCOLS.has(k) ? (patch[k] == null ? null : JSON.stringify(patch[k])) : patch[k]);
      sets.push(COLS[k] + ' = $' + vals.length);
    }
    if (!sets.length) return this.byId(id);
    return toAcc((await this.pool.query('update accounts set ' + sets.join(', ') + ' where id = $1 returning *', vals)).rows[0]);
  }
  async remove(id) { await this.pool.query('delete from hall where acc = $1', [id]); await this.pool.query('delete from sessions where acc = $1', [id]); await this.pool.query('delete from accounts where id = $1', [id]); }
  async hallAll() { return (await this.pool.query('select acc, data from hall')).rows.map((r) => Object.assign({}, typeof r.data === 'string' ? JSON.parse(r.data) : r.data, { acc: r.acc })); }
  async hallPut(r) {
    try { await this.pool.query('insert into hall (acc, data) values ($1,$2) on conflict (acc) do update set data = excluded.data', [r.acc, JSON.stringify(r)]); } catch (e) {
      if (e && (e.code === '23503' || /foreign key/i.test(e.message || ''))) return; // a conta foi excluída enquanto o ranking gravava
      throw e;
    }
  }
  async hallDel(id) { await this.pool.query('delete from hall where acc = $1', [id]); }
  async putSession(hash, acc, exp) {
    await this.pool.query('insert into sessions (hash, acc, exp) values ($1,$2,$3) on conflict (hash) do update set exp = excluded.exp', [hash, acc, exp]);
  }
  async getSession(hash) { const r = (await this.pool.query('select acc, exp from sessions where hash = $1', [hash])).rows[0]; return r ? { acc: r.acc, exp: Number(r.exp) } : null; }
  async delSession(hash) { await this.pool.query('delete from sessions where hash = $1', [hash]); }
  async delSessionsOf(acc) { await this.pool.query('delete from sessions where acc = $1', [acc]); }
  async purge() { await this.pool.query('delete from sessions where exp < $1', [Date.now()]); }
  async close() { try { await this.pool.end(); } catch (e) { /* já fechado */ } }
}

/* ------------------------------ e-mail ------------------------------ */
function makeMailer(env) {
  if (env.RESEND_API_KEY) {
    return async (to, subject, text) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM || 'SlimeRPG <onboarding@resend.dev>', to: [to], subject, text })
      });
      if (!r.ok) throw new Error('Resend respondeu ' + r.status);
    };
  }
  if (env.SMTP_URL) {
    const tr = require('nodemailer').createTransport(env.SMTP_URL);
    let from = env.MAIL_FROM;
    if (!from) { try { from = 'SlimeRPG <' + decodeURIComponent(new URL(env.SMTP_URL).username) + '>'; } catch (e) { from = 'SlimeRPG'; } }
    return (to, subject, text) => tr.sendMail({ from, to, subject, text });
  }
  return null;
}

/* ------------------------------ módulo ------------------------------ */
// opts (só para testes): env, store, pool, mailer, limits, trustProxy
function create(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  let store = opts.store;
  if (!store) {
    if (opts.pool) store = new PgStore(opts.pool);
    else if (env.DATABASE_URL) {
      const { Pool } = require('pg');
      const url = env.DATABASE_URL, local = /@(localhost|127\.0\.0\.1)/.test(url);
      store = new PgStore(new Pool({ connectionString: url, max: 5, ssl: env.PGSSL === 'disable' || local || /sslmode=/.test(url) ? undefined : { rejectUnauthorized: false } }));
    } else store = new FileStore(env.DATA_DIR || path.join(__dirname, 'data'));
  }
  const mailer = opts.mailer !== undefined ? opts.mailer : makeMailer(env);
  const L = Object.assign({}, LIMITS, opts.limits);
  const trustProxy = opts.trustProxy !== undefined ? opts.trustProxy : env.TRUST_PROXY === '1';
  const allowImport = env.ALLOW_SAVE_IMPORT !== '0';
  const cache = new Map(), dirty = new Set(), inflight = new Map(), hits = new Map();
  const readyP = store.init().catch((e) => { console.error('Contas: não consegui abrir o armazenamento (' + store.kind + '):', e.message); throw e; });
  readyP.catch(() => {});
  if (!store.persistent) console.warn('Contas: sem DATABASE_URL, usando arquivo local. Na Render grátis as contas somem a cada reinício; use um Postgres (veja o README).');
  if (!mailer) console.warn('Contas: sem RESEND_API_KEY nem SMTP_URL; e-mails não são confirmados e a recuperação de senha fica desligada.');
  const gc = setInterval(() => { const n = Date.now(); for (const [k, h] of hits) if (h.reset < n) hits.delete(k); readyP.then(() => store.purge()).catch(() => {}); }, 600000);
  if (gc.unref) gc.unref();

  const limit = (key, [max, ms]) => {
    const now = Date.now(); let h = hits.get(key);
    if (!h || h.reset < now) { h = { n: 0, reset: now + ms }; hits.set(key, h); }
    return ++h.n <= max;
  };
  const clientIp = (req) => {
    if (trustProxy) { const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean); if (xf.length) return xf[xf.length - 1]; }
    return (req.socket && req.socket.remoteAddress) || '?';
  };
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const codeRec = (email, kind, code) => ({ kind, h: sha(email + ':' + code), exp: Date.now() + CODE_MS, tries: 0, sent: Date.now() });
  async function newSession(accId) {
    const token = crypto.randomBytes(32).toString('hex');
    await store.putSession(sha(token), accId, Date.now() + SESSION_MS);
    return token;
  }
  async function checkCode(acc, kind, code) {
    const c = acc.code;
    if (!c || c.kind !== kind || c.exp < Date.now()) return false;
    if (c.tries >= MAX_TRIES) { await store.update(acc.id, { code: null }); return false; }
    if (sha(acc.email + ':' + String(code || '').trim()) === c.h) return true;
    c.tries++; await store.update(acc.id, { code: c });
    return false;
  }
  async function sendCode(acc, kind) {
    const code = newCode();
    await store.update(acc.id, { code: codeRec(acc.email, kind, code) });
    const subject = kind === 'verify' ? 'Confirme seu e-mail no SlimeRPG' : 'Recuperar a senha do SlimeRPG';
    const text = (kind === 'verify' ? 'Seu código para confirmar o e-mail no SlimeRPG é ' : 'Seu código para criar uma senha nova no SlimeRPG é ') + code +
      '.\nEle vale por 15 minutos.\n\nSe não foi você que pediu, ignore esta mensagem: nada muda na sua conta.';
    await mailer(acc.email, subject, text);
  }
  const ready = () => readyP;

  /* ---- loja de skins (só visual) ---- */
  const ADMIN_TOKEN = String(env.ADMIN_TOKEN || '');
  const CONTATO = String(env.CONTATO_EMAIL || 'guiaugusto_32@outlook.com').trim();
  const PIX = { key: String(env.PIX_CHAVE || CONTATO).trim(), name: env.PIX_NOME || 'SLIMERPG', city: env.PIX_CIDADE || 'BRASIL' };
  const lojaPacks = (() => {
    const out = [];
    for (const [id, k] of Object.entries(D.SKIN_PACKS)) {
      let code = null;
      try { code = pix.brcode({ key: PIX.key, name: PIX.name, city: PIX.city, amount: k.price, txid: 'SLIME' + id.toUpperCase() }); } catch (e) { console.error('Loja: Pix inválido:', e.message); }
      out.push({ id, name: k.name, price: k.price, note: k.note || '', skins: k.skins, code });
    }
    return out;
  })();
  const skinsOf = (acc) => { // { own: [ids válidos], eq: {body, head, face, bow} }
    const sk = acc && acc.skins && typeof acc.skins === 'object' ? acc.skins : {};
    const own = [...new Set((Array.isArray(sk.own) ? sk.own : []).filter((id) => D.SKINS[id]))];
    return { own, eq: D.skinClean(sk.eq, own) };
  };
  let skinLock = Promise.resolve(); // uma alteração de skins por vez (evita perder uma liberação feita junto com um equipar)
  const skinWrite = (fn) => { const r = skinLock.then(fn); skinLock = r.catch(() => {}); return r; };
  const setSkins = (accId, mutate) => skinWrite(async () => {
    const acc = await store.byId(accId); if (!acc) return null;
    const cur = skinsOf(acc), next = mutate({ own: cur.own.slice(), eq: Object.assign({}, cur.eq) });
    next.eq = D.skinClean(next.eq, next.own);
    await store.update(accId, { skins: next });
    if (typeof opts.onSkins === 'function') { try { opts.onSkins(accId, next); } catch (e) { /* o jogo online é só um aviso */ } }
    return next;
  });
  // Libera skins para uma conta (prêmios do ranking). Devolve a lista de skins que ela passou a ter.
  const grantSkins = async (accId, ids) => { const next = await setSkins(accId, (sk) => { sk.own = [...new Set(sk.own.concat(ids.filter((id) => D.SKINS[id])))]; return sk; }); return next ? next.own : null; };
  async function adminSkin(req, res, ip) {
    if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 16) return fail(res, 503, 'Liberação desativada: defina ADMIN_TOKEN (16+ caracteres) no servidor.');
    const h = hits.get('adm:' + ip);
    if (h && h.reset > Date.now() && h.n >= L.admin[0]) return fail(res, 429, 'Muitas tentativas. Tente de novo mais tarde.');
    const m = /^Bearer (.{1,256})$/.exec(req.headers.authorization || '');
    const a = crypto.createHash('sha256').update(m ? m[1] : '').digest(), b = crypto.createHash('sha256').update(ADMIN_TOKEN).digest();
    if (!m || !crypto.timingSafeEqual(a, b)) { limit('adm:' + ip, L.admin); return fail(res, 401, 'Não autorizado.'); }
    let body; try { body = await readJson(req); } catch (e) { return fail(res, 400, 'Pedido inválido.'); }
    const email = normEmail(body.email), pack = D.SKIN_PACKS[body.pack];
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'E-mail inválido.');
    if (!pack) return fail(res, 400, 'Pacote inválido. Use: ' + Object.keys(D.SKIN_PACKS).join(', ') + '.');
    await readyP;
    const acc = await store.byEmail(email);
    if (!acc) return fail(res, 404, 'Não existe conta com esse e-mail.');
    const remover = body.remover === true;
    const next = await setSkins(acc.id, (sk) => { sk.own = remover ? sk.own.filter((id) => !pack.skins.includes(id)) : [...new Set(sk.own.concat(pack.skins))]; return sk; });
    return reply(res, 200, { ok: true, email, pack: body.pack, skins: next.own });
  }

  // Devolve a conta de um token de login (ou null). Lança erro se o armazenamento estiver fora do ar.
  async function auth(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    await readyP;
    const h = sha(token), s = await store.getSession(h), now = Date.now();
    if (!s || s.exp < now) return null;
    const acc = await store.byId(s.acc);
    if (!acc) return null;
    if (s.exp - now < SESSION_MS - 30 * DAY) store.putSession(h, acc.id, now + SESSION_MS).catch(() => {});
    return acc;
  }
  // Progresso: o que o servidor escreveu por último vale (cache), senão o que está no banco.
  async function loadSave(acc) { return cache.has(acc.id) ? cache.get(acc.id) : acc.save; }
  function saveProgress(id, save) {
    if (!save || JSON.stringify(save).length > 8192) return;
    cache.set(id, save); dirty.add(id);
    if (inflight.has(id)) return;
    const run = (async () => {
      let fails = 0;
      while (dirty.delete(id)) {
        try { await store.update(id, { save: cache.get(id), saveAt: Date.now() }); fails = 0; } catch (e) {
          console.error('Contas: falha ao salvar o progresso da conta ' + id + ': ' + e.message);
          if (++fails >= 3) break;
          dirty.add(id); await sleep(1500);
        }
      }
    })().finally(() => inflight.delete(id));
    inflight.set(id, run);
  }
  async function flush() { while (inflight.size) await Promise.all([...inflight.values()]); }
  // Jogador saiu: grava o que falta e solta a memória (se a conta não estiver mais em uso).
  function release(id, stillOnline) {
    const w = inflight.get(id) || Promise.resolve();
    w.then(() => { if (!dirty.has(id) && !stillOnline()) cache.delete(id); });
  }

  /* ---- HTTP ---- */
  function reply(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  }
  const fail = (res, code, msg, extra) => reply(res, code, Object.assign({ error: msg }, extra));
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let n = 0; const chunks = [];
      req.on('data', (c) => { n += c.length; if (n > 65536) req.destroy(); else if (n <= 4096) chunks.push(c); });
      req.on('end', () => { if (n > 4096) return reject(new Error('grande')); try { const j = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); resolve(j && typeof j === 'object' ? j : {}); } catch (e) { reject(new Error('json')); } });
      req.on('error', reject);
    });
  }
  const bearer = (req) => { const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };
  const pubAcc = (acc, token) => ({ token, email: acc.email, verified: acc.verified, mail: !!mailer });
  const pwOk = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 128;
  let dummyHash = null;

  async function route(req, res, url) {
    const ip = clientIp(req);
    if (url === '/api/config' && req.method === 'GET') return reply(res, 200, { enabled: true, mail: !!mailer, persistent: !!store.persistent, import: allowImport });
    if (url === '/api/loja' && req.method === 'GET') return reply(res, 200, { enabled: true, contato: CONTATO, pixChave: PIX.key, packs: lojaPacks });
    if (url === '/admin/skin') return req.method === 'POST' ? adminSkin(req, res, ip) : fail(res, 405, 'Método não permitido.');
    if (req.method !== 'POST' && url !== '/api/me' && url !== '/api/skins') return fail(res, 405, 'Método não permitido.');
    try { await readyP; } catch (e) { return fail(res, 503, 'As contas estão indisponíveis agora. Tente de novo em instantes.'); }
    const body = req.method === 'POST' ? await readJson(req) : {};
    switch (url) {
      case '/api/register': {
        if (!limit('reg:' + ip, L.register)) return fail(res, 429, 'Muitas tentativas. Tente de novo mais tarde.');
        const email = normEmail(body.email);
        if (!EMAIL_RE.test(email) || email.length > 120) return fail(res, 400, 'Esse e-mail não parece válido.');
        if (!pwOk(body.password)) return fail(res, 400, 'A senha precisa ter de 8 a 128 caracteres.');
        let acc = await store.byEmail(email);
        if (acc && acc.verified) return fail(res, 409, 'Este e-mail já tem uma conta. Use "Entrar".');
        const pass = await hashPw(body.password), fresh = !acc;
        if (acc) { // cadastro anterior nunca confirmado: quem confirma o e-mail fica com a conta, então ele é refeito do zero
          await store.delSessionsOf(acc.id); cache.delete(acc.id); dirty.delete(acc.id);
          acc = await store.update(acc.id, { pass, verified: !mailer, save: null, saveAt: 0, code: null });
        } else {
          try { acc = await store.insert({ email, pass, verified: !mailer, created: Date.now(), save: null, saveAt: 0, code: null }); } catch (e) {
            if (e.code === 'DUP') return fail(res, 409, 'Este e-mail já tem uma conta. Use "Entrar".');
            throw e;
          }
        }
        if (mailer) {
          try { await sendCode(acc, 'verify'); } catch (e) {
            console.error('Contas: falha ao enviar e-mail:', e.message);
            if (fresh) await store.remove(acc.id);
            return fail(res, 502, 'Não consegui enviar o e-mail de confirmação. Confira o endereço e tente de novo.');
          }
        }
        return reply(res, 200, pubAcc(acc, await newSession(acc.id)));
      }
      case '/api/login': {
        const email = normEmail(body.email);
        if (!limit('lgi:' + ip, L.loginIp) || !limit('lg:' + ip + ':' + email, L.login)) return fail(res, 429, 'Muitas tentativas. Espere alguns minutos e tente de novo.');
        const acc = EMAIL_RE.test(email) ? await store.byEmail(email) : null;
        if (!dummyHash) dummyHash = hashPw('slime-dummy');
        const ok = acc ? await checkPw(String(body.password || ''), acc.pass) : (await checkPw(String(body.password || ''), await dummyHash), false);
        if (!ok) return fail(res, 401, 'E-mail ou senha incorretos.');
        return reply(res, 200, pubAcc(acc, await newSession(acc.id)));
      }
      case '/api/me': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        const sv = await loadSave(acc);
        return reply(res, 200, { email: acc.email, verified: acc.verified, mail: !!mailer, items: sv && Array.isArray(sv.items) ? sv.items.length : 0, quests: sv && Array.isArray(sv.done) ? sv.done.length : 0, hasSave: !!sv });
      }
      case '/api/skins': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        return reply(res, 200, skinsOf(acc));
      }
      case '/api/skins/equip': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        if (!limit('eq:' + acc.id, [60, 600000])) return fail(res, 429, 'Muitas trocas. Espere um pouco.');
        const want = body.eq && typeof body.eq === 'object' ? body.eq : {};
        const have = skinsOf(acc);
        for (const slot of D.SKIN_SLOTS) { // pedir uma skin que a conta não tem é recusado (não é ignorado em silêncio)
          const id = want[slot];
          if (id && !(typeof id === 'string' && D.SKINS[id] && D.SKINS[id].slot === slot && have.own.includes(id))) return fail(res, 403, 'Você não tem essa skin.');
        }
        const next = await setSkins(acc.id, (sk) => { sk.eq = D.skinClean(want, sk.own); return sk; });
        return reply(res, 200, next);
      }
      case '/api/verify': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        if (acc.verified) return reply(res, 200, { verified: true });
        if (!limit('cd:' + ip, L.code)) return fail(res, 429, 'Muitas tentativas. Tente de novo mais tarde.');
        if (!(await checkCode(acc, 'verify', body.code))) return fail(res, 400, 'Código errado ou vencido. Peça um novo.');
        await store.update(acc.id, { verified: true, code: null });
        return reply(res, 200, { verified: true });
      }
      case '/api/resend': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        if (acc.verified || !mailer) return reply(res, 200, { ok: true });
        if (acc.code && acc.code.sent && Date.now() - acc.code.sent < 45000) return fail(res, 429, 'Espere um pouco antes de pedir outro código.');
        if (!limit('rs:' + acc.id, L.resend)) return fail(res, 429, 'Muitos pedidos de código. Tente de novo mais tarde.');
        try { await sendCode(acc, 'verify'); } catch (e) { console.error('Contas: falha ao enviar e-mail:', e.message); return fail(res, 502, 'Não consegui enviar o e-mail agora.'); }
        return reply(res, 200, { ok: true });
      }
      case '/api/forgot': {
        if (!mailer) return fail(res, 501, 'Recuperação de senha indisponível neste servidor (sem e-mail configurado).');
        const email = normEmail(body.email);
        if (!limit('fg:' + ip, L.forgot) || !limit('fgm:' + email, L.forgotMail)) return fail(res, 429, 'Muitos pedidos. Tente de novo mais tarde.');
        const acc = EMAIL_RE.test(email) ? await store.byEmail(email) : null;
        if (acc) { try { await sendCode(acc, 'reset'); } catch (e) { console.error('Contas: falha ao enviar e-mail:', e.message); } }
        return reply(res, 200, { ok: true }); // sempre a mesma resposta, exista a conta ou não
      }
      case '/api/reset': {
        const email = normEmail(body.email);
        if (!limit('cd:' + ip, L.code)) return fail(res, 429, 'Muitas tentativas. Tente de novo mais tarde.');
        if (!pwOk(body.password)) return fail(res, 400, 'A senha precisa ter de 8 a 128 caracteres.');
        const acc = EMAIL_RE.test(email) ? await store.byEmail(email) : null;
        if (!acc || !(await checkCode(acc, 'reset', body.code))) return fail(res, 400, 'Código errado ou vencido. Peça um novo.');
        await store.update(acc.id, { pass: await hashPw(body.password), verified: true, code: null });
        await store.delSessionsOf(acc.id); // quem tinha a conta aberta precisa entrar de novo
        return reply(res, 200, { ok: true });
      }
      case '/api/logout': {
        const t = bearer(req);
        if (t) await store.delSession(sha(t));
        return reply(res, 200, { ok: true });
      }
      case '/api/delete': {
        const acc = await auth(bearer(req));
        if (!acc) return fail(res, 401, 'Sessão expirada.');
        if (!limit('del:' + acc.id, L.login)) return fail(res, 429, 'Muitas tentativas. Tente de novo mais tarde.');
        if (!(await checkPw(String(body.password || ''), acc.pass))) return fail(res, 401, 'Senha incorreta.');
        await store.remove(acc.id); cache.delete(acc.id); dirty.delete(acc.id);
        if (typeof opts.onDelete === 'function') opts.onDelete(acc.id);
        return reply(res, 200, { ok: true });
      }
      default: return fail(res, 404, 'Não encontrado.');
    }
  }
  // true se a rota é de /api/ (e a resposta já foi dada)
  function handle(req, res, url) {
    if (!url.startsWith('/api/') && url !== '/admin/skin') return false;
    route(req, res, url).catch((e) => {
      if (res.headersSent) return;
      if (e && (e.message === 'grande' || e.message === 'json')) return fail(res, 400, 'Pedido inválido.');
      console.error('Contas: erro:', e && e.message);
      fail(res, 500, 'Erro no servidor. Tente de novo.');
    });
    return true;
  }
  async function close() { await flush(); if (store.close) await store.close(); clearInterval(gc); }

  return { handle, auth, skinsOf, grantSkins, loadSave, saveProgress, flush, release, ready, close, allowImport, store, status: () => ({ kind: store.kind, persistent: !!store.persistent, mail: !!mailer }) };
}

module.exports = { create, FileStore, PgStore, hashPw, checkPw, EMAIL_RE };
