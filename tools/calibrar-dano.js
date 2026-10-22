'use strict';
// Confere o teto de dano por golpe (veja MIN_HITS em game-data.js) e sugere os multiplicadores máximos de cada arma.
// Uso: node tools/calibrar-dano.js
// Para cada arma e faixa 1 a 5, no atributo esperado (REF_ATTR), mostra o maior golpe (básico, habilidade e habilidade fundida, +50%)
// em % do teto: acima de 100% a arma passa do limite. A faixa 6 (mítica) é medida contra a aranha-véu e só a habilidade fundida pode passar
// um pouco do teto; o dragão fica de fora da regra.
const D = require('../game-data.js');
const FUSE = 1.5;
let bad = 0;
const rows = [];
Object.keys(D.FAMILIES).forEach((fam) => {
  const F = D.FAMILIES[fam];
  if (!F.cls || fam === 'faca') return; // a faca inicial não tem faixas
  let bMax = Infinity, sMax = Infinity, worstB = 0, worstS = 0;
  for (let t = 1; t <= 6; t++) {
    const st = { str: 0, dex: 0, man: 0, hlt: 0 };
    st[F.attr === 'best' ? 'str' : F.attr] = D.REF_ATTR[t - 1];
    const cap = D.hitCap(t, F.cls), item = D.ITEMS[fam + '_' + t];
    if (!item) continue;
    const b = D.weaponDamage(item, st), s0 = D.skillDamage(item, st), s = s0 * FUSE;
    worstB = Math.max(worstB, b / cap, s0 / cap); if (t <= 5) worstS = Math.max(worstS, s / cap);
    const unit = (4 + D.REF_ATTR[t - 1]) * D.TIER_MULT[t - 1];
    bMax = Math.min(bMax, cap / unit); sMax = Math.min(sMax, cap / unit / (t <= 5 ? FUSE : 1));
  }
  if (worstB > 1 || worstS > 1) bad++;
  rows.push({ arma: fam, golpes_min: D.MIN_HITS[F.cls], 'mult básico': F.mult, 'máx básico': +bMax.toFixed(2), 'mult habilidade': F.skill ? F.skill.mult : '-', 'máx habilidade': F.skill ? +sMax.toFixed(2) : '-', 'maior golpe %': Math.round(worstB * 100), 'maior fundida (faixas 1-5) %': F.skill ? Math.round(worstS * 100) : '-' });
});
console.table(rows);
console.log(bad ? bad + ' arma(s) passam do teto.' : 'Todas as armas respeitam o teto.');
process.exit(bad ? 1 : 0);
