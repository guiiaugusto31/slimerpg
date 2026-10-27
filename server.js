'use strict';
// SlimeRPG — servidor: HTTP estático + WebSocket. Toda a lógica de combate, XP, pontos de atributo e missões roda aqui.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const D = require('./game-data');
const { REPEAT_MS } = require('./ranking');
let accounts = null; // contas por e-mail; criado mais abaixo (fora do simulador)
let ranking = null, rankingReady = Promise.resolve(); // rankings por conta (ranking.js); só existem junto com as contas
const online = new Map(); // id da conta -> WebSocket em uso (uma conta só joga em um lugar por vez)

const PORT = parseInt(process.env.PORT, 10) || 3000;
const TICK = 30;
const DT = 1 / TICK;
const W = D.WORLD;
const PUB = path.join(__dirname, 'public');
const MOB_KEYS = Object.keys(D.MOBS);
const BASE_SPEED = 170;
const SPAWN_PROTECT = 2; // segundos de imunidade ao (re)nascer
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};

/* ------------------------------ utilidades ------------------------------ */
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clampWorld(o) {
  const nx = (o.x - W.cx) / W.rx, ny = (o.y - W.cy) / W.ry;
  const n = Math.hypot(nx, ny);
  if (n > W.wall) { o.x = W.cx + (nx / n) * W.rx * W.wall; o.y = W.cy + (ny / n) * W.ry * W.wall; }
}
function segDist(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/* ------------------------------ HTTP estático ------------------------------ */
const rooms = [];
let nextRoomId = 1, nextPlayerId = 1;

function sendFile(res, fp) {
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    const ext = path.extname(fp).toLowerCase();
    const img = /\.(png|jpe?g|webp|gif)$/.test(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': img ? 'public, max-age=3600' : 'no-cache'
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (url === '/data.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify(D.publicData()));
  }
  if (url === '/game-data.js') return sendFile(res, path.join(__dirname, 'game-data.js'));
  if (url === '/img-list') { // lista as imagens que existem em public/img (o cliente só carrega as que existirem)
    return fs.readdir(path.join(PUB, 'img'), (err, files) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(err ? [] : files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f))));
    });
  }
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      rooms: rooms.length,
      players: rooms.reduce((s, r) => s + r.players.size, 0),
      modes: Object.keys(D.MODES).reduce((o, k) => { o[k] = rooms.reduce((s, r) => s + (r.mode === k ? r.players.size : 0), 0); return o; }, {}),
      perRoom: rooms.map((r) => ({ id: r.id, players: r.players.size }))
    }));
  }
  if (url === '/api/ranking' && req.method === 'GET') return serveRanking(req, res);
  if (url === '/api/ranking/claim' && req.method === 'POST') return claimPrize(req, res);
  if (url.startsWith('/api/') || url === '/admin/skin' || url === '/admin/senha') { // contas por e-mail (accounts.js)
    if (accounts && accounts.handle(req, res, url)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"Contas desativadas neste servidor."}');
  }
  if (url === '/') url = '/index.html';
  const fp = path.normalize(path.join(PUB, url));
  if (fp !== PUB && !fp.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  sendFile(res, fp);
});

// GET /api/ranking: as duas listas (sem e-mails). Com o login no cabeçalho, marca a linha de quem pediu e diz a posição dele.
async function serveRanking(req, res) {
  const reply = (obj) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    if (!ranking) return reply({ enabled: false });
    await rankingReady;
    let acc = null;
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    if (m && accounts) { try { acc = await accounts.auth(m[1]); } catch (e) { acc = null; } }
    reply(Object.assign({ enabled: true, persistent: !!accounts.status().persistent }, ranking.boards(acc ? acc.id : null)));
  } catch (e) {
    console.error('Ranking: erro:', e && e.message);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{"error":"Rankings indisponíveis agora."}'); }
  }
}

// POST /api/ranking/claim: quem fechou a semana passada em 1º lugar de algum ranking resgata a skin do prêmio (o servidor confere; o cliente não decide nada)
async function claimPrize(req, res) {
  const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    if (!ranking || !accounts) return reply(404, { error: 'Rankings indisponíveis.' });
    await rankingReady;
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    const acc = m ? await accounts.auth(m[1]) : null;
    if (!acc) return reply(401, { error: 'Entre na sua conta para resgatar.' });
    const boards = ranking.claimable(acc.id), skins = boards.map((k) => D.WEEK_PRIZES[k].skin);
    if (!skins.length) return reply(200, { ok: true, granted: [], own: accounts.skinsOf(acc).own });
    const own = await accounts.grantSkins(acc.id, skins);
    reply(200, { ok: true, granted: skins, own });
  } catch (e) {
    console.error('Prêmio: erro:', e && e.message);
    if (!res.headersSent) reply(500, { error: 'Não deu para resgatar agora.' });
  }
}

/* ------------------------------ salas e entidades ------------------------------ */
function newRoom(mode) {
  const room = { mode: D.MODES[mode] ? mode : 'classic', best: [], id: nextRoomId++, players: new Map(), specs: new Map(), kc: null, mobs: [], projs: [], later: [], ev: [], t: 0, now: 0, nid: 1, boss: null, quiet: false };
  const tw = D.ZONES.reduce((s, z) => s + z.weight, 0);
  D.ZONES.forEach((z, zi) => {
    const n = Math.round((D.MOB_COUNT * z.weight) / tw);
    for (let i = 0; i < n; i++) room.mobs.push(makeMob(room, zi));
  });
  makeBoss(room);
  rooms.push(room);
  return room;
}

function makeMob(room, zi) {
  const z = D.ZONES[zi], def = D.MOBS[z.mob];
  const m = { room, id: room.nid++, isMob: true, key: z.mob, ki: MOB_KEYS.indexOf(z.mob), def, zi, r: def.r, maxHp: def.hp, alive: true, respT: 0 };
  resetMob(m);
  return m;
}
// O dragão dorme no centro do mapa. Ele é um monstro da lista (para o alvo automático, projéteis e área funcionarem
// igual), mas com comportamento próprio: só age depois de levar golpes (updateBoss).
function makeBoss(room) {
  const def = D.MOBS[D.BOSS.mob];
  const m = {
    id: room.nid++, isMob: true, boss: true, key: D.BOSS.mob, ki: MOB_KEYS.indexOf(D.BOSS.mob), def, zi: -1,
    r: def.r, maxHp: def.hp, baseHp: def.hp, alive: true, respT: 0, room
  };
  resetMob(m);
  room.mobs.push(m);
  room.boss = m;
  return m;
}

function resetMob(m) {
  if (m.boss) {
    m.x = m.hx = W.cx; m.y = m.hy = W.cy; m.face = Math.PI / 2;
    m.maxHp = m.baseHp; m.hp = m.maxHp; m.alive = true; m.hits = 0; m.stun = 0; m.atkT = 0; m.tgt = null; m.returning = false;
    m.state = 0; m.cast = null; m.cdB = 3; m.cdS = 3; m.gcd = 0; m.calmT = 0; m.threat = new Map(); m.dmgBy = new Map();
    return;
  }
  m.cast = null; m.spCd = undefined;
  const z = D.ZONES[m.zi];
  let ang, nd;
  for (let k = 0; k < 24; k++) { // sorteia de novo se cair dentro da toca do dragão ou perto demais de outro da mesma zona
    ang = Math.random() * Math.PI * 2; nd = rnd(z.min, Math.min(z.max, W.wall - 0.03));
    const cx = W.cx + Math.cos(ang) * nd * W.rx, cy = W.cy + Math.sin(ang) * nd * W.ry;
    if (Math.hypot(Math.cos(ang) * nd * W.rx, Math.sin(ang) * nd * W.ry) <= D.BOSS.clear) continue;
    if (z.gap && m.room && m.room.mobs.some((o) => o !== m && o.zi === m.zi && o.hx !== undefined && Math.hypot(o.hx - cx, o.hy - cy) < z.gap)) continue;
    break;
  }
  m.x = m.hx = W.cx + Math.cos(ang) * nd * W.rx;
  m.y = m.hy = W.cy + Math.sin(ang) * nd * W.ry;
  m.hp = m.maxHp; m.alive = true; m.hits = 0; m.stun = 0; m.atkT = rnd(0, 1);
  m.tgt = null; m.wanderT = rnd(0, 3); m.wx = m.x; m.wy = m.y; m.returning = false;
}

function makePlayer(ws, name, color, save, mode) {
  const p = {
    id: nextPlayerId++, ws, isPlayer: true, name, color, gone: false, room: null,
    x: 0, y: 0, face: 0, mx: 0, my: 0, am: false, aim: 0,
    level: 1, xp: 0, points: 0, stats: { str: 1, dex: 1, man: 1, hlt: 1 }, hp: 1, maxHp: 1, r: 16,
    inv: [], equip: { w: ['faca', null], a: 'vital_0' }, kills: {}, pk: 0, done: new Set(),
    alive: false, protectUntil: 0, stun: 0, slowT: 0, wt: [0, 0], st: [0, 0],
    combatT: 0, aliveT: 0, nodT: 0, oneHits: 0, lastSave: -99, saveDirty: false,
    armor: { hp: 0, rp: 0, rm: 0 }, armorItem: 'vital_0', active: [], fused: false, sk: 0, trails: [], inQ: [], qActive: false, ack: 0, qMiss: 0
  };
  if (mode === 'pvp') { // PvP não leva o progresso dos outros modos: só as armas míticas do dragão ficam; o resto do save fica guardado como estava
    p.pvp = true;
    const tmp = { inv: [], kills: {}, pk: 0, done: new Set(), equip: { w: ['faca', null], a: 'vital_0' } };
    loadSave(tmp, save);
    p.baseSave = { items: tmp.inv, equip: tmp.equip, kills: tmp.kills, pk: tmp.pk, done: [...tmp.done] };
    loadSave(p, { items: tmp.inv.filter(isMythicWeapon), equip: tmp.equip });
  } else loadSave(p, save);
  recalc(p);
  return p;
}

const isMythicWeapon = (id) => !!(D.ITEMS[id] && D.ITEMS[id].kind === 'weapon' && D.ITEMS[id].tier === D.MYTHIC_TIER);
// Valida o progresso salvo no navegador do jogador (sem login: o save vive no localStorage).
function loadSave(p, s) {
  if (!s || typeof s !== 'object') return;
  const cap = D.CATALOG_SIZE;
  if (Array.isArray(s.items)) {
    for (const id of s.items) {
      if (typeof id === 'string' && D.ITEMS[id] && !D.BASE_ITEMS.includes(id) && !p.inv.includes(id) && p.inv.length < cap) p.inv.push(id);
    }
  }
  if (s.kills && typeof s.kills === 'object') {
    for (const k of MOB_KEYS) { const v = Number(s.kills[k]); if (v > 0) p.kills[k] = Math.min(100000, Math.floor(v)); }
  }
  const pk = Number(s.pk);
  if (pk > 0) p.pk = Math.min(100000, Math.floor(pk));
  if (Array.isArray(s.done)) for (const id of s.done) if (D.QUESTS.some((q) => q.id === id)) p.done.add(id);
  const eq = s.equip;
  if (eq && typeof eq === 'object') {
    const ok = (id, kind) => typeof id === 'string' && D.ITEMS[id] && D.ITEMS[id].kind === kind && (D.BASE_ITEMS.includes(id) || p.inv.includes(id));
    if (Array.isArray(eq.w)) {
      for (let i = 0; i < 2; i++) {
        if (eq.w[i] === null) p.equip.w[i] = null;
        else if (ok(eq.w[i], 'weapon')) p.equip.w[i] = eq.w[i];
      }
    }
    if (ok(eq.a, 'armor')) p.equip.a = eq.a;
  }
}

// Recalcula tudo que deriva de atributos/equipamento. Item sem requisito cumprido fica inativo.
function recalc(p) {
  p.r = 16 + p.level * 0.9;
  const arm = D.ITEMS[p.equip.a];
  const useArm = arm && arm.kind === 'armor' && D.meetsReq(arm, p.stats) ? arm : D.ITEMS.vital_0;
  p.armorItem = useArm.id;
  p.armor = D.armorStats(useArm, p.stats);
  p.maxHp = 40 + p.stats.hlt * 10 + p.armor.hp;
  p.spd = null; // a velocidade é recalculada abaixo, depois de saber quais armas estão ativas
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  p.active = [];
  for (let slot = 0; slot < 2; slot++) {
    const it = D.ITEMS[p.equip.w[slot]];
    if (it && it.kind === 'weapon' && D.meetsReq(it, p.stats)) p.active.push({ slot, item: it, F: D.FAMILIES[it.fam] });
  }
  if (!p.active.length) p.active.push({ slot: 0, item: D.ITEMS.faca, F: D.FAMILIES.faca }); // sem arma ativa: a faca ajuda
  p.spd = D.moveSpeed(p.level, p.active.map((a) => a.item.fam));
  const w0 = D.ITEMS[p.equip.w[0]];
  // Fusão: o MESMO item nos dois slots (como só existe 1 de cada no inventário, é assim que se funde).
  p.fused = !!(w0 && p.equip.w[0] === p.equip.w[1] && D.meetsReq(w0, p.stats) && D.FAMILIES[w0.fam].skill);
  // Mistura: duas armas diferentes ativas, as duas com habilidade
  const mixOk = !p.fused && p.active.length === 2 && p.active[0].item.id !== p.active[1].item.id && p.active[0].F.skill && p.active[1].F.skill;
  p.mixed = !!mixOk;
  p.mixName = mixOk ? D.mixName(p.active[0].item.fam, p.active[1].item.fam) : '';
  p.mixCd = mixOk ? D.mixCd(p.active[0].item.fam, p.active[1].item.fam) : 0;
}

function spawnPlayer(room, p) {
  const ang = Math.random() * Math.PI * 2, nd = rnd(0.8, W.wall - 0.03);
  p.x = W.cx + Math.cos(ang) * nd * W.rx;
  p.y = W.cy + Math.sin(ang) * nd * W.ry;
  recalc(p);
  p.hp = p.maxHp; p.alive = true; p.protectUntil = room.now + SPAWN_PROTECT;
  p.stun = 0; p.slowT = 0; p.wt = [0, 0]; p.st = [0, 0]; p.trails = []; p.inQ.length = 0;
  p.aliveT = 0; p.nodT = 0; p.combatT = 0; p.oneHits = 0;
}

/* ------------------------------ rede ------------------------------ */
function send(p, obj) {
  if (p.ws.readyState === 1) p.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}
function bcast(room, obj, except) {
  const s = JSON.stringify(obj);
  room.players.forEach((p) => { if (p !== except) send(p, s); });
  room.specs.forEach((p) => { if (p !== except) send(p, s); });
}
function feed(room, text) { bcast(room, { t: 'feed', m: text }); }
function ev(room, e) { if (room.ev.length < 400) room.ev.push(e); }
function fx(room, kind, x, y, ang, size, fam, tier, extra) {
  ev(room, ['f', Math.round(x), Math.round(y), kind, +ang.toFixed(2), Math.round(size), fam, tier, extra === undefined ? 0 : extra]);
}

function meMsg(p) {
  return {
    t: 'me', lv: p.level, pts: p.points, xp: p.xp, xn: p.level >= D.MAX_LEVEL ? 0 : D.xpNeed(p.level), stats: p.stats,
    hp: Math.round(p.hp), mhp: p.maxHp, inv: p.inv, eq: p.equip, act: p.active.map((a) => a.slot),
    fu: p.fused, mx: p.mixed ? [p.mixName, p.mixCd] : 0, wcd: [+p.wt[0].toFixed(2), +p.wt[1].toFixed(2)], scd: [+p.st[0].toFixed(2), +p.st[1].toFixed(2)],
    arm: p.armor, armId: p.armorItem, alive: p.alive, rk: p.rk || 0, rd: p.rd || 0, rs: p.rs || 0,
    q: { kills: p.kills, pk: p.pk, alive: Math.floor(p.aliveT), nod: Math.floor(p.nodT), one: p.oneHits, done: [...p.done] }
  };
}
function saveMsg(p) {
  if (p.pvp) { // no PvP só entram no save as armas míticas (as novas do dragão); o resto continua o que era antes
    const b = p.baseSave, items = b.items.slice();
    for (const id of p.inv) if (isMythicWeapon(id) && !items.includes(id)) items.push(id);
    return { t: 'save', d: { items, equip: b.equip, kills: b.kills, pk: b.pk, done: b.done } };
  }
  return { t: 'save', d: { items: p.inv, equip: p.equip, kills: p.kills, pk: p.pk, done: [...p.done] } };
}

/* ------------------------------ combate ------------------------------ */
// Novatos (nível NEWBIE_LEVEL ou menos) não lutam contra outros jogadores: não apanham nem batem. Monstros valem para todos.
function pvpOk(a, b) { return !(a.room && a.room.mode === 'coop') && a.level > D.NEWBIE_LEVEL && b.level > D.NEWBIE_LEVEL && !(a.simTeam && a.simTeam === b.simTeam); } // no modo cooperativo ninguém fere ninguém // simTeam: só o simulador usa (robôs aliados)

function eachEnemy(room, src, fn) {
  for (const m of room.mobs) if (m.alive) fn(m);
  room.players.forEach((p) => { if (p !== src && p.alive && (!src.isPlayer || pvpOk(src, p))) fn(p); });
}

function stun(e, sec) {
  if (e.isPlayer) sec *= D.PLAYER_STUN_MULT;
  e.stun = Math.max(e.stun || 0, sec);
}

// Aplica dano. Retorna true se acertou (false se o alvo estava imune/morto).
function hit(room, src, e, dmg, dtype) {
  if (!e.alive) return false;
  if (e.isPlayer) {
    if (e.protectUntil > room.now) return false;
    if (src && src.isPlayer && !pvpOk(src, e)) return false; // proteção de novato
    if (src && src.isPlayer && src !== e) dmg *= D.PVP_DAMAGE; // PvP com 40% a menos de dano
    const res = dtype === 'magic' ? e.armor.rm : e.armor.rp;
    dmg = Math.max(1, Math.round(dmg * (1 - res / 100)));
    e.nodT = 0;
  } else {
    dmg = Math.max(1, Math.round(dmg));
    if (e.boss) { // só jogadores do nível mínimo machucam o dragão
      if (!src || !src.isPlayer || src.gone || src.level < D.BOSS.minLevel) return false;
      dmg = Math.min(dmg, Math.ceil(e.hp));
      bossHurt(room, e, src, dmg);
    }
  }
  if (e.isMob) e.hits++; // golpes que o monstro já levou nesta vida (a missão do Arco conta quantos foram precisos)
  e.hp -= dmg;
  if (room.onHit) room.onHit(src, e, dmg); // gancho do simulador (medir dano causado e sofrido)
  if (src && src.isPlayer) src.combatT = 6;
  // 5º e 6º campos: quem apanhou e a direção do golpe (o cliente usa para empurrar, achatar e soltar faíscas para o lado certo)
  ev(room, ['d', Math.round(e.x), Math.round(e.y - e.r), dmg, e.isPlayer ? 1 : 0, e.id, src ? +Math.atan2(e.y - src.y, e.x - src.x).toFixed(2) : null]);
  if (e.hp <= 0) {
    e.hp = 0;
    if (e.isMob) killMob(room, e, src);
    else killPlayer(room, e, src);
  }
  return true;
}

function killMob(room, m, src) {
  if (m.boss) return killBoss(room, m);
  m.alive = false; m.respT = rnd(D.MOB_RESPAWN[0], D.MOB_RESPAWN[1]); m.tgt = null;
  ev(room, ['x', Math.round(m.x), Math.round(m.y), m.ki]);
  if (src && src.isPlayer && !src.gone && src.alive) {
    addXp(room, src, Math.max(1, Math.round(m.def.xp * ((D.MODES[room.mode] || D.MODES.classic).mobXp))));
    src.kills[m.key] = (src.kills[m.key] || 0) + 1;
    if (m.def.tier >= 3 && m.hits <= D.ONEHIT_MAX_HITS) src.oneHits++; // "monstro forte" = faixa 3 ou mais, morto em poucos golpes
    rollDrops(room, src, m);
    checkQuests(room, src);
    src.saveDirty = true;
  }
}

/* ------------------------- espectador e contador de abates ------------------------- */
// ADMIN_EMAIL (variável de ambiente, vários separados por vírgula): contas com esses e-mails (já confirmados) podem ligar o contador.
const ADMINS = ('guiaugusto_32@outlook.com,guiiaugusto31@gmail.com,' + String(process.env.ADMIN_EMAIL || '')).toLowerCase().split(/[,;\s]+/).filter(Boolean);
const MAX_SPECS = 10; // espectadores por sala
const isAdminAcc = (acc) => !!(acc && acc.verified && acc.email && ADMINS.includes(String(acc.email).toLowerCase()));
// Contador de abates da sala (ligado pelo administrador): conta só quem joga com conta, vítimas de qualquer nível, mesma regra dos 5 segundos.
function kcAdd(room, src, v) {
  const kc = room.kc;
  if (!kc || !src.acct) return;
  const key = src.acct.id + '>' + (v.acct ? 'a' + v.acct.id : 'g' + String(v.name).toLowerCase()), t = Date.now(), last = kc.recent.get(key);
  if (last !== undefined && t - last < REPEAT_MS) return;
  kc.recent.set(key, t);
  if (kc.recent.size > 2000) for (const [k, ts] of kc.recent) if (t - ts >= REPEAT_MS) kc.recent.delete(k);
  const row = kc.rows.get(src.acct.id) || { name: src.name, k: 0, first: t };
  row.name = src.name; row.k++; row.last = t;
  kc.rows.set(src.acct.id, row);
  kc.dirty = true;
}
function kcMsg(room) {
  if (!room.kc) return { t: 'kc', on: false };
  const l = [...room.kc.rows.values()].sort((a, b) => b.k - a.k || a.last - b.last).slice(0, 10).map((r) => [r.name, r.k]);
  return { t: 'kc', on: true, l };
}
function updateSpec(s) {
  const reps = s.inQ.length > 2 ? 2 : 1;
  for (let r = 0; r < reps; r++) {
    const c = s.inQ.shift();
    if (c) { s.mx = c.x; s.my = c.y; s.ack = c.s; s.qMiss = 0; }
    else { if (++s.qMiss > 6) { s.mx = 0; s.my = 0; } continue; }
    if (s.mx || s.my) { s.x += s.mx * s.spd * DT; s.y += s.my * s.spd * DT; clampWorld(s); s.face = Math.atan2(s.my, s.mx); }
  }
}

function killPlayer(room, v, src) {
  const old = v.level;
  v.alive = false; v.mx = 0; v.my = 0;
  const by = src ? (src.isPlayer ? src.name : src.def.name) : '???';
  ev(room, ['x', Math.round(v.x), Math.round(v.y), -1, v.id]);
  const tomb = src && src.isPlayer && src !== v && src.sk ? Math.floor(src.sk / 100) : 0; // prêmio semanal: lápide (1) ou lápide dourada (2) de quem abateu
  if (tomb) fx(room, 'tomb', v.x, v.y, 0, 40, 'faca', tomb);
  send(v, { t: 'death', by, lvl: old });
  if (src && src.isPlayer && src !== v && !src.gone && src.alive) {
    if (old >= D.PK_MIN_LEVEL) src.pk++; // a missão 'derrotar jogadores' só conta vítimas de nível razoável (para não valer caçar novatos)
    { // o ranking de abates do Clássico conta vítimas de qualquer nível
      if (ranking && src.acct) { const vk = v.acct ? 'a' + v.acct.id : 'g' + String(v.name).toLowerCase(); if (room.mode === 'classic') ranking.pvpKill(src.acct.id, vk); }
    }
    kcAdd(room, src, v);
    addXp(room, src, Math.floor(D.totalXp(old, v.xp) * D.PVP_XP_FRAC)); // 40% de todo o XP que a vítima tinha (níveis já passados + o do nível atual)
    checkQuests(room, src);
    src.saveDirty = true;
    if (room.mode === 'pvp') { src.rk = (src.rk || 0) + 1; src.rs = (src.rs || 0) + 1; if (ranking && src.acct) ranking.modeKill(src.acct.id, v.acct ? 'a' + v.acct.id : 'g' + String(v.name).toLowerCase()); } // contador da sala: abates e série (mortes seguidas sem morrer)
    const streak = room.mode === 'pvp' && src.rs >= 3 ? ' — série de ' + src.rs + '!' : '';
    feed(room, src.name + ' derrotou ' + v.name + ' (nv ' + old + ')' + streak);
  } else {
    feed(room, v.name + ' foi derrotado por ' + by + ' (nv ' + old + ')');
  }
  if (room.mode === 'pvp') { v.rd = (v.rd || 0) + 1; v.rs = 0; }
  // Morreu = perde todo o nível atual. Equipamentos e progresso de missões permanecem.
  v.level = 1; v.xp = 0; v.points = 0; v.stats = { str: 1, dex: 1, man: 1, hlt: 1 };
  v.aliveT = 0; v.nodT = 0; v.oneHits = 0; v.stun = 0; v.slowT = 0;
  recalc(v);
  v.saveDirty = true;
}

function addXp(room, p, amount) {
  if (p.level >= D.MAX_LEVEL || amount <= 0) return;
  p.xp += amount;
  ev(room, ['d', Math.round(p.x), Math.round(p.y - p.r - 16), amount, 2]);
  let ups = 0;
  const gain = { str: 0, dex: 0, man: 0, hlt: 0 };
  while (p.level < D.MAX_LEVEL && p.xp >= D.xpNeed(p.level)) {
    p.xp -= D.xpNeed(p.level);
    p.level++;
    ups++;
    if (p.level === 5 || p.level === 10 || p.level === 20) console.log('[subida] ' + room.mode + ' | ' + (p.acct ? p.acct.email : 'sem conta') + ' | ' + p.name + ' | nível ' + p.level + ' em ' + Math.round(p.aliveT) + 's de vida'); // para medir quanto tempo a subida leva (aparece nos logs da hospedagem)
    for (const k of D.ATTRS) { // dados do nível: 1d3 em cada atributo (máximo ATTR_MAX)
      const g = Math.min(1 + Math.floor(Math.random() * D.LEVEL_DIE), D.ATTR_MAX - p.stats[k]);
      p.stats[k] += g; gain[k] += g;
    }
  }
  if (ups) {
    if (p.level >= D.MAX_LEVEL) p.xp = 0;
    recalc(p);
    p.hp = p.maxHp;
    send(p, { t: 'lvl', level: p.level, ups, gain });
    send(p, meMsg(p));
    if (p.level >= D.MAX_LEVEL) {
      feed(room, p.name + ' chegou ao nível ' + D.MAX_LEVEL + ' e ganhou a coroa!');
      if (ranking && p.acct) ranking.crowned(p.acct.id);
    }
    checkQuests(room, p);
  }
}

/* ------------------------------ loot e missões ------------------------------ */
const ITEM_POOL = {};
Object.values(D.ITEMS).forEach((it) => {
  if (it.tier < 1) return;
  const key = it.kind + it.tier;
  (ITEM_POOL[key] = ITEM_POOL[key] || []).push(it);
});

function rollDrops(room, p, m) {
  const tier = Math.min(D.DROP_MAX_TIER, m.def.tier);
  if (Math.random() < D.DROP_WEAPON) giveRandom(p, 'weapon', tier);
  if (Math.random() < D.DROP_ARMOR) giveRandom(p, 'armor', Math.min(D.DROP_MAX_TIER_ARMOR, m.def.tier));
}
// Cai direto na mochila (desbloqueia o item), no máximo 1 de cada: só sorteia entre o que o jogador ainda não tem.
function giveRandom(p, kind, tier) {
  const cands = (ITEM_POOL[kind + tier] || []).filter((it) => !p.inv.includes(it.id));
  if (!cands.length) return null;
  return giveItem(p, cands[Math.floor(Math.random() * cands.length)]);
}
function giveItem(p, it) {
  if (p.inv.includes(it.id)) return null;
  p.inv.push(it.id);
  p.saveDirty = true;
  send(p, { t: 'loot', item: it.id });
  send(p, meMsg(p));
  return it;
}

function questDone(p, q) {
  switch (q.type) {
    case 'kill': return (p.kills[q.mob] || 0) >= q.n;
    case 'pk': return p.pk >= q.n;
    case 'survive': return p.alive && p.aliveT >= q.n;
    case 'nodamage': return p.alive && p.nodT >= q.n;
    case 'onehit': return p.oneHits >= q.n;
    case 'level': return p.level >= q.n;
    default: return false;
  }
}
function checkQuests(room, p) {
  if (!p.alive) return;
  for (const q of D.QUESTS) {
    if (p.done.has(q.id) || !questDone(p, q)) continue;
    p.done.add(q.id);
    if (!p.inv.includes(q.reward)) p.inv.push(q.reward); // recompensa ignora o limite de espaço
    p.saveDirty = true;
    send(p, { t: 'quest', id: q.id, item: q.reward });
    send(p, meMsg(p));
    feed(room, p.name + ' completou a missão: ' + q.text);
  }
}

/* ------------------------------ ataques automáticos ------------------------------ */
// Procura o alvo mais próximo ao alcance. No modo "cursor" só vale quem está na direção da mira.
function findTarget(room, p, range, ignoreAim) {
  let best = null, bd = Infinity;
  const reach = range + p.r * 0.5;
  const cur = p.am && !ignoreAim;
  const consider = (e) => {
    if (!e.alive) return;
    if (e.boss && p.level < D.BOSS.minLevel) return;
    if (e.isPlayer && (e.protectUntil > room.now || !pvpOk(p, e))) return;
    const d = dist(p.x, p.y, e.x, e.y);
    if (d > reach + e.r) return;
    if (cur && Math.abs(angDiff(Math.atan2(e.y - p.y, e.x - p.x), p.aim)) > 0.9) return;
    if (d < bd) { bd = d; best = e; }
  };
  for (const m of room.mobs) consider(m);
  room.players.forEach((q) => { if (q !== p) consider(q); });
  if (!best) return null;
  return { e: best, d: bd, ang: cur ? p.aim : Math.atan2(best.y - p.y, best.x - p.x) };
}

function spawnProj(room, p, o) {
  room.projs.push({
    id: room.nid++, owner: p, x: p.x + Math.cos(o.ang) * p.r, y: p.y + Math.sin(o.ang) * p.r,
    vx: Math.cos(o.ang) * o.speed, vy: Math.sin(o.ang) * o.speed, ang: o.ang, dmg: o.dmg, type: o.type,
    r: o.r, life: o.range / o.speed, k: o.k, fam: o.fam, tier: o.tier, aoe: o.aoe || 0,
    pierce: !!o.pierce, hit: o.pierce ? new Set() : (o.skip ? new Set([o.skip]) : null),
    split: !!o.split, home: o.home || null, turn: o.turn || 0, onhit: o.onhit || null, heal: o.heal || 0, splitN: o.splitN || 0, splitMul: o.splitMul || 0
  });
}
// Varinha: o tiro explode em 5 estilhaços (72° um do outro) que se curvam para os alvos mais próximos do ponto de impacto
function splitShards(room, pr, first) {
  const near = [];
  eachEnemy(room, pr.owner, (t) => {
    if (t === first || (t.boss && pr.owner.level < D.BOSS.minLevel)) return;
    if (t.isPlayer && t.protectUntil > room.now) return;
    const d = dist(pr.x, pr.y, t.x, t.y);
    if (d <= D.WAND_SPLIT.seek) near.push({ t, d });
  });
  near.sort((a, b) => a.d - b.d);
  fx(room, 'orbx', pr.x, pr.y, 0, 46, pr.fam, pr.tier);
  const n = pr.splitN || D.WAND_SPLIT.n, mul = pr.splitMul || D.WAND_SPLIT.mul;
  for (let i = 0; i < n; i++) {
    const ang = pr.ang + i * Math.PI * 2 / n + 0.3;
    room.projs.push({
      id: room.nid++, owner: pr.owner, x: pr.x, y: pr.y, vx: Math.cos(ang) * D.WAND_SPLIT.speed, vy: Math.sin(ang) * D.WAND_SPLIT.speed,
      ang, dmg: pr.dmg * mul, type: pr.type, r: 9, life: D.WAND_SPLIT.range / D.WAND_SPLIT.speed, k: 'b', fam: pr.fam, tier: pr.tier, aoe: 0,
      pierce: false, hit: new Set([first]), split: false, home: near.length ? near[i % near.length].t : null, turn: D.WAND_SPLIT.turn, onhit: null, heal: pr.heal ? pr.heal * 0.66 : 0, splitN: 0, splitMul: 0
    });
  }
}

function inCone(p, t, R, ang, width) {
  const d = dist(p.x, p.y, t.x, t.y);
  if (d - t.r > R + p.r * 0.5) return false;
  const a = Math.atan2(t.y - p.y, t.x - p.x);
  return Math.abs(angDiff(a, ang)) <= width / 2 + Math.asin(Math.min(1, t.r / Math.max(d, 1)));
}

// Corte em cone: quem é atingido e a forma MÁXIMA da área de dano. O dano conta a borda do alvo (inCone): um monstro é pego se a borda dele chega
// a `alcance + meio corpo` e a abertura ganha asin(raio/distância) de cada lado. Para o raio `rt` do maior alvo, a forma máxima tem alcance base + rt e
// abertura width + 2·asin(rt/alcance), e a animação percorre exatamente isso (a arma, a luz no chão); `rt` e `width` seguem no efeito para a luz abrir
// as laterais do jeito que o dano abre. rt ≤ 90 (o dragão é o maior).
function coneHits(room, p, R, ang, width, e) {
  const base = R + p.r * 0.5, hits = []; let rt = e ? e.r : 0;
  eachEnemy(room, p, (t) => { if (inCone(p, t, R, ang, width)) { hits.push(t); rt = Math.max(rt, t.r); } });
  rt = Math.min(90, rt);
  const reach = base + rt;
  return { hits, reach, rt, width, span: width + 2 * Math.asin(Math.min(1, rt / reach)) };
}

function basicAttack(room, p, a, tg) {
  const F = a.F, it = a.item, fam = it.fam, tier = it.tier, e = tg.e, ang = tg.ang;
  const dmg = D.weaponDamage(it, p.stats);
  p.face = ang;
  // animação da arma no cliente; espada e chicote levam o alcance máximo e a abertura do golpe (a lâmina percorre exatamente a área de dano)
  const arc = F.atk === 'arc' ? coneHits(room, p, F.range, ang, F.arcAng, e) : null;
  ev(room, arc ? ['a', Math.round(p.x), Math.round(p.y), p.id, a.slot, +ang.toFixed(2), 0, Math.round(arc.reach), +arc.span.toFixed(3)]
    : ['a', Math.round(p.x), Math.round(p.y), p.id, a.slot, +ang.toFixed(2), 0]);
  switch (F.atk) {
    case 'single':
      fx(room, 'thrust', e.x, e.y, ang, 34, fam, tier);
      if (hit(room, p, e, dmg, F.type) && F.stunChance && Math.random() < F.stunChance) stun(e, 0.6);
      break;
    case 'splash':
      fx(room, 'smash', e.x, e.y, ang, F.splash, fam, tier);
      eachEnemy(room, p, (t) => { if (dist(t.x, t.y, e.x, e.y) - t.r <= F.splash) hit(room, p, t, dmg, F.type); });
      break;
    case 'arc': {
      fx(room, 'arc', p.x, p.y, ang, arc.reach, fam, tier, [+F.arcAng.toFixed(3), Math.round(arc.rt)]);
      arc.hits.forEach((t) => hit(room, p, t, dmg, F.type));
      break;
    }
    case 'ring': { // sinos: a badalada acontece no monstro que está sendo atacado e atinge quem estiver ao redor dele
      const R = F.range + p.r * 0.5;
      fx(room, 'ring', e.x, e.y, 0, R, fam, tier);
      eachEnemy(room, p, (t) => { if (t === e || dist(e.x, e.y, t.x, t.y) - t.r <= R) hit(room, p, t, dmg, F.type); });
      break;
    }
    case 'proj':
      spawnProj(room, p, { ang, speed: F.projSpeed, range: F.range + 40, dmg, type: F.type, r: 8, k: 'p', fam, tier });
      break;
    case 'orb':
      spawnProj(room, p, { ang, speed: F.projSpeed, range: F.range + 30, dmg, type: F.type, r: 12, k: 'o', fam, tier, aoe: F.aoe });
      break;
  }
}

// mix: a habilidade faz parte de uma habilidade mista (quem controla a recarga é trySkillMix) e devolve se disparou.
function trySkill(room, p, a, mix) {
  const F = a.F, S = F.skill, i = a.slot;
  if (!S) return false;
  if (!mix) {
    if (p.fused && i === 1) return false; // habilidade fundida: um único disparo por ciclo, com o cooldown da arma
    if (p.st[i] > 0) return false;
  }
  const fu = p.fused, am = fu ? 1.4 : 1, dm = (fu ? 1.5 : 1) * (mix ? D.MIX_DMG : 1);
  let trig;
  switch (S.kind) {
    case 'burst': trig = findTarget(room, p, S.radius * am, true); break;
    case 'cone': trig = findTarget(room, p, S.range * am, false); break;
    case 'dash': trig = findTarget(room, p, S.dist * am, false); break;
    case 'volley': trig = findTarget(room, p, S.reach * am, false); break;
    case 'bolt': trig = findTarget(room, p, S.reach * am, false); break;
    default: return false;
  }
  // sem inimigo no alcance, só a habilidade de cura é usada (e só se estiver machucado)
  if (!trig) {
    if (S.kind === 'burst' && S.heal && p.hp < p.maxHp) trig = { e: null, d: 0, ang: p.face };
    else return false;
  }
  const it = a.item, fam = it.fam, tier = it.tier, type = F.type;
  const dmg = Math.round(D.skillDamage(it, p.stats) * dm);
  const ang = trig.ang;
  if (!mix) p.st[i] = S.cd;
  p.face = ang;
  const cone = S.kind === 'cone' ? coneHits(room, p, S.range * am, ang, S.angle * (fu ? 1.25 : 1), trig.e) : null;
  ev(room, cone ? ['a', Math.round(p.x), Math.round(p.y), p.id, i, +ang.toFixed(2), 1, Math.round(cone.reach), +cone.span.toFixed(3)]
    : ['a', Math.round(p.x), Math.round(p.y), p.id, i, +ang.toFixed(2), 1]);
  switch (S.kind) {
    case 'burst': {
      const R = S.radius * am;
      // martelo e maça: a pancada cai no chão, no pé do alvo (e pega quem estiver em volta dele); as outras explodem em volta de quem usa
      const slam = (fam === 'martelo' || fam === 'maca') && trig && trig.e, cx = slam ? trig.e.x : p.x, cy = slam ? trig.e.y : p.y;
      fx(room, 's_burst', cx, cy, 0, R, fam, tier);
      eachEnemy(room, p, (t) => {
        if (dist(cx, cy, t.x, t.y) - t.r <= R + (slam ? 0 : p.r * 0.5) && hit(room, p, t, dmg, type) && S.stun) stun(t, S.stun);
      });
      if (S.heal) {
        const h = Math.round(S.heal * p.maxHp * (fu ? 1.5 : 1));
        p.hp = Math.min(p.maxHp, p.hp + h);
        ev(room, ['d', Math.round(p.x), Math.round(p.y - p.r), h, 3]);
      }
      break;
    }
    case 'cone': {
      const width = S.angle * (fu ? 1.25 : 1);
      fx(room, 's_cone', p.x, p.y, ang, cone.reach, fam, tier, [+width.toFixed(3), Math.round(cone.rt)]);
      cone.hits.forEach((t) => hit(room, p, t, dmg, type));
      break;
    }
    case 'dash': {
      const len = S.dist * (fu ? 1.3 : 1);
      const x0 = p.x, y0 = p.y;
      const to = { x: x0 + Math.cos(ang) * len, y: y0 + Math.sin(ang) * len };
      clampWorld(to);
      eachEnemy(room, p, (t) => { if (segDist(t.x, t.y, x0, y0, to.x, to.y) <= t.r + p.r + 14) hit(room, p, t, dmg, type); });
      p.x = to.x; p.y = to.y;
      fx(room, 's_dash', x0, y0, ang, len, fam, tier, [Math.round(to.x), Math.round(to.y)]);
      break;
    }
    case 'volley': {
      const count = S.count + (fu ? 2 : 0);
      for (let k = 0; k < count; k++) {
        const aa = ang + (k - (count - 1) / 2) * S.spread;
        spawnProj(room, p, { ang: aa, speed: 600, range: S.reach * am, dmg, type, r: 8, k: 'v', fam, tier });
      }
      break;
    }
    case 'bolt':
      spawnProj(room, p, {
        ang, speed: S.speed, range: S.reach * am, dmg, type, r: S.radius * (fu ? 1.6 : 1), k: 'b', fam, tier, split: true
      });
      break;
  }
  return true;
}

// Habilidade (explosão ou cone) a partir de um ponto qualquer, não só de quem usa: serve para as misturas especiais.
function skillAt(room, p, it, S, ox, oy, ang, dmg, scale) {
  const type = D.FAMILIES[it.fam].type, k = scale || 1; let n = 0;
  if (S.kind === 'burst') {
    fx(room, 's_burst', ox, oy, 0, S.radius * k, it.fam, it.tier);
    eachEnemy(room, p, (t) => { if (dist(ox, oy, t.x, t.y) - t.r <= S.radius * k && hit(room, p, t, dmg, type)) { n++; if (S.stun) stun(t, S.stun); } });
  } else if (S.kind === 'cone') {
    fx(room, 's_cone', ox, oy, ang, S.range * k, it.fam, it.tier, +S.angle.toFixed(2));
    eachEnemy(room, p, (t) => { if (inCone({ x: ox, y: oy, r: 0 }, t, S.range * k, ang, S.angle) && hit(room, p, t, dmg, type)) n++; });
  }
  return n;
}
function healOwner(room, p, frac) {
  if (!p.alive || p.gone || p.hp >= p.maxHp) return;
  const h = Math.round(frac * p.maxHp); p.hp = Math.min(p.maxHp, p.hp + h);
  ev(room, ['d', Math.round(p.x), Math.round(p.y - p.r), h, 3]);
}
const later = (room, sec, fn) => room.later.push({ t: sec, fn });
// Estilhaço teleguiado (varinha) a partir de um ponto
function pushShard(room, owner, x, y, ang, o) {
  room.projs.push({
    id: room.nid++, owner, x, y, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed, ang, dmg: o.dmg, type: o.type, r: 9, life: o.range / o.speed,
    k: 'b', fam: o.fam, tier: o.tier, aoe: 0, pierce: false, hit: null, split: false, home: o.home || null, turn: o.turn || 10, onhit: null, heal: 0, splitN: 0, splitMul: 0
  });
}
const mixAnim = (room, p, a, ang) => ev(room, ['a', Math.round(p.x), Math.round(p.y), p.id, a.slot, +ang.toFixed(2), 1]);
const skillDmg = (a, p) => Math.round(D.skillDamage(a.item, p.stats) * D.MIX_DMG);

// ---- Misturas com comportamento próprio: cada arma tem um PAPEL e cada par de papéis tem uma combinação ----
// arrow (arco): tiro/flechas · bolt (varinha): tiro que se espalha · slam (martelo, maça, cajado): pancada no pé do alvo
// slash (espada, chicote): corte em cone · dash (rapieira): investida · aura (sinos): cura
const ROLE = { arco: 'arrow', varinha: 'bolt', martelo: 'slam', maca: 'slam', cajado: 'slam', espada: 'slash', chicote: 'slash', rapieira: 'dash', sinos: 'aura' };
const byRole = (pair, r) => pair.find((a) => ROLE[a.item.fam] === r);
const reachOf = (a) => { const S = a.F.skill; return S.reach || S.range || S.radius || S.dist || 100; };
const mixTarget = (room, p, pair, ignoreAim) => findTarget(room, p, Math.max(...pair.map(reachOf)), ignoreAim);
const startMix = (room, p, pair, tg) => { p.face = tg.ang; pair.forEach((a) => mixAnim(room, p, a, tg.ang)); };
const LEECH = 0.05; // sinos + pancada/corte: cura por inimigo atingido (até 3)
// carrega a habilidade da outra arma até o ponto do impacto (pancada cai no pé do alvo, corte sai do ponto da flecha)
const payload = (p, o) => (room, pr, e) => { const slam = ROLE[o.item.fam] === 'slam'; skillAt(room, p, o.item, o.F.skill, slam ? e.x : pr.x, slam ? e.y : pr.y, pr.ang, skillDmg(o, p)); };
const arrowShot = (room, p, bow, tg, extra) => spawnProj(room, p, Object.assign({ ang: tg.ang, speed: 700, range: reachOf(bow), dmg: skillDmg(bow, p), type: bow.F.type, r: 9, k: 'v', fam: 'arco', tier: bow.item.tier }, extra));
const wandBolt = (room, p, w, tg, extra) => spawnProj(room, p, Object.assign({ ang: tg.ang, speed: w.F.skill.speed, range: w.F.skill.reach, dmg: skillDmg(w, p), type: w.F.type, r: w.F.skill.radius, k: 'b', fam: 'varinha', tier: w.item.tier, split: true }, extra));
const MIX_SPECIAL = {
  // flecha única que, ao acertar, solta o corte/pancada da outra arma no impacto
  'arrow+slash': (room, p, pair) => { const bow = byRole(pair, 'arrow'), o = pair.find((a) => a !== bow), tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg); arrowShot(room, p, bow, tg, { onhit: payload(p, o) }); return true; },
  'arrow+slam': (room, p, pair) => MIX_SPECIAL['arrow+slash'](room, p, pair),
  // flechas mágicas: 3 flechas e cada uma estoura em 3 estilhaços teleguiados
  'arrow+bolt': (room, p, pair) => { const bow = byRole(pair, 'arrow'), tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg); for (let k = -1; k <= 1; k++) arrowShot(room, p, bow, { ang: tg.ang + k * 0.22 }, { split: true, splitN: 3, splitMul: 0.5 }); return true; },
  // flechas que curam quem atira
  'arrow+aura': (room, p, pair) => { const bow = byRole(pair, 'arrow'), tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg); for (let k = -1; k <= 1; k++) arrowShot(room, p, bow, { ang: tg.ang + k * 0.22 }, { heal: 0.03 }); return true; },
  // investida e, no fim dela, o tiro sai do ponto onde parou
  'arrow+dash': (room, p, pair) => { const tg = mixTarget(room, p, pair, false); if (!tg) return false; const d = byRole(pair, 'dash'), o = pair.find((a) => a !== d); if (!trySkill(room, p, d, true)) return false; trySkill(room, p, o, true); return true; },
  'bolt+dash': (room, p, pair) => MIX_SPECIAL['arrow+dash'](room, p, pair),
  // tiro da varinha que, além de se espalhar, solta o corte da outra arma no impacto
  'bolt+slash': (room, p, pair) => { const w = byRole(pair, 'bolt'), o = pair.find((a) => a !== w), tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg); wandBolt(room, p, w, tg, { onhit: payload(p, o) }); return true; },
  // tiro da varinha que se espalha em estilhaços que curam
  'aura+bolt': (room, p, pair) => { const w = byRole(pair, 'bolt'), tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg); wandBolt(room, p, w, tg, { heal: 0.03 }); return true; },
  // pancada no pé do alvo e, de dentro dela, 5 tiros da varinha que acham os alvos da região
  'bolt+slam': (room, p, pair) => {
    const ha = byRole(pair, 'slam'), wa = byRole(pair, 'bolt'), R = ha.F.skill.radius, tg = findTarget(room, p, R, true); if (!tg || !tg.e) return false;
    const cx = tg.e.x, cy = tg.e.y; startMix(room, p, pair, tg);
    skillAt(room, p, ha.item, ha.F.skill, cx, cy, tg.ang, skillDmg(ha, p));
    const inside = [];
    eachEnemy(room, p, (t) => { if (dist(cx, cy, t.x, t.y) - t.r <= R && !(t.boss && p.level < D.BOSS.minLevel)) inside.push(t); });
    inside.sort((a, b) => dist(cx, cy, a.x, a.y) - dist(cx, cy, b.x, b.y));
    const n = D.WAND_SPLIT.n;
    for (let i = 0; i < n; i++) {
      const a0 = Math.random() * Math.PI * 2, rr = Math.random() * R * 0.45, sx = cx + Math.cos(a0) * rr, sy = cy + Math.sin(a0) * rr;
      const home = inside.length ? inside[i % inside.length] : null, ang = home ? Math.atan2(home.y - sy, home.x - sx) : i * Math.PI * 2 / n;
      pushShard(room, p, sx, sy, ang, { speed: 560, range: R + 60, dmg: skillDmg(wa, p) * 0.8, type: wa.F.type, fam: 'varinha', tier: wa.item.tier, home, turn: 14 });
      fx(room, 'orbx', sx, sy, 0, 22, 'varinha', wa.item.tier);
    }
    return true;
  },
  // duas pancadas: a segunda vem logo depois, maior e um pouco mais fraca (terremoto)
  'slam+slam': (room, p, pair) => {
    const big = pair.slice().sort((x, y) => y.F.skill.radius - x.F.skill.radius), tg = findTarget(room, p, big[0].F.skill.radius, true); if (!tg || !tg.e) return false;
    const cx = tg.e.x, cy = tg.e.y; startMix(room, p, pair, tg);
    skillAt(room, p, big[1].item, big[1].F.skill, cx, cy, tg.ang, skillDmg(big[1], p));
    later(room, 0.35, () => { if (p.alive && !p.gone) skillAt(room, p, big[0].item, big[0].F.skill, cx, cy, tg.ang, Math.round(skillDmg(big[0], p) * 0.8), 1.35); });
    return true;
  },
  // pancada e, logo depois, onda de corte saindo do ponto da pancada na direção do golpe
  'slam+slash': (room, p, pair) => {
    const ha = byRole(pair, 'slam'), sa = byRole(pair, 'slash'), tg = mixTarget(room, p, pair, true); if (!tg || !tg.e) return false;
    const cx = tg.e.x, cy = tg.e.y; startMix(room, p, pair, tg);
    skillAt(room, p, ha.item, ha.F.skill, cx, cy, tg.ang, skillDmg(ha, p));
    later(room, 0.2, () => { if (p.alive && !p.gone) skillAt(room, p, sa.item, sa.F.skill, cx, cy, tg.ang, skillDmg(sa, p)); });
    return true;
  },
  // investida e, onde ela termina, a pancada
  'dash+slam': (room, p, pair) => {
    const d = byRole(pair, 'dash'), ha = byRole(pair, 'slam'), tg = mixTarget(room, p, pair, false); if (!tg || !tg.e) return false;
    const e = tg.e; if (!trySkill(room, p, d, true)) return false;
    skillAt(room, p, ha.item, ha.F.skill, e.alive ? e.x : p.x, e.alive ? e.y : p.y, tg.ang, skillDmg(ha, p));
    return true;
  },
  // investida e, onde ela termina, o corte
  'dash+slash': (room, p, pair) => {
    const d = byRole(pair, 'dash'), sa = byRole(pair, 'slash'), tg = mixTarget(room, p, pair, false); if (!tg) return false;
    if (!trySkill(room, p, d, true)) return false;
    skillAt(room, p, sa.item, sa.F.skill, p.x, p.y, tg.ang, skillDmg(sa, p));
    return true;
  },
  // pancada que rouba vida: cura por inimigo atingido
  'aura+slam': (room, p, pair) => {
    const ha = byRole(pair, 'slam'), tg = mixTarget(room, p, pair, true); if (!tg || !tg.e) return false;
    startMix(room, p, pair, tg);
    const n = skillAt(room, p, ha.item, ha.F.skill, tg.e.x, tg.e.y, tg.ang, skillDmg(ha, p));
    healOwner(room, p, LEECH * Math.min(3, n)); return true;
  },
  // corte que rouba vida
  'aura+slash': (room, p, pair) => {
    const sa = byRole(pair, 'slash'), tg = mixTarget(room, p, pair, false); if (!tg) return false;
    startMix(room, p, pair, tg);
    const n = skillAt(room, p, sa.item, sa.F.skill, p.x, p.y, tg.ang, skillDmg(sa, p));
    healOwner(room, p, LEECH * Math.min(3, n)); return true;
  },
  // corte em X: dois cortes cruzados, o segundo um instante depois
  'slash+slash': (room, p, pair) => {
    const tg = mixTarget(room, p, pair, false); if (!tg) return false; startMix(room, p, pair, tg);
    skillAt(room, p, pair[0].item, pair[0].F.skill, p.x, p.y, tg.ang + 0.4, skillDmg(pair[0], p));
    later(room, 0.2, () => { if (p.alive && !p.gone) skillAt(room, p, pair[1].item, pair[1].F.skill, p.x, p.y, tg.ang - 0.4, skillDmg(pair[1], p)); });
    return true;
  },
  // investida da rapieira que deixa no chão um rastro de cura por 2 s
  'aura+dash': (room, p, pair) => {
    const da = byRole(pair, 'dash'), ba = byRole(pair, 'aura');
    const tg = findTarget(room, p, da.F.skill.dist, false); if (!tg) return false;
    const x0 = p.x, y0 = p.y;
    if (!trySkill(room, p, da, true)) return false;
    mixAnim(room, p, ba, tg.ang);
    const heal = (ba.F.skill.heal || 0.18) * p.maxHp * (p.fused ? 1.5 : 1);
    p.trails.push({ x0, y0, x1: p.x, y1: p.y, t: D.TRAIL_HEAL.time, rate: heal / D.TRAIL_HEAL.time });
    fx(room, 'healtrail', x0, y0, tg.ang, Math.round(dist(x0, y0, p.x, p.y)), 'sinos', ba.item.tier, [Math.round(p.x), Math.round(p.y)]);
    return true;
  }
};
const mixKey = (pair) => pair.map((a) => ROLE[a.item.fam]).sort().join('+');

// Habilidade mista: as duas habilidades saem juntas e dividem uma recarga (guardada nos dois slots).
function trySkillMix(room, p) {
  if (p.st[0] > 0 || p.st[1] > 0) return;
  const pair = p.active.slice().sort((x, y) => (x.F.skill.kind === 'dash') - (y.F.skill.kind === 'dash')); // a investida por último
  let any = false;
  const spec = MIX_SPECIAL[mixKey(pair)];
  if (spec) any = spec(room, p, pair);
  if (any) { p.st[0] = p.st[1] = p.mixCd; return; }
  if (spec) any = false; // sem alvo para a mistura especial: volta ao normal (por exemplo, o sino ainda cura sozinho quando está machucado)
  for (const a of pair) if (trySkill(room, p, a, true)) any = true;
  if (any) {
    p.st[0] = p.st[1] = p.mixCd;
    const ia = pair[0].item, ib = pair[1].item; // animação própria da combinação (as duas cores e um desenho que depende do par)
    fx(room, 'mixfx', p.x, p.y, p.face, 210, ia.fam, Math.max(ia.tier, ib.tier), ib.fam);
  }
}

function explode(room, pr) {
  fx(room, 'orbx', pr.x, pr.y, 0, pr.aoe, pr.fam, pr.tier);
  eachEnemy(room, pr.owner, (t) => { if (dist(pr.x, pr.y, t.x, t.y) - t.r <= pr.aoe) hit(room, pr.owner, t, pr.dmg, pr.type); });
}

function updateProjs(room) {
  for (let i = room.projs.length - 1; i >= 0; i--) {
    const pr = room.projs[i];
    if (pr.home) { // estilhaço teleguiado: curva em direção ao alvo, se ele ainda estiver vivo
      if (!pr.home.alive || pr.home.gone) pr.home = null;
      else {
        const want = Math.atan2(pr.home.y - pr.y, pr.home.x - pr.x), df = angDiff(want, pr.ang), step = Math.max(-pr.turn * DT, Math.min(pr.turn * DT, df)), sp = Math.hypot(pr.vx, pr.vy);
        pr.ang += step; pr.vx = Math.cos(pr.ang) * sp; pr.vy = Math.sin(pr.ang) * sp;
      }
    }
    pr.x += pr.vx * DT; pr.y += pr.vy * DT; pr.life -= DT;
    let remove = false;
    const test = (e) => {
      if (remove || !e.alive || e === pr.owner) return;
      if (e.isPlayer && (e.protectUntil > room.now || !pvpOk(pr.owner, e))) return;
      if (pr.hit && pr.hit.has(e)) return;
      if (dist(pr.x, pr.y, e.x, e.y) > e.r + pr.r) return;
      if (pr.k === 'o') { explode(room, pr); remove = true; return; }
      hit(room, pr.owner, e, pr.dmg, pr.type);
      if (pr.heal) healOwner(room, pr.owner, pr.heal);
      if (pr.onhit) pr.onhit(room, pr, e); // projétil misto: ao acertar, solta a habilidade da outra arma
      if (pr.split) { splitShards(room, pr, e); remove = true; return; }
      if (pr.onhit) { remove = true; return; }
      if (pr.pierce) pr.hit.add(e); else remove = true;
    };
    for (const m of room.mobs) test(m);
    room.players.forEach(test);
    if (!remove && pr.life <= 0) { if (pr.k === 'o') explode(room, pr); remove = true; }
    if (!remove && Math.hypot((pr.x - W.cx) / W.rx, (pr.y - W.cy) / W.ry) > 1.08) remove = true;
    if (remove) { room.projs[i] = room.projs[room.projs.length - 1]; room.projs.pop(); }
  }
}

/* ------------------------------ atualização ------------------------------ */
function updatePlayer(room, p) {
  if (!p.alive) return;
  p.aliveT += DT;
  if (p.combatT > 0) { p.combatT -= DT; p.nodT += DT; } // "sem tomar dano" só conta enquanto você está lutando
  if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * D.PLAYER_REGEN * DT); // regenera sempre, inclusive em luta
  if (p.trails && p.trails.length) { // rastro de cura (rapieira + sinos): cura quem fez enquanto estiver em cima
    for (let i = p.trails.length - 1; i >= 0; i--) {
      const tr = p.trails[i]; tr.t -= DT;
      if (tr.t <= 0) { p.trails.splice(i, 1); continue; }
      if (p.hp < p.maxHp && segHit(tr.x0, tr.y0, tr.x1, tr.y1, p.x, p.y).d <= D.TRAIL_HEAL.width + p.r) p.hp = Math.min(p.maxHp, p.hp + tr.rate * DT);
    }
  }
  if (p.stun > 0) p.stun -= DT;
  if (p.slowT > 0) p.slowT -= DT;
  for (let i = 0; i < 2; i++) { if (p.wt[i] > 0) p.wt[i] -= DT; if (p.st[i] > 0) p.st[i] -= DT; }
  // comandos de movimento do cliente: um por passo; se acumular (rede em rajada), consome um a mais para alcançar
  let reps = 1;
  if (p.qActive) {
    reps = p.inQ.length > 2 ? 2 : 1;
    for (let r = 0; r < reps; r++) {
      const c = p.inQ.shift();
      if (c) { p.mx = c.x; p.my = c.y; p.ack = c.s; p.qMiss = 0; }
      else { if (++p.qMiss > 6) { p.mx = 0; p.my = 0; } continue; } // fila vazia: espera o comando chegar (nunca anda sem comando, senão o servidor passa na frente do cliente)
      if (p.stun <= 0 && (p.mx || p.my)) { // anda neste passo (o resto da atualização só roda depois do atordoamento)
        const sp = (p.spd || BASE_SPEED) * (p.slowT > 0 ? 0.6 : 1);
        p.x += p.mx * sp * DT; p.y += p.my * sp * DT; clampWorld(p); p.face = Math.atan2(p.my, p.mx);
      }
    }
  }
  if (p.stun > 0) return;
  if (!p.qActive && (p.mx || p.my)) {
    const sp = (p.spd || BASE_SPEED) * (p.slowT > 0 ? 0.6 : 1);
    p.x += p.mx * sp * DT; p.y += p.my * sp * DT;
    clampWorld(p);
    p.face = Math.atan2(p.my, p.mx);
  }
  for (const a of p.active) {
    if (p.wt[a.slot] <= 0) {
      const tg = findTarget(room, p, a.F.range, false);
      if (tg) { basicAttack(room, p, a, tg); p.wt[a.slot] = a.F.cd; }
      else if (a.F.atk === 'proj' || a.F.atk === 'orb') { // arma de longe atira mesmo sem alvo: na direção da mira (cursor) ou para onde o slime olha
        basicAttack(room, p, a, { e: null, d: 0, ang: p.am ? p.aim : p.face });
        p.wt[a.slot] = a.F.cd;
      }
    }
    if (a.F.skill && !p.mixed) trySkill(room, p, a);
  }
  if (p.mixed) trySkillMix(room, p);
}

function stepToward(e, tx, ty, speed) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1) return d;
  const s = Math.min(d, speed * DT);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  clampWorld(e);
  return d - s;
}

// Ataques especiais dos monstros comuns: aviso no chão (mesmo desenho do dragão), depois o golpe.
// shape: self (em volta dele), leap (pula e cai em cima de quem estava marcado), cone, dash (investida em linha), ground (área sob o alvo).
function mobStartCast(room, m, tg) {
  const S = m.def.sp, ang = Math.atan2(tg.y - m.y, tg.x - m.x);
  m.spCd = S.cd; m.face = ang;
  const c = { t: S.wind, ang, x: tg.x, y: tg.y, sx: m.x, sy: m.y };
  m.cast = c;
  if (S.shape === 'self') ev(room, ['w', Math.round(m.x), Math.round(m.y), 1, 0, S.radius, +S.wind.toFixed(2), 0]);
  else if (S.shape === 'leap' || S.shape === 'ground') ev(room, ['w', Math.round(c.x), Math.round(c.y), 1, 0, S.radius, +S.wind.toFixed(2), 0]);
  else ev(room, ['w', Math.round(m.x), Math.round(m.y), 0, +ang.toFixed(2), S.range, +S.wind.toFixed(2), S.width]);
}
// distância de um ponto a um segmento (para o tiro de teia, que viaja em linha reta e acerta o primeiro que estiver no caminho)
function segHit(x0, y0, x1, y1, px, py) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return { d: Math.hypot(px - (x0 + dx * u), py - (y0 + dy * u)), u };
}
function mobResolveCast(room, m) {
  const S = m.def.sp, c = m.cast, key = m.key;
  m.cast = null; m.atkT = 0.6;
  const dmg = () => m.def.dmg * S.mul * rnd(0.95, 1.05);
  const after = (p) => { if (S.stun) stun(p, S.stun); if (S.slow) p.slowT = Math.max(p.slowT || 0, S.slow); };
  // Área com núcleo (se a habilidade tem `core`): dentro do núcleo é o dano todo e o atordoamento; na borda externa é metade do dano, sem atordoar.
  // A distância conta do centro do jogador, então a área desenhada no chão é exatamente a área que machuca.
  const area = (x, y, R) => room.players.forEach((p) => {
    if (!p.alive) return;
    const d = dist(x, y, p.x, p.y), lim = S.core ? R : R + p.r * 0.5;
    if (d > lim) return;
    const edge = S.core && d > R * S.core;
    if (hit(room, m, p, dmg() * (edge ? 0.5 : 1), 'phys') && !edge) after(p); else if (edge && p.alive && S.slow) after(p);
  });
  if (S.shape === 'self') { fx(room, 'ms', m.x, m.y, 0, S.radius, key, 1); area(m.x, m.y, S.radius); }
  else if (S.shape === 'leap' || S.shape === 'ground') {
    if (S.shape === 'leap') { m.x = c.x; m.y = c.y; clampWorld(m); }
    fx(room, 'ms', c.x, c.y, 0, S.radius, key, 1); area(c.x, c.y, S.radius);
  } else if (S.shape === 'shot') {
    const x1 = m.x + Math.cos(c.ang) * S.range, y1 = m.y + Math.sin(c.ang) * S.range;
    let best = null, bu = 2;
    room.players.forEach((p) => { if (!p.alive || p.protectUntil > room.now) return; const q = segHit(m.x, m.y, x1, y1, p.x, p.y); if (q.d <= S.hitR + p.r && q.u < bu) { bu = q.u; best = p; } });
    fx(room, 'ms', m.x, m.y, c.ang, best ? S.range * bu : S.range, key, 1, best ? 1 : 0);
    if (best && hit(room, m, best, dmg(), 'phys')) after(best);
  } else if (S.shape === 'cone') {
    fx(room, 'ms', m.x, m.y, c.ang, S.range, key, 1, S.width);
    room.players.forEach((p) => { if (p.alive && inCone(m, p, S.range, c.ang, S.width) && hit(room, m, p, dmg(), 'phys')) after(p); });
  } else { // dash: avança em linha e atinge quem estiver no caminho
    const x0 = m.x, y0 = m.y;
    fx(room, 'ms', x0, y0, c.ang, S.range, key, 1, S.width);
    room.players.forEach((p) => { if (p.alive && inCone({ x: x0, y: y0 }, p, S.range, c.ang, S.width) && hit(room, m, p, dmg(), 'phys')) after(p); });
    m.x += Math.cos(c.ang) * S.range * 0.85; m.y += Math.sin(c.ang) * S.range * 0.85; clampWorld(m);
  }
}

function updateMob(room, m) {
  if (!m.alive) {
    m.respT -= DT;
    if (m.respT <= 0) { resetMob(m); if (m.boss) feed(room, 'O ' + m.def.name + ' voltou ao centro do mapa.'); }
    return;
  }
  if (m.boss) return updateBoss(room, m);
  if (m.atkT > 0) m.atkT -= DT;
  if (m.stun > 0) { m.stun -= DT; m.cast = null; m.jmp = 0; return; }
  const def = m.def;
  let tg = m.tgt;
  if (tg && (!tg.alive || tg.gone)) tg = null;
  if (!tg || (room.t + m.id) % 10 === 0) {
    let best = null, bd = def.aggro * def.aggro;
    room.players.forEach((p) => {
      if (!p.alive || p.protectUntil > room.now) return;
      const d2 = (p.x - m.x) * (p.x - m.x) + (p.y - m.y) * (p.y - m.y);
      if (d2 < bd) { bd = d2; best = p; }
    });
    if (best) tg = best;
  }
  const dh = dist(m.x, m.y, m.hx, m.hy);
  if (tg && (dh > 650 || dist(m.x, m.y, tg.x, tg.y) > def.aggro * 1.8)) { tg = null; m.returning = true; }
  m.tgt = tg;
  if (m.returning) {
    stepToward(m, m.hx, m.hy, def.speed);
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * DT);
    if (dh < 30) m.returning = false;
    return;
  }
  if (m.cast) { // preparando o ataque especial: fica parado até o aviso acabar
    m.cast.t -= DT;
    const cs = m.cast, SP = def.sp;
    if (SP && SP.shape === 'leap' && cs.t > 0) { // agacha e depois salta de verdade até o ponto marcado (no último 0,45 s do aviso)
      const AIR = Math.min(0.45, SP.wind * 0.65);
      if (cs.t < AIR) {
        const u = 1 - cs.t / AIR, e = u * u * (3 - 2 * u);
        m.x = cs.sx + (cs.x - cs.sx) * e; m.y = cs.sy + (cs.y - cs.sy) * e; clampWorld(m);
        m.jmp = Math.max(0.02, u);
      } else m.jmp = -Math.min(1, (SP.wind - cs.t) / Math.max(0.05, SP.wind - AIR));
    }
    if (cs.t <= 0) { m.jmp = 0; mobResolveCast(room, m); }
    return;
  }
  if (tg) {
    const d = dist(m.x, m.y, tg.x, tg.y);
    if (def.sp) {
      m.spCd = (m.spCd === undefined ? rnd(1, def.sp.cd) : m.spCd) - DT;
      if (m.spCd <= 0 && d <= def.sp.trigger + tg.r && m.atkT <= 0) { mobStartCast(room, m, tg); return; }
    }
    if (d <= m.r + tg.r + 4) {
      if (m.atkT <= 0) {
        ev(room, ['k', Math.round(m.x), Math.round(m.y), m.id, +Math.atan2(tg.y - m.y, tg.x - m.x).toFixed(2)]); // o monstro dá o bote (animação)
        hit(room, m, tg, def.dmg * rnd(0.9, 1.1), 'phys');
        m.atkT = def.atkCd;
        if (def.slow && tg.alive) tg.slowT = def.slow;
      }
    } else {
      stepToward(m, tg.x, tg.y, def.speed);
    }
    return;
  }
  m.wanderT -= DT;
  if (m.wanderT <= 0) {
    const a = Math.random() * Math.PI * 2, r = rnd(20, 140);
    m.wx = m.hx + Math.cos(a) * r; m.wy = m.hy + Math.sin(a) * r;
    m.wanderT = rnd(2, 5);
  }
  if (dist(m.x, m.y, m.wx, m.wy) > 8) stepToward(m, m.wx, m.wy, def.speed * 0.4);
}

/* ------------------------------ dragão ancestral (chefe) ------------------------------ */
// Dorme no centro. Só acorda quando leva um golpe de alguém no nível mínimo. Acordado, persegue quem mais o machucou,
// solta sopro de fogo (cone) e pancada no chão (área) com aviso na tela antes de sair, e volta a dormir (curando)
// se ficar BOSS.calm segundos sem apanhar. Quem causar pelo menos BOSS.minShare da vida dele leva uma arma mítica.
function bossHurt(room, m, src, dmg) {
  if (m.state !== 1) {
    if (m.state === 0) feed(room, src.name + ' despertou o ' + m.def.name + '!');
    m.state = 1; m.cast = null; m.fightT0 = room.now; // a luta conta desde o 1º golpe (ou desde que ele voltou a lutar)
  }
  m.calmT = m.def.calm;
  m.threat.set(src, (m.threat.get(src) || 0) + dmg);
  m.dmgBy.set(src, (m.dmgBy.get(src) || 0) + dmg);
}

function bossTarget(room, m) {
  let best = null, bt = 0;
  m.threat.forEach((t, p) => {
    if (p.gone || !p.alive || p.room !== room || p.protectUntil > room.now) return;
    if (dist(m.x, m.y, p.x, p.y) > D.BOSS.leash) return;
    if (t > bt) { bt = t; best = p; }
  });
  return best;
}

// Recarga do dragão: com menos de 30% de vida ela cai 20%; com menos de 10%, cai 40% (vale para sopro, pancada no chão e garra)
function bossCdMul(m) {
  let mul = 1;
  for (const t of D.BOSS.cdTiers) if (m.hp < m.maxHp * t.hp) mul = Math.min(mul, t.mul);
  return mul;
}

function bossStartCast(room, m, kind, ang) {
  const def = m.def, S = kind === 0 ? def.breath : def.slam;
  const rage = m.hp < m.maxHp * D.BOSS.rage;
  m.cast = { kind, t: S.wind * (rage ? 0.85 : 1), ang };
  m.gcd = 0.9;
  if (kind === 0) {
    m.cdB = S.cd * bossCdMul(m);
    ev(room, ['w', Math.round(m.x), Math.round(m.y), 0, +ang.toFixed(2), S.range, +m.cast.t.toFixed(2), S.width]);
  } else {
    m.cdS = S.cd * bossCdMul(m);
    ev(room, ['w', Math.round(m.x), Math.round(m.y), 1, 0, S.radius, +m.cast.t.toFixed(2), 0]);
  }
}

function bossResolveCast(room, m) {
  const def = m.def, c = m.cast;
  m.cast = null;
  if (c.kind === 0) {
    const S = def.breath;
    fx(room, 'd_breath', m.x, m.y, c.ang, S.range, 'dragao', 6, S.width);
    room.players.forEach((p) => { if (p.alive && inCone(m, p, S.range, c.ang, S.width)) hit(room, m, p, S.dmg * rnd(0.95, 1.05), 'magic'); });
  } else {
    const S = def.slam;
    fx(room, 'd_slam', m.x, m.y, 0, S.radius, 'dragao', 6);
    room.players.forEach((p) => {
      if (p.alive && dist(m.x, m.y, p.x, p.y) - p.r <= S.radius && hit(room, m, p, S.dmg * rnd(0.95, 1.05), 'phys')) stun(p, 1.2);
    });
  }
}

function updateBoss(room, m) {
  const def = m.def, rage = m.hp < m.maxHp * D.BOSS.rage;
  if (m.atkT > 0) m.atkT -= DT;
  if (m.cdB > 0) m.cdB -= DT;
  if (m.cdS > 0) m.cdS -= DT;
  if (m.gcd > 0) m.gcd -= DT;
  if (m.state === 0) { // dormindo: não faz nada, só se cura
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * def.regen * DT);
    return;
  }
  if (m.state === 2) { // voltando para casa
    m.cast = null;
    const d = stepToward(m, m.hx, m.hy, def.speed * 1.6);
    m.hp = Math.min(m.maxHp, m.hp + m.maxHp * def.regen * 2 * DT);
    if (d < 6 && m.hp >= m.maxHp) {
      m.state = 0; m.face = Math.PI / 2;
      m.maxHp = m.baseHp; m.hp = m.baseHp; // a vida extra do grupo some quando ele volta a dormir
      feed(room, 'O ' + def.name + ' voltou a dormir.');
    }
    return;
  }
  // acordado
  // a vida cresce com o grupo: cada jogador vivo, por perto, que já o machucou soma BOSS.scale (a vida atual sobe junto)
  let crowd = 0;
  m.dmgBy.forEach((d, p) => { if (!p.gone && p.alive && p.room === room && dist(m.x, m.y, p.x, p.y) <= D.BOSS.leash) crowd++; });
  const want = Math.round(m.baseHp * (1 + D.BOSS.scale * (Math.min(D.BOSS.scaleCap, Math.max(1, crowd)) - 1)));
  if (want > m.maxHp) { m.hp += want - m.maxHp; m.maxHp = want; }
  m.calmT -= DT;
  m.threat.forEach((t, p) => m.threat.set(p, t * (1 - 0.1 * DT))); // a "raiva" esfria devagar
  if (m.cast) {
    m.cast.t -= DT;
    if (m.cast.t <= 0) bossResolveCast(room, m);
    return; // preso no lugar enquanto prepara o ataque
  }
  const tg = bossTarget(room, m);
  if (m.calmT <= 0 || !tg) { // ninguém bate nele há um tempo (ou ninguém por perto): desiste
    m.state = 2; m.tgt = null; m.dmgBy.clear(); m.threat.clear();
    return;
  }
  m.tgt = tg;
  const d = dist(m.x, m.y, tg.x, tg.y);
  const ang = Math.atan2(tg.y - m.y, tg.x - m.x);
  m.face = ang;
  const reach = m.r + tg.r + 26;
  if (m.gcd <= 0) {
    let close = false;
    room.players.forEach((p) => {
      if (p.alive && p.protectUntil <= room.now && dist(m.x, m.y, p.x, p.y) - p.r <= def.slam.radius * 0.8) close = true;
    });
    if (m.cdS <= 0 && close) return bossStartCast(room, m, 1, 0);
    if (m.cdB <= 0 && d <= def.breath.range * 0.95) return bossStartCast(room, m, 0, ang);
  }
  if (d <= reach) {
    if (m.atkT <= 0) {
      ev(room, ['k', Math.round(m.x), Math.round(m.y), m.id, +ang.toFixed(2)]);
      hit(room, m, tg, def.dmg * rnd(0.9, 1.1), 'phys');
      m.atkT = def.atkCd * bossCdMul(m);
      fx(room, 'd_claw', m.x, m.y, ang, m.r + 46, 'dragao', 6);
    }
  } else {
    stepToward(m, tg.x, tg.y, def.speed * (rage ? 1.3 : 1));
  }
}

function fmtDur(sec) { // "3 h 12 min", "12 min 30 s", "45 s"
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), mi = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ' h ' + mi + ' min' : mi ? mi + ' min ' + s + ' s' : s + ' s';
}

function killBoss(room, m) {
  m.alive = false; m.respT = D.BOSS.respawn; m.cast = null; m.state = 0;
  ev(room, ['x', Math.round(m.x), Math.round(m.y), m.ki]);
  const winners = [];
  m.dmgBy.forEach((dmg, p) => { if (!p.gone && p.room === room && dmg >= m.maxHp * D.BOSS.minShare) winners.push(p); });
  const names = [];
  for (const p of winners) {
    p.kills[m.key] = (p.kills[m.key] || 0) + 1;
    if (ranking && p.acct && room.mode === 'coop') {
      const rec = ranking.coopKill(p.acct.id, room.now - (m.fightT0 === undefined ? room.now : m.fightT0));
      if (rec) send(p, { t: 'toast', m: 'Seu melhor tempo no cooperativo! Veja em Rankings.' });
    } else if (ranking && p.acct && room.mode === 'classic') {
      const first = ranking.dragonKill(p.acct.id, room.now - (m.fightT0 === undefined ? room.now : m.fightT0));
      if (first) send(p, { t: 'toast', m: 'Primeira vitória sobre o dragão! Seu tempo de jogo: ' + fmtDur(first.play) + '. Veja em Rankings.' });
    }
    const it = giveRandom(p, 'weapon', D.MYTHIC_TIER);
    names.push(p.name);
    if (!it) send(p, { t: 'toast', m: 'Você já tem todas as armas míticas.' });
    // peitoral do dragão: chance extra a cada vitória, até conseguir
    const armor = D.ITEMS[D.BOSS.armorItem];
    if (armor && !p.inv.includes(armor.id) && Math.random() < D.BOSS.armorDrop) {
      giveItem(p, armor);
      feed(room, p.name + ' arrancou o ' + armor.name + ' do ' + m.def.name + '!');
    }
    p.saveDirty = true;
  }
  feed(room, 'O ' + m.def.name + ' foi derrotado' + (names.length ? ' por ' + names.join(', ') : '') + '!');
  if (room.mode === 'coop') { // cronômetro cooperativo: tempo da 1ª pancada até a queda, com o recorde da sala
    const secs = Math.max(1, Math.round(room.now - (m.fightT0 === undefined ? room.now : m.fightT0)));
    const prev = room.best[0] ? room.best[0].t : Infinity;
    room.best.push({ t: secs, who: names.slice(0, 6) });
    room.best.sort((a, b) => a.t - b.t); room.best.length = Math.min(room.best.length, 5);
    feed(room, 'Tempo para derrubar o dragão: ' + fmtDur(secs) + (secs < prev ? (prev === Infinity ? ' (primeiro tempo da sala)' : ' — NOVO RECORDE da sala!') : ' (recorde: ' + fmtDur(prev) + ')'));
    bcast(room, { t: 'best', best: room.best });
  }
  m.dmgBy.clear(); m.threat.clear();
}

// Empurra monstros que se sobrepõem. Usa uma grade (só compara vizinhos) em vez de comparar todos com todos: com 1100+ monstros isso pesava no servidor grátis.
function separateMobs(room) {
  const ms = room.mobs;
  const CELL = 120, grid = new Map();
  const push2 = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.85;
    if (Math.abs(dx) > min || Math.abs(dy) > min) return;
    const d = Math.hypot(dx, dy) || 0.01;
    if (d >= min) return;
    const push = (min - d) * 0.5; // roda a cada 2 passos, então empurra o dobro
    if (!a.boss) { const k = b.boss ? 4 : 1; a.x -= (dx / d) * push * k; a.y -= (dy / d) * push * k; }
    if (!b.boss) { const k = a.boss ? 4 : 1; b.x += (dx / d) * push * k; b.y += (dy / d) * push * k; }
  };
  const bosses = [];
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    if (!a.alive) continue;
    if (a.boss || a.r * 1.7 > CELL) { bosses.push(a); continue; } // grandes (dragão): comparam com todos
    const key = Math.floor(a.x / CELL) * 4096 + Math.floor(a.y / CELL);
    const c = grid.get(key);
    if (c) c.push(a); else grid.set(key, [a]);
  }
  for (const [key, cell] of grid) {
    const cx = Math.floor(key / 4096), cy = key - cx * 4096;
    for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) push2(cell[i], cell[j]);
    for (const [ox, oy] of [[1, 0], [1, 1], [0, 1], [-1, 1]]) { // metade dos vizinhos, para não repetir o par
      const o = grid.get((cx + ox) * 4096 + cy + oy);
      if (o) for (let i = 0; i < cell.length; i++) for (let j = 0; j < o.length; j++) push2(cell[i], o[j]);
    }
  }
  for (const g of bosses) for (const o of ms) if (o !== g && o.alive) push2(g, o);
}

const near = (me, x, y) => Math.abs(x - me.x) < 1000 && Math.abs(y - me.y) < 650;

function sendSnapshots(room) {
  const pl = [];
  room.players.forEach((p) => {
    if (!p.alive) return;
    pl.push({
      i: p.id, x: Math.round(p.x), y: Math.round(p.y), h: Math.round(p.hp), m: p.maxHp, l: p.level,
      a: +p.face.toFixed(2), r: Math.round(p.r), w: p.active.map((a) => a.item.id), ar: p.armorItem, q: p.ack, v: Math.round((p.spd || BASE_SPEED) * 10),
      f: (p.protectUntil > room.now ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.fused ? 4 : 0) | (p.level >= D.MAX_LEVEL ? 8 : 0) | (p.slowT > 0 ? 16 : 0) | (p.level <= D.NEWBIE_LEVEL ? 32 : 0)
    });
    if (p.sk) pl[pl.length - 1].k = p.sk; // skin equipada (campo no fim: clientes antigos ignoram)
  });
  const plJson = JSON.stringify(pl);
  const B = room.boss; // o dragão aparece no minimapa para todos: [x, y, vida, vidaMax, estado (0 dorme, 1 luta, 2 volta, 3 morto), segundos para voltar]
  const boJson = B ? JSON.stringify([Math.round(B.x), Math.round(B.y), Math.round(B.hp), B.maxHp, B.alive ? B.state : 3, B.alive ? 0 : Math.ceil(B.respT), B.alive && B.state === 1 && B.fightT0 !== undefined ? +(room.now - B.fightT0).toFixed(1) : 0]) : 'null'; // último: segundos de luta (cronômetro do modo cooperativo)
  const snapFor = (me) => {
    const mb = [], pj = [], evs = [];
    for (const m of room.mobs) {
      if (!m.alive || !near(me, m.x, m.y)) continue;
      const row = [m.id, m.ki, Math.round(m.x), Math.round(m.y), Math.round(m.hp), m.maxHp, m.stun > 0 ? 1 : 0];
      if (m.boss) { // 2 = dormindo, 4 = sopro armado, 8 = pancada armada, 16 = enfurecido
        row[6] = (m.state === 0 ? 2 : 0) | (m.cast ? (m.cast.kind === 0 ? 4 : 8) : 0) | (m.hp < m.maxHp * D.BOSS.rage ? 16 : 0);
        row.push(+m.face.toFixed(2));
      } else if (m.jmp) row.push(+m.jmp.toFixed(2)); // coelho: <0 agachando, >0 no ar (0..1)
      mb.push(row);
    }
    for (const pr of room.projs) {
      if (near(me, pr.x, pr.y)) pj.push([pr.id, Math.round(pr.x), Math.round(pr.y), +pr.ang.toFixed(2), pr.k, pr.fam, pr.tier, Math.round(pr.r)]);
    }
    for (const e of room.ev) if (near(me, e[1], e[2])) evs.push(e);
    let pjs = plJson;
    if (me.spec) { // o espectador aparece só na própria lista (para o cliente andar com a mesma predição); ninguém mais o vê
      const own = JSON.stringify({ i: me.id, x: Math.round(me.x), y: Math.round(me.y), h: 1, m: 1, l: 1, a: +me.face.toFixed(2), r: 12, w: [], ar: 'vital_0', q: me.ack, v: Math.round(me.spd * 10), f: 64 });
      pjs = '[' + own + (pl.length ? ',' + plJson.slice(1) : ']');
    }
    send(me, '{"t":"s","n":' + room.t + ',"p":' + pjs + ',"mb":' + JSON.stringify(mb) + ',"pj":' + JSON.stringify(pj) + ',"ev":' + JSON.stringify(evs) + ',"bo":' + boJson + '}');
  };
  room.players.forEach(snapFor);
  room.specs.forEach(snapFor);
  room.ev.length = 0;
}

const skinsMsg = (sk) => ({ t: 'skins', own: sk.own, eq: sk.eq });

function lbMsg(room) {
  const pvp = room.mode === 'pvp';
  const arr = [...room.players.values()]
    .sort((a, b) => (pvp ? (b.rk || 0) - (a.rk || 0) || (a.rd || 0) - (b.rd || 0) : 0) || b.level - a.level || b.xp - a.xp)
    .slice(0, 8)
    .map((p) => [p.id, p.name, p.level, p.level >= D.MAX_LEVEL ? 1 : 0, p.rk || 0, p.rd || 0]);
  return { t: 'lb', l: arr, md: room.mode };
}

function updateRoom(room) {
  room.now += DT; room.t++;
  room.players.forEach((p) => updatePlayer(room, p));
  room.specs.forEach((sp) => updateSpec(sp));
  updateProjs(room);
  if (room.later.length) for (let i = room.later.length - 1; i >= 0; i--) { const l = room.later[i]; l.t -= DT; if (l.t <= 0) { room.later.splice(i, 1); try { l.fn(); } catch (e) { /* jogador saiu */ } } } // ações atrasadas das misturas
  for (const m of room.mobs) updateMob(room, m);
  if (room.t % 2 === 0) separateMobs(room);
  if (room.quiet) room.ev.length = 0; // simulador: ninguém olhando, não monta pacotes
  else {
    if (room.t % 2 === 0) sendSnapshots(room);
    if (room.t % 6 === 0) room.players.forEach((p) => send(p, meMsg(p)));
  }
  if (room.t % TICK === 0) {
    room.players.forEach((p) => { checkQuests(room, p); if (ranking && p.acct) ranking.addPlay(p.acct.id, 1); }); // missões baseadas em tempo; tempo de jogo da conta
    if (!room.quiet) bcast(room, lbMsg(room));
  }
  if (room.kc && room.kc.dirty && !room.quiet) { room.kc.dirty = false; bcast(room, kcMsg(room)); }
  room.players.forEach((p) => {
    if (p.saveDirty && room.now - p.lastSave >= (p.acct ? 15 : 2)) { persist(p); p.lastSave = room.now; p.saveDirty = false; }
  });
}

const SIM = !!(process.env && process.env.SLIME_SIM); // simulador: quem importa este arquivo controla o relógio
if (!SIM) {
  try {
    accounts = require('./accounts').create({ onSkins: (id, sk) => { const ws = online.get(id); const p = ws && ws.p; if (!p || p.gone) return; p.sk = D.skinCode(sk.eq); send(p, skinsMsg(sk)); bcast(p.room, { t: 'sk', id: p.id, k: p.sk }); }, onDelete: (id) => { if (ranking) ranking.forget(id); const ws = online.get(id); if (ws) kick(ws, 'Sua conta foi excluída.'); } });
    ranking = require('./ranking').create(accounts.store);
    rankingReady = accounts.ready().then(() => ranking.load()).catch((e) => { console.error('Ranking: não consegui carregar:', e.message); });
  } catch (e) { console.error('Contas desativadas:', e.message); accounts = null; ranking = null; }
}

// Grava o progresso: jogador com conta vai para o servidor; sem conta, vai para o navegador dele (localStorage).
function persist(p) {
  if (p.acct && accounts) accounts.saveProgress(p.acct.id, saveMsg(p).d);
  else send(p, saveMsg(p));
}
function sendWs(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
// Tira alguém do jogo (conta aberta em outro lugar, conta excluída...).
function kick(ws, msg) {
  sendWs(ws, { t: 'kicked', m: msg });
  leave(ws);
  try { ws.close(); } catch (e) { /* já fechado */ }
}
if (!SIM) setInterval(() => { for (const room of rooms) updateRoom(room); }, 1000 / TICK);

/* ------------------------------ WebSocket ------------------------------ */
const wss = new WebSocketServer({ server, maxPayload: 16384 });

// Entrada: com "token" o jogador entra na conta dele (o progresso vem do servidor); sem token, o progresso vem do navegador.
async function startJoin(ws, m) {
  if (ws.joining) return;
  ws.joining = true;
  let acc = null, save = m.save;
  const spec = m.spec === true;
  if (m.token !== undefined && m.token !== null && m.token !== '') {
    if (!accounts) { sendWs(ws, { t: 'authfail' }); ws.joining = false; return; }
    try { acc = await accounts.auth(m.token); } catch (e) { sendWs(ws, { t: 'authfail', retry: true }); ws.joining = false; return; }
    if (!acc) { sendWs(ws, { t: 'authfail' }); ws.joining = false; return; }
    if (spec) { doSpec(ws, m, acc); return; } // espectador não ocupa a conta: dá para assistir e jogar com o mesmo e-mail
    const old = online.get(acc.id);
    online.set(acc.id, ws);
    if (old && old !== ws) kick(old, 'Sua conta entrou em outro lugar.');
    await rankingReady;
    const stored = await accounts.loadSave(acc);
    if (stored) save = stored;
    else if (!accounts.allowImport) save = null; // conta nova só importa o progresso do navegador se o servidor deixar
  }
  if (spec) { doSpec(ws, m, null); return; }
  if (ws.readyState !== 1) { if (acc && online.get(acc.id) === ws) online.delete(acc.id); ws.joining = false; return; }
  doJoin(ws, m, acc, save);
}
// Entrada como espectador: câmera livre, invisível, sem combate. Vai para a sala mais cheia do modo escolhido.
function specInit(p) {
  const room = p.room;
  send(p, {
    t: 'init', id: p.id, room: room.id, mode: room.mode, best: room.best, maxPlayers: D.MAX_PLAYERS, acct: p.acct ? p.acct.email : null, spec: true, admin: !!p.admin,
    roster: [...room.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color, sk: q.sk || 0 })).concat([{ id: p.id, name: p.name, color: p.color, sk: 0 }])
  });
  send(p, meMsg(p));
  send(p, lbMsg(room));
  send(p, kcMsg(room));
}
function doSpec(ws, m, acc) {
  if (ws.readyState !== 1) { ws.joining = false; return; }
  const mode = typeof m.mode === 'string' && Object.prototype.hasOwnProperty.call(D.MODES, m.mode) ? m.mode : 'classic';
  const cand = rooms.filter((r) => r.mode === mode && r.specs.size < MAX_SPECS).sort((a, b) => b.players.size - a.players.size);
  const room = cand[0] || newRoom(mode);
  const name = String(m.name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14) || 'Espectador';
  const p = makePlayer(ws, name, '#9aa7b4', null, mode);
  p.spec = true; p.isPlayer = false; p.alive = true; p.spd = BASE_SPEED * 2; p.x = W.cx; p.y = W.cy; p.r = 12;
  p.admin = isAdminAcc(acc);
  if (acc) p.acct = { id: acc.id, email: acc.email };
  ws.p = p; p.room = room;
  room.specs.set(p.id, p);
  specInit(p);
}
function doJoin(ws, m, acc, save) {
  const name = String(m.name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14) || 'Slime';
  const color = typeof m.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#5fd35f';
  const mode = typeof m.mode === 'string' && Object.prototype.hasOwnProperty.call(D.MODES, m.mode) ? m.mode : 'classic';
  const room = rooms.find((r) => r.mode === mode && r.players.size < D.MAX_PLAYERS) || newRoom(mode);
  const p = makePlayer(ws, name, color, save, mode);
  if (acc) { p.acct = { id: acc.id, email: acc.email }; if (ranking) ranking.touch(acc.id, name); p.sk = D.skinCode(accounts.skinsOf(acc).eq); }
  ws.p = p; p.room = room;
  room.players.set(p.id, p);
  spawnPlayer(room, p);
  send(p, {
    t: 'init', id: p.id, room: room.id, mode: room.mode, best: room.best, maxPlayers: D.MAX_PLAYERS, acct: acc ? acc.email : null,
    roster: [...room.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color, sk: q.sk || 0 }))
  });
  if (acc) send(p, skinsMsg(accounts.skinsOf(acc)));
  send(p, meMsg(p));
  send(p, lbMsg(room));
  if (room.kc) send(p, kcMsg(room));
  bcast(room, { t: 'pj', id: p.id, name: p.name, color: p.color, sk: p.sk || 0 }, p);
  checkQuests(room, p);
  p.saveDirty = true;
  if (acc) { accounts.saveProgress(acc.id, saveMsg(p).d); p.saveDirty = false; p.lastSave = room.now; } // grava já (importa o progresso do navegador, se foi o caso)
}

function onMessage(ws, raw) {
  ws.rate = (ws.rate || 0) + 1;
  if (ws.rate > 120) return; // limite por segundo
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  const p = ws.p;
  if (m.t === 'join') { if (!p) startJoin(ws, m); return; }
  if (!p) return;
  if (p.spec && m.t !== 'in' && m.t !== 'kc' && m.t !== 'nextroom') return; // espectador só anda, troca de sala e (administrador) liga o contador
  switch (m.t) {
    case 'kc': { // administrador liga/desliga (ou zera) o contador de abates da sala
      if (!p.spec || !p.admin) break;
      const room = p.room;
      if (m.on === false) { room.kc = null; feed(room, 'Contador de abates desligado'); }
      else if (!room.kc || m.reset === true) { room.kc = { rows: new Map(), recent: new Map(), dirty: false }; feed(room, 'Contador de abates ligado: vale quem joga com conta'); }
      bcast(room, kcMsg(room));
      break;
    }
    case 'nextroom': {
      if (!p.spec) break;
      const list = rooms.filter((r) => r.mode === p.room.mode);
      const to = list[(list.indexOf(p.room) + 1) % list.length];
      if (!to || to === p.room) { send(p, { t: 'toast', m: 'Só existe uma sala neste modo agora.' }); break; }
      if (to.specs.size >= MAX_SPECS) { send(p, { t: 'toast', m: 'Essa sala está cheia de espectadores.' }); break; }
      const from = p.room;
      from.specs.delete(p.id);
      if (!from.players.size && !from.specs.size) { const i = rooms.indexOf(from); if (i >= 0) rooms.splice(i, 1); }
      p.room = to; p.x = W.cx; p.y = W.cy; p.inQ.length = 0; p.ack = 0; p.mx = p.my = 0;
      to.specs.set(p.id, p);
      specInit(p);
      break;
    }
    case 'in': {
      let mx = Number(m.mx) || 0, my = Number(m.my) || 0;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      p.am = !!m.am;
      if (typeof m.a === 'number' && isFinite(m.a)) p.aim = m.a;
      if (typeof m.s === 'number' && isFinite(m.s)) { // cliente novo: um comando de movimento por passo (30/s), numerado; o servidor devolve o último que usou
        p.qActive = true;
        if (p.inQ.length >= 8) p.inQ.shift();
        p.inQ.push({ s: m.s | 0, x: mx, y: my });
      } else if (!p.qActive) { p.mx = mx; p.my = my; } // cliente antigo / robôs do simulador
      break;
    }
    case 'equip': {
      if (!p.alive) break;
      const slot = m.slot, id = m.item;
      if (slot !== 'w0' && slot !== 'w1' && slot !== 'a') break;
      if (id === null) {
        if (slot === 'a') p.equip.a = 'vital_0'; else p.equip.w[slot === 'w0' ? 0 : 1] = null;
      } else {
        const it = typeof id === 'string' ? D.ITEMS[id] : null;
        if (!it || it.kind !== (slot === 'a' ? 'armor' : 'weapon')) break;
        if (!D.BASE_ITEMS.includes(id) && !p.inv.includes(id)) break;
        if (!D.meetsReq(it, p.stats)) { send(p, { t: 'toast', m: 'Requisito não cumprido: ' + D.ATTR_NAMES[it.attr] + ' ' + it.req }); break; }
        if (slot === 'a') p.equip.a = id; else p.equip.w[slot === 'w0' ? 0 : 1] = id;
      }
      const mixBefore = p.mixName;
      recalc(p);
      p.saveDirty = true;
      if (p.mixed && p.mixName !== mixBefore) send(p, { t: 'toast', m: 'Habilidade mista: ' + p.mixName });
      send(p, meMsg(p));
      break;
    }
    case 'alloc': { // gasta pontos de atributo: { k: 'str'|'dex'|'man'|'hlt', n: quantidade }
      if (!p.alive || !D.ATTRS.includes(m.k)) break;
      let n = Math.floor(Number(m.n));
      if (!(n >= 1)) break;
      n = Math.min(n, p.points, D.ATTR_MAX - p.stats[m.k]);
      if (n < 1) break;
      const before = p.maxHp;
      p.stats[m.k] += n; p.points -= n;
      recalc(p);
      p.hp = Math.min(p.maxHp, p.hp + Math.max(0, p.maxHp - before)); // mais Saúde cura na mesma medida
      send(p, meMsg(p));
      break;
    }
    case 'respawn':
      if (!p.alive) { spawnPlayer(p.room, p); send(p, meMsg(p)); }
      break;
  }
}

// Proteção contra abuso: limite de conexões ao mesmo tempo e de conexões novas por minuto, por IP (o IP real vem do último valor de X-Forwarded-For, que o proxy da hospedagem acrescenta).
const ipConns = new Map(), ipRecent = new Map();
const MAX_CONN_IP = 12, MAX_NEW_PER_MIN = 40;
const wsIp = (req) => { const xf = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean); return xf.length ? xf[xf.length - 1] : (req.socket.remoteAddress || '?'); };
if (!SIM) setInterval(() => { ipRecent.clear(); }, 60000).unref();
wss.on('connection', (ws, req) => {
  const ip = wsIp(req);
  if (/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(ip)) { ws.p = null; ws.rate = 0; ws.isAlive = true; return setupWs(ws); } // máquina local (testes, desenvolvimento): sem limite
  const nowN = (ipRecent.get(ip) || 0) + 1; ipRecent.set(ip, nowN);
  if ((ipConns.get(ip) || 0) >= MAX_CONN_IP || nowN > MAX_NEW_PER_MIN) { try { ws.close(1013, 'muitas conexões'); } catch (e) { /* já fechado */ } return; }
  ipConns.set(ip, (ipConns.get(ip) || 0) + 1);
  ws.once('close', () => { const n = (ipConns.get(ip) || 1) - 1; if (n <= 0) ipConns.delete(ip); else ipConns.set(ip, n); });
  ws.p = null; ws.rate = 0; ws.isAlive = true;
  setupWs(ws);
});
function setupWs(ws) {
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => onMessage(ws, raw.toString()));
  ws.on('error', () => {});
  ws.on('close', () => leave(ws));
}
// Jogador saiu (fechou a aba, caiu a conexão ou foi tirado do jogo). Pode ser chamado mais de uma vez.
function leave(ws) {
  const p = ws.p;
  if (!p || p.gone) { if (!p) ws.joining = false; return; }
  p.gone = true;
  if (p.spec) {
    const room = p.room;
    room.specs.delete(p.id);
    if (!room.players.size && !room.specs.size) { const i = rooms.indexOf(room); if (i >= 0) rooms.splice(i, 1); }
    return;
  }
  if (p.acct && accounts) {
    accounts.saveProgress(p.acct.id, saveMsg(p).d);
    if (ranking) ranking.flush(p.acct.id).catch(() => {});
    if (online.get(p.acct.id) === ws) online.delete(p.acct.id);
    accounts.release(p.acct.id, () => online.has(p.acct.id));
  }
  const room = p.room;
  room.players.delete(p.id);
  bcast(room, { t: 'pl', id: p.id });
  if (!room.players.size && !room.specs.size) { const i = rooms.indexOf(room); if (i >= 0) rooms.splice(i, 1); }
}

if (!SIM) {
  if (ranking) { const t = setInterval(() => { ranking.flush().catch(() => {}); }, 30000); if (t.unref) t.unref(); } // tempo de jogo e abates vão para o armazenamento a cada 30 s
  try { // deploy/reinício (SIGTERM): grava o que falta antes de sair
    const bye = () => {
      setTimeout(() => process.exit(0), 4000).unref();
      Promise.all([accounts && accounts.flush(), ranking && ranking.flush()]).catch(() => {}).then(() => process.exit(0));
    };
    process.once('SIGTERM', bye); process.once('SIGINT', bye);
  } catch (e) { /* ambiente sem sinais (preview no navegador) */ }
  setInterval(() => { wss.clients.forEach((ws) => { ws.rate = 0; }); }, 1000);
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  server.listen(PORT, () => console.log('SlimeRPG rodando em http://localhost:' + PORT));
}

// exportados para test/sim.js e para o simulador (tools/simular.js)
module.exports = { killPlayer, saveMsg, bossCdMul, server, wss, rooms, online, getAccounts: () => accounts, getRanking: () => ranking, fmtDur, recalc, addXp, fx, ev, newRoom, makePlayer, spawnPlayer, updateRoom, hit, giveRandom, checkQuests, DT, TICK, BASE_SPEED };
