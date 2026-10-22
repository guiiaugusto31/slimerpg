'use strict';
// SlimeRPG — servidor: HTTP estático + WebSocket. Toda a lógica de combate, XP, dados (1d3) e missões roda aqui.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const D = require('./game-data');
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
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
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
  if (n > 1) { o.x = W.cx + (nx / n) * W.rx; o.y = W.cy + (ny / n) * W.ry; }
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
      perRoom: rooms.map((r) => ({ id: r.id, players: r.players.size }))
    }));
  }
  if (url === '/api/ranking' && req.method === 'GET') return serveRanking(req, res);
  if (url.startsWith('/api/') || url === '/admin/skin') { // contas por e-mail (accounts.js)
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

/* ------------------------------ salas e entidades ------------------------------ */
function newRoom() {
  const room = { id: nextRoomId++, players: new Map(), mobs: [], projs: [], ev: [], t: 0, now: 0, nid: 1, boss: null, quiet: false };
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
  const m = { id: room.nid++, isMob: true, key: z.mob, ki: MOB_KEYS.indexOf(z.mob), def, zi, r: def.r, maxHp: def.hp, alive: true, respT: 0 };
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
  const z = D.ZONES[m.zi];
  let ang, nd;
  for (let k = 0; k < 8; k++) { // sorteia de novo se cair dentro da toca do dragão
    ang = Math.random() * Math.PI * 2; nd = rnd(z.min, Math.min(z.max, 0.97));
    if (Math.hypot(Math.cos(ang) * nd * W.rx, Math.sin(ang) * nd * W.ry) > D.BOSS.clear) break;
  }
  m.x = m.hx = W.cx + Math.cos(ang) * nd * W.rx;
  m.y = m.hy = W.cy + Math.sin(ang) * nd * W.ry;
  m.hp = m.maxHp; m.alive = true; m.hits = 0; m.stun = 0; m.atkT = rnd(0, 1);
  m.tgt = null; m.wanderT = rnd(0, 3); m.wx = m.x; m.wy = m.y; m.returning = false;
}

function makePlayer(ws, name, color, save) {
  const p = {
    id: nextPlayerId++, ws, isPlayer: true, name, color, gone: false, room: null,
    x: 0, y: 0, face: 0, mx: 0, my: 0, am: false, aim: 0,
    level: 1, xp: 0, stats: { str: 1, dex: 1, man: 1, hlt: 1 }, hp: 1, maxHp: 1, r: 16,
    inv: [], equip: { w: ['faca', null], a: 'vital_0' }, kills: {}, pk: 0, done: new Set(),
    alive: false, protectUntil: 0, stun: 0, slowT: 0, wt: [0, 0], st: [0, 0],
    combatT: 0, aliveT: 0, nodT: 0, oneHits: 0, lastSave: -99, saveDirty: false,
    armor: { hp: 0, rp: 0, rm: 0 }, armorItem: 'vital_0', active: [], fused: false, sk: 0
  };
  loadSave(p, save);
  recalc(p);
  return p;
}

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
  if (p.hp > p.maxHp) p.hp = p.maxHp;
  p.active = [];
  for (let slot = 0; slot < 2; slot++) {
    const it = D.ITEMS[p.equip.w[slot]];
    if (it && it.kind === 'weapon' && D.meetsReq(it, p.stats)) p.active.push({ slot, item: it, F: D.FAMILIES[it.fam] });
  }
  if (!p.active.length) p.active.push({ slot: 0, item: D.ITEMS.faca, F: D.FAMILIES.faca }); // sem arma ativa: a faca ajuda
  const w0 = D.ITEMS[p.equip.w[0]];
  // Fusão: o MESMO item nos dois slots (como só existe 1 de cada no inventário, é assim que se funde).
  p.fused = !!(w0 && p.equip.w[0] === p.equip.w[1] && D.meetsReq(w0, p.stats) && D.FAMILIES[w0.fam].skill);
}

function spawnPlayer(room, p) {
  const ang = Math.random() * Math.PI * 2, nd = rnd(0.8, 0.94);
  p.x = W.cx + Math.cos(ang) * nd * W.rx;
  p.y = W.cy + Math.sin(ang) * nd * W.ry;
  recalc(p);
  p.hp = p.maxHp; p.alive = true; p.protectUntil = room.now + SPAWN_PROTECT;
  p.stun = 0; p.slowT = 0; p.wt = [0, 0]; p.st = [0, 0];
  p.aliveT = 0; p.nodT = 0; p.combatT = 0; p.oneHits = 0;
}

/* ------------------------------ rede ------------------------------ */
function send(p, obj) {
  if (p.ws.readyState === 1) p.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}
function bcast(room, obj, except) {
  const s = JSON.stringify(obj);
  room.players.forEach((p) => { if (p !== except) send(p, s); });
}
function feed(room, text) { bcast(room, { t: 'feed', m: text }); }
function ev(room, e) { if (room.ev.length < 400) room.ev.push(e); }
function fx(room, kind, x, y, ang, size, fam, tier, extra) {
  ev(room, ['f', Math.round(x), Math.round(y), kind, +ang.toFixed(2), Math.round(size), fam, tier, extra === undefined ? 0 : extra]);
}

function meMsg(p) {
  return {
    t: 'me', lv: p.level, xp: p.xp, xn: p.level >= D.MAX_LEVEL ? 0 : D.xpNeed(p.level), stats: p.stats,
    hp: Math.round(p.hp), mhp: p.maxHp, inv: p.inv, eq: p.equip, act: p.active.map((a) => a.slot),
    fu: p.fused, wcd: [+p.wt[0].toFixed(2), +p.wt[1].toFixed(2)], scd: [+p.st[0].toFixed(2), +p.st[1].toFixed(2)],
    arm: p.armor, armId: p.armorItem, alive: p.alive,
    q: { kills: p.kills, pk: p.pk, alive: Math.floor(p.aliveT), nod: Math.floor(p.nodT), one: p.oneHits, done: [...p.done] }
  };
}
function saveMsg(p) {
  return { t: 'save', d: { items: p.inv, equip: p.equip, kills: p.kills, pk: p.pk, done: [...p.done] } };
}

/* ------------------------------ combate ------------------------------ */
// Novatos (nível NEWBIE_LEVEL ou menos) não lutam contra outros jogadores: não apanham nem batem. Monstros valem para todos.
function pvpOk(a, b) { return a.level > D.NEWBIE_LEVEL && b.level > D.NEWBIE_LEVEL && !(a.simTeam && a.simTeam === b.simTeam); } // simTeam: só o simulador usa (robôs aliados)

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
    addXp(room, src, m.def.xp);
    src.kills[m.key] = (src.kills[m.key] || 0) + 1;
    if (m.def.tier >= 3 && m.hits <= D.ONEHIT_MAX_HITS) src.oneHits++; // "monstro forte" = faixa 3 ou mais, morto em poucos golpes
    rollDrops(room, src, m);
    checkQuests(room, src);
    src.saveDirty = true;
  }
}

function killPlayer(room, v, src) {
  const old = v.level;
  v.alive = false; v.mx = 0; v.my = 0;
  const by = src ? (src.isPlayer ? src.name : src.def.name) : '???';
  ev(room, ['x', Math.round(v.x), Math.round(v.y), -1, v.id]);
  send(v, { t: 'death', by, lvl: old });
  if (src && src.isPlayer && src !== v && !src.gone && src.alive) {
    if (old >= D.PK_MIN_LEVEL) { // só vítimas de nível razoável contam (para a missão e para o ranking de PvP): evita caçar novatos
      src.pk++;
      if (ranking && src.acct) ranking.pvpKill(src.acct.id, v.acct ? 'a' + v.acct.id : 'g' + String(v.name).toLowerCase());
    }
    addXp(room, src, Math.floor(D.xpNeed(old) * D.PVP_XP_FRAC)); // 40% do XP do nível atual da vítima
    checkQuests(room, src);
    src.saveDirty = true;
    feed(room, src.name + ' derrotou ' + v.name + ' (nv ' + old + ')');
  } else {
    feed(room, v.name + ' foi derrotado por ' + by + ' (nv ' + old + ')');
  }
  // Morreu = perde todo o nível atual. Equipamentos e progresso de missões permanecem.
  v.level = 1; v.xp = 0; v.stats = { str: 1, dex: 1, man: 1, hlt: 1 };
  v.aliveT = 0; v.nodT = 0; v.oneHits = 0; v.stun = 0; v.slowT = 0;
  recalc(v);
  v.saveDirty = true;
}

function addXp(room, p, amount) {
  if (p.level >= D.MAX_LEVEL || amount <= 0) return;
  p.xp += amount;
  ev(room, ['d', Math.round(p.x), Math.round(p.y - p.r - 16), amount, 2]);
  const rolls = [];
  while (p.level < D.MAX_LEVEL && p.xp >= D.xpNeed(p.level)) {
    p.xp -= D.xpNeed(p.level);
    p.level++;
    const g = {};
    for (const k of D.ATTRS) { g[k] = 1 + Math.floor(Math.random() * 3); p.stats[k] += g[k]; } // 1d3 por atributo, no servidor
    rolls.push(g);
  }
  if (rolls.length) {
    if (p.level >= D.MAX_LEVEL) p.xp = 0;
    recalc(p);
    p.hp = p.maxHp;
    send(p, { t: 'lvl', level: p.level, rolls });
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
    pierce: !!o.pierce, hit: o.pierce ? new Set() : null
  });
}

function inCone(p, t, R, ang, width) {
  const d = dist(p.x, p.y, t.x, t.y);
  if (d - t.r > R + p.r * 0.5) return false;
  const a = Math.atan2(t.y - p.y, t.x - p.x);
  return Math.abs(angDiff(a, ang)) <= width / 2 + Math.asin(Math.min(1, t.r / Math.max(d, 1)));
}

function basicAttack(room, p, a, tg) {
  const F = a.F, it = a.item, fam = it.fam, tier = it.tier, e = tg.e, ang = tg.ang;
  const dmg = D.weaponDamage(it, p.stats);
  p.face = ang;
  ev(room, ['a', Math.round(p.x), Math.round(p.y), p.id, a.slot, +ang.toFixed(2), 0]); // animação da arma no cliente
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
      const R = F.range + p.r * 0.5;
      fx(room, 'arc', p.x, p.y, ang, R, fam, tier, F.arcAng);
      eachEnemy(room, p, (t) => { if (inCone(p, t, F.range, ang, F.arcAng)) hit(room, p, t, dmg, F.type); });
      break;
    }
    case 'ring': {
      const R = F.range + p.r * 0.5;
      fx(room, 'ring', p.x, p.y, 0, R, fam, tier);
      eachEnemy(room, p, (t) => { if (dist(p.x, p.y, t.x, t.y) - t.r <= R) hit(room, p, t, dmg, F.type); });
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

function trySkill(room, p, a) {
  const F = a.F, S = F.skill, i = a.slot;
  if (!S) return;
  if (p.fused && i === 1) return; // habilidade fundida: um único disparo por ciclo, com o cooldown da arma
  if (p.st[i] > 0) return;
  const fu = p.fused, am = fu ? 1.4 : 1, dm = fu ? 1.5 : 1;
  let trig;
  switch (S.kind) {
    case 'burst': trig = findTarget(room, p, S.radius * am, true); break;
    case 'cone': trig = findTarget(room, p, S.range * am, false); break;
    case 'dash': trig = findTarget(room, p, S.dist * am, false); break;
    case 'volley': trig = findTarget(room, p, S.reach * am, false); break;
    case 'bolt': trig = findTarget(room, p, S.reach * am, false); break;
    default: return;
  }
  if (!trig) return;
  const it = a.item, fam = it.fam, tier = it.tier, type = F.type;
  const dmg = Math.round(D.skillDamage(it, p.stats) * dm);
  const ang = trig.ang;
  p.st[i] = S.cd;
  p.face = ang;
  ev(room, ['a', Math.round(p.x), Math.round(p.y), p.id, i, +ang.toFixed(2), 1]);
  switch (S.kind) {
    case 'burst': {
      const R = S.radius * am;
      fx(room, 's_burst', p.x, p.y, 0, R, fam, tier);
      eachEnemy(room, p, (t) => {
        if (dist(p.x, p.y, t.x, t.y) - t.r <= R + p.r * 0.5 && hit(room, p, t, dmg, type) && S.stun) stun(t, S.stun);
      });
      if (S.heal) {
        const h = Math.round(S.heal * p.maxHp * (fu ? 1.5 : 1));
        p.hp = Math.min(p.maxHp, p.hp + h);
        ev(room, ['d', Math.round(p.x), Math.round(p.y - p.r), h, 3]);
      }
      break;
    }
    case 'cone': {
      const R = S.range * am, width = S.angle * (fu ? 1.25 : 1);
      fx(room, 's_cone', p.x, p.y, ang, R, fam, tier, +width.toFixed(2));
      eachEnemy(room, p, (t) => { if (inCone(p, t, R, ang, width)) hit(room, p, t, dmg, type); });
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
        ang, speed: S.speed, range: S.reach * am, dmg, type, r: S.radius * (fu ? 1.6 : 1), k: 'b', fam, tier, pierce: true
      });
      break;
  }
}

function explode(room, pr) {
  fx(room, 'orbx', pr.x, pr.y, 0, pr.aoe, pr.fam, pr.tier);
  eachEnemy(room, pr.owner, (t) => { if (dist(pr.x, pr.y, t.x, t.y) - t.r <= pr.aoe) hit(room, pr.owner, t, pr.dmg, pr.type); });
}

function updateProjs(room) {
  for (let i = room.projs.length - 1; i >= 0; i--) {
    const pr = room.projs[i];
    pr.x += pr.vx * DT; pr.y += pr.vy * DT; pr.life -= DT;
    let remove = false;
    const test = (e) => {
      if (remove || !e.alive || e === pr.owner) return;
      if (e.isPlayer && (e.protectUntil > room.now || !pvpOk(pr.owner, e))) return;
      if (pr.hit && pr.hit.has(e)) return;
      if (dist(pr.x, pr.y, e.x, e.y) > e.r + pr.r) return;
      if (pr.k === 'o') { explode(room, pr); remove = true; return; }
      hit(room, pr.owner, e, pr.dmg, pr.type);
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
  if (p.stun > 0) p.stun -= DT;
  if (p.slowT > 0) p.slowT -= DT;
  for (let i = 0; i < 2; i++) { if (p.wt[i] > 0) p.wt[i] -= DT; if (p.st[i] > 0) p.st[i] -= DT; }
  if (p.stun > 0) return;
  if (p.mx || p.my) {
    const sp = BASE_SPEED * (p.slowT > 0 ? 0.6 : 1);
    p.x += p.mx * sp * DT; p.y += p.my * sp * DT;
    clampWorld(p);
    p.face = Math.atan2(p.my, p.mx);
  }
  for (const a of p.active) {
    if (p.wt[a.slot] <= 0) {
      const tg = findTarget(room, p, a.F.range, false);
      if (tg) { basicAttack(room, p, a, tg); p.wt[a.slot] = a.F.cd; }
    }
    if (a.F.skill) trySkill(room, p, a);
  }
}

function stepToward(e, tx, ty, speed) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < 1) return d;
  const s = Math.min(d, speed * DT);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  return d - s;
}

function updateMob(room, m) {
  if (!m.alive) {
    m.respT -= DT;
    if (m.respT <= 0) { resetMob(m); if (m.boss) feed(room, 'O ' + m.def.name + ' voltou ao centro do mapa.'); }
    return;
  }
  if (m.boss) return updateBoss(room, m);
  if (m.atkT > 0) m.atkT -= DT;
  if (m.stun > 0) { m.stun -= DT; return; }
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
  if (tg) {
    const d = dist(m.x, m.y, tg.x, tg.y);
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

function bossStartCast(room, m, kind, ang) {
  const def = m.def, S = kind === 0 ? def.breath : def.slam;
  const rage = m.hp < m.maxHp * D.BOSS.rage;
  m.cast = { kind, t: S.wind * (rage ? 0.85 : 1), ang };
  m.gcd = 0.9;
  if (kind === 0) {
    m.cdB = S.cd * (rage ? 0.65 : 1);
    ev(room, ['w', Math.round(m.x), Math.round(m.y), 0, +ang.toFixed(2), S.range, +m.cast.t.toFixed(2), S.width]);
  } else {
    m.cdS = S.cd * (rage ? 0.65 : 1);
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
      m.atkT = def.atkCd * (rage ? 0.7 : 1);
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
    if (ranking && p.acct) {
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
  m.dmgBy.clear(); m.threat.clear();
}

function separateMobs(room) {
  const ms = room.mobs;
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y, min = (a.r + b.r) * 0.85;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const push = (min - d) * 0.25;
      if (!a.boss) { const k = b.boss ? 4 : 1; a.x -= (dx / d) * push * k; a.y -= (dy / d) * push * k; }
      if (!b.boss) { const k = a.boss ? 4 : 1; b.x += (dx / d) * push * k; b.y += (dy / d) * push * k; }
    }
  }
}

const near = (me, x, y) => Math.abs(x - me.x) < 1000 && Math.abs(y - me.y) < 650;

function sendSnapshots(room) {
  const pl = [];
  room.players.forEach((p) => {
    if (!p.alive) return;
    pl.push({
      i: p.id, x: Math.round(p.x), y: Math.round(p.y), h: Math.round(p.hp), m: p.maxHp, l: p.level,
      a: +p.face.toFixed(2), r: Math.round(p.r), w: p.active.map((a) => a.item.id), ar: p.armorItem,
      f: (p.protectUntil > room.now ? 1 : 0) | (p.stun > 0 ? 2 : 0) | (p.fused ? 4 : 0) | (p.level >= D.MAX_LEVEL ? 8 : 0) | (p.slowT > 0 ? 16 : 0) | (p.level <= D.NEWBIE_LEVEL ? 32 : 0)
    });
    if (p.sk) pl[pl.length - 1].k = p.sk; // skin equipada (campo no fim: clientes antigos ignoram)
  });
  const plJson = JSON.stringify(pl);
  const B = room.boss; // o dragão aparece no minimapa para todos: [x, y, vida, vidaMax, estado (0 dorme, 1 luta, 2 volta, 3 morto), segundos para voltar]
  const boJson = B ? JSON.stringify([Math.round(B.x), Math.round(B.y), Math.round(B.hp), B.maxHp, B.alive ? B.state : 3, B.alive ? 0 : Math.ceil(B.respT)]) : 'null';
  room.players.forEach((me) => {
    const mb = [], pj = [], evs = [];
    for (const m of room.mobs) {
      if (!m.alive || !near(me, m.x, m.y)) continue;
      const row = [m.id, m.ki, Math.round(m.x), Math.round(m.y), Math.round(m.hp), m.maxHp, m.stun > 0 ? 1 : 0];
      if (m.boss) { // 2 = dormindo, 4 = sopro armado, 8 = pancada armada, 16 = enfurecido
        row[6] = (m.state === 0 ? 2 : 0) | (m.cast ? (m.cast.kind === 0 ? 4 : 8) : 0) | (m.hp < m.maxHp * D.BOSS.rage ? 16 : 0);
        row.push(+m.face.toFixed(2));
      }
      mb.push(row);
    }
    for (const pr of room.projs) {
      if (near(me, pr.x, pr.y)) pj.push([pr.id, Math.round(pr.x), Math.round(pr.y), +pr.ang.toFixed(2), pr.k, pr.fam, pr.tier, Math.round(pr.r)]);
    }
    for (const e of room.ev) if (near(me, e[1], e[2])) evs.push(e);
    send(me, '{"t":"s","n":' + room.t + ',"p":' + plJson + ',"mb":' + JSON.stringify(mb) + ',"pj":' + JSON.stringify(pj) + ',"ev":' + JSON.stringify(evs) + ',"bo":' + boJson + '}');
  });
  room.ev.length = 0;
}

const skinsMsg = (sk) => ({ t: 'skins', own: sk.own, eq: sk.eq });

function lbMsg(room) {
  const arr = [...room.players.values()]
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 8)
    .map((p) => [p.id, p.name, p.level, p.level >= D.MAX_LEVEL ? 1 : 0]);
  return { t: 'lb', l: arr };
}

function updateRoom(room) {
  room.now += DT; room.t++;
  room.players.forEach((p) => updatePlayer(room, p));
  updateProjs(room);
  for (const m of room.mobs) updateMob(room, m);
  separateMobs(room);
  if (room.quiet) room.ev.length = 0; // simulador: ninguém olhando, não monta pacotes
  else {
    if (room.t % 2 === 0) sendSnapshots(room);
    if (room.t % 6 === 0) room.players.forEach((p) => send(p, meMsg(p)));
  }
  if (room.t % TICK === 0) {
    room.players.forEach((p) => { checkQuests(room, p); if (ranking && p.acct) ranking.addPlay(p.acct.id, 1); }); // missões baseadas em tempo; tempo de jogo da conta
    if (!room.quiet) bcast(room, lbMsg(room));
  }
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
  if (m.token !== undefined && m.token !== null && m.token !== '') {
    if (!accounts) { sendWs(ws, { t: 'authfail' }); ws.joining = false; return; }
    try { acc = await accounts.auth(m.token); } catch (e) { sendWs(ws, { t: 'authfail', retry: true }); ws.joining = false; return; }
    if (!acc) { sendWs(ws, { t: 'authfail' }); ws.joining = false; return; }
    const old = online.get(acc.id);
    online.set(acc.id, ws);
    if (old && old !== ws) kick(old, 'Sua conta entrou em outro lugar.');
    await rankingReady;
    const stored = await accounts.loadSave(acc);
    if (stored) save = stored;
    else if (!accounts.allowImport) save = null; // conta nova só importa o progresso do navegador se o servidor deixar
  }
  if (ws.readyState !== 1) { if (acc && online.get(acc.id) === ws) online.delete(acc.id); ws.joining = false; return; }
  doJoin(ws, m, acc, save);
}
function doJoin(ws, m, acc, save) {
  const name = String(m.name || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 14) || 'Slime';
  const color = typeof m.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.color) ? m.color : '#5fd35f';
  const room = rooms.find((r) => r.players.size < D.MAX_PLAYERS) || newRoom();
  const p = makePlayer(ws, name, color, save);
  if (acc) { p.acct = { id: acc.id, email: acc.email }; if (ranking) ranking.touch(acc.id, name); p.sk = D.skinCode(accounts.skinsOf(acc).eq); }
  ws.p = p; p.room = room;
  room.players.set(p.id, p);
  spawnPlayer(room, p);
  send(p, {
    t: 'init', id: p.id, room: room.id, maxPlayers: D.MAX_PLAYERS, acct: acc ? acc.email : null,
    roster: [...room.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color, sk: q.sk || 0 }))
  });
  if (acc) send(p, skinsMsg(accounts.skinsOf(acc)));
  send(p, meMsg(p));
  send(p, lbMsg(room));
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
  switch (m.t) {
    case 'in': {
      let mx = Number(m.mx) || 0, my = Number(m.my) || 0;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      p.mx = mx; p.my = my; p.am = !!m.am;
      if (typeof m.a === 'number' && isFinite(m.a)) p.aim = m.a;
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
      recalc(p);
      p.saveDirty = true;
      send(p, meMsg(p));
      break;
    }
    case 'respawn':
      if (!p.alive) { spawnPlayer(p.room, p); send(p, meMsg(p)); }
      break;
  }
}

wss.on('connection', (ws) => {
  ws.p = null; ws.rate = 0; ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => onMessage(ws, raw.toString()));
  ws.on('error', () => {});
  ws.on('close', () => leave(ws));
});
// Jogador saiu (fechou a aba, caiu a conexão ou foi tirado do jogo). Pode ser chamado mais de uma vez.
function leave(ws) {
  const p = ws.p;
  if (!p || p.gone) { if (!p) ws.joining = false; return; }
  p.gone = true;
  if (p.acct && accounts) {
    accounts.saveProgress(p.acct.id, saveMsg(p).d);
    if (ranking) ranking.flush(p.acct.id).catch(() => {});
    if (online.get(p.acct.id) === ws) online.delete(p.acct.id);
    accounts.release(p.acct.id, () => online.has(p.acct.id));
  }
  const room = p.room;
  room.players.delete(p.id);
  bcast(room, { t: 'pl', id: p.id });
  if (!room.players.size) { const i = rooms.indexOf(room); if (i >= 0) rooms.splice(i, 1); }
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
module.exports = { server, wss, rooms, online, getAccounts: () => accounts, getRanking: () => ranking, fmtDur, recalc, addXp, newRoom, makePlayer, spawnPlayer, updateRoom, hit, giveRandom, checkQuests, DT, TICK, BASE_SPEED };
