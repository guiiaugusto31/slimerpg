'use strict';
// Teste de simulação: sobe o servidor dentro do processo, conecta clientes WebSocket falsos e verifica as regras.
// Uso: node test/sim.js
process.env.PORT = process.env.PORT || '3111';
const http = require('http');
const WebSocket = require('ws');
const D = require('../game-data');
const { rooms } = require('../server');

const PORT = process.env.PORT;
let fails = 0, oks = 0;
function ok(cond, msg) {
  if (cond) { oks++; console.log('  ok  ', msg); } else { fails++; console.log('  FAIL', msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJson(p) {
  return new Promise((res, rej) => http.get({ port: PORT, path: p }, (r) => {
    let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

function client(name, color, save) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + PORT);
    const c = { ws, msgs: [], me: null, id: null, fx: new Set(), dmg: [], lvl: [], quests: [], toasts: [], loot: [], death: null, saves: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      c.msgs.push(m.t);
      if (m.t === 'init') { c.id = m.id; c.room = m.room; resolve(c); }
      if (m.t === 'me') c.me = m;
      if (m.t === 's') for (const e of m.ev) { if (e[0] === 'f') c.fx.add(e[3]); if (e[0] === 'd') c.dmg.push(e); }
      if (m.t === 'lvl') c.lvl.push(m);
      if (m.t === 'quest') c.quests.push(m);
      if (m.t === 'toast') c.toasts.push(m.m);
      if (m.t === 'loot') c.loot.push(m);
      if (m.t === 'death') c.death = m;
      if (m.t === 'save') c.saves.push(m.d);
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, color, save })));
    c.send = (o) => ws.send(JSON.stringify(o));
  });
}
const pl = (c) => rooms.find((r) => r.players.has(c.id)).players.get(c.id);
const roomOf = (c) => rooms.find((r) => r.players.has(c.id));
function boost(p, st) { Object.assign(p.stats, st); }

async function main() {
  console.log('HTTP');
  const data = await getJson('/data.json');
  ok(data.MAX_LEVEL === 20 && data.QUESTS.length === 9, '/data.json traz as regras e 9 missões');
  ok(data.ITEM_LIMIT === 1 && data.PVP_XP_FRAC === 0.4, 'limite de 1 por item e XP de PvP 40%');

  console.log('Salas');
  const many = [];
  for (let i = 0; i < 22; i++) many.push(await client('Bot' + i, '#33aa55'));
  const st = await getJson('/status');
  ok(st.rooms === 2 && st.perRoom[0].players === 20 && st.perRoom[1].players === 2, '22 jogadores → sala de 20 + sala de 2 (' + JSON.stringify(st.perRoom) + ')');
  many.forEach((c) => c.ws.close());
  await sleep(300);
  ok(rooms.length === 0, 'salas vazias são removidas');

  console.log('Sanitização do nome/cor');
  const weird = await client('<script>alert(1)</script>MuitoLongoNomeDeSlime', 'red');
  ok(pl(weird).name.length <= 14 && !/[<>()]/.test(pl(weird).name), 'nome limpo: "' + pl(weird).name + '"');
  ok(/^#[0-9a-f]{6}$/i.test(pl(weird).color), 'cor inválida cai no padrão');
  weird.ws.close();
  await sleep(200);

  console.log('Combate, XP, nível, morte');
  const A = await client('Alice', '#ff77aa');
  const B = await client('Bruno', '#77aaff');
  const room = roomOf(A);
  const pa = pl(A), pb = pl(B);
  ok(room === roomOf(B), 'jogadores na mesma sala');
  ok(pa.level === 1 && pa.stats.str === 1 && pa.stats.hlt === 1, 'começa nível 1 com todos atributos 1');
  ok(pa.maxHp === 40 + 10 + Math.round(8 * 0.375), 'HP inicial = 40 + 10*Saúde + peitoral (' + pa.maxHp + ')');
  // esconde o resto dos mobs para o teste ficar determinístico
  const away = (m) => { m.x = m.hx = 99999; m.y = m.hy = 99999; };
  room.mobs.forEach(away);
  const cog = room.mobs.find((m) => m.key === 'cogumelo');
  const place = (p, x, y) => { p.x = x; p.y = y; p.protectUntil = 0; };
  const mobAt = (m, x, y) => { m.x = m.hx = x; m.y = m.hy = y; m.hp = m.maxHp; m.alive = true; m.hits = 0; m.stun = 0; m.tgt = null; };
  boost(pa, { str: 40 });
  mobAt(cog, W().cx, W().cy + 200);
  place(pa, W().cx + 30, W().cy + 200);
  place(pb, W().cx + 900, W().cy - 600);
  await sleep(1200);
  ok(!cog.alive, 'faca mata cogumelo sozinha (ataque automático)');
  ok(pa.kills.cogumelo === 1, 'contou 1 kill de cogumelo');
  ok(D.xpNeed(1) === 5 && D.xpNeed(2) === 10 && D.xpNeed(3) === 77, 'curva inicial: 5 XP, 10 XP, depois 77 XP');

  // 1 cogumelo (5 XP) leva do nível 1 ao 2 e dá 8 pontos de atributo para o jogador distribuir
  ok(A.lvl.length === 1 && pa.level === 2 && pa.xp === 0, '1 cogumelo leva do nível 1 ao 2 (nível ' + pa.level + ', xp ' + pa.xp + ')');
  ok(A.lvl[0].gain && Object.values(A.lvl[0].gain).every((g) => g >= 1 && g <= 3) && pa.points === 0, 'cada nível rola 1d3 em cada atributo');
  pa.points = 8;
  const s0 = Object.assign({}, pa.stats);
  ok(pa.hp === pa.maxHp, 'vida recuperada ao subir de nível (os atributos só sobem quando o jogador gasta os pontos)');
  A.send({ t: 'alloc', k: 'hlt', n: 3 }); await sleep(100);
  ok(pa.stats.hlt === s0.hlt + 3 && pa.points === 5, 'alloc: 3 pontos em Saúde (' + pa.stats.hlt + ', sobram ' + pa.points + ')');
  A.send({ t: 'alloc', k: 'dex', n: 99 }); await sleep(100);
  ok(pa.stats.dex === s0.dex + 5 && pa.points === 0, 'alloc nunca gasta mais pontos do que tem');
  A.send({ t: 'alloc', k: 'man', n: 1 }); A.send({ t: 'alloc', k: 'xyz', n: 1 }); await sleep(100);
  ok(pa.stats.man === s0.man && !('xyz' in pa.stats), 'sem pontos ou atributo inválido: nada acontece');
  pa.points = 100; pa.stats.dex = 55; A.send({ t: 'alloc', k: 'dex', n: 20 }); await sleep(100);
  ok(pa.stats.dex === D.ATTR_MAX && D.ATTR_MAX === 60 && pa.points === 95, 'máximo de 60 em um único atributo (sobram ' + pa.points + ')');
  A.send({ t: 'alloc', k: 'dex', n: 1 }); A.send({ t: 'alloc', k: 'man', n: -5 }); A.send({ t: 'alloc', k: 'man', n: 1.5 }); await sleep(100);
  ok(pa.stats.dex === 60 && pa.stats.man === s0.man + 1 && pa.points === 94, 'no máximo ou número inválido não passa (' + pa.stats.man + ')');
  pa.points = 0; Object.assign(pa.stats, s0); recalcAll(pa); pa.hp = pa.maxHp;

  // 2 cogumelos levam do nível 2 ao 3
  const c2 = room.mobs.find((m) => m.key === 'cogumelo' && m !== cog), c3 = room.mobs.find((m) => m.key === 'cogumelo' && m !== cog && m !== c2);
  mobAt(c2, W().cx, W().cy + 200); room.mobs.forEach((m) => { if (m !== c2) away(m); });
  await sleep(1200);
  ok(pa.level === 2 && pa.xp === 5, 'depois do 1º cogumelo no nível 2: 5/10 XP (nível ' + pa.level + ', xp ' + pa.xp + ')');
  mobAt(c3, W().cx, W().cy + 200); room.mobs.forEach((m) => { if (m !== c3) away(m); });
  await sleep(1200);
  ok(A.lvl.length === 2 && pa.level === 3, '2 cogumelos levam do nível 2 ao 3 (nível ' + pa.level + ')');

  // PvP ligado para todos desde o nível 1 (sem proteção de novato); só vítimas de nível 8+ contam para a missão
  ok(D.NEWBIE_LEVEL === 0 && D.PK_MIN_LEVEL === 8, 'PvP liga desde o nível 1; só vítimas de nível 8+ contam para a missão');
  pb.stats.hlt = 200; pb.level = 2; recalcAll(pb); pb.hp = pb.maxHp; place(pb, pa.x + 40, pa.y); pa.protectUntil = 0; pb.protectUntil = 0;
  const hpLow = pb.hp;
  await sleep(700);
  ok(pb.alive && pb.hp < hpLow, 'jogador de nível baixo também apanha de outro jogador (PvP sempre ligado)');
  pb.stats.hlt = 1; recalcAll(pb);

  // PvP: XP = 40% do XP do nível da vítima
  pa.level = 8; pa.xp = 0; pb.level = 8; pb.hp = 1; boost(pb, { str: 1 });
  const xp0 = pa.xp, lvl0 = pa.level;
  place(pb, pa.x + 40, pa.y); pa.protectUntil = 0; pb.protectUntil = 0;
  await sleep(1000);
  ok(!pb.alive, 'jogador morreu para a faca do outro');
  ok(pa.pk === 1, 'contou 1 jogador derrotado');
  const expect = Math.floor(D.xpNeed(8) * 0.4);
  ok(pa.xp - xp0 === expect || pa.level > lvl0, 'XP de PvP = 40% do XP do nível da vítima (' + expect + ')');
  ok(B.death && B.death.lvl === 8, 'vítima recebeu mensagem de morte (nível perdido: ' + (B.death && B.death.lvl) + ')');
  ok(pb.level === 1 && pb.stats.str === 1 && pb.xp === 0, 'vítima voltou para nível 1 e atributos 1');
  B.send({ t: 'respawn' });
  await sleep(200);
  ok(pb.alive && pb.hp === pb.maxHp && pb.protectUntil > room.now, 'respawn com vida cheia e imunidade curta');

  console.log('Equipamentos e limite de 1 por item');
  pb.inv = ['martelo_1']; pb.stats = { str: 10, dex: 1, man: 1, hlt: 1 }; recalcAll(pb);
  B.send({ t: 'equip', slot: 'w0', item: 'espada_1' });
  await sleep(100);
  ok(pb.equip.w[0] === 'faca', 'não equipa item que não está no inventário');
  B.send({ t: 'equip', slot: 'w0', item: 'martelo_1' });
  B.send({ t: 'equip', slot: 'w1', item: 'martelo_1' });
  await sleep(150);
  ok(pb.equip.w[0] === 'martelo_1' && pb.equip.w[1] === 'martelo_1', 'o mesmo item pode ocupar os 2 slots');
  ok(pb.fused === true, 'mesmo item nos 2 slots = habilidade fundida');
  pb.stats.str = 1; recalcAll(pb);
  ok(pb.active.length === 1 && pb.active[0].item.id === 'faca', 'sem requisito: arma fica inativa e a faca assume');
  pb.stats.str = 10; recalcAll(pb);
  B.send({ t: 'equip', slot: 'a', item: 'blindado_1' });
  await sleep(100);
  ok(pb.equip.a === 'vital_0', 'peitoral fora do inventário é recusado');
  pb.inv.push('blindado_1'); pb.stats.hlt = 5; recalcAll(pb);
  B.send({ t: 'equip', slot: 'a', item: 'blindado_1' });
  await sleep(100);
  ok(pb.equip.a === 'blindado_1' && pb.armor.rp === 8 && pb.armor.rm === 0, 'Blindado dá resistência física (' + JSON.stringify(pb.armor) + ')');
  B.send({ t: 'equip', slot: 'a', item: 'vital_0' });
  await sleep(100);
  ok(pb.equip.a === 'vital_0' && pb.inv.includes('blindado_1'), 'voltar ao peitoral inicial desequipa sem perder o item');
  B.send({ t: 'discard', item: 'blindado_1' });
  await sleep(100);
  ok(pb.inv.includes('blindado_1'), 'a mochila é um catálogo: não existe mais descartar item');

  console.log('Drops: no máximo 1 de cada item');
  const oldW = D.DROP_WEAPON, oldA = D.DROP_ARMOR;
  D.DROP_WEAPON = 1; D.DROP_ARMOR = 1;
  pa.inv = []; pa.level = 1; pa.xp = 0; boost(pa, { str: 60 });
  room.mobs.forEach(away);
  for (let i = 0; i < 40; i++) {
    const m = room.mobs.find((x) => x.key === 'cogumelo' && !x.alive) || room.mobs.find((x) => x.key === 'cogumelo');
    mobAt(m, pa.x + 25, pa.y); pa.protectUntil = 0;
    await sleep(650);
    room.mobs.forEach((x) => { if (x !== m) away(x); });
    if (pa.level > 1) { pa.level = 1; pa.xp = 0; }
    if (pa.inv.filter((id) => D.ITEMS[id].kind === 'weapon').length >= 9) break;
  }
  const t1w = pa.inv.filter((id) => D.ITEMS[id].kind === 'weapon' && D.ITEMS[id].tier === 1);
  const t1a = pa.inv.filter((id) => D.ITEMS[id].kind === 'armor' && D.ITEMS[id].tier === 1);
  ok(new Set(pa.inv).size === pa.inv.length, 'inventário sem duplicatas (' + pa.inv.length + ' itens)');
  ok(t1w.length === 9 && t1a.length === 3, 'dropou todas as 9 armas e 3 peitorais de faixa 1 uma única vez cada');
  ok(pa.inv.every((id) => D.ITEMS[id].tier <= 1), 'cogumelos só dropam faixa 1');
  ok(A.loot.some((l) => l.item), 'cliente foi avisado do loot');
  D.DROP_WEAPON = oldW; D.DROP_ARMOR = oldA;

  console.log('Missões');
  pa.alive && (pa.inv = pa.inv.slice(0, 5));
  pa.kills.javali = 100;
  await sleep(1300);
  ok(pa.done.has('q_martelo') && pa.inv.includes('martelo_5'), 'missão dos 100 javalis entrega o Martelo Lendário');
  ok(A.quests.some((q) => q.id === 'q_martelo'), 'cliente foi avisado da missão');
  pa.kills.aranha = 40; pa.pk = 5;
  await sleep(1300);
  ok(pa.inv.includes('chicote_5') && pa.inv.includes('varinha_5'), 'missões de aranhas e PvP entregam armas');
  A.send({ t: 'discard', item: 'martelo_5' });
  await sleep(100);
  ok(pa.inv.includes('martelo_5'), 'arma lendária não pode ser descartada');
  pa.stats.str = 1; recalcAll(pa);
  A.send({ t: 'equip', slot: 'w0', item: 'martelo_5' });
  await sleep(100);
  ok(pa.equip.w[0] !== 'martelo_5', 'lendária não equipa sem 39 de Força');

  // sobreviver / sem dano
  pa.aliveT = 599.9; pa.nodT = 59.9;
  pa.combatT = 6;
  await sleep(1300);
  ok(pa.done.has('q_espada'), 'sobreviver 10 min completa a missão da Espada');
  ok(pa.done.has('q_rapieira'), '1 min em combate sem tomar dano completa a Rapieira');
  // um golpe só
  const jav = room.mobs.find((m) => m.key === 'javali');
  room.mobs.forEach(away);
  mobAt(jav, pa.x + 25, pa.y); pa.protectUntil = 0; pa.stats.str = 1000; // faca: (força+1) × 1,3 precisa passar da vida do javali
  pa.done.delete('q_arco'); pa.oneHits = 0;
  await sleep(1000);
  ok(pa.oneHits >= 1 && pa.done.has('q_arco'), 'matar monstro forte com um golpe completa a missão do Arco');
  // teto de dano por golpe: o maior golpe de cada arma (básico, habilidade e habilidade fundida) fica abaixo de 1/N da vida do monstro da faixa
  const srvHit0 = require('../server').hit;
  {
    let over = [];
    Object.keys(D.FAMILIES).forEach((fam) => {
      const F = D.FAMILIES[fam]; if (fam === 'faca') return;
      for (let t = 1; t <= 6; t++) { // a faixa 6 (mítica) é medida contra a aranha-véu; a fusão só conta até a faixa 5
        const st = { str: 0, dex: 0, man: 0, hlt: 0 }; st[F.attr] = D.REF_ATTR[t - 1];
        const it = D.ITEMS[fam + '_' + t], cap = D.hitCap(t, F.cls);
        if (D.weaponDamage(it, st) > cap) over.push(it.id + ' básico');
        if (D.skillDamage(it, st) > cap) over.push(it.id + ' habilidade');
        if (t <= 5 && D.skillDamage(it, st) * 1.5 > cap) over.push(it.id + ' habilidade fundida');
      }
    });
    ok(over.length === 0, 'teto de dano: nenhum golpe das armas passa de 1/5, 1/3, 1/7 ou 1/5 da vida do monstro da faixa' + (over.length ? ' (' + over.join(', ') + ')' : ''));
    ok(D.hitCap(5, 'fm') === 660 && D.hitCap(5, 'sm') === 1100 && D.hitCap(5, 'fr') === 3300 / 7 && D.hitCap(5, 'sr') === 660, 'teto de dano: a faixa 5 usa a aranha-véu (3300 de vida)');
  }
  // até 3 golpes conta; 4 não
  pa.done.delete('q_arco'); pa.oneHits = 0; pa.stats.str = 1; pa.protectUntil = 0;
  const third = Math.ceil(jav.maxHp / 3) + 1;
  mobAt(jav, pa.x + 400, pa.y); room.mobs.forEach((m) => { if (m !== jav) away(m); });
  srvHit0(room, pa, jav, third, 'phys'); srvHit0(room, pa, jav, third, 'phys'); srvHit0(room, pa, jav, third, 'phys');
  ok(!jav.alive && pa.oneHits === 1, 'monstro forte morto no 3º golpe conta para a missão do Arco');
  pa.oneHits = 0; mobAt(jav, pa.x + 400, pa.y);
  const fourth = Math.ceil(jav.maxHp / 4) + 1;
  for (let i = 0; i < 4; i++) srvHit0(room, pa, jav, fourth, 'phys');
  ok(!jav.alive && pa.oneHits === 0, 'monstro forte que precisou de 4 golpes não conta');
  pa.stats.str = 1000; pa.oneHits = 0;
  // nível 20
  pa.level = 19; pa.xp = D.xpNeed(19) - 1; pa.done.delete('q_sinos');
  const cg = room.mobs.find((m) => m.key === 'cogumelo'); room.mobs.forEach(away); mobAt(cg, pa.x + 25, pa.y);
  await sleep(1300);
  ok(pa.level === 20 && pa.done.has('q_sinos'), 'chegar ao nível 20 completa Sinos e vira nível máximo');
  A.ws.close(); B.ws.close();
  await sleep(200);

  console.log('Todas as armas: ataque básico e habilidade');
  const fams = Object.keys(D.FAMILIES).filter((f) => f !== 'faca');
  const bots = [];
  for (const f of fams) bots.push(await client('T_' + f, '#aabbcc'));
  const r2 = roomOf(bots[0]);
  r2.mobs.forEach(away);
  const dummies = r2.mobs.filter((m) => m.key === 'aranha' || m.key === 'broto' || m.key === 'javali').slice(0, 0);
  const pool = r2.mobs.slice(0, fams.length);
  fams.forEach((f, i) => {
    const p = pl(bots[i]);
    Object.assign(p.stats, { str: 30, dex: 30, man: 30, hlt: 300 });
    p.inv = [f + '_1'];
    p.equip.w = [f + '_1', null];
    recalcAll(p); p.hp = p.maxHp;
    const m = pool[i];
    const bx = W().cx - 1200 + i * 250, by = W().cy;
    mobAt(m, bx + (D.FAMILIES[f].range > 150 ? 180 : 45), by);
    m.hp = m.maxHp = 1e7; m.def = Object.assign({}, m.def, { dmg: 0 });
    place(p, bx, by);
  });
  const fired = fams.map(() => false);
  for (let k = 0; k < 28; k++) {
    pool.forEach((m) => { m.stun = 5; });
    bots.forEach((b, i) => { if (pl(b).st[0] > 0) fired[i] = true; });
    await sleep(250);
  }
  fams.forEach((f, i) => {
    const m = pool[i], skillKind = D.FAMILIES[f].skill.kind;
    ok(m.hp < 1e7, f + ': ataque automático causou dano (' + (1e7 - m.hp) + ')');
    ok(fired[i], f + ': habilidade "' + skillKind + '" disparou sozinha (cooldown ativado)');
  });
  // fusão
  const pf = pl(bots[0]);
  pf.inv = ['martelo_1']; pf.equip.w = ['martelo_1', 'martelo_1']; recalcAll(pf);
  ok(pf.fused, 'fusão ativa com martelo + martelo');
  bots.forEach((b) => b.ws.close());
  await sleep(200);

  console.log('Catálogo da mochila e regras novas');
  const real = Object.values(D.ITEMS).filter((it) => !D.BASE_ITEMS.includes(it.id));
  const mythics = real.filter((it) => it.kind === 'weapon' && it.tier === D.MYTHIC_TIER);
  ok(D.CATALOG_SIZE === real.length && real.length === 70, 'catálogo da mochila: ' + real.length + ' itens que começam bloqueados');
  ok(real.every((it) => { const h = D.howToGet(it); return h && h.text && ['quest', 'drop', 'boss'].includes(h.kind); }), 'todo item do catálogo explica como conseguir');
  ok(mythics.length === 9 && mythics.every((it) => D.howToGet(it).kind === 'boss'), '9 armas míticas, todas só do dragão');
  const dracoItem = D.ITEMS[D.BOSS.armorItem];
  ok(dracoItem && dracoItem.kind === 'armor' && dracoItem.tier === D.MYTHIC_TIER && D.howToGet(dracoItem).kind === 'boss' && /dragão/i.test(D.howToGet(dracoItem).text), 'o Peitoral Dracônico é o único peitoral mítico e só vem do dragão');
  ok(real.filter((it) => it.kind === 'armor' && it.tier === D.MYTHIC_TIER).length === 1, 'só existe 1 peitoral mítico');
  const dSt = D.armorStats(dracoItem, { hlt: 40 }), vSt = D.armorStats(D.ITEMS.vital_5, { hlt: 40 });
  ok(dSt.rp > 0 && dSt.rm > 0 && dSt.rp === dSt.rm && dSt.hp > vSt.hp && D.armorStats(D.ITEMS.blindado_5, { hlt: 40 }).rm === 0, 'Dracônico dá vida (mais que o Vital lendário) e resiste a dano físico E mágico (' + JSON.stringify(dSt) + ')');
  ok(real.filter((it) => D.howToGet(it).kind === 'quest').length === D.QUESTS.length, 'cada missão entrega 1 item do catálogo');
  ok(D.WORLD.w === 7200 && D.WORLD.h === 4500, 'mapa com o dobro do tamanho original (7200 x 4500)');
  const order = ['cogumelo', 'coelho', 'lobo', 'javali', 'broto', 'aranha'];
  ok(order.every((k, i) => i === 0 || (D.MOBS[k].hp > D.MOBS[order[i - 1]].hp && D.MOBS[k].dmg >= D.MOBS[order[i - 1]].dmg)), 'monstros ficam mais fortes a cada zona (vida e dano crescentes)');

  console.log('Dragão ancestral');
  const { hit: srvHit } = require('../server');
  const Dr = await client('Domador', '#ff5533');
  const Ex = await client('Ajudante', '#33aaff');
  const rd = roomOf(Dr), pd = pl(Dr), pe = pl(Ex), bs = rd.boss;
  ok(rd === roomOf(Ex) && bs && bs.alive, 'cada sala tem um dragão');
  rd.mobs.forEach((m) => { if (!m.boss) away(m); });
  const baseHp = bs.maxHp;
  ok(bs.state === 0 && Math.abs(bs.x - W().cx) < 1 && Math.abs(bs.y - W().cy) < 1 && baseHp >= 50000, 'o dragão dorme no centro, com muita vida (' + baseHp + ')');
  Object.assign(pd.stats, { str: 60, hlt: 3000 }); Object.assign(pe.stats, { str: 60, hlt: 3000 }); recalcAll(pd); recalcAll(pe);
  pd.level = 19; place(pd, bs.x + 400, bs.y); place(pe, bs.x - 420, bs.y); pe.level = 19; // lados opostos: os dois são nível 20 e não devem se atacar
  ok(srvHit(rd, pd, bs, 500, 'phys') === false && bs.state === 0, 'abaixo do nível 20 ninguém consegue machucar o dragão');
  pd.level = 20; pe.level = 20;
  pd.hp = pd.maxHp; pe.hp = pe.maxHp;
  await sleep(1300);
  ok(bs.state === 0 && pd.hp === pd.maxHp && Math.abs(bs.x - W().cx) < 1, 'dragão dorme e não ataca quem não o machucou');
  { const { bossCdMul } = require('../server'), mk = (f) => ({ hp: 1000 * f, maxHp: 1000 });
    ok(bossCdMul(mk(0.5)) === 1 && bossCdMul(mk(0.3)) === 1, 'dragão com 30% de vida ou mais: recarga normal');
    ok(Math.abs(bossCdMul(mk(0.29)) - 0.8) < 1e-9 && Math.abs(bossCdMul(mk(0.1)) - 0.8) < 1e-9, 'dragão abaixo de 30% de vida: recarga 20% menor');
    ok(Math.abs(bossCdMul(mk(0.09)) - 0.6) < 1e-9 && Math.abs(bossCdMul(mk(0.01)) - 0.6) < 1e-9, 'dragão abaixo de 10% de vida: recarga 40% menor'); }
  ok(srvHit(rd, pd, bs, 500, 'phys') === true && bs.state === 1, 'ao levar um golpe, o dragão acorda');
  await sleep(250);
  ok(bs.maxHp === baseHp, 'sozinho, a vida dele não cresce (' + bs.maxHp + ')');
  srvHit(rd, pe, bs, 500, 'phys');
  await sleep(250);
  ok(bs.maxHp === Math.round(baseHp * (1 + D.BOSS.scale)), 'com um segundo jogador a vida máxima sobe ' + D.BOSS.scale * 100 + '% (' + bs.maxHp + ')');
  const hp0 = pd.hp + pe.hp;
  await sleep(3500);
  ok(pd.hp + pe.hp < hp0 || Math.hypot(bs.x - W().cx, bs.y - W().cy) > 5, 'acordado, ele avança e ataca');
  // abate: quem causou 6% ou mais da vida leva uma arma mítica, quem só encostou não
  const mythOf = (p) => p.inv.filter((id) => D.ITEMS[id].tier === D.MYTHIC_TIER && D.ITEMS[id].kind === 'weapon');
  srvHit(rd, pd, bs, Math.round(bs.maxHp * 0.3), 'phys');
  bs.hp = Math.min(bs.hp, 100); pd.hp = pd.maxHp; pe.hp = pe.maxHp;
  const rand0 = Math.random; Math.random = () => 0.01; // sorteio favorável: o peitoral do dragão cai
  srvHit(rd, pd, bs, 1e9, 'phys');
  Math.random = rand0;
  ok(!bs.alive && bs.respT === D.BOSS.respawn, 'dragão derrotado volta só depois de ' + D.BOSS.respawn + ' s');
  ok(mythOf(pd).length === 1, 'quem causou muito dano ganhou 1 arma mítica (' + mythOf(pd) + ')');
  ok(mythOf(pe).length === 0, 'quem só deu um golpe leve não ganha arma mítica');
  ok(pd.inv.filter((id) => id === D.BOSS.armorItem).length === 1 && !pe.inv.includes(D.BOSS.armorItem), 'quem venceu levou o Peitoral Dracônico (uma vez só); quem só encostou não');
  Dr.send({ t: 'equip', slot: 'a', item: D.BOSS.armorItem });
  await sleep(150);
  ok(pd.equip.a === D.BOSS.armorItem && pd.armorItem === D.BOSS.armorItem && pd.armor.rp === dSt.rp && pd.armor.rm === dSt.rm && pd.armor.hp > 0, 'equipar o Dracônico aplica vida e as duas resistências (' + JSON.stringify(pd.armor) + ')');
  ok(pd.maxHp === 40 + pd.stats.hlt * 10 + pd.armor.hp, 'a vida máxima soma a vida do peitoral');
  Dr.ws.close(); Ex.ws.close();
  await sleep(200);

  console.log('Regeneração de vida');
  const Rg = await client('Regen', '#ffffff');
  const prg = pl(Rg), rrg = roomOf(Rg);
  rrg.mobs.forEach(away); prg.protectUntil = 0; prg.stats.hlt = 100; recalcAll(prg);
  prg.hp = prg.maxHp * 0.5; srvHit(rrg, null, prg, 5, 'phys'); // acabou de levar dano
  const rh0 = prg.hp;
  await sleep(2000);
  const gain = (prg.hp - rh0) / prg.maxHp; // 0,5% por segundo, 2 s: cerca de 1%
  ok(D.PLAYER_REGEN === 0.005 && gain > 0.007 && gain < 0.013, 'a vida regenera ' + D.PLAYER_REGEN * 100 + '% por segundo mesmo logo depois de levar dano (ganhou ' + (gain * 100).toFixed(2) + '% em 2 s)');
  ok(D.PLAYER_STUN_MULT === 0.5, 'atordoamento em jogador dura metade do tempo');
  Rg.ws.close();
  await sleep(150);

  console.log('Save validado');
  const hacker = await client('Hack', '#ffffff', { items: ['nao_existe', 'faca', 'espada_3', 'espada_3', 'vital_0'], pk: 'abc', kills: { javali: 5, xyz: 99 }, done: ['q_arco', 'foo'], equip: { w: ['espada_3', 'rapieira_5'], a: 'arcano_9' } });
  const ph = pl(hacker);
  ok(ph.inv.length === 1 && ph.inv[0] === 'espada_3', 'save: ignora itens inválidos, base e duplicatas');
  ok(ph.equip.w[0] === 'espada_3' && ph.equip.w[1] === null && ph.equip.a === 'vital_0', 'save: equipamento só aceita o que está no inventário');
  ok(ph.kills.javali === 5 && !ph.kills.xyz && ph.pk === 0 && ph.done.has('q_arco') && !ph.done.has('foo'), 'save: contadores e missões validados');
  hacker.ws.close();

  console.log('Velocidade ao andar');
  const sp = (l, f) => D.moveSpeed(l, f);
  ok(sp(1, ['faca']) > sp(10, ['faca']) && sp(10, ['faca']) > sp(20, ['faca']), 'quanto menor o slime (nível mais baixo), mais rápido');
  ok(sp(5, ['espada']) > sp(5, ['arco']) && sp(5, ['faca']) > sp(5, ['varinha']), 'com arma de perto anda um pouco mais rápido que com arma de longe');
  const mix = sp(5, ['espada', 'arco']);
  ok(mix > sp(5, ['arco']) && mix < sp(5, ['espada']), 'uma de perto e uma de longe fica no meio');
  ok(sp(5, ['espada']) / sp(5, ['arco']) < 1.1, 'a diferença entre perto e longe é leve (menos de 10%)');
  ok(sp(1, ['arco']) <= D.MOVE_BASE * 1.11 && sp(20, ['arco']) >= D.MOVE_BASE * 0.9, 'nenhum caso foge muito da velocidade base');
  const pv = require('../server').makePlayer({}, 'T', '#ffffff', null); require('../server').recalc(pv);
  ok(Math.abs(pv.spd - sp(1, ['faca'])) < 1e-9, 'o servidor usa a mesma conta (nível 1 com a faca)');
  console.log('\n' + oks + ' ok, ' + fails + ' falhas');
  process.exit(fails ? 1 : 0);
}

function W() { return D.WORLD; }
function recalcAll(p) {
  // reaproveita a lógica do servidor via mensagem inócua: o servidor recalcula em equip; aqui chamamos direto pelo require
  require('../server').recalc && require('../server').recalc(p);
}

main().catch((e) => { console.error(e); process.exit(1); });
