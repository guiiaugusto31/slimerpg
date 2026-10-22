'use strict';
// SlimeRPG — rankings, guardados no servidor (no mesmo armazenamento das contas, em accounts.js).
//
// Dois rankings, os dois só para quem joga com conta (o progresso do navegador pode ser editado; o do servidor, não):
//  - PvP: quem já chegou ao nível 20 ("coroados"), por abates de jogadores.
//  - Dragão: quem derrotou o Dragão ancestral, pelo menor tempo de jogo (tempo conectado, somado entre as sessões) até a 1ª vitória.
// O tempo de jogo e as contagens vivem aqui, não no save do jogador, então importar o save do navegador não adianta nada.
//
// Uma linha por conta: { acc, name, crowned, pvp, play, wins, dragon }
//   crowned: quando chegou ao nível 20 (ms) ou 0 | pvp: abates de jogadores | play: segundos de jogo
//   wins: vezes que derrotou o dragão | dragon: { play, fight, at } da 1ª vitória (play = tempo de jogo na hora, fight = duração da luta) ou null

const MAX_ROWS = 50;               // linhas de cada ranking na tela
const REPEAT_MS = 5 * 60000;       // matar a mesma vítima de novo dentro deste prazo não soma (evita farmar uma segunda conta)

function num(v, max) { v = Number(v); return v > 0 && isFinite(v) ? Math.min(max, v) : 0; }
function norm(r) {
  const d = r.dragon && typeof r.dragon === 'object' ? { play: num(r.dragon.play, 1e9), fight: num(r.dragon.fight, 1e9), at: num(r.dragon.at, 1e15) } : null;
  return {
    acc: r.acc, name: String(r.name || 'Slime').slice(0, 14), crowned: num(r.crowned, 1e15), pvp: Math.floor(num(r.pvp, 1e9)),
    play: num(r.play, 1e9), wins: Math.floor(num(r.wins, 1e9)), dragon: d
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
    r.pvp++; mark(r);
    return true;
  }
  // derrotou o dragão. Devolve a vitória registrada se foi a primeira (o melhor tempo de uma conta é sempre o da 1ª vitória, o tempo de jogo só cresce).
  function dragonKill(acc, fightSec) {
    const r = row(acc); if (!r) return null;
    r.wins++;
    let first = null;
    if (!r.dragon) { r.dragon = { play: r.play, fight: Math.max(0, fightSec || 0), at: now() }; first = r.dragon; }
    mark(r);
    return first;
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
    return { pvp, dragon, posPvp, posDragon };
  }
  // Listas públicas (sem e-mail nem número de conta). viewer: id da conta de quem pede (marca a linha dele e diz a posição).
  function boards(viewer) {
    const t = now();
    if (!cache || cacheVer !== version && t - cacheAt >= cacheMs) { cache = build(); cacheAt = t; cacheVer = version; }
    const c = cache;
    const out = {
      pvp: c.pvp.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, kills: r.pvp, me: r.acc === viewer })),
      dragon: c.dragon.slice(0, MAX_ROWS).map((r, i) => ({ n: i + 1, name: r.name, play: Math.round(r.dragon.play), fight: Math.round(r.dragon.fight), wins: r.wins, me: r.acc === viewer })),
      total: { crowned: c.pvp.length, dragon: c.dragon.length }
    };
    const me = viewer === null || viewer === undefined ? null : rows.get(viewer);
    if (me) {
      out.you = {
        name: me.name, crowned: !!me.crowned, kills: me.pvp, posPvp: c.posPvp.get(me.acc) || 0,
        dragon: me.dragon ? { play: Math.round(me.dragon.play), fight: Math.round(me.dragon.fight) } : null, posDragon: c.posDragon.get(me.acc) || 0, play: Math.round(me.play)
      };
    }
    return out;
  }

  return { load, touch, addPlay, crowned, pvpKill, dragonKill, forget, flush, boards, rows, REPEAT_MS };
}

module.exports = { create, MAX_ROWS, REPEAT_MS };
