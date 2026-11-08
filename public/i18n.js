/* SlimeRPG em inglês: o jogo é escrito em português e este arquivo traduz o que aparece na tela.
   Em vez de mexer em cada texto do código, a tradução acontece na saída: textos e atributos da página (inclusive os que
   o jogo cria depois) e os textos desenhados no canvas. Primeiro regras com ordem de palavras diferente, depois a troca
   de trechos conhecidos (do maior para o menor). Idioma: o escolhido no menu; sem escolha, o do navegador. */
(function () {
  'use strict';
  var KEY = 'slimeLang';
  function pick() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) { /* sem URLSearchParams */ }
    if (q === 'en' || q === 'pt') { try { localStorage.setItem(KEY, q); } catch (e) { /* sem armazenamento */ } return q; }
    try { var s = localStorage.getItem(KEY); if (s === 'en' || s === 'pt') return s; } catch (e) { /* sem armazenamento */ }
    return /^pt/i.test(navigator.language || '') ? 'pt' : 'en';
  }
  var LANG = pick();
  window.LANG = LANG;
  window.setLang = function (l) { try { localStorage.setItem(KEY, l); } catch (e) { /* sem armazenamento */ } location.reload(); };
  document.documentElement.lang = LANG === 'en' ? 'en' : 'pt-BR';
  if (LANG !== 'en') return;

  // Trechos PT -> EN (frases inteiras e pedaços que o código junta com números e nomes)
  var D = {
    // menu e telas
    'Uma floresta, trinta slimes, nenhuma trégua. Mate monstros, suba até o nível 20 e use a coroa.': 'One forest, thirty slimes, no truce. Defeat monsters, reach level 20 and wear the crown.',
    'Nome do slime': 'Slime name', 'Como te chamam na floresta?': 'What do they call you in the forest?', 'Cor do slime': 'Slime color',
    'Outra cor': 'Other color', 'Escolher': 'Pick', 'Cor': 'Color', 'Matiz': 'Hue', 'Brilho': 'Brightness', 'Intensidade': 'Intensity',
    'Entrar ou criar conta': 'Sign in or create account',
    'Com uma conta, o progresso fica salvo no servidor e vale em qualquer aparelho.': 'With an account, your progress is saved on the server and works on any device.',
    'Crie sua conta até': 'Create your account by', 'e ganhe o': 'and get the', ', exclusivo de quem chegou primeiro.': ', exclusive to early players.',
    'Modo de jogo': 'Game mode', 'Modo': 'Mode', 'Entrar na floresta': 'Enter the forest', 'Assistir como espectador': 'Watch as spectator',
    'Câmera livre: você anda pelo mapa sem ser visto e sem lutar': 'Free camera: roam the map unseen and without fighting',
    'Loja de skins': 'Skin shop', 'Chamar amigos para jogar': 'Invite friends to play', 'Sobre o jogo e perguntas frequentes': 'About the game and FAQ',
    'Sobre o jogo': 'About the game', 'Discord do jogo: eventos e torneios': 'Game Discord: events and tournaments',
    'Instalar o jogo no aparelho': 'Install the game on this device', 'Como jogar': 'How to play',
    'Você só anda:': 'You only move:', 'ou setas no PC, joystick no celular.': 'or arrow keys on PC, joystick on mobile.',
    'As armas atacam e usam habilidades sozinhas, no alvo mais próximo ou na direção do mouse.': 'Weapons attack and use skills on their own, at the nearest target or toward the mouse.',
    'A cada nível um dado 1d3 sobe cada atributo (máximo 60). Força, Destreza e Mana liberam armas; Saúde dá vida.': 'Each level a 1d3 die raises every attribute (max 60). Strength, Dexterity and Mana unlock weapons; Health gives HP.',
    'abre a mochila (todos os itens aparecem, bloqueados até você ganhar),': 'opens the backpack (every item is listed, locked until you earn it),',
    'as missões e': 'the quests and', 'os rankings.': 'the rankings.',
    'Ao morrer você perde o nível atual, mas guarda seus equipamentos.': 'When you die you lose your current level, but keep your gear.',
    'No centro do mapa dorme o': 'In the center of the map sleeps the',
    '. Só quem está no nível 20 consegue machucá-lo, e ele larga uma arma mítica.': '. Only level 20 players can hurt it, and it drops a mythic weapon.',
    'Toque e arraste em qualquer lugar para andar': 'Touch and drag anywhere to move',
    'Hora do Slime': 'Slime Hour', 'agora!': 'now!', 'XP em dobro por mais': 'Double XP for',
    ': toda sexta às': ': every Friday at', 'h, XP em dobro por': ':00 (Brasília), double XP for', 'min. Começa em': 'min. Starts in',
    'Sexta 20h: XP em dobro': 'Friday 8pm: double XP',
    // modos
    'Clássico': 'Classic', 'Cooperativo': 'Co-op',
    'O jogo de sempre: monstros com 1,5x de XP, PvP liberado e o dragão no centro.': 'The usual game: monsters give 1.5x XP, PvP on and the dragon in the center.',
    'Todos do mesmo lado: sem PvP, monstros com 1,5x de XP e um cronômetro para derrubar o dragão no menor tempo.': 'Everyone on the same side: no PvP, monsters give 1.5x XP and a timer to take down the dragon as fast as possible.',
    'Todos contra todos: os monstros dão 3x mais XP para subir rápido, e a sala conta seus abates, mortes e série.': 'Free for all: monsters give 3x XP to level fast, and the room counts your kills, deaths and streak.',
    // morte, conexão, compartilhar
    'Você caiu': 'You fell', 'Derrotado por': 'Defeated by', '. Você perdeu o nível': '. You lost level',
    'e os atributos, mas seus equipamentos continuam com você.': 'and your attributes, but you keep your gear.',
    'Renascer': 'Respawn', 'Voltar ao menu': 'Back to menu', 'Compartilhar meu resultado': 'Share my result', 'Compartilhar': 'Share',
    'Cheguei ao nível': 'I reached level', 'Vem jogar comigo!': 'Come play with me!',
    'Grátis no navegador: slimerpg.onrender.com': 'Free in your browser: slimerpg.onrender.com',
    'Imagem baixada e link copiado!': 'Image downloaded and link copied!',
    'Conexão perdida': 'Connection lost', 'O servidor parou de responder.': 'The server stopped responding.',
    'Seu progresso está guardado neste navegador.': 'Your progress is saved in this browser.', 'Seu progresso está guardado na sua conta.': 'Your progress is saved in your account.',
    'Reconectar': 'Reconnect', 'Conectando…': 'Connecting…', 'Carregando…': 'Loading…', 'Você foi desconectado.': 'You were disconnected.',
    'Você saiu do jogo': 'You left the game', 'Sua conta entrou em outro lugar.': 'Your account signed in somewhere else.', 'Sua conta foi excluída.': 'Your account was deleted.',
    'Não foi possível conectar ao servidor. Verifique se ele está rodando.': 'Could not connect to the server.', 'Sem conexão com o servidor. Tente de novo.': 'No connection to the server. Try again.',
    'Sem conexão com o servidor.': 'No connection to the server.', 'Sair? Toque de novo': 'Leave? Tap again', 'Sair da partida e voltar à tela inicial': 'Leave the match and go back to the title screen',
    // HUD
    'Tempo de jogo': 'Play time', 'Ranking da sala': 'Room ranking', 'Nv': 'Lv', 'ab · Nv': 'K · Lv', 'Abates': 'Kills', '· Mortes': '· Deaths', '· Série': '· Streak', '· Recorde': '· Best',
    'Próxima sala': 'Next room', 'Espectador · sala': 'Spectator · room', 'Espectador': 'Spectator', 'Só existe uma sala neste modo agora.': 'There is only one room in this mode right now.',
    'Essa sala está cheia de espectadores.': 'This room is full of spectators.', 'Contador de abates': 'Kill counter', 'Ligar contador de abates': 'Turn on kill counter', 'Desligar contador de abates': 'Turn off kill counter',
    'Zerar a contagem de abates?': 'Reset the kill count?', 'Zerar': 'Reset',
    'Contador de abates ligado: vale quem joga com conta': 'Kill counter on: only players with accounts count', 'Contador de abates desligado': 'Kill counter off',
    'Mira: alvo próximo': 'Aim: nearest target', 'Mira: cursor': 'Aim: cursor', 'As armas miram no alvo mais próximo.': 'Weapons aim at the nearest target.', 'As armas miram na direção do cursor.': 'Weapons aim toward the cursor.',
    'Como as armas escolhem o alvo': 'How weapons pick a target', 'Som: música e efeitos': 'Sound: music and effects', 'Música e efeitos sonoros': 'Music and sound effects',
    'Mochila (I)': 'Backpack (I)', 'Mochila': 'Backpack', 'Missões (M)': 'Quests (M)', 'Missões': 'Quests', 'Rankings (R)': 'Rankings (R)', 'Menu': 'Menu',
    'Distribuir pontos de atributo (P)': 'Spend attribute points (P)', 'Distribuir pontos de atributo': 'Spend attribute points',
    'Voltando para casa e se curando': 'Going home and healing', 'Dragão dormindo': 'Dragon asleep', 'Dragão caído': 'Dragon down', 'Tempo para derrubar o dragão:': 'Time to take down the dragon:',
    'NOVO RECORDE da sala!': 'NEW room RECORD!', '(primeiro tempo da sala)': '(first time in this room)', '(recorde:': '(record:', 'Nível máximo': 'Max level',
    '🎲 dado 1d3 em cada atributo': '🎲 1d3 die on each attribute', 'dado 1d3 em cada atributo': '1d3 die on each attribute',
    // atributos
    'Atributos': 'Attributes', 'Força': 'Strength', 'Destreza': 'Dexterity', 'Mana': 'Mana', 'Saúde': 'Health', 'Maior atributo': 'Highest attribute', 'qualquer atributo': 'any attribute',
    'Dano das armas de Força e requisito delas.': 'Damage of Strength weapons and their requirement.',
    'Dano das armas de Destreza e requisito delas.': 'Damage of Dexterity weapons and their requirement.',
    'Dano das armas de Mana e requisito delas.': 'Damage of Mana weapons and their requirement.',
    'Vida: +10 por ponto. Requisito dos peitorais.': 'HP: +10 per point. Chestplate requirement.',
    'Você ainda tem': 'You still have', 'pontos guardados para distribuir.': 'points saved to spend.', 'ponto guardado para distribuir.': 'point saved to spend.',
    'A cada nível o dado rola': 'Each level the die rolls', 'em cada um. Ao morrer, tudo volta ao começo.': 'on each one. When you die, everything resets.',
    // mochila e itens
    'conquistados': 'collected', 'Toque em um item para ver os detalhes.': 'Tap an item to see its details.', 'Iniciais': 'Starters', 'Inicial': 'Starter',
    'Arma inicial': 'Starter weapon', 'Peitoral inicial': 'Starter chestplate', 'Arma 1 (equipada)': 'Weapon 1 (equipped)', 'Arma 2 (equipada)': 'Weapon 2 (equipped)',
    'Equipar na arma 1': 'Equip as weapon 1', 'Equipar na arma 2': 'Equip as weapon 2', 'Equipar': 'Equip', 'Equipado': 'Equipped', 'Equipamento': 'Equipment',
    'Arma 1': 'Weapon 1', 'Arma 2': 'Weapon 2', 'Peitoral': 'Chestplate', 'Peito': 'Chest', 'Requisito não cumprido:': 'Requirement not met:', 'Requisito': 'Requirement',
    'Você já começa com este item.': 'You start with this item.', 'Como conseguir': 'How to get it', 'Cai de': 'Dropped by', 'Cai do': 'Dropped by the', 'Chefe': 'Boss',
    'Ataque': 'Attack', 'Habilidade mista:': 'Mixed skill:', 'Habilidade': 'Skill', 'Dano e recarga': 'Damage and cooldown', 'Alcance': 'Range', 'Velocidade': 'Speed',
    'golpes por segundo': 'hits per second', 'de dano a cada': 'damage every', 'Resistência': 'Resistance', 'resiste golpes': 'resists hits', 'resiste magia': 'resists magic',
    'mais vida': 'more HP', 'vida e resistências': 'HP and resistances', '% a dano físico': '% vs physical damage', '% a dano mágico': '% vs magic damage', '% da vida': '% of HP', 's de vida': 's of HP',
    'bloqueada': 'locked', 'bloqueado': 'locked', '· perigoso para você': '· dangerous for you', 'Vida extra': 'Extra HP',
    'O mesmo item nos dois slots funde a habilidade: +50% de dano e área maior, um disparo por ciclo. Armas diferentes criam uma habilidade mista.': 'The same item in both slots fuses the skill: +50% damage and a bigger area, one cast per cycle. Different weapons create a mixed skill.',
    '. As duas habilidades saem juntas (+10% de dano) com uma recarga só de': '. Both skills fire together (+10% damage) with a single cooldown of',
    '% de chance de levar este peitoral a cada vitória.': '% chance to get this chestplate each victory.',
    // raridades (depois que a regra põe a raridade antes do nome)
    'Comum': 'Common', 'Incomum': 'Uncommon', 'Raras': 'Rare', 'Raros': 'Rare', 'Rara': 'Rare', 'Raro': 'Rare', 'Épicas': 'Epic', 'Épicos': 'Epic', 'Épica': 'Epic', 'Épico': 'Epic',
    'Lendárias': 'Legendary', 'Lendários': 'Legendary', 'Lendária': 'Legendary', 'Lendário': 'Legendary', 'Míticas': 'Mythic', 'Míticos': 'Mythic', 'Mítica': 'Mythic', 'Mítico': 'Mythic',
    'comum': 'common', 'incomum': 'uncommon', 'rara': 'rare', 'épica': 'epic', 'lendária': 'legendary', 'mítica': 'mythic',
    // armas e peitorais
    'Faca': 'Knife', 'Martelo': 'Hammer', 'Maça': 'Mace', 'Espada': 'Sword', 'Rapieira': 'Rapier', 'Arco': 'Bow', 'Chicote': 'Whip', 'Varinha': 'Wand', 'Cajado': 'Staff', 'Sinos': 'Bells',
    'Casaca de Gelatina': 'Jelly Coat', 'Peitoral Vital': 'Vital Chestplate', 'Peitoral Arcano': 'Arcane Chestplate', 'Peitoral Blindado': 'Armored Chestplate', 'Peitoral Dracônico': 'Draconic Chestplate',
    'Lâmina do dragão': 'Dragon Blade', 'Coração do dragão': 'Dragon Heart', 'Flecha-dragão': 'Dragon Arrow', 'Açoite ígneo': 'Fiery Lash', 'Chama primordial': 'Primal Flame',
    // habilidades e golpes
    'Golpe único': 'Single strike', 'Golpe em arco': 'Arc strike', 'Golpe em leque': 'Fan strike', 'Golpe com impacto em área': 'Strike with area impact', 'Golpe atordoante': 'Stunning strike',
    'Corte em arco': 'Arc slash', 'Corte duplo': 'Double slash', 'Onda cortante': 'Cutting wave', 'Onda de impacto': 'Shockwave', 'Onda sonora': 'Sound wave', 'Onda ao redor de você': 'Wave around you',
    'Estocada': 'Thrust', 'Sequência de estocadas': 'Thrust combo', 'Chuva de estocadas': 'Thrust storm', 'Flecha explosiva': 'Explosive arrow', 'Flecha perfurante': 'Piercing arrow', 'Flecha': 'Arrow',
    'Chuva de flechas': 'Arrow rain', 'Tempestade de flechas': 'Arrow storm', 'Tiro duplo': 'Double shot', 'Chicotada': 'Lash', 'Giro de chicote': 'Whip spin', 'Chicote de espinhos': 'Thorn whip',
    'Tempestade de açoites': 'Lash storm', 'Açoite': 'Lash', 'Laço': 'Lasso', 'Faísca': 'Spark', 'Raio duplo': 'Double bolt', 'Raio que atravessa tudo': 'Bolt that pierces everything',
    'Corrente de raios': 'Chain lightning', 'Bola de fogo': 'Fireball', 'Meteoro': 'Meteor', 'Orbe arcano': 'Arcane orb', 'Orbe que explode ao atingir': 'Orb that explodes on hit', 'Orbe': 'Orb',
    'Chuva de orbes': 'Orb rain', 'Nova de energia': 'Energy nova', 'Escudo arcano': 'Arcane shield', 'Cura em área': 'Area heal', 'Explosão ao redor': 'Explosion around you', 'Canção': 'Song',
    'Sinfonia': 'Symphony', 'Réquiem': 'Requiem', 'Repique atordoante': 'Stunning chime', 'Repique': 'Chime', 'Pancada no chão': 'Ground slam', 'Pancada sísmica': 'Seismic slam',
    'Salto esmagador': 'Crushing leap', 'Terremoto': 'Earthquake', 'Tremor': 'Tremor', 'Fissura': 'Fissure', 'Impacto': 'Impact', 'Investida atravessando inimigos': 'Dash through enemies',
    'Investida': 'Charge', 'Passo-sombra': 'Shadow step', 'Lâmina giratória': 'Spinning blade', 'Tempestade de lâminas': 'Blade storm', 'Lâmina': 'Blade', 'Dança das chamas': 'Flame dance',
    'Projétil': 'Projectile', 'Rajada de projéteis': 'Projectile burst', 'Cataclismo': 'Cataclysm', 'Singularidade': 'Singularity', 'Julgamento': 'Judgment', 'Veredito': 'Verdict', 'Quebra-escudo': 'Shield breaker',
    'Esmagador': 'Crushing', 'Certeira': 'Precise', 'Cortante': 'Cutting', 'Veloz': 'Swift', 'Selvagem': 'Wild', 'Sagrada': 'Holy', 'Sagrado': 'Holy', 'Arcana': 'Arcane', 'Místico': 'Mystic', 'médio': 'medium',
    // monstros e regiões
    'Cogumelo-fungo': 'Fungus Shroom', 'Coelho-musgo': 'Moss Bunny', 'Lobo-raiz': 'Root Wolf', 'Javali-espinho': 'Thorn Boar', 'Broto ancião': 'Elder Sprout', 'Aranha-véu': 'Veil Spider',
    'Árvore anciã': 'Elder Tree', 'Dragão ancestral': 'Ancient Dragon', 'Dragão': 'Dragon', 'Esporos': 'Spores', 'Pulo pesado': 'Heavy leap', 'Mordida': 'Bite', 'Raízes': 'Roots',
    'Tiro de teia': 'Web shot', 'Galho pesado': 'Heavy branch', 'Bosque dos Cogumelos': 'Mushroom Grove', 'Campina dos Coelhos': 'Bunny Meadow', 'Mata dos Lobos': 'Wolf Woods',
    'Charneca dos Javalis': 'Boar Heath', 'Bosque Ancião': 'Elder Grove', 'Ninho das Aranhas': 'Spider Nest', 'Clareira Anciã': 'Elder Clearing', 'Toca do Dragão': 'Dragon\'s Lair',
    // feed do servidor
    'foi derrotado por': 'was defeated by', 'foi derrotado': 'was defeated', 'derrotou': 'defeated', '(nv': '(lv', 'série de': 'streak of', 'chegou ao nível': 'reached level',
    'completou a missão:': 'completed the quest:', 'arrancou o': 'ripped the', 'despertou o': 'woke the', 'voltou a dormir.': 'went back to sleep.', 'voltou ao centro do mapa.': 'went back to the center of the map.',
    'e ganhou a coroa!': 'and won the crown!', 'Primeira vitória sobre o dragão! Seu tempo de jogo:': 'First win over the dragon! Your play time:', 'Seu melhor tempo no cooperativo! Veja em Rankings.': 'Your best co-op time! See Rankings.',
    // missões
    'Missão:': 'Quest:', 'Missão': 'Quest', 'Recompensa:': 'Reward:', 'Concluída:': 'Done:', 'missão concluída.': 'quest done.', 'missões concluídas.': 'quests done.',
    'Cada missão concede uma arma lendária. O progresso de abates e vitórias é guardado entre as vidas.': 'Each quest grants a legendary weapon. Kill and win progress is kept between lives.',
    'Matar 100 javalis-espinho': 'Defeat 100 thorn boars', 'Matar 100 lobos-raiz': 'Defeat 100 root wolves', 'Matar 40 aranhas-véu': 'Defeat 40 veil spiders', 'Matar 60 brotos anciões': 'Defeat 60 elder sprouts',
    'Ficar vivo por 10 minutos': 'Stay alive for 10 minutes', 'Ficar 1 minuto sem tomar dano': 'Go 1 minute without taking damage', 'Chegar ao nível 20 em uma vida': 'Reach level 20 in one life',
    'Matar um monstro forte com até 3 golpes': 'Defeat a strong monster in 3 hits or fewer', 'Derrotar 5 jogadores de nível 8 ou mais': 'Defeat 5 players of level 8 or higher',
    'Só conta enquanto você está lutando.': 'Only counts while you are fighting.', 'Vale só para a vida atual.': 'Only counts for your current life.',
    'ganha uma arma mítica aleatória.': 'gets a random mythic weapon.', 'Você já tem todas as armas míticas.': 'You already have all mythic weapons.',
    // rankings
    'Rankings': 'Rankings', 'Ranking': 'Ranking', 'Semanal': 'Weekly', 'Desde o início': 'All time', 'Período': 'Period', 'Clássico: abates': 'Classic: kills', 'Clássico: tempo até o dragão': 'Classic: time to the dragon',
    'Cooperativo: tempo até o dragão': 'Co-op: time to the dragon', 'PvP: abates': 'PvP: kills', 'Zera em': 'Resets in', 'Vencedor da semana passada:': 'Last week\'s winner:',
    'Você:': 'You:', 'º na semana, com': ' this week, with', 'º, com': ', with', 'de jogo.': 'of play.', 'de luta.': 'of fighting.', 'luta de': 'fight of', 'Você já jogou': 'You have played',
    '. Derrote o dragão para entrar neste ranking.': '. Defeat the dragon to enter this ranking.', 'vitórias': 'wins', 'vitória': 'win', 'abates.': 'kills.', 'abate.': 'kill.', 'abates': 'kills', 'abate': 'kill',
    'Modo Clássico, esta semana: abates de jogadores (a mesma vítima só conta de novo depois de 5 minutos).': 'Classic mode, this week: player kills (the same victim only counts again after 5 minutes).',
    'Modo Clássico, esta semana: menor tempo de luta contra o Dragão ancestral.': 'Classic mode, this week: shortest fight against the Ancient Dragon.',
    'Modo Clássico. Menor tempo de jogo (conectado, somando todas as sessões) até derrotar o Dragão ancestral pela primeira vez.': 'Classic mode. Shortest play time (online, all sessions) until defeating the Ancient Dragon for the first time.',
    'Modo Cooperativo, esta semana: menor tempo de luta da equipe contra o Dragão ancestral.': 'Co-op mode, this week: the team\'s shortest fight against the Ancient Dragon.',
    'Modo Cooperativo. Menor tempo de luta, em minutos, da primeira pancada até o Dragão ancestral cair (o cronômetro da sala). Vale o melhor tempo de cada conta.': 'Co-op mode. Shortest fight, in minutes, from the first hit until the Ancient Dragon falls (the room timer). Each account\'s best time counts.',
    'Modo PvP, esta semana: abates de jogadores de qualquer nível.': 'PvP mode, this week: kills of players of any level.',
    'Modo PvP. Abates de jogadores de qualquer nível (a mesma vítima só conta de novo depois de 5 minutos).': 'PvP mode. Kills of players of any level (the same victim only counts again after 5 minutes).',
    'Nenhuma equipe derrubou o dragão no cooperativo ainda.': 'No team has taken down the dragon in co-op yet.', 'Ninguém fez abates no modo PvP ainda.': 'Nobody has PvP kills yet.',
    'Ninguém com conta chegou ao nível 20 ainda. Seja o primeiro.': 'Nobody with an account has reached level 20 yet. Be the first.', 'Ninguém pontuou nesta semana ainda. Seja o primeiro.': 'Nobody has scored this week yet. Be the first.',
    'Ninguém derrotou o dragão ainda. Só quem está no nível 20 consegue machucá-lo.': 'Nobody has defeated the dragon yet. Only level 20 players can hurt it.',
    'Chegue ao nível 20 para entrar neste ranking. Seus abates até lá já estão sendo contados (': 'Reach level 20 to enter this ranking. Your kills until then are already counted (',
    'Derrote o dragão no Clássico para entrar neste ranking da semana.': 'Defeat the dragon in Classic to enter this week\'s ranking.', 'Derrube o dragão no Cooperativo para entrar neste ranking da semana.': 'Take down the dragon in Co-op to enter this week\'s ranking.',
    'Derrube o dragão no modo Cooperativo para entrar neste ranking.': 'Take down the dragon in Co-op mode to enter this ranking.',
    'Você ainda não fez abates no Clássico nesta semana.': 'You have no Classic kills this week yet.', 'Você ainda não fez abates no PvP nesta semana.': 'You have no PvP kills this week yet.', 'Você ainda não fez abates no modo PvP.': 'You have no PvP kills yet.',
    'Só quem joga com conta entra nos rankings. Entre ou crie uma conta na tela inicial.': 'Only players with an account enter the rankings. Sign in or create one on the title screen.',
    'Os rankings não estão disponíveis agora. Eles precisam do servidor com contas ligadas (não funcionam na versão de teste).': 'Rankings are not available right now.', 'Rankings indisponíveis.': 'Rankings unavailable.',
    'Neste servidor os rankings zeram quando ele reinicia (sem banco de dados ligado).': 'On this server rankings reset when it restarts.',
    '(segunda-feira, 0h, horário de Brasília).': '(Monday, midnight, Brasília time).', '(você)': '(you)', '(você tem': '(you have',
    // loja e skins
    'Loja': 'Shop', 'Minhas skins': 'My skins', 'Skins': 'Skins', 'Chapéus': 'Hats', 'Chapéu': 'Hat', 'Efeito ao abater jogador': 'Effect when defeating a player', 'Nenhum': 'None', 'Tudo': 'Everything',
    'Só visuais: nenhuma skin dá vantagem em combate.': 'Cosmetic only: no skin gives a combat advantage.', 'Carregando a loja…': 'Loading the shop…',
    'Você ainda não tem skins. Escolha um pacote na aba Loja.': 'You have no skins yet. Pick a pack in the Shop tab.', 'Você já tem': 'You already have', 'Você não tem essa skin.': 'You don\'t have that skin.',
    'Entre numa conta por e-mail para guardar e usar skins.': 'Sign in with an email account to keep and use skins.', 'As skins vão para a conta ligada a este login.': 'Skins go to the account of this login.',
    'Prêmios da semana': 'Weekly prizes', 'Semana passada: ninguém pontuou': 'Last week: nobody scored', 'Semana passada:': 'Last week:',
    'Quem fecha a semana em 1º lugar de um ranking ganha a skin sozinho, na virada da semana (segunda 00:00, horário de Brasília). É sua para sempre.': 'Whoever ends the week in 1st place of a ranking gets the skin automatically when the week turns (Monday 00:00, Brasília time). It\'s yours forever.',
    'Resgatar': 'Claim', 'Resgatado': 'Claimed', 'Recebida': 'Received', 'Ganhou': 'Earned', 'Entre na sua conta para resgatar.': 'Sign in to claim.', 'Prêmio resgatado! Equipe em "Minhas skins".': 'Prize claimed! Equip it in "My skins".',
    'Não há prêmio para resgatar agora.': 'There is no prize to claim right now.', 'Não consegui resgatar agora.': 'Could not claim right now.', 'Não deu para resgatar agora.': 'Could not claim right now.',
    'Convide amigos': 'Invite friends', 'Copiar meu link': 'Copy my link', 'Seu link de convite': 'Your invite link', 'Amigos que já contaram:': 'Friends counted so far:',
    'Entre na sua conta para pegar o seu link de convite.': 'Sign in to get your invite link.', 'Quando': 'When', 'amigos entrarem pelo seu link e chegarem ao nível': 'friends join through your link and reach level', ', a coroa é sua.': ', the crown is yours.',
    'Cabeça de dragão dourada': 'Golden dragon cap', 'Cabeça de dragão': 'Dragon cap', 'Lápide dourada (ao abater)': 'Golden tombstone (on kill)', 'Lápide (ao abater)': 'Tombstone (on kill)',
    'Chifres de carneiro': 'Ram horns', 'Coroa da amizade': 'Friendship hat', 'Chapéu de pioneiro': 'Pioneer hat', 'Chapéu de cogumelo': 'Mushroom hat', 'Chapéu de marinheiro': 'Sailor hat',
    'Coroinha de flores': 'Flower crown', 'Cartola': 'Top hat', 'Chapéu de mago com estrelas que brilham': 'Wizard hat with shining stars', 'Chapéu de mago': 'Wizard hat',
    'Chapéu de pirata com caveira e bordado dourado': 'Pirate hat with skull and gold trim', 'Chapéu de pirata': 'Pirate hat', 'Premium Mago': 'Premium Wizard', 'Premium Pirata': 'Premium Pirate',
    '4 chapéus: cogumelo, marinheiro, coroinha de flores e cartola': '4 hats: mushroom, sailor, flower crown and top hat', 'Os 2 premium + os 4 chapéus (em vez de R$ 12)': 'The 2 premium + the 4 hats (instead of R$ 12)',
    '(prêmio de torneio)': '(tournament prize)', '(prêmio semanal)': '(weekly prize)', '(convide 3 amigos)': '(invite 3 friends)', '(contas criadas até': '(accounts created by', '(bloqueada)': '(locked)', '(bloqueado)': '(locked)',
    'Pagar com Pix': 'Pay with Pix', 'Pix copia e cola': 'Pix copy and paste', 'Copiar Pix copia e cola': 'Copy Pix code', 'Copiado!': 'Copied!', 'Chave Pix:': 'Pix key:', 'Valor:': 'Amount:', 'QR code do Pix': 'Pix QR code',
    'Pague o Pix e envie o comprovante e o e-mail da sua conta para': 'Pay with Pix and send the receipt and your account email to', '. A liberação é manual.': '. Unlocking is manual.',
    '. Abra o app do seu banco, escolha Pix e leia o QR ou use o copia e cola.': '. Open your bank app, choose Pix and scan the QR or use copy and paste.',
    'A loja não está disponível agora. Tente de novo em instantes.': 'The shop is not available right now. Try again in a moment.',
    'Para comprar é preciso uma conta por e-mail: o progresso salvo só no navegador pode ser editado, então não vale para skins.': 'Buying requires an email account: progress saved only in the browser can be edited, so it doesn\'t count for skins.',
    // conta
    'Sua conta do SlimeRPG': 'Your SlimeRPG account', 'Sua conta': 'Your account', 'Conta': 'Account', 'Entrar': 'Sign in', 'Criar conta': 'Create account', 'Sair da conta': 'Sign out', 'Sair': 'Leave',
    'E-mail': 'Email', 'Senha (8 ou mais caracteres)': 'Password (8+ characters)', 'Senha nova (8 ou mais caracteres)': 'New password (8+ characters)', 'Senha': 'Password',
    'Mostrar a senha': 'Show password', 'Ocultar a senha': 'Hide password', 'Mostrar': 'Show', 'Ocultar': 'Hide', 'Esqueci a senha': 'Forgot password', 'Recuperar a senha': 'Recover password',
    'Criar senha nova': 'Create new password', 'Trocar a senha': 'Change password', 'Senha trocada. Entre com a senha nova.': 'Password changed. Sign in with the new password.',
    'Confirme seu e-mail': 'Confirm your email', 'Confirmar e-mail': 'Confirm email', 'Confirmar': 'Confirm', 'Código': 'Code', 'Enviar código': 'Send code', 'Mandar o código de novo': 'Send the code again',
    'Código enviado.': 'Code sent.', 'Código errado ou vencido. Peça um novo.': 'Wrong or expired code. Ask for a new one.', 'Código errado.': 'Wrong code.',
    'Enviamos um código de 6 dígitos para': 'We sent a 6-digit code to', '. Ele vale por 15 minutos. Veja também a caixa de spam.': '. It is valid for 15 minutes. Check your spam folder too.',
    'Digite o e-mail da conta. Se ela existir, enviamos um código para criar uma senha nova.': 'Type the account email. If it exists, we\'ll send a code to create a new password.',
    'Se existe uma conta com': 'If there is an account with', ', o código chegou no e-mail dela.': ', the code was sent to it.',
    'Use o seu e-mail: ele identifica a conta. O progresso (itens, missões e abates) fica guardado no servidor e vale em qualquer aparelho.': 'Use your email: it identifies the account. Progress (items, quests and kills) is saved on the server and works on any device.',
    'Conta pronta. O progresso será guardado nela.': 'Account ready. Your progress will be saved in it.', 'Progresso guardado:': 'Progress saved:', 'Progresso na sua conta:': 'Progress in your account:', 'Progresso salvo na conta': 'Progress saved in account',
    'itens deste navegador vão junto para a conta nova.': 'items from this browser go to the new account.', '(e-mail confirmado)': '(email confirmed)', '(e-mail ainda não confirmado)': '(email not confirmed yet)',
    'Excluir a conta': 'Delete account', 'Excluir conta': 'Delete account', 'Excluir para sempre': 'Delete forever', 'Voltar': 'Back', 'Fechar': 'Close',
    'Isso apaga a conta e todo o progresso guardado nela, e não tem volta. Digite a senha para confirmar.': 'This deletes the account and all its progress, and cannot be undone. Type your password to confirm.',
    'Este e-mail já tem uma conta. Use "Entrar".': 'This email already has an account. Use "Sign in".', 'Esse e-mail não parece válido.': 'That email doesn\'t look valid.', 'E-mail inválido.': 'Invalid email.',
    'Não existe conta com esse e-mail.': 'There is no account with that email.', 'E-mail ainda não confirmado.': 'Email not confirmed yet.', 'Espere um pouco antes de pedir outro código.': 'Wait a little before asking for another code.',
    'Muitos pedidos de código. Tente de novo mais tarde.': 'Too many code requests. Try again later.', 'Sessão expirada.': 'Session expired.', 'Não deu certo. Tente de novo.': 'That didn\'t work. Try again.', 'Não deu certo.': 'That didn\'t work.',
    'Seu login venceu ou a conta não existe mais. Entre de novo ou jogue sem conta.': 'Your login expired or the account no longer exists. Sign in again or play without an account.',
    'As contas estão indisponíveis agora. Tente de novo em instantes.': 'Accounts are unavailable right now. Try again in a moment.', 'Não consegui conferir sua conta agora. Tente de novo em instantes.': 'Could not check your account right now. Try again in a moment.',
    'Não consegui enviar o e-mail agora.': 'Could not send the email right now.', 'Não consegui enviar.': 'Could not send.', 'Não consegui trocar agora.': 'Could not change it right now.',
    'Recuperação de senha indisponível neste servidor (sem e-mail configurado).': 'Password recovery is unavailable on this server.',
    'Abra o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".': 'Open the browser menu and choose "Install app" or "Add to Home screen".',
    'No iPhone: toque em Compartilhar (o quadrado com a seta) e depois em "Adicionar à Tela de Início".': 'On iPhone: tap Share (the square with an arrow) and then "Add to Home Screen".', 'Agora não': 'Not now',
    'Pré-visualização do seu slime': 'Preview of your slime', 'Slime': 'Slime',
    'jogadores': 'players', 'jogador': 'player', 'vazio': 'empty', 'vazia': 'empty', 'Armas': 'Weapons', 'Peitorais': 'Chestplates', 'só os meus': 'only mine', 'Os bloqueados mostram como conseguir.': 'Locked ones show how to get them.',
    '% por abate; só sorteia itens que você ainda não tem).': '% per kill; only rolls items you don\'t have yet).', ', no centro do mapa. Só quem está no nível': ', in the center of the map. Only players at level',
    'consegue machucá-lo, e quem causar': 'can hurt it, and whoever deals', '% ou mais': '% or more', ', dano': ', damage', ', atordoa': ', stuns', ', cura': ', heals', 'de Saúde': 'Health',
    'Ver missões': 'See quests', 'Tirar da arma 1': 'Remove from weapon 1', 'Tirar da arma 2': 'Remove from weapon 2', 'Missão cumprida:': 'Quest complete:', 'curto': 'short', 'longo': 'long', 'nenhuma': 'none',
    'Jogadores não podem te atacar até o nível': 'Players can\'t attack you until level', 'Abates da sala': 'Room kills', 'Ninguém abateu ainda.': 'Nobody has a kill yet.', 'Dragão renasce em': 'Dragon respawns in', 'Dragão:': 'Dragon:',
    'em cada atributo (média de 2). O máximo é': 'on each attribute (average 2). The max is',
    'Modo Clássico. Quem já chegou ao nível 20, pelos abates de jogadores (vítimas do nível 8 para cima; a mesma vítima só conta de novo depois de 5 minutos).': 'Classic mode. Players who reached level 20, by player kills (victims level 8 and up; the same victim only counts again after 5 minutes).',
    'Pacote': 'Pack', 'Comprar': 'Buy', 'Preço': 'Price', 'Equipar skin': 'Equip skin', 'Tirar': 'Remove', 'Usando': 'Using', 'Abrir': 'Open'
  };
  // nomes com a ordem trocada em inglês: "Espada Rara" -> "Rara Espada" (depois as duas palavras são traduzidas)
  var NOUNS = 'Faca|Martelo|Maça|Espada|Rapieira|Arco|Chicote|Varinha|Cajado|Sinos|Peitoral Vital|Peitoral Arcano|Peitoral Blindado|Peitoral Dracônico';
  var TIERS = 'Comum|Incomum|Raras?|Raros?|Épicas?|Épicos?|Lendárias?|Lendários?|Míticas?|Míticos?';
  var MOBS = 'Cogumelo-fungo|Coelho-musgo|Lobo-raiz|Javali-espinho|Broto ancião|Aranha-véu|Árvore anciã|Dragão ancestral';
  var RULES = [ // antes da troca de trechos
    [new RegExp('(' + NOUNS + ') (' + TIERS + ')(?=$|[^A-Za-zÀ-ú])', 'g'), '$2 $1'],
    [/Arma (comum|incomum|rara|épica|lendária|mítica) de /g, function (m, t) { return t.charAt(0).toUpperCase() + t.slice(1) + ' weapon · '; }],
    [/Arma inicial de /g, 'Starter weapon · '],
    [new RegExp('(^|[^A-Za-zÀ-ú])O (' + MOBS + ')', 'g'), '$1The $2'],
    [new RegExp('Cai do (' + MOBS + ')', 'g'), 'Dropped by the $1'],
    [new RegExp(' do (' + MOBS + ')', 'g'), ' from the $1'],
    [/da vida dele tem (\d+)% de chance de levar este peitoral a cada vitória\./g, 'of its HP has a $1% chance to get this chestplate each victory.'],
    [/da vida dele ganha uma arma mítica aleatória\./g, 'of its HP gets a random mythic weapon.']
  ];
  var POST = [ // depois
    [/(\d+) de (\d+)/g, '$1 of $2'],
    [/Nível (\d+)/g, 'Level $1'], [/nível (\d+)/g, 'level $1'], [/Níveis /g, 'Levels '], [/Levels (\d+) a (\d+)/g, 'Levels $1 to $2'],
    [/ e (?=[A-Z])/g, ' and ']
  ];
  var keys = Object.keys(D).sort(function (a, b) { return b.length - a.length; });
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var isL = /[A-Za-zÀ-ú]/, BIG;
  try { // com fronteira de palavra (navegadores novos)
    BIG = new RegExp(keys.map(function (k) { return (isL.test(k[0]) ? '(?<![A-Za-zÀ-ú])' : '') + esc(k) + (isL.test(k[k.length - 1]) ? '(?![A-Za-zÀ-ú])' : ''); }).join('|'), 'g');
  } catch (e) { // navegador antigo sem lookbehind: só a fronteira do fim
    BIG = new RegExp(keys.map(function (k) { return esc(k) + (isL.test(k[k.length - 1]) ? '(?![A-Za-zÀ-ú])' : ''); }).join('|'), 'g');
  }
  var cache = new Map();
  function tr(s) {
    if (!s || typeof s !== 'string' || !/[A-Za-zÀ-ú]{2}/.test(s)) return s;
    var c = cache.get(s); if (c !== undefined) return c;
    var out = s;
    for (var i = 0; i < RULES.length; i++) out = out.replace(RULES[i][0], RULES[i][1]);
    out = out.replace(BIG, function (m) { return D[m] !== undefined ? D[m] : m; });
    for (var j = 0; j < POST.length; j++) out = out.replace(POST[j][0], POST[j][1]);
    if (cache.size > 5000) cache.clear();
    cache.set(s, out);
    return out;
  }
  window.tr = tr;

  // Página: textos e atributos visíveis, agora e sempre que o jogo mudar algo
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'value'];
  function fixNode(n) {
    if (n.nodeType === 3) { var t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; return; }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA') return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i]; if (a === 'value' && !(n.tagName === 'INPUT' && (n.type === 'button' || n.type === 'submit'))) continue;
      var v = n.getAttribute(a); if (v) { var tv = tr(v); if (tv !== v) n.setAttribute(a, tv); }
    }
    for (var c = n.firstChild; c; c = c.nextSibling) fixNode(c);
  }
  var busy = false;
  var mo = new MutationObserver(function (list) {
    if (busy) return; busy = true;
    try {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') fixNode(m.target);
        else if (m.type === 'attributes') fixNode(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) fixNode(m.addedNodes[j]);
      }
    } finally { busy = false; }
  });
  function start() {
    fixNode(document.body); document.title = tr(document.title);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // Canvas: nomes de monstros, avisos e números desenhados no jogo
  var P = CanvasRenderingContext2D.prototype;
  ['fillText', 'strokeText', 'measureText'].forEach(function (f) {
    var orig = P[f];
    P[f] = function (t) { var a = Array.prototype.slice.call(arguments); a[0] = tr(String(t)); return orig.apply(this, a); };
  });
})();
