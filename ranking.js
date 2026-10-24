'use strict';
// SlimeRPG — rankings, guardados no servidor (no mesmo armazenamento das contas, em accounts.js).
//
// Dois rankings, os dois só para quem joga com conta (o progresso do navegador pode ser editado; o do servidor, não):
//  - PvP: quem já chegou ao nível 20 ("coroados"), por abates de jogadores.
//  - Dragão: quem derrotou o Dragão ancestral, pelo menor tempo de jogo (tempo conectado, somado entre as sessões) até a 1ª vitória.
// O tempo de jogo e as contagens vivem aqui, não no save do jogador, então importar o save do navegador não adianta nada.
//
// Rankings por modo de jogo (game-data MODES): Clássico usa os dois acima (PvP e Dragão); PvP tem o ranking de abates (pk, de qualquer nível);
// Cooperativo tem o menor tempo de luta até derrubar o dragão (cp, em segundos; vale o tempo do cronômetro da sala).
// Uma linha por conta: { acc, name, crowned, pvp, play, wins, dragon, pk, cp, cw }
//   crowned: quando chegou ao nível 20 (ms) ou 0 | pvp: abates de jogadores | play: segundos de jogo
//   wins: vezes que derrotou o dragão | dragon: { play, fight, at } da 1ª vitória (play = tempo de jogo na hora, fight = duração da luta) ou null

const MAX_ROWS = 50;               // linhas de cada ranking na tela
const REPEAT_MS = 5 * 60000;       // matar a mesma vítima de novo dentro deste prazo não soma (evita farmar uma segunda conta)

function num(v, max) { v = Number(v); return v > 0 && isFinite(v) ? Math.min(max, v) : 0; }
const DAY = 86400000;
// Semana do ranking: de segunda 00:00 a domingo 23:59, no horário de Brasília (UTC-3). id = número da semana; 1970-01-01 foi uma quinta-feira.
function weekId(t) { return Math.floor((Math.floor((t - 3 * 3600000) / DAY) + 3) / 7); }
function weekEnd(id) { return ((id + 1) * 7 - 3) * DAY + 3 * 3600000; } // instante (ms) em que a semana id termina
function best(o) { return o && typeof o === 'object' ? { fight: num(o.fight, 1e9), at: num(o.at, 1e15) } : null; }
function normWeek(w) {
  w = w && typeof w === 'object' ? w : {};
  return { id: Math.floor(num(w.id, 1e9)), pvp: Math.floor(num(w.pvp, 1e9)), pk: Math.floor(num(w.pk, 1e9)), dg: best(w.dg), dw: Math.floor(num(w.dw, 1e9)), cp: best(w.cp), cw: Math.floor(num(w.cw, 1e9)) };
}
function norm(r) {
  const d = r.dragon && typeof r.dragon === 'object' ? { play: num(r.dragon.play, 1e9), fight: num(r.dragon.fight, 1e9), at: num(r.dragon.at, 1e15) } : null;
  return {
    acc: r.acc, name: String(r.name || 'Slime').slice(0, 14), crowned: num(r.crowned, 1e15), pvp: Math.floor(num(r.pvp, 1e9)),
    play: num(r.play, 1e9), wins: Math.floor(num(r.wins, 1e9)), dragon: d,
    pk: Math.floor(num(r.pk, 1e9)), // modo PvP: abates de jogadores
    cp: r.cp && typeof r.cp === 'object' ? { fight: num(r.cp.fight, 1e9), at: num(r.cp.at, 1e15) } : null, cw: Math.floor(num(r.cw, 1e9)), // modo cooperativo: melhor tempo de luta contra o dragão e vitórias
    pw: r.pw && typeof r.pw === 'object' ? normWeek(r.pw) : null, // placar da semana passada (para os prêmios: quem fechou em 1º resgata a skin)
    wk: normWeek(r.wk) // placar da semana (zera na segunda-feira): { id, pvp, pk, dg: {fight,at}, dw, cp: {fight,at}, cw }
  };
}

// opts: now (relógio em ms, só para testes), cacheMs (quanto tempo a lista montada vale; 2 s por padrão)
function create(store, opts) {
  opts = opts || {};
  const now = opts.now || Date.now;
  const cacheMs = opts.cacheMs === undefined ? 2000 : opts.cacheMs;
  const rows = new Map(), dirty = new Set(), recent = new Map();
  let cache = null, cacheAt = 0, version = 0, cacheVer = -1;

  const touchVer = () => { version++; };
  function row(acc, make) {
    let r = rows.get(acc);
    if (!r && make) { r = norm({ acc }); rows.set(acc, r); }
    return r || null;
  }
  const mark = (r) => { dirty.add(r.acc); touchVer(); };
  const curWeek = () => weekId(now());
  function wk(r) {
    const id = curWeek();
    if (r.wk.id !== id) { r.pw = r.wk.id === id - 1 ? r.wk : null; r.wk = normWeek({ id }); } // a semana que acabou fica guardada por mais uma semana
    return r.wk;
  }
  const weekOf = (r, id) => (r.wk.id === id ? r.wk : r.pw && r.pw.id === id ? r.pw : null);
  // Vencedores de uma semana: o 1º de cada ranking semanal (mesmos critérios das listas)
  function winnersOf(all, id) {
    const pick = (ok, better) => {
      let top = null;
      for (const r of all) { const w = weekOf(r, id); if (!w || !ok(w)) continue; if (!top || better(w, top.w) || (!better(top.w, w) && r.acc < top.r.acc)) top = { r, w }; }
      return top ? { acc: top.r.acc, name: top.r.name } : null;
    };
    return {
      pvp: pick((w) => w.pvp > 0, (a, b) => a.pvp > b.pvp),
      pvpm: pick((w) => w.pk > 0, (a, b) => a.pk > b.pk),
      dragon: pick((w) => !!w.dg, (a, b) => a.dg.fight < b.dg.fight || (a.dg.fight === b.dg.fight && a.dg.at < b.dg.at)),
      coop: pick((w) => !!w.cp, (a, b) => a.cp.fight < b.cp.fight || (a.cp.fight === b.cp.fight && a.cp.at < b.cp.at))
    };
  }
  // Prêmios que a conta pode resgatar agora: os rankings em que ela fechou a semana passada em 1º lugar
  function claimable(acc) {
    const pid = curWeek() - 1, win = winnersOf([...rows.values()], pid), out = [];
    for (const k of Object.keys(win)) if (win[k] && win[k].acc === acc) out.push(k);
    return out;
  } // semana nova: o placar da semana recomeça do zero

  async function load() {
    for (const r of await store.hallAll()) if (r && typeof r.acc === 'number' && !rows.has(r.acc)) rows.set(r.acc, norm(r));
    touchVer();
  }

  /* ---- eventos do jogo (todos ignoram contas que não existem mais) ---- */
  function touch(acc, name) { // entrou no jogo: cria a linha e guarda o nome que ela usa agora
    const r = row(acc, true);
    r.name = String(name || 'Slime').slice(0, 14);
    mark(r);
  }
  function addPlay(acc, sec) { const r = row(acc); if (r) { r.play += sec; dirty.add(acc); } }
  function crowned(acc) { const r = row(acc); if (r && !r.crowned) { r.crowned = now(); mark(r); } }
  // abate de jogador; victimKey identifica a vítima (conta ou visitante). Devolve true se contou.
  function pvpKill(acc, victimKey) {
    const r = row(acc); if (!r) return false;
    const t = now(), k = acc + '>' + victimKey, last = recent.get(k);
    if (last !== undefined && t - last < REPEAT_MS) return false;
    recent.set(k, t);
    if (recent.size > 5000) for (const [kk, v] of recent) if (t - v >= REPEAT_MS) recent.delete(kk);
    r.pvp++; wk(r).pvp++; mark(r);
    return true;
  }
  // derrotou o dragão. Devolve a vitória registrada se foi a primeira (o melhor tempo de uma conta é sempre o da 1ª vitória, o tempo de jogo só cresce).
  function dragonKill(acc, fightSec) {
    const r = row(acc); if (!r) return null;
    r.wins++;
    let first = null;
    if (!r.dragon) { r.dragon = { play: r.play, fight: Math.max(0, fightSec || 0), at: now() }; first = r.dragon; }
    const w = wk(r), f0 = Math.max(1, fightSec || 1); w.dw++;
    if (!w.dg || f0 < w.dg.fight) w.dg = { fight: f0, at: now() };
    mark(r);
    return first;
  }
  // abate no modo PvP (qualquer nível; a mesma vítima só conta de novo depois de REPEAT_MS)
  function modeKill(acc, victimKey) {
    const r = row(acc); if (!r) return false;
    const t = now(), k = 'm' + acc + '>' + victimKey, last = recent.get(k);
    if (last !== undefined && t - last < REPEAT_MS) return false;
    recent.set(k, t);
    r.pk++; wk(r).pk++; mark(r);
    return true;
  }
  // dragão derrubado no modo cooperativo: guarda o melhor (menor) tempo de luta da conta. Devolve true se foi recorde pessoal.
  function coopKill(acc, fightSec) {
    const r = row(acc); if (!r) return false;
    const f = Math.max(1, fightSec || 1);
    r.cw++;
    const best = !r.cp || f < r.cp.fight;
    if (best) r.cp = { fight: f, at: now() };
    const w = wk(r); w.cw++;
    if (!w.cp || f < w.cp.fight) w.cp = { fight: f, at: now() };
    mark(r);
    return best;
  }
  function forget(acc) { rows.delete(acc); dirty.delete(acc); touchVer(); }

  /* ---- gravação ---- */
  async function flush(only) {
    const ids = only === undefined ? [...dirty] : (dirty.has(only) ? [only] : []);
    for (const id of ids) {
      const r = rows.get(id);
      dirty.delete(id);
      if (!r) continue;
      try { await store.hallPut(r); } catch (e) { dirty.add(id); console.error('Ranking: falha ao gravar a conta ' + id + ': ' + e.message); }
    }
  }

  /* ---- listas ---- */
  function build() {
    const all = [...rows.values()];
    const pvp = all.filter((r) => r.crowned).sort((a, b) => b.pvp - a.pvp || a.crowned - b.crowned || a.acc - b.acc);
    const dragon = all.filter((r) => r.dragon).sort((a, b) => a.dragon.play - b.dragon.play || a.dragon.at - b.dragon.at || a.acc - b.acc);
    const posPvp = new Map(pvp.map((r, i) => [r.acc, i + 1])), posDragon = new Map(dragon.map((r, i) => [r.acc, i + 1]));
    const pvpm = all.filter((r) => r.pk > 0).sort((a, b) => b.pk - a.pk || a.acc - b.acc);
    const coop = all.filter((r) => r.cp).sort((a, b) => a.cp.fight - b.cp.fight || a.cp.at - b.cp.at || a.acc - b.acc);
    const posPvpm = new Map(pvpm.map((r, i) => [r.acc, i + 1])), posCoop = new Map(coop.map((r, i) => [r.acc, i + 1]));
    // placar da semana: só quem pontuou na semana atual
    const wid = curWeek(), cur = all.filter((r) => r.wk.id === wid);
    const wpvp = cur.filter((r) => r.wk.pvp > 0).sort((a, b) => b.wk.pvp - a.wk.pvp || a.acc - b.acc);
    const wdragon = cur.filter((r) => r.wk.dg).sort((a, b) => a.wk.dg.fight - b.wk.dg.fight || a.wk.dg.at - b.wk.dg.at || a.acc - b.acc);
    const wpvpm = cur.filter((r) => r.wk.pk > 0).sort((a, b) => b.wk.pk - a.wk.pk || a.acc - b.acc);
    const wcoop = cur.filter((r) => r.wk.cp).sort((a, b) => a.wk.cp.fight - b.wk.cp.fight || a.wk.cp.at - b.wk.cp.at || a.acc - b.acc);
    const pos = (l) => new Map(l.map((r, i) => [r.acc, i + 1]));
    const prev = winnersOf(all, wid - 1);
    return { prev, pvp, dragon, posPvp, posDragon, pvpm, coop, posPvpm, posCoop, wid, wpvp, wdragon, wpvpm, wcoop, wPos: { pvp: pos(wpvp), dragon: pos(wdragon), pvpm: pos(wpvpm), coop: pos(wcoop) } };
  }
  // Listas públicas (sem e-mail nem número de conta). viewer: id da conta de quem pede (marca a linha dele e diz a posição).
  function boards(viewer) {
    const t = now();
    if (!cache || cache.wid !== curWeek() || cacheVer !== version && t - cacheAt >= cacheMs) { cache = build(); cacheAt = t; cacheVer = version; }
    const c = cache;
    const out = {
      pvp: c.pvp.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, kills: r.pvp, me: r.acc === viewer })),
      dragon: c.dragon.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, play: Math.round(r.dragon.play), fight: Math.round(r.dragon.fight), wins: r.wins, me: r.acc === viewer })),
      pvpm: c.pvpm.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, kills: r.pk, me: r.acc === viewer })),
      coop: c.coop.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, fight: Math.round(r.cp.fight), wins: r.cw, me: r.acc === viewer })),
      // vencedores da semana que passou (quem fechou em 1º resgata a skin na loja)
      prizes: { week: c.wid - 1, winners: ['coop', 'pvpm', 'pvp', 'dragon'].map((k) => ({ board: k, name: c.prev[k] ? c.prev[k].name : null, me: !!c.prev[k] && c.prev[k].acc === viewer })) },
      total: { crowned: c.pvp.length, dragon: c.dragon.length, pvpm: c.pvpm.length, coop: c.coop.length },
      // semanal (zera na segunda-feira 00:00, horário de Brasília): mesmos quatro rankings; no do dragão vale o tempo de luta
      week: {
        endsIn: Math.max(0, Math.round((weekEnd(c.wid) - t) / 1000)),
        pvp: c.wpvp.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, kills: r.wk.pvp, me: r.acc === viewer })),
        pvpm: c.wpvpm.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, kills: r.wk.pk, me: r.acc === viewer })),
        dragon: c.wdragon.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, fight: Math.round(r.wk.dg.fight), wins: r.wk.dw, me: r.acc === viewer })),
        coop: c.wcoop.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, fight: Math.round(r.wk.cp.fight), wins: r.wk.cw, me: r.acc === viewer }))
      }
    };
    const me = viewer === null || viewer === undefined ? null : rows.get(viewer);
    if (me) {
      out.you = {
        name: me.name, crowned: !!me.crowned, kills: me.pvp, posPvp: c.posPvp.get(me.acc) || 0,
        dragon: me.dragon ? { play: Math.round(me.dragon.play), fight: Math.round(me.dragon.fight) } : null, posDragon: c.posDragon.get(me.acc) || 0, play: Math.round(me.play),
        pk: me.pk, posPvpm: c.posPvpm.get(me.acc) || 0, coop: me.cp ? { fight: Math.round(me.cp.fight) } : null, posCoop: c.posCoop.get(me.acc) || 0
      };
      const w = me.wk.id === c.wid ? me.wk : normWeek({});
      out.you.week = {
        pvp: w.pvp, posPvp: c.wPos.pvp.get(me.acc) || 0, pk: w.pk, posPvpm: c.wPos.pvpm.get(me.acc) || 0,
        dragon: w.dg ? Math.round(w.dg.fight) : 0, posDragon: c.wPos.dragon.get(me.acc) || 0, coop: w.cp ? Math.round(w.cp.fight) : 0, posCoop: c.wPos.coop.get(me.acc) || 0
      };
    }
    return out;
  }

  return { load, touch, addPlay, crowned, pvpKill, modeKill, dragonKill, coopKill, forget, flush, boards, claimable, rows, REPEAT_MS };
}

module.exports = { create, MAX_ROWS, REPEAT_MS };
