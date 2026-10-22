# Imagens do jogo

Coloque os arquivos em `public/img/` com exatamente estes nomes (`.png`, `.jpg` ou `.webp`) e recarregue a página. O que não existir continua com o desenho de reserva.

Quem tem internet pode baixar quase tudo de uma vez: `npm run imagens`.

## Já incluídas na pasta

Os monstros comuns foram refeitos no estilo do slime (corpo gordinho e brilhante, contorno escuro grosso, olhos pretos com brilho, bochechas rosadas). Vieram do Canva em miniatura (200 × 200), foram recortados do fundo e ampliados para 384 px com `tools/recortar-fundo.py entrada.png saida.png 384`. Para ficar nítido em telas grandes, abra o link, baixe em PNG e passe pelo mesmo script.

| Arquivo | Conteúdo | Versão grande |
|---|---|---|
| `mob_cogumelo.png` | Cogumelo-fungo | https://www.canva.com/M/MAHYwJY-f9w |
| `mob_coelho.png` | Coelho-musgo | https://www.canva.com/M/MAHYwKdwJiU |
| `mob_lobo.png` | Lobo-raiz (olha para a esquerda) | https://www.canva.com/M/MAHYwAw3Fpo |
| `mob_javali.png` | Javali-espinho (olha para a esquerda) | https://www.canva.com/M/MAHYwMDJTEM |
| `mob_broto.png` | Broto ancião | https://www.canva.com/M/MAHYwGkKKf4 |

Os desenhos antigos (mais realistas) ficam no histórico do Canva: cogumelo MAHYsIWZA38, coelho MAHYsHrYcVc, lobo MAHYsJsP8RE, javali MAHYsDHxAUg.

### Dragão ancestral (três poses)

O dragão tem três imagens, todas olhando para a direita (o jogo espelha sozinho quando ele vira):

| Arquivo | Quando aparece | Versão grande |
|---|---|---|
| `mob_dragao.png` | Em pé, na luta normal | https://www.canva.com/M/MAHYwz6wmfI |
| `mob_dragao_dormindo.png` | Dormindo na toca | https://www.canva.com/M/MAHYwx3Sh38 |
| `mob_dragao_furia.png` | Rugindo: sopro armado e fúria (menos de 30% de vida) | https://www.canva.com/M/MAHYw-1MCCM |

Os três vieram do Canva em 200 × 200 com fundo cinza; aqui já estão com o fundo recortado e ampliados para ~512 px (`tools/recortar-fundo.py entrada.png saida.png 512`, precisa de Pillow, numpy e scipy). Se baixar a versão grande do Canva, passe pelo mesmo script e troque o arquivo.

Por cima da imagem o jogo desenha, em código, tudo o que avisa o jogador: o brilho na garganta antes do sopro, as rachaduras antes da pancada, o tom vermelho, a aura e as brasas na fúria, a fumaça das narinas e os "z" do sono. Sem `mob_dragao.png` o jogo volta ao dragão desenhado em código (as outras duas poses são opcionais: sem elas, a pose em pé é usada).

### Fogo e onda de choque do dragão (já vêm no pacote)

Os ataques do dragão usam imagens de fogo geradas no Z-Image Turbo sobre fundo preto, preparadas com `tools/preparar-fx.py` (o preto vira transparência, o desenho é recortado e salvo em WebP) e desenhadas com mistura aditiva por cima do chão:

| Arquivo | Conteúdo | Como o jogo usa |
|---|---|---|
| `fx_jato_1.webp`, `fx_jato_2.webp`, `fx_jato_3.webp` | Jato de fogo na horizontal, ponta na borda esquerda (1024 px de largura) | Sopro: os três quadros se alternam (13 por segundo, com transição suave) e o jato sai da boca do dragão, cresce e abre até o alcance do cone |
| `fx_onda_1.webp`, `fx_onda_2.webp` | Chão rachado com lava e anel de fogo, visto de cima (640 px) | Pancada: a onda se expande até o raio do golpe, girada ao acaso, por baixo do dragão e dos jogadores |
| `fx_garra.webp` | Marcas de garra em fogo (512 px) | Garra: o arranhão desce na frente do dragão |

Sem esses arquivos, o jogo volta aos efeitos desenhados em código (cone de brasas, anéis e linhas). Para trocar um deles, gere o fogo em fundo preto liso e passe pelo script:
`python3 -I tools/preparar-fx.py entrada.png public/img/fx_jato_1.webp jato` (os tipos são `jato`, `onda` e `garra`; precisa de Pillow e numpy). O script imprime as medidas do desenho; se o jato novo tiver outras proporções, ajuste a tabela `JET` (e `ONDA_R`, para a onda) no começo de `public/fx.js`.

O corpo do dragão também acompanha cada ataque (`dragonXf`, em `public/art.js`): joga a cabeça para trás e a garganta brilha no aviso do sopro, avança ao soltar; empina nas patas de trás antes da pancada e despenca com poeira; e dá o bote nas garras.

## Mapa

| Arquivo | Conteúdo | Onde pegar |
|---|---|---|
| `mapa.png` | Arena vista de cima, com a praça de pedra no centro | https://www.canva.com/M/MAHYsNyFDdY (baixe em PNG) |

O mundo tem 7200 × 4500. Sem o arquivo `mapa.png`, o jogo desenha o chão sozinho, em blocos gerados na hora (grama, clareiras, flores, pedras e a praça de pedra com a toca do dragão no centro), então o mapa grande não pesa na memória. Se você colocar um `mapa.png`, ele é esticado sobre o mundo todo: quanto maior a imagem, mais nítido. A praça deve ficar no centro e a borda da floresta fechada acompanha uma elipse.

## O slime (já vem no pacote)

Três poses desenhadas no Higgsfield (modelo z_image), recortadas do fundo e guardadas em `public/img/`. Elas não são baixadas pelo `npm run imagens`: já vão no repositório.

| Arquivo | Pose | Quando aparece | Desenho original (Higgsfield) |
|---|---|---|---|
| `slime_idle.png` | parado | andando, parado, piscando | https://d8j0ntlcm91z4.cloudfront.net/user_3Jdx5VEk64qzUApfcGlhe7t6gaB/hf_20261022_004809_2fdf2bf6-0f6c-42ff-9e66-418845f8cefa.png |
| `slime_attack.png` | atacando, com braço próprio (reserva; no jogo o golpe usa o slime parado zangado) | só com `ownArms` | https://d8j0ntlcm91z4.cloudfront.net/user_3Jdx5VEk64qzUApfcGlhe7t6gaB/hf_20261022_004744_119c467e-33b1-4448-94d6-a2158203a6fd.png |
| `slime_hurt.png` | atingido | ao levar dano: pisca em branco, achata e é empurrado | https://d8j0ntlcm91z4.cloudfront.net/user_3Jdx5VEk64qzUApfcGlhe7t6gaB/hf_20261022_004809_c6d8398d-e4a3-405c-9b9f-173309eda4eb.png |

**Pose de golpe.** Como os bracinhos que seguram a arma são desenhados à parte, no golpe o jogo usa o slime parado com sobrancelhas zangadas e a boca aberta (desenhadas por código, em `slimeAngry`). O arquivo `slime_attack.png` só é usado se a pose pedir `ownArms`.

**Como a cor do jogador entra.** O corpo azul do desenho vira um mapa de gradiente: o tom médio fica na cor escolhida, o claro puxa para o branco e o escuro para o preto. O contorno escuro, os olhos, o brilho branco e o rosado das bochechas ficam como no desenho. O resultado fica em cache por cor.

**Como trocar o slime por outro desenho.**
1. Gere as três poses com o mesmo personagem, em fundo cinza liso.
2. Recorte as três com a **mesma escala** (senão o slime muda de tamanho ao trocar de pose):
   `python3 -I tools/recortar-slime.py pose.jpg public/img/slime_idle.png 0.6 384` (e o mesmo para `slime_attack.png` e `slime_hurt.png`).
3. Se os olhos ficarem em outro lugar, ajuste `SLIME_EYES` e `SLIME_EYE_R` no começo do bloco do slime em `public/art.js` (valores de 0 a 1 sobre a imagem parada). Sem as três imagens, o jogo usa o slime desenhado por código.

## Armas e roupas (já vêm no pacote)

Os ícones (9 armas, a faca, os 3 peitorais e o Peitoral Dracônico, este gerado com o Z-Image Turbo) foram recortados do fundo, encolhidos para 256 px e guardados em `public/img/` (`weapon_<arma>.png` e `armor_<tipo>.png`). Eles pesam uns 30 a 100 KB cada, em vez dos 2048 px originais, e por isso o `npm run imagens` não baixa mais esses arquivos.

- **Armas na mão.** Cada desenho aponta para um lado e tem o cabo num lugar. A tabela `WGEO_IMG` no começo do bloco de armas de `public/art.js` diz, para cada arma, onde fica o cabo (`H`), a parte que bate (`P`) e onde a mão segura (`t`, de 0 a 1). O arco e os sinos usam o ponto de empunhadura direto (`G`). Se trocar o desenho de uma arma, ajuste a linha dela.
- **Roupa no corpo.** A roupa que o slime veste **não** é o ícone da mochila: é desenhada por código sob medida para o corpo dele (jaqueta de couro, túnica arcana, couraça de placas e armadura de escamas do dragão, mais a casaca de gelatina inicial), cortada pela silhueta, com gola, ombreiras onde saem os bracinhos, luz e sombra para dar volume e mangas com punho que o `drawArm` desenha por cima do bracinho. A faixa aparece no debrum, nas fivelas, nos punhos e nas gemas. O código fica em `ARM_PAINT`, `ARM_PADS`, `ARM_COLLAR` e `ARM_SLEEVE`, em `public/art.js`; para criar um peitoral novo, acrescente o tipo em cada uma dessas tabelas e em `ARMORS` (`game-data.js`). Os ícones `armor_*.png` só aparecem na mochila.
- Para recortar um ícone novo: `python3 -I tools/recortar-icone.py entrada.jpg public/img/weapon_espada.png 256 30` (o último número é a tolerância do cinza do fundo; `halo` no fim apaga o anel claro ao redor, como nos sinos).

## Baixadas por `npm run imagens`

| Arquivo | Conteúdo | Link direto |
|---|---|---|
| `mob_aranha.png` | Aranha (já vem no pacote; o `npm run imagens` não baixa mais nada) | https://www.canva.com/M/MAHYw7yK6Uk |

Os ícones de arma e de peitoral valem para as cinco faixas: a faixa aparece na cor da borda (cinza, verde, azul, roxo e dourado).

## Dicas

- Para sprites (slime, monstros, armas, peitorais), use fundo liso. Fundos cinza ou brancos ligados à borda são removidos sozinhos; imagens PNG que já têm transparência são usadas como estão.
- O slime deve ter o corpo de uma cor só, com contorno escuro e brilho branco, para a cor do jogador pegar bem.
- O jogo espelha o monstro conforme a direção em que ele anda. Ele supõe que a imagem olha para a direita; o lobo e o javali já estão marcados como virados para a esquerda e os demais como de frente. Se trocar uma imagem por outra com direção diferente, ajuste `FACING` no começo da seção de monstros em `public/art.js`.
