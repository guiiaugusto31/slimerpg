'use strict';
// Dados e regras do jogo, compartilhados entre servidor e cliente (o cliente recebe via /data.json).

const MAX_PLAYERS = 30;
const MAX_LEVEL = 20;

// Mapa elíptico. Dobrado em largura e altura (era 3600 x 2250).
const WORLD = { w: 14400, h: 9000 };
WORLD.cx = WORLD.w / 2;
WORLD.cy = WORLD.h / 2;
WORLD.rx = WORLD.w / 2 - 300;
WORLD.ry = WORLD.h / 2 - 240;
WORLD.wall = 0.93; // limite andável (fração da elipse): ali começa a muralha de árvores da borda; ninguém passa e nenhum monstro nasce além disso

// Faixas de nível das armas (3, 6, 10, 15 e 20): requisito de atributo, multiplicador e raridade.
// A faixa 6 (mítica) só vem do dragão: requisito logo acima da média de quem chega ao nível 20.
const TIER_REQ = [5, 11, 19, 29, 39, 40];
const TIER_MULT = [1, 1.5, 2.2, 3.2, 4.5, 6.3];
const TIER_NAMES = ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária', 'Mítica'];          // feminino (arma, espada...)
const TIER_NAMES_M = ['Comum', 'Incomum', 'Raro', 'Épico', 'Lendário', 'Mítico'];        // masculino (peitoral, martelo...)
const TIER_COLORS = ['#b8c0c4', '#6fd16f', '#4aa3ff', '#b06cff', '#ffb020', '#ff4f6a'];
const MYTHIC_TIER = 6;

const ATTRS = ['str', 'dex', 'man', 'hlt'];
const POINTS_PER_LEVEL = 0; // não há mais pontos para distribuir: a cada nível rola-se 1d3 em cada atributo (média 2)
const LEVEL_DIE = 3;        // dado do nível: 1d3 para Força, Destreza, Mana e Saúde
const ATTR_MAX = 60;        // máximo em um único atributo
const ATTR_NAMES = { str: 'Força', dex: 'Destreza', man: 'Mana', hlt: 'Saúde', best: 'Maior atributo' };

// Os dois primeiros níveis são rápidos: 1 cogumelo (5 XP) leva ao nível 2 e mais 2 cogumelos levam ao nível 3.
const XP_EARLY = [5, 10];
// Ritmo da subida (xpK: XP base por nível; xpSteep: quanto a curva fica mais íngreme a partir do nível 8).
const TUNE = { xpK: 15, xpSteep: 0 };
function totalXp(level, xp) { let t = xp || 0; for (let l = 1; l < level; l++) t += xpNeed(l); return t; } // XP acumulado de quem está no nível `level` com `xp` no nível atual
function xpNeed(level) {
  if (level >= 1 && level <= XP_EARLY.length) return XP_EARLY[level - 1];
  return Math.floor(TUNE.xpK * Math.pow(level, 1.5) * (1 + TUNE.xpSteep * Math.max(0, level - 8)));
}

// atk: como o ataque básico funciona
//  single: um alvo | splash: alvo + área | arc: todos num arco | ring: ao redor | proj: projétil | orb: orbe lento com área
// skill.kind: burst | cone | dash | volley | bolt
const FAMILIES = {
  faca: {
    cls: 'fm', name: 'Faca', attr: 'best', type: 'phys', atk: 'single', range: 50, cd: 0.6, mult: 1, skill: null,
    skillNames: [], color: '#c9d3d8'
  },
  martelo: {
    cls: 'sm', name: 'Martelo', attr: 'str', type: 'phys', atk: 'splash', range: 62, cd: 1.4, mult: 2.35, splash: 55,
    skill: { kind: 'burst', mult: 2.95, cd: 7, radius: 90, stun: 0.8 },
    skillNames: ['Pancada no chão', 'Tremor', 'Salto esmagador', 'Fissura', 'Terremoto'], color: '#8a7a64'
  },
  maca: {
    cls: 'sm', name: 'Maça', attr: 'str', type: 'phys', atk: 'single', range: 54, cd: 1.1, mult: 2.55, stunChance: 0.18,
    skill: { kind: 'burst', mult: 2.95, cd: 5.5, radius: 75, stun: 1.6 },
    skillNames: ['Golpe atordoante', 'Quebra-escudo', 'Onda de impacto', 'Pancada sísmica', 'Julgamento'], color: '#6f7d86'
  },
  espada: {
    cls: 'sm', name: 'Espada', attr: 'str', type: 'phys', atk: 'arc', range: 74, cd: 0.9, mult: 1.75, arcAng: 1.9,
    skill: { kind: 'cone', mult: 2.95, cd: 5, range: 125, angle: 2.3 },
    skillNames: ['Corte em arco', 'Corte duplo', 'Lâmina giratória', 'Onda cortante', 'Tempestade de lâminas'], color: '#b9c6cf'
  },
  rapieira: {
    cls: 'fm', name: 'Rapieira', attr: 'dex', type: 'phys', atk: 'single', range: 58, cd: 0.45, mult: 1.25,
    skill: { kind: 'dash', mult: 1.75, cd: 4.5, dist: 190 },
    skillNames: ['Estocada', 'Investida', 'Sequência de estocadas', 'Passo-sombra', 'Chuva de estocadas'], color: '#d8dde0'
  },
  arco: {
    cls: 'fr', name: 'Arco', attr: 'dex', type: 'phys', atk: 'proj', range: 330, cd: 0.65, mult: 1.55, projSpeed: 540,
    skill: { kind: 'volley', mult: 1.25, cd: 5.5, count: 3, spread: 0.24, reach: 380 },
    skillNames: ['Tiro duplo', 'Flecha perfurante', 'Chuva de flechas', 'Flecha explosiva', 'Tempestade de flechas'], color: '#8a5a2b'
  },
  chicote: {
    cls: 'fm', name: 'Chicote', attr: 'dex', type: 'phys', atk: 'arc', range: 125, cd: 0.6, mult: 0.95, arcAng: 2.6,
    skill: { kind: 'cone', mult: 1.75, cd: 5, range: 165, angle: 3.8 },
    skillNames: ['Chicotada', 'Laço', 'Giro de chicote', 'Chicote de espinhos', 'Tempestade de açoites'], color: '#6b4a2e'
  },
  varinha: {
    cls: 'fr', name: 'Varinha', attr: 'man', type: 'magic', atk: 'proj', range: 270, cd: 0.5, mult: 1.55, projSpeed: 620,
    skill: { kind: 'bolt', mult: 1.25, cd: 5, reach: 380, radius: 16, speed: 640 },
    skillNames: ['Faísca', 'Raio duplo', 'Bola de fogo', 'Corrente de raios', 'Meteoro'], color: '#4fe08a'
  },
  cajado: {
    cls: 'sr', name: 'Cajado', attr: 'man', type: 'magic', atk: 'orb', range: 310, cd: 1.2, mult: 2.05, projSpeed: 360, aoe: 65,
    skill: { kind: 'burst', mult: 1.75, cd: 7, radius: 120, stun: 0 },
    skillNames: ['Orbe arcano', 'Chuva de orbes', 'Escudo arcano', 'Nova de energia', 'Singularidade'], color: '#5aa8ff'
  },
  sinos: {
    cls: 'sm', name: 'Sinos', attr: 'man', type: 'magic', atk: 'ring', range: 110, cd: 0.9, mult: 1.05,
    skill: { kind: 'burst', mult: 2.95, cd: 6.5, radius: 115, stun: 0, heal: 0.18 },
    skillNames: ['Repique', 'Repique atordoante', 'Cura em área', 'Onda sonora', 'Sinfonia'], color: '#e0b04a'
  }
};

// Teto de dano por golpe. Nenhum golpe de uma arma (básico, habilidade ou habilidade fundida, que dá +50%) passa de 1/N da vida do
// monstro da faixa dela, então o monstro de faixa equivalente leva pelo menos N golpes para morrer:
//   fm = corpo a corpo rápida (1/5) | sm = corpo a corpo lenta (1/3) | fr = à distância rápida (1/7) | sr = à distância lenta (1/5)
// Quem calibra é o multiplicador (mult e skill.mult), não uma trava no código: o dano sobe com o atributo da arma (em média cerca de 2 por nível se o jogador espalhar os
// 8 pontos por nível; concentrando, vai até ATTR_MAX), e a vida do monstro sobe junto com a faixa. REF_ATTR é o atributo esperado no fim do uso de cada faixa
// (1 a 6). A faixa mítica usa a aranha-véu (o monstro comum mais forte) e só a habilidade fundida passa um pouco do teto (cerca de 20%);
// o dragão fica de fora. Confira com `node tools/calibrar-dano.js` e com o teste de regras.
const MIN_HITS = { fm: 5, sm: 3, fr: 7, sr: 5 };
const REF_ATTR = [10, 18, 28, 38, 43, 44];

// Gênero do nome de cada arma (m, f ou p de plural) e a habilidade da faixa mítica.
const FAM_GENDER = { martelo: 'm', maca: 'f', espada: 'f', rapieira: 'f', arco: 'm', chicote: 'm', varinha: 'f', cajado: 'm', sinos: 'p' };
const MYTHIC_SKILL = {
  martelo: 'Cataclismo', maca: 'Veredito', espada: 'Lâmina do dragão', rapieira: 'Dança das chamas', arco: 'Flecha-dragão',
  chicote: 'Açoite ígneo', varinha: 'Chama primordial', cajado: 'Coração do dragão', sinos: 'Réquiem'
};
Object.keys(MYTHIC_SKILL).forEach((f) => FAMILIES[f].skillNames.push(MYTHIC_SKILL[f]));
function tierName(gender, tier) {
  const m = TIER_NAMES_M[tier - 1];
  return gender === 'f' ? TIER_NAMES[tier - 1] : gender === 'p' ? m + 's' : m;
}

// Peitorais: todos escalam com Saúde. hp = HP extra por ponto de Saúde; rp/rm = resistência física/mágica.
// O Dracônico é o único mítico: só existe na faixa 6, cai do dragão e junta vida com as duas resistências (res = % fixa, abaixo do teto).
const ARMORS = {
  vital: { name: 'Peitoral Vital', hp: 8, rp: 0, rm: 0, color: '#7a4a32' },
  arcano: { name: 'Peitoral Arcano', hp: 4, rp: 0, rm: 1, color: '#5a5fc4' },
  blindado: { name: 'Peitoral Blindado', hp: 4, rp: 1, rm: 0, color: '#8a939a' },
  draco: { name: 'Peitoral Dracônico', hp: 6, rp: 1, rm: 1, res: 42, tiers: [6], color: '#c0392b' }
};
const RES_PER_TIER = 8; // % de resistência por faixa
const RES_CAP = 60;

const ITEMS = {};
ITEMS.faca = { id: 'faca', kind: 'weapon', fam: 'faca', tier: 0, name: 'Faca', req: 0, attr: 'best' };
Object.keys(FAMILIES).forEach((fam) => {
  if (fam === 'faca') return;
  for (let t = 1; t <= MYTHIC_TIER; t++) {
    ITEMS[fam + '_' + t] = {
      id: fam + '_' + t, kind: 'weapon', fam, tier: t,
      name: FAMILIES[fam].name + ' ' + tierName(FAM_GENDER[fam], t), req: TIER_REQ[t - 1], attr: FAMILIES[fam].attr
    };
  }
});
ITEMS.vital_0 = { id: 'vital_0', kind: 'armor', type: 'vital', tier: 0, name: 'Casaca de Gelatina', req: 0, attr: 'hlt' };
Object.keys(ARMORS).forEach((type) => {
  (ARMORS[type].tiers || [1, 2, 3, 4, 5]).forEach((t) => {
    ITEMS[type + '_' + t] = {
      id: type + '_' + t, kind: 'armor', type, tier: t,
      name: ARMORS[type].name + ' ' + tierName('m', t), req: TIER_REQ[t - 1], attr: 'hlt'
    };
  });
});
const BASE_ITEMS = ['faca', 'vital_0']; // sempre disponíveis
const CATALOG_SIZE = Object.keys(ITEMS).length - BASE_ITEMS.length; // todos os outros itens aparecem na mochila, bloqueados até ganhar

// Monstros da floresta
const MOBS = {
  // hp/dmg calibrados com o simulador (tools/simular.js): um jogador com o equipamento da faixa mata o monstro do anel em ~7 s
  // e perde ~20% da vida na luta; sem o equipamento da faixa, a luta fica perigosa. Anéis mais fortes ficam mais perto do centro.
  cogumelo: { name: 'Cogumelo-fungo', hp: 30, dmg: 3, speed: 45, aggro: 110, r: 20, xp: 5, tier: 1, atkCd: 1.4, sp: { name: 'Esporos', shape: 'self', radius: 95, trigger: 80, wind: 0.8, cd: 6, mul: 1.3, slow: 2 } },
  coelho: { name: 'Coelho-musgo', hp: 278, dmg: 4, speed: 115, aggro: 150, r: 18, xp: 10, tier: 1, atkCd: 1.1, sp: { name: 'Pulo pesado', shape: 'leap', radius: 80, trigger: 190, wind: 0.7, cd: 5, mul: 1.6, stun: 0.5 } },
  lobo: { name: 'Lobo-raiz', hp: 440, dmg: 7, speed: 150, aggro: 150, r: 22, xp: 20, tier: 2, atkCd: 1.05, sp: { name: 'Mordida', shape: 'cone', range: 120, width: 1.4, trigger: 90, wind: 0.55, cd: 4.5, mul: 1.7 } },
  javali: { name: 'Javali-espinho', hp: 951, dmg: 15, speed: 140, aggro: 160, r: 28, xp: 46, tier: 3, atkCd: 1.2, sp: { name: 'Investida', shape: 'dash', range: 280, width: 0.5, trigger: 260, wind: 0.8, cd: 6, mul: 2, stun: 0.6 } },
  broto: { name: 'Broto ancião', hp: 1877, dmg: 32, speed: 65, aggro: 170, r: 34, xp: 72, tier: 4, atkCd: 1.4, sp: { name: 'Raízes', shape: 'ground', radius: 120, trigger: 220, wind: 1.0, cd: 7, mul: 1.6, stun: 0.9 } },
  aranha: { name: 'Aranha-véu', hp: 3300, dmg: 36, speed: 175, aggro: 170, r: 26, xp: 104, tier: 5, atkCd: 1.1, slow: 1.5, sp: { name: 'Tiro de teia', shape: 'shot', range: 380, width: 0.14, hitR: 30, trigger: 340, wind: 0.6, cd: 6, mul: 0.9, slow: 3.5 } },
  // Árvore anciã: guardiã do anel mais próximo do dragão. Lenta e pesada: mesma vida da aranha (o teto de dano da faixa 5 não muda), bate mais forte.
  arvore: { name: 'Árvore anciã', hp: 3300, dmg: 44, speed: 70, aggro: 180, r: 44, xp: 124, tier: 5, atkCd: 1.5, sp: { name: 'Galho pesado', shape: 'ground', radius: 135, core: 0.6, trigger: 260, wind: 1.2, cd: 8, mul: 2.2, stun: 1.0 } },
  // Chefe: dorme no centro e só age depois de levar golpes. Sopro de fogo e pancada no chão têm aviso antes de sair.
  dragao: {
    name: 'Dragão ancestral', hp: 75000, dmg: 200, speed: 120, aggro: 0, r: 80, xp: 1200, tier: 6, atkCd: 1.7, boss: true,
    breath: { dmg: 304, range: 420, width: 0.8, cd: 8, wind: 1.0 },
    slam: { dmg: 240, radius: 200, cd: 11, wind: 1.1 },
    calm: 10,    // segundos sem apanhar até ele voltar para casa e dormir
    regen: 0.04  // fração da vida por segundo enquanto dorme (o dobro ao voltar para casa)
  }
};
// O dragão fica no centro. Quem bater nele com pelo menos minShare da vida dele ganha uma arma mítica aleatória.
// minLevel: só quem está no nível máximo consegue machucá-lo. clear: raio da toca onde monstros comuns não nascem.
// leash: distância máxima até quem ele persegue. rage: abaixo dessa fração de vida ele fica mais rápido e agressivo.
// scale: cada jogador extra que o está machucando soma essa fração à vida dele (até scaleCap jogadores), para um grupo grande não passar por cima.
// armorItem/armorDrop: além da arma mítica, quem vence ainda tem esta chance de levar o peitoral do dragão (se ainda não tiver).
// Varinha: o tiro estoura em n estilhaços teleguiados (velocidade, alcance, curva em rad/s, dano em fração do tiro, seek = até onde procuram outro alvo)
const WAND_SPLIT = { n: 5, speed: 520, range: 340, turn: 8, mul: 0.6, seek: 300 };
const TRAIL_HEAL = { time: 2, width: 40 }; // rastro de cura (rapieira + sinos): dura 2 s, cura quem fez a investida ao ficar nele
const BOSS = { mob: 'dragao', respawn: 300, minShare: 0.06, clear: 270, minLevel: 20, leash: 1500, rage: 0.3, cdTiers: [{ hp: 0.3, mul: 0.8 }, { hp: 0.1, mul: 0.6 }], scale: 0.2, scaleCap: 12, armorItem: 'draco_6', armorDrop: 0.5 };
// Zonas em anéis elípticos, da borda (fraca) para a praça do centro (forte). nd = distância normalizada ao centro.
const ZONES = [
  { min: 0.88, max: 1.0, mob: 'cogumelo', weight: 0.177 },
  { min: 0.76, max: 0.88, mob: 'coelho', weight: 0.2655 },
  { min: 0.62, max: 0.76, mob: 'lobo', weight: 0.211 },
  { min: 0.48, max: 0.62, mob: 'javali', weight: 0.235 },
  { min: 0.34, max: 0.48, mob: 'broto', weight: 0.179 },
  { min: 0.22, max: 0.34, mob: 'aranha', weight: 0.0438, gap: 250 }, // gap: distância mínima entre dois da mesma zona (aranhas e árvores ficam bem espaçadas)
  { min: 0.11, max: 0.22, mob: 'arvore', weight: 0.0285, gap: 290 }
];
// Missões: as 9 armas lendárias (faixa 5) só vêm de missões, nunca de drops.
// kill/pk acumulam entre as vidas. survive/nodamage/onehit/level contam só na vida atual.
const QUESTS = [
  { id: 'q_martelo', reward: 'martelo_5', type: 'kill', mob: 'javali', n: 100, text: 'Matar 100 javalis-espinho' },
  { id: 'q_maca', reward: 'maca_5', type: 'kill', mob: 'lobo', n: 100, text: 'Matar 100 lobos-raiz' },
  { id: 'q_espada', reward: 'espada_5', type: 'survive', n: 600, text: 'Ficar vivo por 10 minutos' },
  { id: 'q_rapieira', reward: 'rapieira_5', type: 'nodamage', n: 60, text: 'Ficar 1 minuto sem tomar dano' },
  { id: 'q_arco', reward: 'arco_5', type: 'onehit', n: 1, text: 'Matar um monstro forte com até 3 golpes' },
  { id: 'q_chicote', reward: 'chicote_5', type: 'kill', mob: 'aranha', n: 40, text: 'Matar 40 aranhas-véu' },
  { id: 'q_varinha', reward: 'varinha_5', type: 'pk', n: 5, text: 'Derrotar 5 jogadores de nível 8 ou mais' },
  { id: 'q_cajado', reward: 'cajado_5', type: 'kill', mob: 'broto', n: 60, text: 'Matar 60 brotos anciões' },
  { id: 'q_sinos', reward: 'sinos_5', type: 'level', n: 20, text: 'Chegar ao nível 20 em uma vida' }
];

// Missão do Arco: "monstro forte" (faixa 3 ou mais) que morre com no máximo este número de golpes. Com o teto de dano por golpe, matar de um só deixou de ser possível.
const ONEHIT_MAX_HITS = 3;
// Modos de jogo: cada um tem suas próprias salas.
// classic = o jogo de sempre, com os monstros dando 1,5x de XP. coop = ninguém fere ninguém, o dragão é a meta e o cronômetro corre da 1ª pancada até ele cair.
// pvp = todos podem lutar entre si, os monstros dão 3x de XP e a sala conta abates, mortes e série.
const MODES = {
  classic: { name: 'Clássico', desc: 'O jogo de sempre: monstros com 1,5x de XP, PvP liberado e o dragão no centro.', mobXp: 1.5 },
  coop: { name: 'Cooperativo', desc: 'Todos do mesmo lado: sem PvP, monstros com 1,5x de XP e um cronômetro para derrubar o dragão no menor tempo.', mobXp: 1.5 },
  pvp: { name: 'PvP', desc: 'Todos contra todos: os monstros dão 3x mais XP para subir rápido, e a sala conta seus abates, mortes e série.', mobXp: 3 }
};
const MOB_COUNT = 1118; // com as aranhas e árvores mais raras: os outros monstros continuam na mesma quantidade de antes
const MOB_RESPAWN = [8, 14];
const DROP_WEAPON = 0.14;
const DROP_ARMOR = 0.07;
const DROP_MAX_TIER = 4;         // armas: a faixa 5 (lendária) só vem de missão e a 6 (mítica) só do dragão
const DROP_MAX_TIER_ARMOR = 5;   // peitorais: o lendário cai das aranhas-véu
const ITEM_LIMIT = 1;      // no máximo 1 de cada item no inventário (o mesmo item pode ocupar os 2 slots de arma e fundir)
const PLAYER_REGEN = 0.005;    // vida que o jogador recupera por segundo (fração da vida máxima), o tempo todo, mesmo levando dano
const PLAYER_STUN_MULT = 0.5;  // atordoamento em jogadores dura esta fração do tempo que dura nos monstros
const PVP_DAMAGE = 0.6; // dano entre jogadores: 60% do normal (nerf de 40%); contra monstros e dragão não muda
const PVP_XP_FRAC = 0.4;   // XP por matar jogador = 40% de todo o XP que a vítima tinha (totalXp)
const NEWBIE_LEVEL = 0;    // até este nível ninguém luta contra jogadores (nem bate, nem apanha). 0 = PvP ligado para todos, desde o nível 1
const PK_MIN_LEVEL = 8;    // a missão 'derrotar jogadores' só conta vítimas deste nível para cima

function attrOf(stats, attr) {
  return attr === 'best' ? Math.max(stats.str, stats.dex, stats.man) : stats[attr];
}
function weaponDamage(item, stats) {
  const F = FAMILIES[item.fam];
  const a = attrOf(stats, F.attr);
  if (item.fam === 'faca') return Math.ceil((a + 1) * 1.3); // faca inicial: maior atributo + 1, com 30% a mais
  return Math.max(1, Math.round((4 + a) * F.mult * TIER_MULT[item.tier - 1]));
}
function skillDamage(item, stats) {
  const F = FAMILIES[item.fam];
  if (!F.skill) return 0;
  return Math.max(1, Math.round((4 + stats[F.attr]) * F.skill.mult * TIER_MULT[item.tier - 1]));
}
// Habilidade mista: duas armas DIFERENTES (cada uma com habilidade) disparam as duas habilidades juntas, com um nome novo e uma recarga só.
// O nome junta uma palavra de cada arma (na ordem de FAMILIES, então a mesma dupla sempre dá o mesmo nome); a recarga é 90% da média das duas.
const MIX_WORDS = {
  martelo: ['Tremor', 'Esmagador'], maca: ['Impacto', 'Sagrado'], espada: ['Lâmina', 'Cortante'], rapieira: ['Estocada', 'Veloz'],
  arco: ['Flecha', 'Certeira'], chicote: ['Açoite', 'Selvagem'], varinha: ['Faísca', 'Arcana'], cajado: ['Orbe', 'Místico'], sinos: ['Canção', 'Sagrada']
};
const MIX_DMG = 1.1;
function mixName(famA, famB) {
  const order = Object.keys(FAMILIES);
  const pair = order.indexOf(famA) <= order.indexOf(famB) ? [famA, famB] : [famB, famA];
  return MIX_WORDS[pair[0]][0] + ' ' + MIX_WORDS[pair[1]][1];
}
function mixCd(famA, famB) {
  return Math.round((FAMILIES[famA].skill.cd + FAMILIES[famB].skill.cd) / 2 * 0.9 * 10) / 10;
}
// Vida do monstro mais forte da faixa (a referência do teto de dano) e o teto de um golpe de uma arma dessa faixa.
function mobHpOfTier(tier) {
  const regular = Object.keys(MOBS).filter((k) => !MOBS[k].boss);
  const t = Math.min(tier, Math.max.apply(null, regular.map((k) => MOBS[k].tier))); // a faixa 6 enfrenta o monstro comum mais forte
  return Math.max.apply(null, regular.filter((k) => MOBS[k].tier === t).map((k) => MOBS[k].hp));
}
function hitCap(tier, cls) { return mobHpOfTier(tier) / MIN_HITS[cls]; }
function armorStats(item, stats) {
  if (!item || item.kind !== 'armor') return { hp: 0, rp: 0, rm: 0 };
  const A = ARMORS[item.type];
  const tm = item.tier === 0 ? 0.375 : TIER_MULT[item.tier - 1];
  const res = item.tier === 0 ? 0 : A.res != null ? A.res : Math.min(RES_CAP, RES_PER_TIER * item.tier);
  return { hp: Math.round(stats.hlt * A.hp * tm), rp: A.rp ? res : 0, rm: A.rm ? res : 0 };
}
// Velocidade ao andar (px/s). Quanto menor o slime (nível baixo), mais rápido: de +10% no nível 1 a -8% no nível 20.
// Armas de perto deixam um pouco mais rápido que armas de longe: só corpo a corpo +6%, uma de cada +3%, só à distância +0%.
// fams = famílias das armas ativas (ex.: ['faca', 'arco']). O servidor e o cliente usam esta mesma conta.
const MOVE_BASE = 170, MOVE_LVL_MAX = 1.10, MOVE_LVL_MIN = 0.92, MELEE_ATK = ['single', 'splash', 'arc', 'ring'];
function moveSpeed(level, fams) {
  const t = Math.max(0, Math.min(1, ((Number(level) || 1) - 1) / (MAX_LEVEL - 1)));
  let sp = MOVE_BASE * (MOVE_LVL_MAX + (MOVE_LVL_MIN - MOVE_LVL_MAX) * t);
  const list = (fams || []).filter((f) => FAMILIES[f]);
  if (list.length) {
    const melee = list.filter((f) => MELEE_ATK.includes(FAMILIES[f].atk)).length;
    sp *= 1 + 0.06 * (melee / list.length);
  }
  return sp;
}
function meetsReq(item, stats) {
  if (!item) return false;
  if (item.req === 0) return true;
  return attrOf(stats, item.attr) >= item.req;
}

// De onde vem cada item (usado pela mochila para explicar como desbloquear).
function howToGet(item) {
  if (BASE_ITEMS.includes(item.id)) return { kind: 'base', text: 'Você já começa com este item.' };
  if (item.tier === MYTHIC_TIER) {
    const b = MOBS[BOSS.mob];
    const where = 'Cai do ' + b.name + ', no centro do mapa. Só quem está no nível ' + BOSS.minLevel + ' consegue machucá-lo, e quem causar ' +
      Math.round(BOSS.minShare * 100) + '% ou mais da vida dele ';
    if (item.kind === 'armor') return { kind: 'boss', text: where + 'tem ' + Math.round(BOSS.armorDrop * 100) + '% de chance de levar este peitoral a cada vitória.' };
    return { kind: 'boss', text: where + 'ganha uma arma mítica aleatória.' };
  }
  const q = QUESTS.find((x) => x.reward === item.id);
  if (q) return { kind: 'quest', quest: q.id, text: 'Missão: ' + q.text + '.' };
  const maxT = item.kind === 'weapon' ? DROP_MAX_TIER : DROP_MAX_TIER_ARMOR;
  const mobs = Object.keys(MOBS).filter((k) => !MOBS[k].boss && Math.min(maxT, MOBS[k].tier) === item.tier);
  const ch = item.kind === 'weapon' ? DROP_WEAPON : DROP_ARMOR;
  const names = mobs.map((k) => MOBS[k].name);
  const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1] : names[0];
  return { kind: 'drop', mobs, chance: ch, text: 'Cai de ' + list + ' (' + (ch * 100).toFixed(ch < 0.1 ? 1 : 0).replace('.0', '') + '% por abate; só sorteia itens que você ainda não tem).' };
}

/* ------------------------------ skins (só visuais) ------------------------------ */
// Nada aqui dá vantagem em combate. slot: onde a skin entra (body = corpo, head = cabeça, face = rosto, bow = laço); code: número dentro do slot (0 = nada).
const SKIN_SLOTS = ['head', 'kill']; // por enquanto só chapéus; a estrutura aceita mais lugares (rosto, costas...) no futuro
const SKINS = {
  cogumelo: { name: 'Chapéu de cogumelo', slot: 'head', code: 1 },
  marinheiro: { name: 'Chapéu de marinheiro', slot: 'head', code: 2 },
  coroa: { name: 'Coroinha de flores', slot: 'head', code: 3 },
  cartola: { name: 'Cartola', slot: 'head', code: 4 },
  mago: { name: 'Chapéu de mago', slot: 'head', code: 5, premium: true },
  pirata: { name: 'Chapéu de pirata', slot: 'head', code: 6, premium: true },
  // Prêmios do ranking semanal (não estão à venda): quem termina a semana em 1º resgata na loja
  dragao: { name: 'Cabeça de dragão', slot: 'head', code: 7, prize: true },
  dragao_ouro: { name: 'Cabeça de dragão dourada', slot: 'head', code: 8, prize: true },
  lapide: { name: 'Lápide (ao abater)', slot: 'kill', code: 1, prize: true },
  lapide_ouro: { name: 'Lápide dourada (ao abater)', slot: 'kill', code: 2, prize: true }
};
// Prêmio de cada ranking semanal: quem fechou a semana em 1º lugar pode resgatar a skin (vale para sempre depois de resgatada)
const WEEK_PRIZES = {
  coop: { skin: 'dragao', title: 'Cooperativo: tempo até o dragão' },
  pvpm: { skin: 'lapide', title: 'PvP: abates' },
  pvp: { skin: 'lapide_ouro', title: 'Clássico: abates' },
  dragon: { skin: 'dragao_ouro', title: 'Clássico: tempo até o dragão' }
};
// Pacotes à venda (preço em reais). Cada pacote libera as skins da lista.
const SKIN_PACKS = {
  chapeus: { name: 'Chapéus', price: 2, skins: ['cogumelo', 'marinheiro', 'coroa', 'cartola'], note: '4 chapéus: cogumelo, marinheiro, coroinha de flores e cartola' },
  mago: { name: 'Premium Mago', price: 5, skins: ['mago'], note: 'Chapéu de mago com estrelas que brilham' },
  pirata: { name: 'Premium Pirata', price: 5, skins: ['pirata'], note: 'Chapéu de pirata com caveira e bordado dourado' },
  tudo: { name: 'Tudo', price: 10, skins: ['cogumelo', 'marinheiro', 'coroa', 'cartola', 'mago', 'pirata'], note: 'Os 2 premium + os 4 chapéus (em vez de R$ 12)' }
};
// Equipado: { head }, com o id da skin ou null. Vai pela rede como um número (o código do chapéu; 0 = nenhum).
const SKIN_BY_CODE = {};
for (const id of Object.keys(SKINS)) SKIN_BY_CODE[SKINS[id].slot + SKINS[id].code] = id;
function skinEmpty() { const o = {}; SKIN_SLOTS.forEach((k) => { o[k] = null; }); return o; }
// Limpa um equipamento qualquer: só fica o que existe, está no slot certo e (se own for dado) a conta possui.
function skinClean(eq, own) {
  const out = skinEmpty();
  if (!eq || typeof eq !== 'object') return out;
  for (const slot of SKIN_SLOTS) {
    const id = eq[slot];
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(SKINS, id) && SKINS[id].slot === slot && (!own || own.includes(id))) out[slot] = id;
  }
  return out;
}
// Número que viaja pela rede: unidades/dezenas = código do chapéu, centenas = código do efeito de abate (0 = nenhum)
function skinCode(eq) {
  const c = (slot) => { const id = eq && eq[slot]; return id && Object.prototype.hasOwnProperty.call(SKINS, id) && SKINS[id].slot === slot ? SKINS[id].code : 0; };
  return c('head') + c('kill') * 100;
}
function skinDecode(n) {
  const out = skinEmpty();
  n = Math.floor(Number(n) || 0);
  if (n > 0) { out.head = SKIN_BY_CODE['head' + (n % 100)] || null; out.kill = SKIN_BY_CODE['kill' + Math.floor(n / 100)] || null; }
  return out;
}

function publicData() {
  return {
    MAX_PLAYERS, MAX_LEVEL, CATALOG_SIZE, WORLD, TIER_REQ, TIER_MULT, TIER_NAMES, TIER_NAMES_M, TIER_COLORS, MYTHIC_TIER, BOSS,
    ATTR_NAMES, FAMILIES, ARMORS, ITEMS, BASE_ITEMS, MOBS, ZONES, RES_PER_TIER, RES_CAP, QUESTS, POINTS_PER_LEVEL, ATTR_MAX,
    ITEM_LIMIT, PVP_XP_FRAC, PVP_DAMAGE, NEWBIE_LEVEL, PK_MIN_LEVEL, SKIN_SLOTS, SKINS, SKIN_PACKS, WEEK_PRIZES, MODES
  };
}

module.exports = {
  MAX_PLAYERS, MAX_LEVEL, CATALOG_SIZE, WORLD, TIER_REQ, TIER_MULT, TIER_NAMES, TIER_NAMES_M, TIER_COLORS, MYTHIC_TIER, BOSS, WAND_SPLIT, TRAIL_HEAL, ATTRS, ATTR_NAMES, POINTS_PER_LEVEL, LEVEL_DIE, MODES, ATTR_MAX,
  FAMILIES, ARMORS, ITEMS, BASE_ITEMS, MOBS, ZONES, QUESTS, MOB_COUNT, MOB_RESPAWN, DROP_WEAPON, DROP_ARMOR,
  DROP_MAX_TIER, DROP_MAX_TIER_ARMOR, ITEM_LIMIT, PLAYER_REGEN, PLAYER_STUN_MULT, PVP_XP_FRAC, PVP_DAMAGE, NEWBIE_LEVEL, PK_MIN_LEVEL, TUNE, ONEHIT_MAX_HITS, MIN_HITS, REF_ATTR, mobHpOfTier, hitCap, howToGet, mixName, mixCd, MIX_DMG, xpNeed, totalXp, attrOf, weaponDamage, skillDamage, armorStats, meetsReq, moveSpeed, MOVE_BASE, publicData,
  SKIN_SLOTS, SKINS, SKIN_PACKS, WEEK_PRIZES, skinEmpty, skinClean, skinCode, skinDecode
};
