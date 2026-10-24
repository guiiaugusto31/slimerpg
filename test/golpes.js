'use strict';
// Teste: o evento de golpe da espada e do chicote leva o alcance e a abertura da área de dano, para a animação da arma percorrer exatamente essa área.
process.env.PORT = process.env.PORT || '3913';
const WebSocket = require('ws');
const S = require('../server'), D = require('../game-data');
let fails = 0;
const ok = (c, m) => { if (c) console.log('  ok  ', m); else { fails++; console.log('  FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + process.env.PORT);
    const c = { ws, id: null, ev: [] };
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.t === 'init') { c.id = m.id; resolve(c); } if (m.t === 's') c.ev.push(...m.ev); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color: '#33aa55' })));
  });
}
(async () => {
  const c = await client('Espadachim');
  const room = S.rooms.find((r) => r.players.has(c.id)), p = room.players.get(c.id);
  room.mobs.forEach((m) => { m.alive = false; m.respT = 1e9; });
  p.protectUntil = 1e12; p.level = 20; p.alive = true; p.x = 4000; p.y = 4000; p.face = 0;
  Object.keys(p.stats).forEach((k) => { p.stats[k] = 40; });
  // A forma máxima do dano (a mesma conta do servidor, inCone): o alvo é pego pela borda, então para um alvo de raio rt o alcance é base + rt e a abertura
  // é width + 2·asin(rt/alcance). A animação da arma e a luz no chão levam exatamente isso (alcance, abertura e rt para a luz abrir as laterais).
  const forma = (alc, width, rt) => { const reach = alc + p.r * 0.5 + rt; return { reach: Math.round(reach), span: width + 2 * Math.asin(Math.min(1, rt / reach)) }; };
  for (const id of ['espada_1', 'chicote_1']) {
    const F = D.FAMILIES[D.ITEMS[id].fam], fam = D.ITEMS[id].fam;
    console.log(fam + ': a animação leva a forma máxima do dano');
    p.equip.w[0] = id; p.equip.w[1] = null; S.recalc(p);
    const m = room.mobs[0]; m.alive = true; m.maxHp = m.hp = 1e9; m.stun = 1e9; m.respT = 0; m.cast = null; m.returning = false; m.tgt = null;
    const N = forma(F.range, F.arcAng, m.r), H = forma(F.skill.range, F.skill.angle, m.r);
    m.x = m.hx = p.x + F.range * 0.6; m.y = m.hy = p.y;
    c.ev.length = 0; p.wt[0] = 0; p.st[0] = 0;
    await sleep(900);
    const normal = c.ev.find((e) => e[0] === 'a' && e[3] === c.id && e[6] === 0), hab = c.ev.find((e) => e[0] === 'a' && e[3] === c.id && e[6] === 1);
    const arc = c.ev.find((e) => e[0] === 'f' && e[3] === 'arc'), cone = c.ev.find((e) => e[0] === 'f' && e[3] === 's_cone');
    ok(!!normal && !!hab, 'o golpe normal e a habilidade geram o evento de animação');
    ok(normal && normal[7] === N.reach, 'golpe normal: alcance = alcance do dano + raio do alvo (' + (normal ? normal[7] : '-') + ')');
    ok(normal && Math.abs(normal[8] - N.span) < 0.002, 'golpe normal: abertura = abertura do dano + folga do raio (' + (normal ? normal[8] : '-') + ' rad)');
    ok(arc && arc[5] === N.reach && Array.isArray(arc[8]) && Math.abs(arc[8][0] - F.arcAng) < 0.002 && arc[8][1] === Math.round(m.r), 'a luz do golpe normal leva alcance, abertura do cone e raio do alvo');
    ok(hab && hab[7] === H.reach && Math.abs(hab[8] - H.span) < 0.002, 'habilidade: alcance e abertura da forma máxima (' + (hab ? hab[7] + ' / ' + hab[8] : '-') + ')');
    ok(cone && cone[5] === H.reach && Array.isArray(cone[8]) && Math.abs(cone[8][0] - F.skill.angle) < 0.002, 'a luz da habilidade leva a forma máxima');
    // o monstro no limite do alcance (borda dentro, centro além do fim da área do cone) leva dano e a forma é a mesma
    const d = F.range + p.r * 0.5 + m.r - 3; m.hp = m.maxHp; m.x = m.hx = p.x + d; m.y = m.hy = p.y;
    c.ev.length = 0; p.wt[0] = 0; p.st[0] = 1e9;
    await sleep(500);
    const lim = c.ev.find((e) => e[0] === 'a' && e[3] === c.id && e[6] === 0);
    ok(m.hp < m.maxHp, 'o monstro no limite (centro a ' + Math.round(d) + ', área até ' + Math.round(F.range + p.r * 0.5) + ') leva dano');
    ok(lim && lim[7] === N.reach, 'no limite a forma é a mesma, e o centro dele fica dentro dela (' + (lim ? lim[7] : '-') + ' ≥ ' + Math.round(d) + ')');
  }
  c.ws.close(); await sleep(150);
  console.log(fails ? fails + ' falha(s)' : 'tudo certo');
  process.exit(fails ? 1 : 0);
})();
