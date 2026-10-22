'use strict';
// Robô do simulador. Joga como um jogador razoável: escolhe o monstro que vale a pena caçar com o equipamento que tem,
// equipa o melhor par de armas, foge quando a vida baixa, descansa para recuperar e (opcionalmente) enfrenta o dragão.
// Não usa nenhuma regra especial: só mexe no que o jogador real mexe (direção de movimento e equipamento).
const { S, D, dist } = require('./harness');

const HUNT = Object.keys(D.MOBS).filter((k) => !D.MOBS[k].boss);
const PLAYER_SPEED = S.BASE_SPEED;

function weaponDps(it, stats) {
  const F = D.FAMILIES[it.fam];
  const basic = D.weaponDamage(it, stats) / F.cd;
  let skill = 0;
  if (F.skill) {
    const mult = F.skill.kind === 'volley' ? Math.min(F.skill.count, 2.2) : 1;
    skill = (D.skillDamage(it, stats) * mult) / F.skill.cd;
  }
  return { basic, skill };
}
function pairDps(a, b, stats) {
  if (a === b) { const w = weaponDps(a, stats); return 2 * w.basic + 1.5 * w.skill; } // fusão: 2 básicos + 1 habilidade a 150%
  const x = weaponDps(a, stats), y = weaponDps(b, stats);
  return x.basic + x.skill + y.basic + y.skill;
}

// Melhor par de armas + melhor peitoral entre o que o jogador tem e consegue usar.
function bestEquip(p) {
  const ids = D.BASE_ITEMS.concat(p.inv);
  const items = ids.map((id) => D.ITEMS[id]);
  const ws = items.filter((it) => it.kind === 'weapon' && D.meetsReq(it, p.stats));
  let best = null, bd = -1;
  for (let i = 0; i < ws.length; i++) {
    for (let j = i; j < ws.length; j++) {
      const d = pairDps(ws[i], ws[j], p.stats);
      if (d > bd) { bd = d; best = [ws[i].id, ws[j].id]; }
    }
  }
  let arm = D.ITEMS.vital_0, bs = -1;
  for (const it of items) {
    if (it.kind !== 'armor' || !D.meetsReq(it, p.stats)) continue;
    const a = D.armorStats(it, p.stats);
    const sc = (40 + p.stats.hlt * 10 + a.hp) / (1 - (0.85 * a.rp + 0.15 * a.rm) / 100);
    if (sc > bs) { bs = sc; arm = it; }
  }
  return { w: best, a: arm.id, dps: bd };
}

class Bot {
  // opts: budget (fração da vida que aceita perder por luta), flee (foge abaixo disso), rest (descansa até isso),
  //  kite ('auto' | true | false), react (ticks entre decisões), arena (caça qualquer monstro, nunca descansa),
  //  boss (vai atrás do dragão no nível 20), dodge (0..1: chance de desviar dos avisos do dragão), kinds (restringe monstros)
  constructor(room, p, opts) {
    this.room = room; this.p = p;
    this.o = Object.assign({ budget: 0.35, flee: 0.3, rest: 0.85, kite: 'auto', react: 4, arena: false, boss: false, dodge: 1, kinds: null, fixedEquip: false, reactBoss: 0.35 }, opts || {});
    this.n = 0; this.deadT = 0; this.kind = HUNT[0]; this.kindT = 0; this.mode = 'hunt'; this.gearKey = '';
    this.goal = null; this.goalT = 0; this.dodgeSeed = Math.random();
    this.stats = { deaths: [], lives: [], loot: [], levelAt: {}, restT: 0, fightT: 0, travelT: 0, bossT: 0 };
    this.life = { start: room.now, levelAt: { 1: room.now } };
    this.logIdx = 0;
    this.maybeGear(true);
  }

  // lê os avisos do servidor (morte, nível, loot) acumulados desde a última vez
  readLog() {
    const L = this.p.log;
    while (this.logIdx < L.length) {
      const m = L[this.logIdx++];
      if (m.t === 'death') {
        this.stats.deaths.push({ at: m.at, level: m.lvl, by: m.by });
        this.life.end = m.at; this.life.by = m.by; this.life.level = m.lvl;
        this.stats.lives.push(this.life);
        this.life = { start: m.at, levelAt: { 1: m.at } };
      } else if (m.t === 'lvl') {
        if (this.life.levelAt[m.level] === undefined) this.life.levelAt[m.level] = m.at;
        if (this.stats.levelAt[m.level] === undefined) this.stats.levelAt[m.level] = m.at;
      } else if (m.t === 'loot' || m.t === 'quest') {
        this.stats.loot.push({ at: m.at, item: m.item, level: this.p.level, quest: m.t === 'quest' });
      }
    }
  }

  maybeGear(force) {
    const p = this.p;
    if (this.o.fixedEquip) return;
    const key = p.inv.length + ':' + p.stats.str + ',' + p.stats.dex + ',' + p.stats.man + ',' + p.stats.hlt;
    if (!force && key === this.gearKey) return;
    this.gearKey = key;
    const e = bestEquip(p);
    if (e.w) { p.equip.w[0] = e.w[0]; p.equip.w[1] = e.w[1]; }
    p.equip.a = e.a;
    S.recalc(p);
  }

  // dano por segundo que as armas ativas fazem em um alvo só
  dps() {
    let t = 0;
    const p = this.p;
    for (const a of p.active) { const w = weaponDps(a.item, p.stats); t += w.basic + (p.fused && a.slot === 1 ? 0 : w.skill * (p.fused ? 1.5 : 1)); }
    return t || 1;
  }
  reach() { return Math.max(...this.p.active.map((a) => a.F.range)); }
  isRanged() { return this.reach() >= 200; }

  // Qual monstro compensa caçar agora: o que rende mais XP por segundo gastando só a vida que o jogador aceita perder.
  chooseKind() {
    const p = this.p, dps = this.dps() * 0.8, regen = D.PLAYER_REGEN * p.maxHp;
    let best = null, bs = -1;
    for (const k of this.o.kinds || HUNT) {
      const d = D.MOBS[k];
      const ttk = d.hp / dps;
      const kite = this.isRanged() && this.o.kite !== false ? 0.45 : 1;
      const taken = ttk * ((d.dmg * (1 - p.armor.rp / 100)) / d.atkCd) * 1.3 * kite;
      if (taken > this.o.budget * p.maxHp) continue;
      const cycle = ttk + 4 + taken / regen + (taken > 0 ? 3 : 0);
      const sc = d.xp / cycle;
      if (sc > bs) { bs = sc; best = k; }
    }
    return best || (this.o.kinds || HUNT)[0];
  }

  tick() {
    this.n++;
    if (this.n % this.o.react !== 0) return;
    const p = this.p, room = this.room, dt = this.o.react / S.TICK;
    this.readLog();
    if (!p.alive) {
      p.mx = p.my = 0;
      this.deadT += dt;
      if (this.deadT >= 2.5) { this.deadT = 0; S.spawnPlayer(room, p); if (this.o.pos) { p.x = this.o.pos.x; p.y = this.o.pos.y; } this.gearKey = ''; this.maybeGear(true); }
      return;
    }
    this.maybeGear(false);
    const reach = this.reach();
    // inventário do entorno
    let nearest = null, nd = 1e9, chaser = null, cd = 1e9, tgtMob = null, td = 1e9, chasers = 0, fastChaser = false;
    const kind = this.chooseKindCached(dt);
    const avoid = [];
    for (const m of room.mobs) {
      if (!m.alive) continue;
      const d = dist(p, m) - m.r - p.r;
      if (m.boss) {
        if (!(this.o.boss && p.level >= D.BOSS.minLevel)) avoid.push([m, m.r + reach + 90, 1]);
        else if (m.state === 0 || m.state === 1) { /* alvo tratado abaixo */ }
        continue;
      }
      if (d < nd) { nd = d; nearest = m; }
      if (m.tgt === p && d < 700) {
        chasers++;
        if (d < cd) { cd = d; chaser = m; }
        if (m.def.speed >= PLAYER_SPEED * 0.9) fastChaser = true;
      } else if (m.key !== kind && !this.o.arena) {
        // evita atravessar o território de monstros muito acima do seu nível
        const dm = D.MOBS[m.key];
        if (dm.xp > D.MOBS[kind].xp * 1.6 && d < dm.aggro + 40) avoid.push([m, dm.aggro + 60, 0.8]);
      }
      if (m.key === kind && d < td && !(room.boss && dist(m, room.boss) < D.BOSS.clear)) { td = d; tgtMob = m; }
    }
    const hpf = p.hp / p.maxHp;
    let tx = null, ty = null, away = null;

    // dragão
    const boss = room.boss;
    if (this.o.boss && boss && boss.alive && p.level >= D.BOSS.minLevel && this.bossReady()) {
      const r = this.bossMove(boss, hpf, chaser);
      if (r) { this.apply(r.x, r.y, avoid); this.stats.bossT += dt; return; }
    }

    if (this.o.arena) {
      if (nearest) { tx = nearest.x; ty = nearest.y; if (this.kiteNow(chaser, cd, reach)) away = chaser; }
    } else {
      // descansar / fugir
      if (hpf < this.o.flee && chasers > 0 && !fastChaser) this.mode = 'flee';
      if (this.mode === 'flee' && chasers === 0) this.mode = 'rest';
      if (this.mode === 'hunt' && hpf < this.o.flee && chasers === 0) this.mode = 'rest';
      if (this.mode === 'rest' && hpf >= this.o.rest) this.mode = 'hunt';
      if (this.mode === 'flee' && chaser) { away = chaser; this.stats.restT += dt; }
      else if (this.mode === 'rest') { this.stats.restT += dt; p.mx = p.my = 0; return; }
      else {
        const foe = chaser || tgtMob;
        if (foe) {
          tx = foe.x; ty = foe.y;
          if (chaser) this.stats.fightT += dt; else this.stats.travelT += dt;
          if (this.kiteNow(chaser, cd, reach)) away = chaser;
        } else {
          this.stats.travelT += dt;
          const g = this.wanderGoal(kind);
          tx = g.x; ty = g.y;
        }
      }
    }
    if (away) { this.apply(p.x + (p.x - away.x), p.y + (p.y - away.y), avoid); return; }
    if (tx === null) { p.mx = p.my = 0; return; }
    // chegou perto o bastante do alvo? para e deixa as armas trabalharem
    const tm = chaser || tgtMob || nearest;
    const dd = Math.hypot(tx - p.x, ty - p.y);
    const want = this.standOff(tm);
    if (tm && tx === tm.x && dd - tm.r - p.r <= want) { p.mx = p.my = 0; return; }
    this.apply(tx, ty, avoid);
  }

  // recua quando um monstro lento chega perto demais (só quem tem arma de longe)
  kiteNow(chaser, cd, reach) {
    return !!(this.o.kite !== false && this.isRanged() && chaser && cd < Math.max(55, reach * 0.22) && chaser.def.speed < PLAYER_SPEED * 0.85 && !this.p.slowT);
  }

  chooseKindCached(dt) {
    this.kindT -= dt;
    if (this.kindT <= 0) { this.kind = this.chooseKind(); this.kindT = 1.5; }
    return this.kind;
  }
  // distância ideal até o alvo: corpo a corpo encosta, de longe fica no alcance
  standOff(m) {
    if (!m) return 0;
    const r = this.reach();
    return r >= 200 ? r * 0.8 : r * 0.7;
  }
  wanderGoal(kind) {
    const room = this.room, p = this.p;
    if (!this.goal || room.now > this.goalT || Math.hypot(this.goal.x - p.x, this.goal.y - p.y) < 60) {
      const z = D.ZONES.find((zz) => zz.mob === kind) || D.ZONES[0];
      const W = D.WORLD, a = Math.random() * Math.PI * 2, nd = z.min + (z.max - z.min) * Math.random();
      this.goal = { x: W.cx + Math.cos(a) * nd * W.rx, y: W.cy + Math.sin(a) * nd * W.ry };
      this.goalT = room.now + 25;
    }
    return this.goal;
  }

  // vai na direção (tx,ty) desviando dos pontos de perigo
  apply(tx, ty, avoid) {
    const p = this.p;
    let vx = tx - p.x, vy = ty - p.y;
    const l = Math.hypot(vx, vy) || 1;
    vx /= l; vy /= l;
    for (const [m, rad, k] of avoid) {
      const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
      if (d < rad && d > 1) { const f = (1 - d / rad) * 2.2 * k; vx += (dx / d) * f; vy += (dy / d) * f; }
    }
    const n = Math.hypot(vx, vy) || 1;
    p.mx = vx / n; p.my = vy / n;
  }

  /* ---- dragão ---- */
  bossReady() {
    // só entra na toca com equipamento decente (pelo menos um par de armas de faixa 4+) e vida cheia
    if (this.bossGo) return true;
    const p = this.p;
    const strong = p.active.filter((a) => a.item.tier >= (this.o.bossTier || 4)).length >= 1;
    if (strong && p.hp >= p.maxHp * 0.95) this.bossGo = true;
    return this.bossGo;
  }
  bossMove(boss, hpf, chaser) {
    const p = this.p, room = this.room;
    if (hpf < this.o.flee && boss.state === 1) { // sai de perto e espera curar
      this.bossGo = false;
      return { x: p.x + (p.x - boss.x), y: p.y + (p.y - boss.y) };
    }
    // desvia dos avisos de ataque
    const c = boss.cast;
    if (c && this.dodgeChance(c)) {
      const dx = p.x - boss.x, dy = p.y - boss.y, d = Math.hypot(dx, dy) || 1;
      if (c.kind === 1) { // pancada no chão: sai da área
        const R = boss.def.slam.radius + p.r + 25;
        if (d < R) return { x: p.x + (dx / d) * 200, y: p.y + (dy / d) * 200 };
      } else { // sopro: sai do cone (anda de lado)
        const S2 = boss.def.breath;
        const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
        const along = dx * ca + dy * sa, lat = -dx * sa + dy * ca;
        if (along > -boss.r && along < S2.range + 60 && Math.abs(lat) < Math.tan(S2.width / 2) * Math.max(along, 60) + p.r + 40) {
          const sgn = lat >= 0 ? 1 : -1;
          return { x: p.x + -sa * sgn * 200, y: p.y + ca * sgn * 200 };
        }
      }
    }
    const reach = this.reach();
    const ideal = reach >= 200 ? reach * 0.85 : reach * 0.75;
    const d = dist(p, boss) - boss.r - p.r;
    if (d > ideal + 25) return { x: boss.x, y: boss.y };
    if (reach >= 200 && d < ideal * 0.5 && boss.state === 1) return { x: p.x + (p.x - boss.x), y: p.y + (p.y - boss.y) };
    p.mx = p.my = 0;
    return { x: p.x, y: p.y, stay: true };
  }
  dodgeChance(c) {
    // reação humana: só começa a desviar depois de reactBoss segundos de aviso; skill decide se percebe
    const total = c.kind === 1 ? this.room.boss.def.slam.wind : this.room.boss.def.breath.wind;
    if (total - c.t < this.o.reactBoss) return false;
    return this.dodgeSeedFor(c) < this.o.dodge;
  }
  dodgeSeedFor(c) {
    if (c !== this.lastCast) { this.lastCast = c; this.lastRoll = Math.random(); }
    return this.lastRoll;
  }
}

module.exports = { Bot, bestEquip, weaponDps, HUNT };
