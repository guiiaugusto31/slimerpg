# Equilíbrio do SlimeRPG

Resultados do simulador (`node tools/simular.js ...`) e as decisões tomadas a partir deles. O simulador roda o servidor de verdade, sem rede, com robôs que jogam sozinhos. Os números dos robôs são uma referência, não a verdade: gente de verdade desvia melhor e anda menos à toa.

## 1. Armas (ranged x melee)

**Teste.** Arena com 9 armas × 6 faixas. Cada arma, sozinha, enfrenta um bando de monstros da faixa dela, que renascem na hora colados no jogador (4 coelhos, 4 lobos, 4 javalis, 3 brotos, 3 aranhas). O jogador tem os atributos médios do nível da faixa e o peitoral vital da mesma faixa. 40 s de jogo por rodada, 4 repetições; as armas de longe rodam duas vezes, recuando (kite) e paradas. No total são mais de 3 horas de jogo simulado por bateria completa.

**Antes.** As armas de perto dominavam: martelo 1,3–2,3× a mediana de abates por minuto, chicote 1,3–1,7×, sinos 1,2–1,6×. As de longe ficavam em 0,14–0,6×, com o arco no fundo.

**Mudanças** (`game-data.js`):

| Arma | Antes | Agora |
|---|---|---|
| Arco | mult 0,8, recarga 0,7 s | mult 1,4, recarga 0,65 s |
| Varinha | mult 0,75 | mult 1,05 |
| Cajado | mult 1,5, orbe a 300, área 55 | mult 1,4, orbe a 360, área 65 |
| Martelo | mult 2,2 | mult 1,75 |
| Chicote | mult 0,75 | mult 0,66 |
| Sinos | mult 1,1 | mult 0,95 |
| Maça | mult 1,8 | mult 2,1 |
| Rapieira | mult 0,7 | mult 0,8 |

**Depois** (média das 6 faixas, abates por minuto relativos à mediana das 9 armas):

| Arma | Tipo | Relativo à mediana | Abates/min | Mortes/10 min na arena |
|---|---|---|---|---|
| Martelo | perto | 1,20× | 14,8 | 26 |
| Sinos | perto | 1,23× | 15,5 | 17 |
| Espada | perto | 1,09× | 13,6 | 24 |
| Chicote | perto | 1,08× | 13,5 | 29 |
| Maça | perto | 0,96× | 12,0 | 22 |
| Rapieira | perto | 0,94× | 11,8 | 23 |
| Cajado | longe | 0,86× (parado: 16,6 ab/min) | 11,9 | 11 |
| Varinha | longe | 0,62× (parado: 9,5 ab/min) | 8,2 | 10 |
| Arco | longe | 0,58× (parado: 9,3 ab/min) | 7,8 | 11 |

**Como ler.** As armas de longe matam menos por minuto, mas morrem menos da metade das vezes na arena: quem recua enquanto atira quase não sofre dano, e morrer custa o nível inteiro. Na prática, de perto rende mais contra bandos e de longe é mais seguro. O cajado é a arma de dano em área parada (forte no centro do bando); o arco e a varinha são a opção segura. Se o arco ou a varinha ainda parecerem fracos jogando de verdade, o próximo ajuste é subir `FAMILIES.arco.mult` e `FAMILIES.varinha.mult` em 10%.

**Limitação do robô.** Nas faixas 1, 3 e 4 o robô que recua passa tanto tempo fugindo (os monstros nascem a ~125 px dele) que mata só 0,2–0,5× a mediana, com quase nenhuma morte. Um jogador de verdade recuaria só quando preciso, então esses números são um piso.

## 2. Progressão do nível 1 ao 20

**Teste.** Robôs começam no nível 1 numa sala de verdade, com monstros espalhados, drops e missões, e jogam 40 min de jogo.

**Antes do ajuste** (solo cuidadoso, 8 robôs): 14,1 mortes por robô, nível 10 em 7,2 min e a maioria morrendo para aranhas e brotos entre os níveis 6 e 9.

**Depois** (solo cuidadoso, com as armas rebalanceadas):

- 3,3 mortes por robô (era 14,1).
- Nível 3 em 0,1 min, nível 5 em 1,8 min, nível 10 em 8,7 min, nível 15 em 21,7 min.
- 3 de 8 chegaram ao nível 20 em 40 min (mediana 36,9 min; o mais rápido, 18,2 min).
- Chance de passar de um trecho ao outro sem morrer: nv 1→3 97%, nv 3→5 88%, nv 5→8 76%, nv 8→10 95%, nv 10→13 76%, nv 13→16 63%, nv 16→20 40%.
- Quem mais mata: aranha-véu (10 mortes) e broto ancião (6). O começo é passável e o nível 20 exige cuidado.

**O que mudou no jogo para chegar nisso:** vida, dano e alcance de agressão dos monstros foram recalibrados (cogumelo 30 de vida e 3 de dano até aranha 3300 de vida e 36 de dano), os anéis do mapa foram redistribuídos e a curva de XP sobe como `15 × nível^1,5` (os dois primeiros níveis são fixos em 5 e 10 XP).

**Nova rodada, depois do teto de dano e da regeneração em combate** (`progressao --rapido`, 40 min de jogo por rodada):

| Rodada | Chegaram ao nível 20 | Mediana (min) | Mortes por robô | Quem mais mata |
|---|---|---|---|---|
| solo cuidadoso (8 robôs) | 7 de 8 | 24,3 (o mais rápido, 16,0) | 2,4 | aranha-véu (6) e javali-espinho (6) |
| solo ousado, aceita perder 60% da vida (8 robôs) | 6 de 8 | 24,6 (o mais rápido, 14,5) | 3,8 | broto ancião (8) e javali-espinho (8) |
| sala cheia, 20 robôs com perfis variados e PvP desde o nível 1 | 1 de 20 | 29,5 | 70,3 | outros jogadores: 1.378 das 1.406 mortes, quase todas nos níveis 1 a 5 |

- No solo cuidadoso a chance de passar de um trecho ao outro sem morrer ficou em 100% até o nível 5, 74% de 5 a 8, 75% de 8 a 10, 87% de 10 a 13, 77% de 13 a 16 e 80% de 16 a 20.
- O jogo ficou **mais fácil** do que na rodada anterior (3 de 8 no nível 20, 3,3 mortes por robô): a regeneração de 0,5% da vida por segundo (`PLAYER_REGEN`), que agora vale também em combate, pesa mais do que o teto de dano por golpe. Se achar fácil demais, é o botão a mexer primeiro.
- Na sala cheia, como o PvP vale desde o nível 1, a maioria das mortes é de jogador contra jogador nos primeiros níveis (os robôs se caçam sem parar). Pessoas de verdade tendem a se espalhar mais, mas esse é o ponto a vigiar com jogadores reais.

Sobre o PvP: já nas rodadas antigas da sala cheia (20 robôs) ele era brutal nos níveis baixos. Para isso existe `NEWBIE_LEVEL` (proteção de novato), que cheguei a deixar em 6; a pedido seu o PvP agora vale desde o nível 1 (`NEWBIE_LEVEL = 0`), então espere mais mortes nos primeiros níveis em sala cheia. `PK_MIN_LEVEL` continua em 8 para a missão da Varinha não valer caçar novatos.

## 3. Dragão ancestral

**Teste.** Grupos de 1, 3, 5 e 10 robôs de nível 20 contra o dragão, 12 lutas por cenário (limite de 300 s). Cada robô veste a melhor faixa que os atributos dele permitem (os requisitos valem de verdade). Os robôs são aliados entre si e desviam dos avisos com 50% ou 100% de acerto.

**Erro encontrado e corrigido no teste:** os robôs se atacavam entre si (PvP), então os grupos morriam sozinhos. Depois de corrigir, o dragão original (30 mil de vida) caía em 10–25 s para qualquer grupo de 3 ou mais. Por isso ele ficou bem mais forte.

**Mudanças:**

- Vida 30 000 → 75 000.
- Garra 160 → 200, sopro 280 → 380, pancada no chão 220 → 300.
- A vida cresce 20% por jogador extra que o esteja machucando, até 12 jogadores (`BOSS.scale`, `BOSS.scaleCap`), e volta ao normal quando ele dorme.

**Resultado** (vitórias em 12 lutas, desviando 100%; a faixa vai de desviar 50% a 100%):

| Grupo | Épico (f4) | Lendário (f5) | Lendário + 1 mítica |
|---|---|---|---|
| 1 jogador | 0% | 8% | 8–25% |
| 3 jogadores | 17–25% | 17–42% | 50–67% |
| 5 jogadores | 42–58% | 83–100% | 92% |
| 10 jogadores | 100% (45–54 s) | 100% (33–36 s) | 100% (27 s) |

Sozinho, só dá com muito jogo (kite, desviar de tudo). Em grupo de 3 ou 5 é uma luta de verdade, com mortes. Um grupo de 10 vence sempre, em 30 a 55 s e perdendo alguns membros pelo caminho; se isso parecer fácil demais, aumente `BOSS.scale` ou `MOBS.dragao.hp`. A vida extra por jogador foi limitada a 12 jogadores, medida só no grupo de 10 (os demais cenários foram rodados com limite 8, sem diferença para grupos de até 5).

### Peitoral Dracônico (mítico)

Cai do dragão com 50% de chance por vitória (`BOSS.armorDrop`), só para quem ainda não tem. Exige 40 de Saúde, como as armas míticas. Com 40 de Saúde ele dá +1512 de vida (um Vital lendário dá +1440), mais **42% de resistência física e 42% de mágica** (`ARMORS.draco.res`; os outros peitorais chegam a 40% em um só tipo). Ele é o melhor peitoral do jogo de propósito, porque é a recompensa de vencer o chefe; a resistência ficou abaixo do teto de 60% para que a luta contra o dragão e o PvP não virem passeio. Se ficar forte demais, baixe `ARMORS.draco.res` ou `BOSS.armorDrop`. O simulador (`tools/simular.js`) ainda não usa o Dracônico: os números do dragão acima são só com peitoral lendário.

## 4. Teto de dano por golpe

**Regra.** Nenhum golpe de uma arma passa de uma fração da vida do monstro da faixa dela, então o monstro de faixa equivalente leva um mínimo de golpes para morrer:

| Tipo | Armas | Teto por golpe | Golpes mínimos |
|---|---|---|---|
| Corpo a corpo rápida (`fm`) | rapieira, chicote (e a faca) | 1/5 da vida | 5 |
| Corpo a corpo lenta (`sm`) | martelo, maça, espada, sinos | 1/3 | 3 |
| À distância rápida (`fr`) | arco, varinha | 1/7 | 7 |
| À distância lenta (`sr`) | cajado | 1/5 | 5 |

Vale para o golpe básico, para a habilidade e para a habilidade fundida (+50%). O dragão fica de fora.

**Não é uma trava no código.** O dano continua escalando com o atributo da arma, que sobe cerca de 2 por nível quando os 8 pontos por nível são espalhados (hoje o jogador escolhe e pode concentrar até 60 em um atributo, então o dano pode passar do teto calibrado), e com a faixa. O teto é respeitado pelos **multiplicadores** de cada arma (`mult` e `skill.mult` em `game-data.js`). Por isso um golpe forte ainda mata de uma vez um monstro de faixa muito mais baixa: um lendário contra um cogumelo (30 de vida) continua sendo um golpe só.

**Como foi calibrado.** Cada faixa tem um monstro de referência (a faixa 1 é o coelho-musgo, 278 de vida; a 2, o lobo, 440; a 3, o javali, 951; a 4, o broto, 1877; a 5, a aranha-véu, 3300; a faixa mítica também usa a aranha) e um atributo de referência no fim do uso da faixa (`REF_ATTR`: 10, 18, 28, 38, 43 e 44). O teto de cada faixa é a vida do monstro dividida pelos golpes mínimos:

| Faixa (monstro) | 1/5 | 1/3 | 1/7 |
|---|---|---|---|
| 1 (coelho) | 55 | 92 | 39 |
| 2 (lobo) | 88 | 146 | 62 |
| 3 (javali) | 190 | 317 | 135 |
| 4 (broto) | 375 | 625 | 268 |
| 5 e 6 (aranha) | 660 | 1100 | 471 |

O multiplicador de cada arma é o maior que cabe no teto de todas as faixas ao mesmo tempo, com a habilidade fundida incluída. A faixa 2 (lobo, com o atributo 18) é a mais apertada, e a faixa 5 fica com 15% de folga. Para não deixar as armas mais fracas, o dano tirado da habilidade foi passado para o golpe básico, que tinha muita folga, mantendo o dano por segundo de cada arma no papel:

| Arma | Básico antes → agora | Habilidade antes → agora |
|---|---|---|
| Martelo | 1,75 → 2,35 | 6 → 2,95 |
| Maça | 2,1 → 2,55 | 4,5 → 2,95 |
| Espada | 1,4 → 1,75 | 5 → 2,95 |
| Sinos | 0,95 → 1,05 | 3,8 → 2,95 |
| Rapieira | 0,8 → 1,25 | 4,5 → 1,75 |
| Chicote | 0,66 → 0,95 | 4,2 → 1,75 |
| Cajado | 1,4 → 2,05 | 5,5 → 1,75 |
| Arco | 1,4 → 1,55 | 2,4 → 1,25 |
| Varinha | 1,05 → 1,55 | 6 → 1,25 |

As recargas não mudaram. As habilidades perderam o papel de golpe forte e ficaram como golpes de efeito (área, perfuração, atordoamento, investida e cura), com dano de 1,2× a 2× o do golpe básico.

**Resultado no simulador** (arena de armas, 10 repetições por arma e faixa; dano por segundo relativo à mediana das 9 armas, média das 6 faixas):

| Arma | Antes | Agora | Mortes/10 min antes → agora |
|---|---|---|---|
| Martelo | 1,18 | 1,22 | 24 → 24 |
| Maça | 0,96 | 0,92 | 21 → 22 |
| Espada | 1,08 | 1,12 | 23 → 24 |
| Sinos | 1,24 | 1,28 | 14 → 15 |
| Rapieira | 0,97 | 0,90 | 21 → 21 |
| Chicote | 1,11 | 1,14 | 26 → 26 |
| Cajado | 0,98 | 1,05 | 10 → 11 |
| Arco | 0,70 | 0,68 | 11 → 11 |
| Varinha | 0,76 | 0,75 | 10 → 11 |

O equilíbrio entre as armas ficou como era, dentro de ±0,1. A rapieira perde um pouco porque a investida atingia vários alvos com o golpe forte. O arco e a varinha continuam sendo as armas seguras e mais lentas de matar; se parecerem fracas jogando de verdade, o próximo ajuste é abrir o teto delas (de 1/7 para 1/6), não subir o multiplicador.

**Dragão.** Com o dano antigo e com o novo, as taxas de vitória ficam iguais dentro do ruído (12 lutas por cenário): lendário com 3 jogadores, 8–33%; com 5, 75–92%; com 10, 100%; lendário + 1 mítica com 3 jogadores, 25–58%. Quem decide a dificuldade da luta é a regeneração: com `PLAYER_REGEN` em 2% por segundo, 5 jogadores com equipamento lendário ganham sempre; em 0%, ganham 50–75%. Em 0,5% (o valor atual) a luta fica entre os dois. A tabela da seção 3 é anterior à regra de regeneração atual e a outros ajustes; hoje o épico com 5 jogadores ganha só 17–25% das lutas (era 42–58%).

**Efeito no PvP.** O golpe mais forte de uma arma lendária caía em cerca de 70% da vida de um jogador de nível 20 com peitoral lendário (1834 de vida, sem contar a resistência); agora são cerca de 35% sem fusão e 50% com a habilidade fundida. A faixa mítica passa do teto só na habilidade fundida (cerca de 20% a mais).

**Missão do Arco.** "Matar um monstro forte com um único golpe" deixou de ser possível (nenhum golpe passa de 1/3 da vida da aranha, e o javali tem 951), então a missão agora é **matar um monstro forte (faixa 3 ou mais) com até 3 golpes** (`ONEHIT_MAX_HITS`).

**Como conferir depois de mexer nos números.** `node tools/calibrar-dano.js` mostra, para cada arma, o maior multiplicador que cabe no teto e o maior golpe em % do teto, e o teste de regras (`npm test`) falha se algum golpe passar.

## Como reproduzir

```bash
node tools/simular.js armas --rapido            # ~1 s
node tools/calibrar-dano.js                     # confere o teto de dano por golpe
node tools/simular.js dragao                    # ~3 s
node tools/simular.js progressao --rapido       # ~6 a 10 min, rodadas em sequência
node tools/simular.js armas --faixa 2,3 --fam arco,varinha --ajuste '{"FAMILIES.arco.mult":1.5}'
```
