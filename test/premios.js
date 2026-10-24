'use strict';
// Testes dos prêmios semanais: vencedores da semana passada, resgate de skins e códigos de rede dos novos efeitos.
const fs = require('fs');
const os = require('os');
const path = require('path');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-prem-'));
process.env.DATA_DIR = path.join(TMP, 'jogo');
const { FileStore } = require('../accounts');
const R = require('../ranking');
const D = require('../game-data');

let oks = 0, fails = 0;
function ok(c, msg) { if (c) { oks++; console.log('  ok  ', msg); } else { fails++; console.log('  FALHA', msg); } }
const mkAcc = async (store, n) => (await store.insert({ email: n + '@teste.com', pass: 'x', verified: true, created: Date.now(), save: null, saveAt: 0, code: null })).id;
const WEEK = 7 * 86400000;

(async () => {
  console.log('Prêmios semanais');
  const store = new FileStore(path.join(TMP, 'dados'));
  await store.init();
  const [a, b, c] = [await mkAcc(store, 'a'), await mkAcc(store, 'b'), await mkAcc(store, 'c')];
  let t = Date.UTC(2026, 9, 14, 15); // quarta-feira
  const rk = R.create(store, { now: () => t, cacheMs: 0 });
  await rk.load();
  rk.touch(a, 'Ana'); rk.touch(b, 'Bia'); rk.touch(c, 'Caio');

  ok(rk.claimable(a).length === 0 && rk.boards(a).prizes.winners.every((w) => !w.name), 'sem semana anterior, ninguém tem prêmio');
  // semana atual: Bia faz mais abates no PvP e no clássico; Ana derruba o dragão mais rápido no coop e no clássico
  rk.modeKill(b, 'x1'); rk.modeKill(b, 'x2'); rk.modeKill(a, 'x3');
  rk.pvpKill(b, 'y1'); rk.pvpKill(b, 'y2'); rk.pvpKill(c, 'y3');
  rk.coopKill(a, 300); rk.coopKill(b, 420);
  rk.dragonKill(a, 200); rk.dragonKill(c, 250);
  ok(rk.claimable(a).length === 0, 'durante a semana ainda não há prêmio para resgatar');

  t += WEEK; // semana seguinte
  ok(rk.claimable(b).sort().join() === 'pvp,pvpm', 'Bia fechou 1ª nos abates (PvP e clássico)');
  ok(rk.claimable(a).sort().join() === 'coop,dragon', 'Ana fechou 1ª nos tempos de dragão (coop e clássico)');
  ok(rk.claimable(c).length === 0, 'quem não ficou em 1º não tem prêmio');
  const pz = rk.boards(b).prizes;
  ok(pz.winners.find((w) => w.board === 'pvpm').me === true && pz.winners.find((w) => w.board === 'coop').name === 'Ana', 'a lista mostra o vencedor de cada ranking e marca quem pede');

  // jogar na semana nova não apaga o direito ao prêmio da semana que passou
  rk.modeKill(c, 'z1'); rk.coopKill(c, 100);
  ok(rk.claimable(a).sort().join() === 'coop,dragon' && rk.claimable(c).length === 0, 'pontuar na semana nova não mexe nos vencedores da semana passada');
  // sobrevive a gravar e reabrir
  await rk.flush();
  const rk2 = R.create(store, { now: () => t, cacheMs: 0 }); await rk2.load();
  ok(rk2.claimable(a).sort().join() === 'coop,dragon', 'os vencedores continuam depois de reabrir o armazenamento');
  t += WEEK; // duas semanas depois: o prazo acabou
  ok(rk2.claimable(a).length === 0, 'duas semanas depois o prêmio já não está disponível');

  // dados
  ok(Object.keys(D.WEEK_PRIZES).sort().join() === 'coop,dragon,pvp,pvpm' && Object.values(D.WEEK_PRIZES).every((p) => D.SKINS[p.skin] && D.SKINS[p.skin].prize), 'cada ranking tem uma skin de prêmio que existe');
  ok(D.SKINS.dragao.slot === 'head' && D.SKINS.dragao_ouro.slot === 'head' && D.SKINS.lapide.slot === 'kill' && D.SKINS.lapide_ouro.slot === 'kill', 'dragões são chapéus e lápides são efeitos de abate');
  const both = { head: 'dragao_ouro', kill: 'lapide_ouro' }, n = D.skinCode(both), back = D.skinDecode(n);
  ok(back.head === 'dragao_ouro' && back.kill === 'lapide_ouro', 'chapéu e lápide viajam juntos no mesmo número de rede');
  ok(!Object.values(D.SKIN_PACKS).some((p) => p.skins.some((id) => D.SKINS[id].prize)), 'prêmios não estão à venda em nenhum pacote');
  const clean = D.skinClean({ head: 'lapide', kill: 'dragao' }, ['lapide', 'dragao']);
  ok(clean.head === null && clean.kill === null, 'skin no lugar errado é recusada');

  console.log(fails ? '\n' + fails + ' falha(s)' : '\nTudo certo (' + oks + ' verificações)');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
