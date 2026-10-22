'use strict';
// Peças do simulador: sobe o servidor real sem rede nem relógio (SLIME_SIM), cria salas, jogadores de mentira e monstros
// avulsos, e avança o tempo na marra (30 passos = 1 segundo de jogo), muito mais rápido que o tempo real.
process.env.SLIME_SIM = '1';
const S = require('../../server');
const D = require('../../game-data');

const MOB_KEYS = Object.keys(D.MOBS);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// WebSocket de mentira: guarda os avisos importantes que o servidor manda ao jogador (morte, nível, loot, missão).
function fakeSocket(log) {
  return {
    readyState: 1,
    send(d) {
      if (typeof d !== 'string' || d.charCodeAt(6) === 115) return; // '{"t":"s' = snapshot; nem lê
      if (d.startsWith('{"t":"death"') || d.startsWith('{"t":"lvl"') || d.startsWith('{"t":"loot"') ||
          d.startsWith('{"t":"quest"') || d.startsWith('{"t":"toast"')) {
        try { log(JSON.parse(d)); } catch (e) { /* ignora */ }
      }
    }
  };
}

// Sala silenciosa (sem pacotes de rede). Se `empty`, remove os monstros naturais e o dragão.
function makeRoom(empty) {
  const room = S.newRoom();
  room.quiet = true;
  if (empty) { room.mobs = []; room.boss = null; }
  return room;
}

function addPlayer(room, name, opt) {
  opt = opt || {};
  const log = [];
  const ws = fakeSocket((m) => log.push(Object.assign({ at: room.now }, m)));
  const p = S.makePlayer(ws, name, '#5fd35f', null);
  p.room = room;
  p.log = log;
  room.players.set(p.id, p);
  if (opt.level) {
    p.level = opt.level;
    p.stats = Object.assign({}, opt.stats || statsAtLevel(opt.level));
  }
  if (opt.inv) p.inv = opt.inv.slice();
  if (opt.equip) p.equip = { w: opt.equip.w.slice(), a: opt.equip.a };
  S.spawnPlayer(room, p);
  if (opt.pos) { p.x = opt.pos.x; p.y = opt.pos.y; }
  return p;
}

// Atributos médios de quem chegou ao nível L (1 + 2 por nível, que é a média de 1d3).
const statsAtLevel = (L) => { const v = 1 + 2 * (L - 1); return { str: v, dex: v, man: v, hlt: v }; };
// Atributos de verdade: sorteia 1d3 por nível, como o servidor faz.
function rollStats(L) {
  const st = { str: 1, dex: 1, man: 1, hlt: 1 };
  for (let l = 1; l < L; l++) for (const k of D.ATTRS) st[k] += 1 + Math.floor(Math.random() * 3);
  return st;
}

// Monstro avulso (para arenas de teste). Não renasce sozinho: quem monta a arena decide.
function addMob(room, key, x, y) {
  const def = D.MOBS[key];
  const m = {
    id: room.nid++, isMob: true, key, ki: MOB_KEYS.indexOf(key), def, zi: 0, r: def.r, maxHp: def.hp,
    alive: true, respT: 1e9, hx: x, hy: y, x, y, hp: def.hp, hits: 0, stun: 0, atkT: Math.random(), tgt: null,
    wanderT: Math.random() * 3, wx: x, wy: y, returning: false
  };
  room.mobs.push(m);
  return m;
}
function rearmMob(m, x, y) {
  m.alive = true; m.hp = m.maxHp; m.hits = 0; m.stun = 0; m.atkT = Math.random(); m.tgt = null; m.returning = false;
  m.x = m.hx = m.wx = x; m.y = m.hy = m.wy = y; m.respT = 1e9;
}

function step(room, bots, n) {
  for (let i = 0; i < n; i++) {
    for (const b of bots) b.tick();
    S.updateRoom(room);
  }
}

const pct = (arr, q) => {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

module.exports = { S, D, MOB_KEYS, dist, makeRoom, addPlayer, addMob, rearmMob, step, statsAtLevel, rollStats, pct, avg };
