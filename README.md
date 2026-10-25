# SlimeRPG

Jogo .io de navegador, em vista 2D de cima, com elementos de MMORPG. Você é um slime com nome e cor à sua escolha, anda pela floresta, mata monstros, enfrenta outros jogadores e sobe até o nível 20 para ganhar a coroa. No nível 20 ainda existe o desafio final: o Dragão ancestral, no centro do mapa, que solta uma arma mítica. Funciona no PC (WASD) e no celular (joystick).

## Como rodar

```bash
npm install
npm start
```

Abra http://localhost:3000. Para testar com mais jogadores, abra várias abas ou acesse pelo IP da sua máquina na rede.

Cada sala comporta 30 jogadores. Quando uma enche, o servidor abre outra automaticamente. Para mudar a porta: `PORT=8080 npm start`.

## Versão de teste (sem instalar nada)

`npm run preview` gera `preview/slime-io-teste.html`, um arquivo único com o jogo inteiro. É só abrir no navegador (no PC ou no celular). O servidor roda dentro da página e cinco slimes-robô entram na floresta com você (alguns partem para cima de quem chegar perto, já que o PvP está ligado). Serve para testar as regras e o visual; o multiplayer de verdade só existe com `npm start`.

## Imagens

O jogo já abre sozinho, com arte desenhada por código (slime, monstros, dragão, 9 armas em 6 faixas, peitorais, efeitos de ataque e o mapa em blocos). Qualquer imagem colocada em `public/img/` com o nome certo substitui o desenho correspondente. Fundos lisos (cinza ou branco) são removidos automaticamente. A cor escolhida pelo jogador é aplicada por cima do slime.

- O slime (3 poses do Higgsfield), as 9 armas, a faca e os 3 peitorais já vão recortados em `public/img/`. `npm run imagens` só baixa os dois monstros do Higgsfield (broto e aranha).
- O mapa e as versões em alta resolução dos outros monstros estão no Canva. Os links e a tabela de nomes estão em [IMAGENS.md](IMAGENS.md).

## Controles

| Ação | PC | Celular |
|---|---|---|
| Andar | WASD ou setas | joystick (arraste na metade esquerda da tela) |
| Mochila | `I` ou botão Mochila | botão Mochila |
| Missões | `M` ou botão Missões | botão Missões |
| Rankings | `R` ou botão Rankings (também na tela inicial) | botão Rankings |
| Mira | botão "Mira" | botão "Mira" |

Você só anda. As armas atacam e usam habilidades sozinhas. A mira tem dois modos: **alvo próximo** (acerta o inimigo mais perto) ou **cursor** (só atinge quem está na direção do mouse; no celular, a direção em que você anda).

## Regras

**Velocidade ao andar.** Quanto menor o slime, mais rápido: de +10% sobre a base (170) no nível 1 a -8% no nível 20. Armas de perto deixam um pouco mais rápido que armas de longe: só corpo a corpo +6%, uma de cada +3%, só à distância +0%. A conta fica em `moveSpeed` (`game-data.js`) e vale igual no servidor e no cliente.

**Atributos.** Força, Destreza, Mana e Saúde começam em 1. A cada nível o servidor **rola um dado 1d3 para cada atributo** (média de 2 por atributo, então o nível 20 dá em média 39 de cada), com **máximo de 60**. Não há mais pontos para distribuir; o painel Atributos (tecla P) mostra os valores. Ao morrer, o nível e os atributos voltam ao começo. Pontos antigos guardados ainda podem ser gastos (`alloc` ignora pontos que você não tem e passa do máximo). Saúde define a vida: `40 + 10 × Saúde + bônus do peitoral`. Força, Destreza e Mana liberam armas e aumentam o dano delas. Não existe barra de mana.

**Habilidades de martelo e maça:** a pancada cai no pé do alvo (e pega quem estiver em volta dele); cajado e sinos explodem em volta de quem usa. **Ataque normal do sino:** a badalada acontece em cima do monstro que está sendo atacado e atinge quem estiver ao redor *dele* (não em volta de quem toca); o teste `test/sinos.js` confere.

**Misturas de armas.** Cada arma tem um papel e cada par de papéis tem uma combinação própria (as 36 combinações de armas diferentes funcionam, com uma recarga só e +10% de dano):
- arco (flecha), varinha (tiro que se espalha em 5 estilhaços teleguiados para outros alvos perto), martelo, maça e cajado (pancada no pé do alvo), espada e chicote (corte em cone), rapieira (investida), sinos (cura).
- flecha + corte ou pancada: uma flecha só, e ao acertar sai o corte/pancada no impacto. Flecha + varinha: 3 flechas que estouram em estilhaços. Flecha + sinos: flechas que curam.
- varinha + pancada: a pancada cai no alvo e saem 5 tiros de dentro dela. Varinha + corte: o tiro solta o corte e se espalha. Varinha + sinos: estilhaços que curam.
- pancada + pancada: terremoto (segunda onda maior). Pancada + corte: onda de corte saindo da pancada. Pancada + investida: investe e bate no fim. Pancada ou corte + sinos: rouba vida (5% por inimigo atingido, até 3).
- corte + corte: corte em X. Corte + investida: investe e corta no fim. Rapieira + sinos: rastro de cura por 2 s.
Se a mistura especial não tem alvo, as duas habilidades funcionam separadas (o sino ainda cura sozinho). O código está em `MIX_SPECIAL` no `server.js`.

**Ataques dos monstros.** Cada monstro comum tem um ataque especial com aviso vermelho no chão antes de sair (dá para desviar): cogumelo solta esporos em volta, coelho pula e cai na sua posição, lobo morde em cone (uma boca de dentes se fecha na frente dele), javali faz uma investida em linha, broto levanta raízes sob você, aranha atira uma bola de teia em linha reta (acerta o primeiro no caminho e deixa lento), árvore anciã derruba um galho pesado (núcleo marcado em dourado: dano total e atordoa; borda: metade do dano, sem atordoar). Habilidades mistas têm animação própria por par de armas (36 combinações). As cores das habilidades são bem vivas (tabela `VIVID` em `public/fx.js`). Os números ficam em `sp` de cada monstro em `game-data.js`.

**Armas.** Você equipa 2 armas e 1 peitoral. A faca inicial causa dano de cerca de 30% acima do seu maior atributo mais 1, e alcança 50 de distância. As outras são 9 armas em 6 faixas, com requisito por atributo:

| Faixa | Raridade | Requisito | Como vem |
|---|---|---|---|
| 1 | Comum | 5 | monstros |
| 2 | Incomum | 11 | monstros |
| 3 | Rara | 19 | monstros |
| 4 | Épica | 29 | monstros fortes |
| 5 | Lendária | 39 | missões |
| 6 | Mítica | 40 | Dragão ancestral |

| Atributo | Armas |
|---|---|
| Força | martelo, maça, espada |
| Destreza | rapieira, arco, chicote |
| Mana | varinha, cajado, sinos |

Cada arma tem seu ataque automático e uma habilidade própria, com recarga própria. O dano dos dois cresce com o atributo da arma e com a faixa. Se faltar requisito, a arma fica inativa (e, sem nenhuma arma ativa, a faca assume). Como o nível 20 dá em média 39 de cada atributo, as armas míticas (requisito 40) pedem uma rolagem de dados acima da média.

**Teto de dano.** Nenhum golpe passa de uma fração da vida do monstro da faixa da arma: 1/5 nas rápidas de perto (rapieira, chicote), 1/3 nas lentas de perto (martelo, maça, espada, sinos), 1/7 nas rápidas de longe (arco, varinha) e 1/5 nas lentas de longe (cajado). Ou seja, o monstro da mesma faixa leva pelo menos 5, 3, 7 ou 5 golpes para morrer. O dragão fica de fora, e um monstro de faixa bem mais baixa ainda cai de um golpe só. Quem garante isso são os multiplicadores das armas em `game-data.js` (`MIN_HITS`, `REF_ATTR`); `node tools/calibrar-dano.js` confere.

Armas de perto (martelo, espada, chicote, sinos) acertam vários inimigos de uma vez; as de longe (arco, varinha, cajado) são mais seguras: quem recua enquanto atira quase não morre. O equilíbrio entre elas foi medido em simulação (veja [EQUILIBRIO.md](EQUILIBRIO.md)).

**Fusão.** O mesmo item nos dois slots de arma funde a habilidade: +50% de dano, área maior e um único disparo por ciclo, com a recarga da arma. Como só existe 1 de cada item na mochila, é assim que se funde.

**Peitorais.** Todos escalam com Saúde e seguem as faixas 1 a 5. Vital: só vida. Arcano: vida e resistência mágica. Blindado: vida e resistência física (8% por faixa, até 60%). Você começa com a Casaca de Gelatina. Acima de todos fica o **Peitoral Dracônico** (mítico, faixa 6, exige 40 de Saúde): é o único que junta **vida** (a de um Vital lendário, ou mais) com **42% de resistência a dano físico e 42% a dano mágico**, e só cai do dragão ancestral.

**Mochila.** É um catálogo com todos os 70 itens do jogo (9 armas × 6 faixas, 3 peitorais × 5 faixas e o Peitoral Dracônico). Os que você ainda não conseguiu aparecem bloqueados e cinza; ao tocar em um, a mochila diz exatamente como conseguir: de qual monstro cai e com que chance, qual missão entrega ou que ele vem do dragão. Item novo ganha um selo até você olhar. Nada se descarta: no máximo 1 de cada item.

**Loot.** O loot cai direto na mochila e só sorteia itens que você ainda não tem: 14% de chance de arma e 7% de peitoral por abate. Cada monstro dá itens da faixa dele (cogumelo e coelho, faixa 1; lobo, faixa 2; javali, faixa 3; broto e aranha, faixa 4, e o peitoral lendário cai das aranhas). A faixa 5 só vem de missões e a faixa 6 só do dragão.

**Morte.** Você perde todo o nível atual (volta ao nível 1 com atributos 1) e mantém os equipamentos e o progresso das missões. Os itens ficam inativos até você cumprir os requisitos de novo. Ao nascer, você tem 2 segundos de imunidade. Não existe zona segura.

**PvP.** Está sempre ligado, desde o nível 1: suas armas atacam o inimigo mais próximo, seja monstro ou outro jogador. Matar um jogador dá 40% de todo o XP que ele tinha (níveis já passados mais o do nível atual). Só os 2 segundos de imunidade ao nascer protegem você. A missão de derrotar jogadores só conta vítimas de nível 8 ou mais (para não valer caçar novatos). Se quiser uma proteção de novato, `NEWBIE_LEVEL` em `game-data.js` define até que nível ninguém luta contra jogadores (hoje é 0, ou seja, sem proteção).

**Primeiros níveis.** São rápidos: 1 cogumelo-fungo (5 XP) leva do nível 1 ao 2, e mais 2 levam ao nível 3. Depois a curva sobe: o nível 3 pede 77 XP para o 4.

**Nível 20.** XP total até lá: cerca de 10 mil. No nível 20 você ganha a coroa no ranking e sobre a cabeça.

**Mapa.** O mundo tem 14400 × 9000 (o dobro, em cada lado, da versão anterior; a quantidade de monstros foi multiplicada por 4 para manter a mesma densidade). Os monstros nascem em anéis, do mais fraco na borda ao mais forte perto do centro. O nome da região aparece na tela quando você entra nela, e setas na borda da tela apontam para o dragão (a partir do nível 15) e para quem estiver com a coroa.

| Anel (da borda ao centro; o Cogumelo ocupa só 12% do raio, e os mais fortes ficam mais afastados do centro) | Região | Monstro | XP |
|---|---|---|---|
| 1 | Bosque dos Cogumelos | Cogumelo-fungo | 5 |
| 2 | Campina dos Coelhos | Coelho-musgo | 10 |
| 3 | Mata dos Lobos | Lobo-raiz | 20 |
| 4 | Charneca dos Javalis | Javali-espinho | 46 |
| 5 | Bosque Ancião | Broto ancião | 72 |
| 6 | Ninho das Aranhas | Aranha-véu (deixa lento) | 104 |
| 7 | Clareira Anciã | Árvore anciã (lenta e pesada, entre a aranha e o dragão; 28 por sala, bem espaçadas; aranhas: 43) | 124 |
| centro | Toca do dragão | Dragão ancestral | 1200 |

**Dragão ancestral.** Dorme no centro do mapa e é muito mais forte que qualquer outro monstro. Só quem está no nível 20 consegue machucá-lo. Enquanto ninguém o acerta, ele não anda nem ataca; ao levar um golpe, acorda e persegue quem mais o machucou. Ele tem três ataques: garra (perto), sopro de fogo em cone e pancada no chão em área. O sopro e a pancada são **avisados na tela** antes de sair (cone ou círculo vermelho), então dá para desviar. Abaixo de 30% de vida ele enlouquece: fica mais rápido e a recarga dos ataques (sopro, pancada e garra) cai 20%; abaixo de 10%, cai 40%. Se ninguém o acertar por 10 segundos, ele volta para casa, dorme e se cura. A vida dele cresce 20% por jogador extra que o esteja machucando (até 12 jogadores), então um grupo grande não passa por cima. Quem causar pelo menos 6% da vida dele ganha **uma arma mítica aleatória** que ainda não tem e, a cada vitória, ainda tem **50% de chance de levar o Peitoral Dracônico** (até conseguir). Ele volta 5 minutos depois.

**Missões (armas lendárias).**

| Arma | Missão |
|---|---|
| Martelo | matar 100 javalis-espinho |
| Maça | matar 100 lobos-raiz |
| Espada | ficar vivo por 10 minutos |
| Rapieira | ficar 1 minuto sem tomar dano (só conta enquanto você luta) |
| Arco | matar um monstro forte (faixa 3 ou mais) com até 3 golpes (`ONEHIT_MAX_HITS`) |
| Chicote | matar 40 aranhas-véu |
| Varinha | derrotar 5 jogadores de nível 8 ou mais |
| Cajado | matar 60 brotos anciões |
| Sinos | chegar ao nível 20 em uma vida |

Abates e vitórias contra jogadores valem entre as vidas. Tempo, poucos golpes e nível 20 valem só para a vida atual.

**Detalhes que eu escolhi** (todos ajustáveis em `game-data.js`): a vida regenera 0,5% da vida máxima por segundo, o tempo todo, mesmo levando dano (`PLAYER_REGEN`); atordoamento em jogadores dura metade do tempo (`PLAYER_STUN_MULT`); um monstro dá XP a quem desferiu o golpe final.

## Visual

O slime segura as armas com **bracinhos de gelatina**: cada arma é pega pelo cabo (parada, fica erguida ao lado do corpo; no golpe a mão faz o movimento da família e o braço estica junto). Ele também **veste a roupa que estiver equipada**: a casaca de gelatina inicial, a jaqueta de couro (Vital), a túnica arcana com runas e gema (Arcano) ou a couraça de placas (Blindado) ou a armadura de escamas vermelhas e douradas do dragão (Dracônico, com brasas e uma aura quente no chão). A roupa é desenhada sob medida para o corpo dele, com gola, ombreiras e **mangas com punho** nos bracinhos, luz e sombra para dar volume, e a faixa do item aparece no debrum, nas fivelas e nas gemas (as faixas 4 a 6 também deixam um brilho no chão). Cada família tem seu gesto de ataque (estocada, pancada com onda de choque, arco de corte, anel, orbe, flechas, raio). **Espada e chicote** encaixam na forma máxima da área de dano. O dano conta a borda do monstro (`inCone` em `server.js`): para um monstro de raio *rt*, o alcance vai até `alcance + meio corpo + rt`, e a abertura ganha `asin(rt/distância)` de cada lado (abre mais perto do corpo). O servidor manda no evento de golpe esse alcance e essa abertura máximos (`reach` e `span`, função `coneHits`) e, no efeito, a abertura do cone e o raio do alvo. A arma puxa para trás, corta de uma borda à outra e a ponta (da lâmina, ou a tira do chicote, que se solta e estala) chega ao alcance máximo; a luz no chão (`hbPath` e `hbLight` em `public/fx.js`) tem exatamente a forma do dano, com a borda de fora no alcance máximo e as laterais abertas do jeito que o dano abre, e se preenche só onde a arma já passou. Na habilidade a lâmina cresce no corte para alcançar o leque maior, e o golpe da habilidade sai **em vermelho** e a arte do corte é desenrolada e enrolada de novo ao longo do arco do alcance máximo (`CUT`, `cutStrip`, `cutTex` e `cutWarp` em `public/fx.js`: a faixa reta é enrolada ponto a ponto numa textura guardada por alcance e abertura), então ela ocupa o leque do dano de uma borda lateral à outra, com a curva voltada para o alvo e cortada pela forma exata do dano (a luz, a arte do corte, o rastro da lâmina e o brilho do chicote; `SKILL_RED` e `tintRed` em `public/fx.js`) para não confundir com o golpe normal. O **golpe normal de espada e chicote usa essa mesma animação em branco e azul** (`SLASH_BLUE` e a arte original do corte, a mesma função `cutWarp`), e a luz da arma, o rastro da lâmina e a tira do chicote também ficam azuis. `test/golpes.js` confere. A flecha do ataque normal é 40% menor (`ARROW_BASIC` em `public/fx.js`). Cada faixa muda a cor e o brilho da arma e do efeito, e as habilidades têm efeito próprio. O dragão tem ilustração própria em três poses (em pé, dormindo e rugindo, em `public/img/mob_dragao*.png`), com sono, aviso vermelho dos ataques, aura e brasas na fúria por cima, barra de vida grande no topo da tela e uma toca com brasas no centro do mapa. **Animações de combate.** O slime tem três expressões (parado, zangado no golpe e atingido): ele respira e pula ao andar, inclina na direção do movimento, avança no golpe e recua, e ao levar dano pisca em branco, achata e é empurrado para longe de quem bateu. Os monstros tremem ao apanhar, dão o bote ao atacar e se desmancham ao morrer. Cada golpe solta faíscas na direção do impacto, as armas deixam rastro, o martelo e a maça levantam poeira, os projéteis estouram ao acertar, e subir de nível abre um anel de luz. Quando um jogador morre, o slime vira uma poça e solta gotas; o dragão explode ao cair. Números de dano simultâneos se empilham em vez de se sobrepor.

O servidor avisa o cliente por eventos: `d` (dano: x, y, valor, tipo, id do alvo, ângulo do golpe), `x` (morte: x, y, tipo de monstro, id do jogador), `k` (monstro atacando: x, y, id, ângulo), além de `a`, `f` e `w` (golpe, efeito e aviso). Os campos novos ficam no fim, então clientes antigos continuam funcionando.

Os efeitos ficam em `public/fx.js`, as animações em `public/game.js` e os desenhos em `public/art.js`. O sopro, a pancada e as garras do dragão usam imagens de fogo (`public/img/fx_*.webp`, veja [IMAGENS.md](IMAGENS.md)); o corpo do dragão se mexe junto (recua e solta o sopro, empina e despenca na pancada, dá o bote na garra).

## Som

Tudo é sintetizado na hora com WebAudio (`public/audio.js`), sem arquivos de áudio. A música é um tema calmo de floresta no clima de Payon (Ragnarok): escala pentatônica em Ré, gayageum (cordas beliscadas), flauta, drone grave e um tambor suave; perto do dragão acordado entram tambores e mais tensão. Os efeitos cobrem passos de gelatina, golpes de cada estilo de arma (estocada, corte, pancada, arco, magia e sinos), habilidades, o bote de cada monstro, sopro, pancada e garras do dragão, derrota, subida de nível e interface, com volume e lado conforme a distância. O botão **Som** (na tela inicial e ao lado do jogo) alterna entre música e efeitos, só efeitos e mudo, e a escolha fica guardada no navegador. O navegador só libera o áudio depois do primeiro toque ou tecla. **Trilhas:** `menu` (tela inicial: balada suave de piano com cordas, no clima da Yuna's song, melodia própria), `campo` (cogumelo e coelho, alegre), `selva` (lobo e javali dividem uma só música: começa pelo tema de Morroc, `deserto`, e segue para o de Payon, `floresta`, em laço; a troca de um tema para o outro acontece sozinha no fim de cada um), `sombra` (broto e aranha, séria e tensa), `anciao` (árvore anciã, sinos e graves), `toca` (perto do dragão dormindo, coração batendo) e `dragao` (tema de chefe no clima de Dark Souls II: marcha lenta, coro, violoncelo e taiko grave, só quando o dragão está acordado e perto; a trilha de guerra anterior, no clima do Labyrinth, ficou guardada como `labirinto`). Ao entrar na partida a música do menu é cortada na hora e entra a da zona. A troca acontece na virada do compasso, e ao despertar o dragão toca uma pancada com metais descendo e o rugido. Para mexer em notas, andamento ou acordes, veja `TRACKS` em `public/audio.js`.

## App instalável (PWA)

O jogo pode ser instalado como app, com ícone próprio e em tela cheia: no Android (Chrome) aparece o botão **Instalar o jogo no aparelho** na tela inicial; no iPhone o mesmo botão explica o caminho (Compartilhar, depois Adicionar à Tela de Início); no computador o Chrome e o Edge mostram o ícone de instalar na barra de endereço. Precisa de **https** (a Render já entrega) e o jogo continua exigindo internet, porque o servidor roda tudo em tempo real. Arquivos: `public/manifest.webmanifest` (nome, cores, ícones), `public/sw.js` (service worker: rede primeiro, então quem sobe uma versão nova sempre recebe a nova; contas, admin, status e dados vivos nunca ficam guardados; sem rede abre a última tela conhecida), `public/pwa.js` (registro e botão de instalar) e `public/icons/` (ícones 192, 512, maskable e da Apple). Os ícones saem do desenho do slime com `python3 tools/gerar-icones.py`. Para obrigar todos a limpar o que o app guardou, troque `VERSAO` em `public/sw.js`. A versão de teste de um arquivo só (`npm run preview`) não tem PWA.

## Contas e progresso

O jogo funciona de dois jeitos:

- **Sem conta** (padrão para quem não entrar): o progresso (mochila, equipamento, abates, missões) fica no `localStorage` do navegador e é enviado ao servidor ao entrar. O servidor valida o formato, mas quem edita o próprio save consegue itens.
- **Com conta por e-mail**: na tela inicial, **Entrar ou criar conta**. O progresso fica **no servidor**, vale em qualquer aparelho e o jogador não consegue editá-lo. O servidor grava até 15 segundos depois de cada mudança (item, abate, nível) e ao sair.

Como funciona a conta:

- E-mail e senha (8 a 128 caracteres). A senha é guardada com scrypt, nunca em texto. O login dura 90 dias e renova quando a pessoa volta. A tela inicial guarda só um código de login (`slimeio_token`), não a senha.
- Com e-mail configurado (veja abaixo), a conta nova recebe um **código de 6 dígitos** (vale 15 minutos, 5 tentativas) para confirmar o e-mail. O mesmo código serve para **recuperar a senha** ("Esqueci a senha"). A conta não confirmada pode jogar, mas quem criar outra conta com o mesmo e-mail antes da confirmação toma o lugar dela.
- Na primeira vez que uma conta nova entra no jogo, ela **importa o progresso que estava no navegador** (uma vez só, e depois de validar o formato). Isso deixa o jogador começar de onde parou, mas também significa que um save editado entra na conta. Para um jogo competitivo de verdade, defina `ALLOW_SAVE_IMPORT=0`: aí a conta sempre começa do zero.
- Uma conta só joga em um lugar por vez: entrar em outro aparelho desconecta o primeiro (com aviso). **Excluir conta** (na janela da conta, pede a senha) apaga a conta e o progresso e desconecta quem estiver jogando.
- Há limite de tentativas por e-mail e por endereço (cadastro, login, códigos, recuperação).
- Sem o servidor de contas (por exemplo na versão de teste, que roda dentro de uma página), os botões de conta nem aparecem.

Variáveis de ambiente (todas opcionais para testar localmente):

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | String de conexão de um Postgres. É o que faz as contas **durarem**. Sem ela, as contas vão para `data/contas.json` (ou `DATA_DIR`), que some quando a hospedagem reinicia (a Render grátis apaga o disco a cada deploy e reinício). A janela de conta avisa quando é assim. |
| `PGSSL` | `disable` desliga o SSL com o banco (padrão: liga, exceto em `localhost`). |
| `RESEND_API_KEY` | Envia os e-mails pelo Resend (por HTTPS). |
| `SMTP_URL` | Envia pelo SMTP, por exemplo `smtp://usuario:senha@servidor:2525`. Se tiver `@` no usuário, escreva `%40`. |
| `MAIL_FROM` | Remetente, por exemplo `SlimeRPG <contato@seudominio.com>`. |
| `TRUST_PROXY` | `1` quando o jogo roda atrás de um proxy (Render, Railway), para o limite de tentativas olhar o IP certo. O `render.yaml` já define. |
| `ALLOW_SAVE_IMPORT` | `0` impede levar o save do navegador para a conta. |
| `DATA_DIR` | Pasta do arquivo de contas quando não há `DATABASE_URL`. |

Sem `RESEND_API_KEY` nem `SMTP_URL` o jogo **não confirma o e-mail** e a recuperação de senha fica desligada: qualquer pessoa consegue criar uma conta com qualquer e-mail, e quem esquecer a senha perde a conta. Serve para testar, não para abrir ao público.

### Rankings

Dois rankings, abertos pelo botão **Rankings** (tecla `R`, e também na tela inicial). **Só jogadores com conta entram**: o save do navegador pode ser editado, o do servidor não, e os números dos rankings ficam numa linha própria por conta (não no save), então importar um save adulterado não adianta.

- **PvP**: lista quem **já chegou ao nível 20** (a coroa), ordenada pelos **abates de jogadores**. Os abates contam desde o nível 1 e **de vítimas de qualquer nível** (só a missão da Varinha continua exigindo vítimas do nível 8 para cima), e a **mesma vítima só conta de novo depois de 5 segundos** (para não dar para farmar uma segunda conta). Quem ainda não chegou ao 20 já acumula abates; entra na lista, com eles, quando chegar.
- **Dragão**: lista quem derrotou o Dragão ancestral, do **menor para o maior tempo de jogo** até a primeira vitória. "Tempo de jogo" é o tempo **conectado** da conta, somado entre todas as sessões (conta também o tempo parado e o da tela de morte). A linha mostra ainda a **duração da luta** (do primeiro golpe até a morte dele) e quantas vitórias a pessoa tem. A vitória vale para quem causa 6% ou mais da vida dele, igual à arma mítica.

Detalhes: cada lista mostra os 50 primeiros; quem está logado vê a própria posição e a linha marcada. O nome mostrado é o último que a conta usou ao entrar. Os rankings **não mostram e-mail**, e excluir a conta apaga a pessoa deles. Ficam no mesmo armazenamento das contas (tabela `hall` no Postgres), então só **duram** com `DATABASE_URL`; sem banco, zeram quando o servidor reinicia (o painel avisa). O servidor grava a cada 30 s, ao sair e ao desligar (SIGTERM). A API é `GET /api/ranking`, pública. Quem já tinha conta antes desta versão começa com tempo de jogo e abates zerados.

### Deixar as contas de pé na hospedagem grátis

1. **Banco.** Crie um Postgres grátis em [Neon](https://neon.tech) ou [Supabase](https://supabase.com), copie a *connection string* e coloque em `DATABASE_URL`. O servidor cria as tabelas sozinho. Evite o Postgres grátis da Render: ele expira depois de 30 dias.
2. **E-mail.** A Render grátis **bloqueia as portas SMTP 25, 465 e 587** ([aviso da Render](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports)), então o Gmail por SMTP padrão não funciona lá. Duas saídas:
   - **Resend** (`RESEND_API_KEY`): vai por HTTPS e não é bloqueado. Mas o remetente de teste do Resend só entrega para o dono da conta; para mandar para os jogadores é preciso um domínio seu, verificado no Resend (`MAIL_FROM` com esse domínio).
   - **SMTP em porta 2525**: alguns provedores (o Brevo, por exemplo) aceitam a porta 2525, que a Render não bloqueia. Use `SMTP_URL=smtp://USUARIO:CHAVE@smtp-relay.brevo.com:2525` e confira no provedor as regras de remetente e o limite diário do plano grátis. Eu não testei o envio de e-mail de verdade neste projeto; os testes usam um envio de mentira.
   Num VPS ou em um plano pago da Render, o SMTP normal (inclusive Gmail com senha de app) funciona.
3. Em **Environment** do serviço na Render, adicione `DATABASE_URL`, o e-mail escolhido e `MAIL_FROM`. O `TRUST_PROXY` já vem no `render.yaml`.

## Loja de skins (chapéus)

Skins são **só visuais**: nada de arma, roupa, nível ou atributo (o jogo tem PvP desde o nível 1 e ranking). Hoje são chapéus, desenhados por código em `public/art.js` (`HATS`), que acompanham pulo, achatar, inclinação e golpe:

| Pacote | Preço | O que libera |
|---|---|---|
| Chapéus | R$ 2 | cogumelo, marinheiro, coroinha de flores, cartola |
| Premium Mago | R$ 5 | chapéu de mago (estrelas que piscam) |
| Premium Pirata | R$ 5 | chapéu de pirata (caveira e bordado dourado) |
| Tudo | R$ 10 | os 6 (em vez de R$ 12) |

**Como funciona.** A loja fica na tela inicial e no menu do jogo (botão "Skins"). Cada pacote mostra o preço e um QR de Pix (BR Code estático com o valor, mais o "copia e cola"). A pessoa paga, manda o comprovante e o e-mail da conta para o contato, e **você libera na mão** (abaixo). O que a conta tem fica no servidor (`skins` na conta), a escolha é feita em "Minhas skins" e os outros jogadores veem o chapéu. O servidor recusa equipar skin que a conta não possui. **Só contas por e-mail** compram: o progresso salvo no navegador pode ser editado.

**Variáveis de ambiente (todas na hospedagem, nunca no código):**

| Variável | Para quê | Padrão |
|---|---|---|
| `ADMIN_TOKEN` | senha do administrador para liberar skins (16+ caracteres). **Sem ela a liberação fica desligada (503).** | nenhum |
| `PIX_CHAVE` | chave Pix que recebe | o e-mail de contato |
| `CONTATO_EMAIL` | e-mail mostrado na loja | `guiaugusto_32@outlook.com` |
| `PIX_NOME` / `PIX_CIDADE` | nome e cidade que aparecem no app do banco (sem acento, até 25 e 15 letras) | `SLIMERPG` / `BRASIL` |

**Liberar um pacote** (ids: `chapeus`, `mago`, `pirata`, `tudo`; o e-mail é o da conta; `"remover": true` desfaz um engano):

```
curl -X POST https://SEU-SITE/admin/skin -H "Authorization: Bearer SUA_ADMIN_TOKEN" -d '{"email":"cliente@exemplo.com","pack":"mago"}'
```

A senha é comparada de forma segura, e depois de 8 erros seguidos o IP fica bloqueado por 15 minutos. Se o jogador estiver online, o chapéu aparece na hora. Para o Pix/QR valer, confira no app do banco que o nome e a chave estão como esperado (ajuste `PIX_NOME`/`PIX_CIDADE`). Na versão de teste (preview) a loja aparece desativada.

## Estrutura

```
server.js          servidor HTTP + WebSocket (salas, combate, XP, missões, dragão)
accounts.js        contas por e-mail: cadastro, login, códigos, progresso no Postgres ou em arquivo
pix.js             Pix copia e cola (BR Code com CRC16) para a loja de skins
ranking.js        rankings por conta (PvP no nível 20 e tempo de jogo até derrotar o dragão), guardados junto com as contas
game-data.js       regras e dados, usados pelo servidor e pelo navegador
public/            cliente: index.html, style.css, game.js, conta.js (tela de conta), loja.js + qr.js (loja de skins e QR do Pix), art.js, fx.js, audio.js (música e efeitos), pwa.js + sw.js + manifest.webmanifest (app instalável), icons/, img/
test/sim.js        testes de regras (npm test)
test/contas.js     testes das contas (arquivo, Postgres de mentira, e-mail de mentira, entrada no jogo)
test/ranking.js    testes dos rankings (regras, gravação, API e eventos no servidor)
test/skins.js      testes da loja (Pix, posse e equipar, liberação de administrador, persistência, skins no jogo)
test/pwa.js        testes do app instalável (manifesto, ícones, service worker, ligações no index.html)
tools/simular.js   simulador de equilíbrio com robôs (armas, progressão, dragão)
tools/calibrar-dano.js  confere o teto de dano por golpe de cada arma
tools/recortar-fundo.py  recorta o fundo liso de uma ilustração e amplia (usado nas imagens do dragão)
tools/preparar-fx.py     transforma fogo gerado em fundo preto em efeito com transparência (jato, onda, garra)
tools/gerar-icones.py    gera os ícones do app a partir do slime (public/icons/)
tools/recortar-slime.py  recorta as poses do slime com a mesma escala (veja IMAGENS.md)
tools/recortar-icone.py  recorta o ícone de uma arma ou roupa do fundo cinza e reduz para 256 px
tools/             também: gerar-preview.js e o script que baixa as imagens
```

## Simulador de equilíbrio

O simulador roda o servidor de verdade, sem rede e sem esperar o relógio, com robôs que jogam sozinhos. Serve para testar uma ideia antes de mexer no jogo.

```bash
node tools/simular.js armas        # arena com as 9 armas × 6 faixas, de perto e de longe
node tools/simular.js progressao   # robôs do nível 1 ao 20, sozinhos e em sala cheia
node tools/simular.js dragao       # grupos de 1, 3, 5 e 10 robôs contra o dragão
node tools/simular.js tudo
```

Opções: `--rapido` (menos repetições), `--json arquivo.json`, `--faixa 2,3` e `--fam arco,varinha` (limitam o teste de armas) e `--ajuste '{"MOBS.lobo.dmg":10,"FAMILIES.arco.mult":1.4}'`, que muda números do jogo só durante a simulação. Os resultados e as decisões estão em [EQUILIBRIO.md](EQUILIBRIO.md).

## Hospedagem

Qualquer serviço que rode Node com WebSocket serve (Render, Railway, um VPS). Hospedagem só de site estático (GitHub Pages, Netlify, Vercel) não serve, porque o jogo precisa de um servidor ligado. Comando de início: `npm start`. O servidor lê a porta de `PORT`. Em HTTPS, o cliente usa `wss://` sozinho. As salas ficam na memória, então use uma única instância. Para ter contas que duram, veja "Contas e progresso".

### Grátis na Render

O arquivo `render.yaml` já está pronto para o plano gratuito.

1. Crie uma conta no GitHub e um repositório novo. Envie todo o conteúdo da pasta (o `.gitignore` já deixa `node_modules` de fora).
2. Crie uma conta em https://render.com e entre com o GitHub.
3. Em **New > Blueprint**, escolha o repositório e confirme. A Render lê o `render.yaml`, instala, baixa as imagens que faltam e inicia o jogo.
4. A Render vai pedir o valor de `ADMIN_TOKEN` (a senha para liberar skins). Digite no painel; ela não fica salva no repositório.
5. **Banco para as contas (importante):** crie um Postgres grátis (por exemplo em https://neon.tech), copie a string de conexão e coloque em **Environment > `DATABASE_URL`**. Sem isso, contas e skins compradas somem a cada reinício, e quem pagou perderia a skin. Depois reinicie o serviço.
6. Quando o deploy terminar, o jogo abre no endereço `https://slimerpg-xxxx.onrender.com` (a Render mostra o endereço exato no painel).

Como o plano gratuito funciona (documentação da Render):

- O serviço dorme depois de 15 minutos sem tráfego. Mensagens de quem está jogando contam como tráfego, então ele fica acordado enquanto houver jogadores.
- Quem entrar com o serviço dormindo espera cerca de 1 minuto para ele acordar.
- 512 MB de memória, uma instância, 750 horas por mês.
- Quando dorme, as salas se perdem. O progresso dos jogadores não: fica no navegador de cada um e, para quem tem conta, no banco (`DATABASE_URL`). O disco da Render grátis não guarda nada entre reinícios.

Para ter um domínio próprio depois, registre o domínio e adicione-o em **Settings > Custom Domains** do serviço.

## Testes

`npm test` sobe o servidor, conecta clientes falsos e confere: salas de 20, pontos de atributo (8 por nível, máximo 60), subida de nível, PvP ligado desde o nível 1, morte, XP de PvP, equipamento, fusão, drops sem duplicata, o catálogo da mochila, as 9 missões, as 9 armas atacando e usando habilidade, o dragão (dorme até levar golpe, vida que cresce com o grupo, arma mítica e Peitoral Dracônico para quem causa dano, com os atributos dele) e a validação do save. `node test/ranking.js` (também roda no `npm test`) confere os rankings: coroa, abates (nível mínimo da vítima e intervalo para repetir), tempo de jogo, ordenação dos dois rankings, gravação no arquivo e no Postgres de mentira, exclusão da conta, e os eventos de verdade no servidor (matar jogador, subir ao 20, derrotar o dragão, a API). `node test/contas.js` (também roda no `npm test`) confere as contas: cadastro, login, senha errada, códigos e recuperação de senha, limites de tentativas, exclusão, o mesmo conjunto de testes no arquivo e num Postgres de mentira, e a entrada no jogo com token (progresso vindo do servidor, importação do navegador, conta aberta em outro lugar, servidor de contas fora do ar).

## Modos de jogo

Na tela inicial o jogador escolhe o modo (a escolha fica guardada no navegador). **Cada modo tem as suas próprias salas** (até 30 jogadores por sala), então ninguém de um modo cai em outro. O progresso da conta (itens e missões) vale no Clássico e no Cooperativo. **O PvP não usa nem guarda as armas dos outros modos**: nele você começa só com a faca e as armas míticas que já ganhou do dragão, e o que achar lá (itens comuns, missões, abates) não é salvo. Só as armas míticas dropadas do dragão ficam guardadas; o resto do seu save continua exatamente como estava (`makePlayer` e `saveMsg` em `server.js`).

- **Clássico**: o jogo de sempre, com os monstros dando 1,5x de XP (matar jogador dá 40% de todo o XP que ele tinha, somando os níveis já passados).
- **Cooperativo**: ninguém fere ninguém (sem PvP) e os monstros dão 1,5x de XP. O objetivo é derrubar o dragão no menor tempo: o cronômetro corre da primeira pancada até ele cair e aparece na faixa do rodapé, junto com o recorde da sala (os 5 melhores tempos ficam na memória do servidor e somem se ele reiniciar). O dragão continua exigindo nível 20 para ser ferido.
- **PvP**: todos contra todos, os monstros dão 3x de XP e a sala conta **abates, mortes e série** (3 abates seguidos sem morrer anunciam a série). O ranking da sala ordena por abates.

Os valores de XP ficam em `MODES` em `game-data.js`. Teste: `test/modos.js`.

**Modo espectador e contador de abates (campeonatos).** Na tela inicial, o botão *Assistir como espectador* entra no modo escolhido com câmera livre: o espectador é invisível, não luta e não conta como jogador (até 10 por sala; vai para a sala mais cheia, e o botão *Próxima sala* troca de sala). Quem entra com a conta do **administrador** vê também o botão *Ligar contador de abates*: o painel *Abates da sala* aparece na tela de todos da sala e conta só quem joga **com conta**, vítimas de qualquer nível, com a regra de 5 segundos para a mesma vítima. *Zerar* recomeça a contagem e *Desligar* apaga o painel. Já vêm como administradores guiaugusto_32@outlook.com e guiiaugusto31@gmail.com; outros e-mails entram pela variável de ambiente `ADMIN_EMAIL` (na Render: Environment → `ADMIN_EMAIL` = seu e-mail; vários separados por vírgula). A conta precisa existir e estar confirmada; crie a sua conta antes, para ninguém registrar esse e-mail primeiro.

**Rankings por modo** (só para quem joga com conta). O painel Rankings tem 3 abas, uma por modo: *Clássico* (dois rankings: *Abates* de quem chegou ao nível 20 e *Dragão*, o menor tempo de jogo até a 1ª vitória), *PvP* (abates de qualquer nível; a mesma vítima só conta de novo depois de 5 segundos) e *PvE* (modo Cooperativo: menor tempo de luta, em minutos, da 1ª pancada até o dragão cair; vale o melhor tempo de cada conta). Cada abate e cada vitória só conta no ranking do modo em que aconteceu.

Cada ranking tem duas visões: **Semanal** (zera toda segunda-feira às 0h, horário de Brasília; no ranking do dragão vale o menor tempo de luta da semana) e **Desde o início** (o geral, que nunca zera). O que acontece na semana soma nas duas.
