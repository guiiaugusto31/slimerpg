'use strict';
/* SlimeRPG — som. Tudo é sintetizado na hora com WebAudio (nenhum arquivo de áudio, nada para baixar).
   - Música: tema de floresta calmo, inspirado no clima de Payon (Ragnarok): escala pentatônica menor em Ré, gayageum (cordas beliscadas),
     flauta com vibrato e respiração, drone grave e um tambor suave. Perto do dragão ela fica mais tensa (tambores).
   - Efeitos: passos de gelatina, golpes de cada arma, habilidades, bichos atacando, dragão, nível, interface, ambiente (vento e pássaros).
   Controle: botão "Som" (ciclo: música e efeitos → só efeitos → mudo), guardado no navegador. */
(function () {
  var AC = window.AudioContext || window.webkitAudioContext;
  var NOOP = function () {};
  if (!AC) { window.SND = { unlock: NOOP, play: NOOP, listen: NOOP, boss: NOOP, zone: NOOP, enter: NOOP, stinger: NOOP, cycle: NOOP, mode: function () { return 2; } }; return; }

  var ctx = null, master, musicMain, musicBus, sfxBus, revIn, noiseBuf, offline = false;
  var L = { x: 0, y: 0 }, bossT = 0, boss = 0, mode = 0, voices = 0, started = false;
  try { var sv = localStorage.getItem('slimeio_snd'); if (sv === '1' || sv === '2') mode = +sv; } catch (e) { /* sem armazenamento */ }

  /* ---------- peças básicas ---------- */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, dur, peak, dest, a) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a || 0.004, peak, dur); o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + (a || 0.004) + dur + 0.05);
    return o;
  }
  function noise(t, dur, ftype, f0, f1, q, peak, dest, a) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = ftype; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a || 0.004, peak, dur); s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + (a || 0.004) + dur + 0.05);
  }
  function makeReverb() {
    var len = Math.floor(ctx.sampleRate * 2.6), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = b.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
    var cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  function graph(c) {
    ctx = c;
    master = ctx.createGain(); master.gain.value = 0.75;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    musicMain = ctx.createGain(); musicBus = ctx.createGain(); sfxBus = ctx.createGain(); musicBus.connect(musicMain); musicMain.connect(master); sfxBus.connect(master); // musicBus = "geração" atual da música; musicMain = volume geral
    var rv = makeReverb(), rg = ctx.createGain(); rg.gain.value = 0.42; revIn = ctx.createGain(); revIn.connect(rv); rv.connect(rg); rg.connect(master);
    var send = ctx.createGain(); send.gain.value = 0.55; musicMain.connect(send); send.connect(revIn);
    var ns = ctx.createGain(); ns.gain.value = 0.16; sfxBus.connect(ns); ns.connect(revIn);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var nd = noiseBuf.getChannelData(0); for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    applyMode();
  }
  function applyMode() {
    if (!ctx) return;
    var t = ctx.currentTime;
    musicMain.gain.setTargetAtTime(mode === 0 ? 0.85 : 0, t, 0.15);
    sfxBus.gain.setTargetAtTime(mode < 2 ? 0.9 : 0, t, 0.08);
  }

  /* ---------- música ---------- */
  var BPM = 64, BEAT = 60 / BPM, SIX = BEAT / 4;
  // Acordes (notas midi): pool = notas do gayageum/harpa; drone = duas notas graves
  var CH = {
    D: { pool: [50, 57, 62, 65, 69, 74], drone: [38, 45] },
    C: { pool: [48, 55, 60, 62, 67, 72], drone: [36, 43] },
    G: { pool: [43, 50, 55, 62, 67, 69], drone: [43, 50] },
    A: { pool: [45, 57, 60, 67, 69, 72], drone: [33, 45] },
    Am: { pool: [45, 52, 57, 60, 64, 69], drone: [33, 40] },
    F: { pool: [41, 48, 53, 57, 60, 65], drone: [29, 41] },
    Em: { pool: [40, 47, 52, 55, 59, 64], drone: [28, 35] },
    Bm: { pool: [47, 54, 59, 62, 66, 71], drone: [35, 42] },
    Dm: { pool: [38, 45, 50, 53, 57, 62], drone: [26, 33] },
    Bb: { pool: [46, 53, 58, 62, 65, 70], drone: [34, 41] },
    Cm: { pool: [48, 55, 60, 63, 67, 72], drone: [36, 43] },
    CM: { pool: [48, 52, 55, 60, 64, 67], drone: [36, 43] }, // acordes maiores (com a terça), só para o campo alegre
    GM: { pool: [43, 50, 55, 59, 62, 67], drone: [43, 50] },
    FM: { pool: [41, 48, 53, 57, 60, 65], drone: [29, 41] },
    AM: { pool: [45, 52, 57, 61, 64, 69], drone: [33, 45] }, // lá maior (com o sol# da escala menor harmônica): tensão do dragão
    Gm: { pool: [43, 50, 55, 58, 62, 67], drone: [31, 38] },
    EM: { pool: [40, 47, 52, 56, 59, 64], drone: [28, 35] } // mi maior (com a terça): tônica da escala do deserto, só para o campo do javali
  };
  var PLUCK = [[0, 2, 4, 2, 3, 2, 4, 5], [0, 3, 2, 4, 2, 3, 1, 2], [0, 2, 3, 5, 4, 3, 2, 1], [1, 3, 2, 4, 3, 5, 4, 2]];
  var PAT_UP = [[0, 1, 2, 3, 4, 5, 4, 3], [0, 2, 1, 3, 2, 4, 3, 5]];
  var P8 = function (x) { return x.split(' '); };
  // Cada trilha tem andamento, seções (acordes + melodia da flauta: [nota, tempos], 32 tempos = 8 compassos) e um estilo de percussão.
  // lead: instrumento da melodia (flute | bell | brass). arp: padrão do arpejo (soft | up | sparse | none | ostinato).
  var TRACKS = {
    // menu (tela inicial): balada suave e nostálgica ao piano, dó maior, andamento lento, cordas macias ao fundo e notas longas (melodia original)
    menu: { bpm: 66, lead: 'piano', arp: 'ballad', perc: 'none', secs: [
      { prog: P8('CM GM Am Em FM CM FM GM'), flute: 1, mel: [[76,2],[79,1],[77,1], [74,3],[71,1], [72,2],[76,1],[81,1], [79,3],[76,1], [77,2],[81,1],[79,1], [76,2],[72,1],[74,1], [77,1.5],[76,0.5],[74,2], [71,2],[74,1],[0,1]] },
      { prog: P8('Am FM CM GM Am FM GM CM'), flute: 1, mel: [[81,2],[79,1],[76,1], [77,2],[79,1],[81,1], [84,3],[81,1], [79,2],[83,1],[81,1], [81,1.5],[84,0.5],[88,2], [86,2],[84,1],[81,1], [83,2],[79,2], [84,3],[0,1]] },
      { prog: P8('CM GM Am FM CM GM FM CM'), flute: 0, mel: [] }
    ] },
    // deserto (campo do javali-espinho): ar de bazar no deserto, escala frígia dominante (mi, fá, sol#, lá, si, dó, ré), alaúde, flauta ney e tambor darbuka.
    // Inspirada no clima das cidades de deserto dos RPGs clássicos; a melodia é original.
    deserto: { bpm: 100, lead: 'flute', arp: 'oud', perc: 'darbuka', secs: [
      { prog: P8('EM EM FM FM EM Am FM EM'), flute: 1, mel: [[76,1],[77,0.5],[80,0.5],[81,2], [80,1],[77,0.5],[76,0.5],[77,1],[80,1], [81,1],[84,1],[83,0.5],[81,0.5],[80,1], [81,0.5],[80,0.5],[77,1],[76,2], [83,1],[84,0.5],[83,0.5],[81,1],[80,1], [81,0.5],[83,0.5],[84,1],[86,1],[84,1], [84,1],[83,0.5],[81,0.5],[80,1],[77,1], [76,1.5],[77,0.5],[80,1],[0,1]] },
      { prog: P8('Am Am FM FM EM EM EM EM'), flute: 1, mel: [[88,1],[86,0.5],[84,0.5],[86,1],[84,1], [83,1],[81,1],[84,2], [84,0.5],[86,0.5],[88,1],[86,1],[84,1], [83,1],[81,1],[80,2], [80,1],[81,0.5],[83,0.5],[84,1],[83,1], [81,1],[80,0.5],[77,0.5],[76,2], [77,0.5],[80,0.5],[83,1],[81,1],[80,1], [76,3],[0,1]] },
      { prog: P8('EM EM FM FM EM EM Am EM'), flute: 0, mel: [] }
    ] },
    // campo (cogumelo e coelho): bem alegre, dó maior, andamento saltitante, baixo pulando e melodia em colcheias
    campo: { bpm: 112, lead: 'flute', arp: 'bounce', perc: 'happy', secs: [
      { prog: P8('CM GM Am FM CM GM FM GM'), flute: 1, mel: [[76,0.5],[79,0.5],[84,1],[83,0.5],[79,0.5],[76,1], [74,0.5],[79,0.5],[83,1],[81,0.5],[79,0.5],[74,1], [72,0.5],[76,0.5],[81,1],[79,0.5],[76,0.5],[72,1], [77,0.5],[81,0.5],[84,1],[81,0.5],[77,0.5],[72,1], [79,1],[84,1],[83,0.5],[81,0.5],[79,1], [79,0.5],[81,0.5],[83,1],[86,1],[83,1], [84,1],[81,1],[77,1],[81,1], [79,1],[83,1],[86,1],[0,1]] },
      { prog: P8('FM CM GM Am FM CM GM CM'), flute: 1, mel: [[81,1],[84,0.5],[81,0.5],[77,1],[81,1], [79,1],[76,0.5],[79,0.5],[84,2], [83,1],[79,0.5],[83,0.5],[86,2], [84,0.5],[81,0.5],[76,1],[81,1],[84,1], [81,0.5],[84,0.5],[89,1],[84,1],[81,1], [88,1],[84,1],[79,1],[76,1], [83,0.5],[86,0.5],[83,1],[79,1],[74,1], [76,1],[79,1],[84,2]] },
      { prog: P8('CM CM GM GM Am Am FM GM'), flute: 0, mel: [] }
    ] },
    // floresta (lobo e javali): o tema de Payon que já existia
    floresta: { bpm: 64, lead: 'flute', arp: 'soft', perc: 'soft', secs: [
      { prog: P8('D D C C G G D D'), flute: 1, mel: [[69,3],[72,1],[74,2],[72,1],[69,1],[67,3],[69,1],[72,4],[74,3],[77,1],[77,2],[74,1.5],[72,0.5],[74,2],[72,1],[69,1],[69,4]] },
      { prog: P8('D D C C G G D D'), flute: 0, mel: [] },
      { prog: P8('D G C C D G A A'), flute: 1, mel: [[74,2],[77,2],[79,3],[77,1],[74,2],[72,2],[69,3],[67,1],[65,2],[67,2],[69,2],[72,2],[74,1.5],[72,0.5],[69,2],[69,4]] },
      { prog: P8('D D C C G G D D'), flute: 1, mel: [[69,3],[72,1],[74,2],[72,1],[69,1],[67,3],[69,1],[72,4],[74,3],[77,1],[77,2],[74,1.5],[72,0.5],[74,2],[72,1],[69,1],[69,4]] }
    ] },
    // sombra (broto e aranha): sério e solene, lá menor, marcha lenta, cordas sustentadas e violoncelo
    sombra: { bpm: 72, lead: 'cello', oct: -12, arp: 'strings', perc: 'march', secs: [
      { prog: P8('Am Am F F Dm Dm Em Em'), flute: 1, mel: [[57,2],[60,1],[64,1],[69,3],[67,1], [65,2],[69,1],[72,1],[69,2],[65,1],[64,1], [62,2],[65,1],[69,1],[74,3],[72,1], [71,1.5],[69,0.5],[67,1],[64,1],[71,4]] },
      { prog: P8('Am F Dm Am Bb F Em Em'), flute: 1, mel: [[69,2],[72,2], [74,3],[72,1], [77,2],[74,2], [72,2],[69,2], [70,2],[74,2], [77,3],[74,1], [76,2],[71,2], [69,4]] },
      { prog: P8('Am Am F F Em Em Am Am'), flute: 0, mel: [] }
    ] },
    // ancião (árvore anciã): mi menor, grave e majestoso, cordas profundas, violoncelo baixo e sinos de tom fúnebre
    anciao: { bpm: 52, lead: 'cello', oct: -12, arp: 'strings', perc: 'deep', secs: [
      { prog: P8('Em Em Cm Cm Bm Bm Em Em'), flute: 1, mel: [[64,4],[67,2],[71,2], [72,3],[70,1],[67,4], [66,4],[69,2],[71,2], [71,2],[67,2],[64,4]] },
      { prog: P8('Em Em Em Em Cm Cm Bm Bm'), flute: 0, mel: [] }
    ] },
    // toca (perto do dragão dormindo): quase sem melodia, coração batendo e drone dissonante
    toca: { bpm: 48, lead: 'bell', arp: 'none', perc: 'sleep', secs: [
      { prog: P8('Dm Dm Bb Bb Dm Dm A A'), flute: 0, mel: [] },
      { prog: P8('Dm Dm Cm Cm Bb Bb A A'), flute: 1, mel: [[62,8],[0,4],[65,4],[69,6],[68,2],[0,4],[62,4]] }
    ] },
    // dragão acordado: tema de chefe sombrio e urgente (ré menor harmônica), pulso grave em semicolcheias, cordas em tensão, metais e tambores de guerra.
    // Inspirado no clima de masmorra de RPGs clássicos; a melodia é original.
    // dragão (acordado): marcha lenta e pesada, coro e violoncelo na melodia, baixo pulsando em colcheias e taiko grave; clima de chefe de Dark Souls II, melodia original
    dragao: { bpm: 84, lead: 'epic', arp: 'epic', perc: 'ds', secs: [
      { prog: P8('Dm Bb F C Dm Bb Gm AM'), flute: 1, mel: [[69,2],[74,1],[72,1], [70,3],[69,1], [72,2],[69,1],[65,1], [67,2],[64,2], [69,1],[74,1],[77,2], [77,1.5],[74,0.5],[70,2], [72,2],[70,1],[67,1], [73,3],[0,1]] },
      { prog: P8('Bb Gm Dm AM Bb Gm AM Dm'), flute: 1, mel: [[77,2],[74,1],[77,1], [79,3],[77,1], [81,2],[77,1],[74,1], [76,1],[74,1],[73,2], [77,1],[79,1],[82,2], [81,1.5],[79,0.5],[77,2], [76,1],[81,1],[79,1],[76,1], [74,3],[0,1]] },
      { prog: P8('Dm F Bb C Dm Gm AM Dm'), flute: 0, mel: [] }
    ] },
    // a trilha de guerra anterior (estilo Labyrinth), guardada para uso futuro
    labirinto: { bpm: 132, lead: 'brass', arp: 'drive', perc: 'war', secs: [
      { prog: P8('Dm Bb Gm AM Dm Bb AM AM'), flute: 1, mel: [[74,1],[0,0.5],[74,0.5],[77,1],[81,1], [82,1.5],[81,0.5],[77,1],[74,1], [79,1],[0,0.5],[79,0.5],[82,1],[86,1], [85,1.5],[81,0.5],[76,1],[85,1], [86,1],[0,0.5],[86,0.5],[89,1],[88,1], [86,1.5],[82,0.5],[79,1],[77,1], [76,0.5],[79,0.5],[81,1],[85,1],[88,1], [86,2],[85,1],[81,1]] },
      { prog: P8('Gm Gm Dm Dm Bb C AM AM'), flute: 1, mel: [[79,1],[82,1],[86,1],[82,1], [79,0.5],[82,0.5],[86,1],[89,2], [81,1],[77,1],[74,1],[77,1], [81,0.5],[85,0.5],[86,1],[85,1],[81,1], [82,1],[79,0.5],[82,0.5],[86,2], [84,1],[79,1],[84,1],[88,1], [85,1],[81,1],[85,1],[88,1], [86,2],[85,1],[0,1]] },
      { prog: P8('Dm Dm Bb Bb Gm Gm AM AM'), flute: 0, mel: [] }
    ] }
  };
  var ZONE_TRACK = { cogumelo: 'campo', coelho: 'campo', lobo: 'selva', javali: 'selva', broto: 'sombra', aranha: 'sombra', arvore: 'anciao', toca: 'toca' };
  var cur = 'menu', want = 'menu', zoneWant = 'menu', fighting = false, SECTIONS = TRACKS.menu.secs; // a tela inicial toca a balada do menu; ao entrar, o jogo troca na hora para a música da zona
  var BARS = 8, mNext = 0, mSec = 0, mBar = 0;
  // trilha "virtual": lobo e javali dividem uma só música que começa pelo tema de Morroc e, ao fim dele, segue para o de Payon, e volta ao começo
  var CHAIN = { selva: ['deserto', 'floresta'] };
  function same(w) { return w === cur || !!(CHAIN[w] && CHAIN[w].indexOf(cur) >= 0); }
  function setTrack(k) { if (CHAIN[k]) k = CHAIN[k][0]; cur = k; var T = TRACKS[k]; SECTIONS = T.secs; BEAT = 60 / T.bpm; SIX = BEAT / 4; mSec = 0; mBar = 0; }

  setTrack('menu');
  function pluck(t, m, vel) { // gayageum: corda beliscada com leve queda de afinação
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine';
    o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o2.frequency.setValueAtTime(f * 2, t);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.7);
    env(g, t, 0.004, vel, 1.5);
    var g2 = ctx.createGain(); g2.gain.value = 0.22; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
  }
  function strings(t, notes, dur, vel) { // cordas sustentadas: serras levemente desafinadas, ataque lento e filtro que abre e fecha
    notes.forEach(function (m, i) {
      var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f * 0.997; o2.frequency.value = f * 1.004;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); lp.frequency.linearRampToValueAtTime(600, t + dur + 0.5); lp.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * (i ? 0.8 : 1), t + dur * 0.35); g.gain.linearRampToValueAtTime(vel * 0.7 * (i ? 0.8 : 1), t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicBus);
      o.start(t); o2.start(t); o.stop(t + dur + 0.7); o2.stop(t + dur + 0.7);
    });
  }
  function cello(t, m, dur, vel) { // violoncelo: arco grave com vibrato que chega devagar
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 1.003;
    vib.frequency.value = 5; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.009, t + Math.min(0.6, dur)); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1700, t + 0.25); lp.frequency.linearRampToValueAtTime(900, t + dur + 0.2); lp.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.12); g.gain.setValueAtTime(vel, t + Math.max(0.13, dur - 0.15)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    var g2 = ctx.createGain(); g2.gain.value = 0.5; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); vib.start(t); var e = t + dur + 0.4; o.stop(e); o2.stop(e); vib.stop(e);
  }
  function piano(t, m, dur, vel) { // piano suave: corda de triângulo com harmônicos que apagam depressa e uma batidinha de martelo
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o3.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003; o3.frequency.value = f * 3.01;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1100, t + 1.1);
    env(g, t, 0.006, vel, Math.min(3.2, 1.4 + dur * 0.5));
    var g2 = ctx.createGain(); g2.gain.value = 0.3; var g3 = ctx.createGain(); g3.gain.value = 0.1;
    o.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp); lp.connect(g); g.connect(musicBus);
    noise(t, 0.03, 'bandpass', 1800, 1200, 1, vel * 0.12, musicBus, 0.001);
    var e = t + Math.min(3.4, 1.6 + dur * 0.5) + 0.2; o.start(t); o2.start(t); o3.start(t); o.stop(e); o2.stop(e); o3.stop(e);
  }
  function choir(t, m, dur, vel) { // coro: serras desafinadas por dois filtros de vogal ("ah"), vibrato que chega devagar e ataque suave
    var f = mtof(m), g = ctx.createGain(), fa = ctx.createBiquadFilter(), fb = ctx.createBiquadFilter(), gb = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain(), os = [];
    fa.type = 'bandpass'; fa.frequency.value = 720; fa.Q.value = 4.5; fb.type = 'bandpass'; fb.frequency.value = 1180; fb.Q.value = 5; gb.gain.value = 0.7;
    vib.frequency.value = 5.1; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.9, dur)); vib.connect(vg);
    [0.993, 1, 1.007].forEach(function (d) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * d; vg.connect(o.frequency); o.connect(fa); o.connect(fb); os.push(o); });
    fa.connect(g); fb.connect(gb); gb.connect(g);
    var a = Math.min(0.45, dur * 0.4);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + a); g.gain.setValueAtTime(vel, t + Math.max(a, dur - 0.2)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.55);
    g.connect(musicBus);
    var e = t + dur + 0.65; os.forEach(function (o) { o.start(t); o.stop(e); }); vib.start(t); vib.stop(e);
  }
  function marimba(t, m, vel) { // nota curta e redonda, de madeira: dá o "pulinho" do baixo e dos brilhos do campo
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 4;
    env(g, t, 0.003, vel, 0.4);
    var g2 = ctx.createGain(); g2.gain.value = 0.14; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + 0.55); o2.stop(t + 0.55);
  }
  function flute(t, m, dur, vel, bend) { // daegeum/flauta: som aveludado, vibrato que chega devagar e um sopro
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    var f0 = bend ? f * Math.pow(2, -1.4 / 12) : f;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + 0.09);
    vib.frequency.value = 4.6; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.011, t + Math.min(0.5, dur)); vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    var a = 0.09;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + a); g.gain.setValueAtTime(vel, t + Math.max(a, dur - 0.18)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    var g2 = ctx.createGain(); g2.gain.value = 0.16; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicBus);
    noise(t, dur + 0.1, 'bandpass', f * 2, f * 2, 3, vel * 0.1, musicBus, 0.12);
    o.start(t); o2.start(t); vib.start(t); var e = t + dur + 0.35; o.stop(e); o2.stop(e); vib.stop(e);
  }
  function pad(t, notes, dur, vel) { // drone grave que respira
    notes.forEach(function (m, i) {
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 1.004;
      lp.type = 'lowpass'; lp.frequency.value = 420 + boss * 500;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * (i ? 0.7 : 1), t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      var g2 = ctx.createGain(); g2.gain.value = 0.4; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(musicBus);
      o.start(t); o2.start(t); o.stop(t + dur + 0.7); o2.stop(t + dur + 0.7);
    });
  }
  function drum(t, vel, deep) { // janggu/taiko: batida surda
    osc('sine', deep ? 120 : 150, deep ? 42 : 60, t, deep ? 0.55 : 0.32, vel, musicBus, 0.003);
    noise(t, 0.08, 'lowpass', deep ? 700 : 1400, 300, 0.7, vel * 0.5, musicBus, 0.002);
  }
  function wood(t, vel) { osc('square', 900, 700, t, 0.04, vel * 0.35, musicBus, 0.001); noise(t, 0.05, 'bandpass', 2400, 1800, 4, vel, musicBus, 0.001); }

  function brass(t, m, dur, vel) { // metal grave de guerra: serra filtrada com ataque forte
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 1.005;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.08); lp.frequency.exponentialRampToValueAtTime(700, t + dur + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.04); g.gain.setValueAtTime(vel, t + Math.max(0.05, dur - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    var g2 = ctx.createGain(); g2.gain.value = 0.35; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); var e = t + dur + 0.3; o.stop(e); o2.stop(e);
  }
  function bellTone(t, m, dur, vel) { // sino de madeira: ataque seco e cauda longa
    var f = mtof(m), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.76;
    env(g, t, 0.004, vel, Math.min(3, dur + 1.2));
    var g2 = ctx.createGain(); g2.gain.value = 0.2; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 1.6); o2.stop(t + dur + 1.6);
  }
  function snare(t, vel) { noise(t, 0.14, 'bandpass', 1800, 1200, 0.8, vel, musicBus, 0.002); osc('triangle', 220, 140, t, 0.1, vel * 0.6, musicBus, 0.002); }

  function scheduleBar(t, sec, bar) {
    var T = TRACKS[cur], s = SECTIONS[sec], chord = CH[s.prog[bar]], i, perc = T.perc;
    var bossK = cur === 'dragao' ? 0 : boss;
    var padV = perc === 'war' || perc === 'ds' ? 0.07 : perc === 'sleep' || perc === 'deep' ? 0.075 : 0.05 + bossK * 0.035;
    pad(t, chord.drone, BEAT * 4, padV);
    if (bossK > 0.35 || perc === 'sleep') pad(t, [chord.drone[0] + 1], BEAT * 4, 0.028 * Math.max(bossK, perc === 'sleep' ? 1 : 0)); // um semitom a mais: tensão
    // baixo longo no início do compasso
    pluck(t, chord.pool[0], perc === 'war' || perc === 'ds' ? 0.14 : 0.1);
    var pat, m, vel;
    if (T.arp === 'soft') { // arpejo do gayageum em colcheias
      pat = PLUCK[(bar + sec) % PLUCK.length];
      for (i = 0; i < 8; i++) { if (Math.random() < 0.08) continue; m = chord.pool[pat[i]]; vel = (i % 4 === 0 ? 0.075 : 0.045) * (0.85 + Math.random() * 0.3); pluck(t + i * BEAT / 2 + rnd(0, 0.012), m, vel); }
    } else if (T.arp === 'up') { // harpa saltitante, bem clara
      pat = PAT_UP[(bar + sec) % 2];
      for (i = 0; i < 8; i++) { m = chord.pool[pat[i]] + 12; vel = (i % 2 === 0 ? 0.06 : 0.04) * (0.85 + Math.random() * 0.3); pluck(t + i * BEAT / 2, m, vel); }
    } else if (T.arp === 'bounce') { // campo: baixo "um-pá" (raiz e quinta) nas batidas e brilhos de harpa nos contratempos
      for (i = 0; i < 8; i++) {
        if (i % 2 === 0) marimba(t + i * BEAT / 2, chord.pool[(i / 2) % 2 ? 2 : 0] + (i === 4 ? 12 : 0), i === 0 ? 0.13 : 0.09);
        else pluck(t + i * BEAT / 2, chord.pool[3 + ((i >> 1) + bar) % 3] + 12, 0.04 * (0.85 + Math.random() * 0.3));
      }
    } else if (T.arp === 'strings') { // cordas longas por compasso (sombra e ancião)
      strings(t, [chord.pool[1], chord.pool[2], chord.pool[3]], BEAT * 4, perc === 'deep' ? 0.032 : 0.028);
    } else if (T.arp === 'oud') { // alaúde: arpejo em colcheias com notinha de enfeite colada na anterior (cheiro de música árabe)
      pat = [0, 2, 3, 2, 4, 3, 2, 1]; if ((bar + sec) % 2) pat = [0, 3, 2, 4, 3, 2, 5, 3];
      for (i = 0; i < 8; i++) {
        if (i === 5 && bar % 4 === 1) continue;
        m = chord.pool[pat[i]] + (pat[i] >= 4 ? 0 : 12); vel = (i % 4 === 0 ? 0.075 : 0.045) * (0.85 + Math.random() * 0.3);
        if (i % 4 === 3) pluck(t + i * BEAT / 2 - 0.055, m - 1, 0.02);
        pluck(t + i * BEAT / 2 + rnd(0, 0.01), m, vel);
      }
    } else if (T.arp === 'drive') { // dragão: pulso grave em semicolcheias (raiz, oitava e quinta) com cordas longas por cima
      var STEP = [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 0, 7, 0, 12, 7];
      for (i = 0; i < 16; i++) marimba(t + i * BEAT / 4, chord.pool[0] + STEP[i] + (i % 4 === 0 ? 0 : 0), i % 4 === 0 ? 0.12 : 0.055);
      strings(t, [chord.pool[1], chord.pool[2], chord.pool[3]], BEAT * 4, 0.05);
    } else if (T.arp === 'epic') { // dragão: baixo em colcheias (raiz e quinta) com cordas longas; na parte sem melodia entra um coro de fundo
      var PU = [0, 0, 7, 0, 0, 7, 12, 7];
      for (i = 0; i < 8; i++) marimba(t + i * BEAT / 2, chord.pool[0] + PU[i], i === 0 ? 0.13 : (i % 2 ? 0.05 : 0.08));
      strings(t, [chord.pool[1], chord.pool[2], chord.pool[3]], BEAT * 4, 0.045);
      if (!s.flute) { choir(t, chord.pool[4] + 12, BEAT * 4, 0.07); choir(t, chord.pool[5], BEAT * 4, 0.06); }
    } else if (T.arp === 'ballad') { // balada: arpejo de piano em colcheias, bem leve, com cordas macias por baixo
      pat = [0, 2, 3, 4, 3, 5, 4, 3]; if ((bar + sec) % 2) pat = [0, 3, 2, 4, 5, 4, 3, 2];
      for (i = 0; i < 8; i++) piano(t + i * BEAT / 2 + rnd(0, 0.008), chord.pool[pat[i]] + (i ? 12 : 0), BEAT / 2, (i % 4 === 0 ? 0.085 : 0.05) * (0.85 + Math.random() * 0.3));
      strings(t, [chord.pool[1], chord.pool[3]], BEAT * 4, 0.028);
    } else if (T.arp === 'sparse') { // poucas notas, longas
      for (i = 0; i < 4; i++) { if (Math.random() < 0.35) continue; pluck(t + i * BEAT + rnd(0, 0.03), chord.pool[(i * 2 + bar) % 6], 0.05 + (i === 0 ? 0.03 : 0)); }
    } else if (T.arp === 'ostinato') { // dragão: semicolcheias graves e repetidas, com acento
      for (i = 0; i < 8; i++) pluck(t + i * BEAT / 2, chord.pool[i % 4 === 3 ? 2 : 0] + (i % 4 === 2 ? 12 : 0), i % 4 === 0 ? 0.11 : 0.06);
    }
    // percussão por trilha
    var k;
    if (perc === 'soft') { drum(t, 0.08 + bossK * 0.1, bossK > 0.4); if (bar % 2 === 1) wood(t + BEAT * 2, 0.05); }
    else if (perc === 'light') { drum(t, 0.06, false); wood(t + BEAT * 2, 0.05); for (k = 0; k < 4; k++) if (k % 2) wood(t + k * BEAT, 0.03); }
    else if (perc === 'happy') { // bumbo leve em 1 e 3, palminha de madeira em 2 e 4 e chocalho nos contratempos
      drum(t, 0.07, false); drum(t + BEAT * 2, 0.055, false); wood(t + BEAT, 0.06); wood(t + BEAT * 3, 0.06);
      for (k = 0; k < 8; k++) noise(t + k * BEAT / 2 + (k % 2 ? 0 : 0), 0.035, 'highpass', 7000, 7000, 1, k % 2 ? 0.032 : 0.018, musicBus, 0.001);
    }
    else if (perc === 'march') { // marcha lenta: bumbo grave em 1 e 3, caixa surda em 2 e 4 e um rufar a cada quatro compassos
      drum(t, 0.11, true); drum(t + BEAT * 2, 0.08, true); snare(t + BEAT, 0.03); snare(t + BEAT * 3, 0.04);
      if (bar % 4 === 3) for (k = 0; k < 4; k++) snare(t + BEAT * 3 + k * BEAT / 4, 0.025 + k * 0.012);
    }
    else if (perc === 'darbuka') { // tambor darbuka no ritmo maqsum: dum . tek tek dum . tek . (e uma virada a cada quatro compassos)
      var dk = function (n, kind, v) { var tt = t + n * BEAT / 2; if (kind === 0) drum(tt, v, false); else wood(tt, v); };
      dk(0, 0, 0.1); dk(1, 1, 0.025); dk(2, 1, 0.065); dk(3, 1, 0.06); dk(4, 0, 0.085); dk(5, 1, 0.025); dk(6, 1, 0.065); dk(7, 1, 0.03);
      if (bar % 4 === 3) { dk(7, 1, 0.05); wood(t + BEAT * 3.75, 0.045); }
    }
    else if (perc === 'dark') { drum(t, 0.1, true); if (bar % 2 === 1) drum(t + BEAT * 2.5, 0.06, true); }
    else if (perc === 'deep') { drum(t, 0.12, true); if (bar % 4 === 3) drum(t + BEAT * 3, 0.1, true); }
    else if (perc === 'sleep') { drum(t, 0.13, true); drum(t + BEAT * 0.45, 0.08, true); if (bar % 2 === 1) drum(t + BEAT * 2, 0.13, true); } // coração do dragão
    else if (perc === 'war') {
      for (k = 0; k < 4; k++) drum(t + k * BEAT, k % 2 ? 0.1 : 0.16, true);
      snare(t + BEAT, 0.08); snare(t + BEAT * 3, 0.1); if (bar % 4 === 3) for (k = 0; k < 4; k++) snare(t + BEAT * 3 + k * BEAT / 4, 0.05 + k * 0.015);
      for (k = 0; k < 8; k++) noise(t + k * BEAT / 2 + BEAT / 4, 0.04, 'highpass', 6000, 6000, 1, 0.03, musicBus, 0.001);
    }
    else if (perc === 'ds') { // taiko pesado em 1 e 3, caixa surda em 2 e 4, virada a cada quatro compassos e um sopro de prato no começo de cada parte
      drum(t, 0.17, true); drum(t + BEAT * 2, 0.14, true); drum(t + BEAT * 2.5, 0.08, true);
      snare(t + BEAT, 0.05); snare(t + BEAT * 3, 0.07);
      if (bar % 4 === 3) for (k = 0; k < 4; k++) drum(t + BEAT * 2 + k * BEAT / 2, 0.1 + k * 0.03, true);
      if (bar === 0) noise(t, 2.6, 'highpass', 4500, 7000, 1, 0.05, musicBus, 1.4);
    }
    if (bossK > 0.25 && perc !== 'war') for (i = 1; i < 4; i++) drum(t + i * BEAT, 0.05 + bossK * 0.1, true);
    if (bossK > 0.6 && perc !== 'war') for (i = 0; i < 8; i++) noise(t + i * BEAT / 2 + BEAT / 4, 0.04, 'highpass', 6000, 6000, 1, 0.025, musicBus, 0.001);
  }
  function scheduleFlute(t, sec, bar) { // as notas da melodia que começam neste compasso
    var s = SECTIONS[sec]; if (!s.flute) return;
    var lead = TRACKS[cur].lead, pos = 0, i;
    for (i = 0; i < s.mel.length; i++) {
      var n = s.mel[i];
      if (Math.floor(pos / 4 + 1e-6) === bar && n[0]) {
        var tt = t + (pos - bar * 4) * BEAT, dd = n[1] * BEAT * 0.94;
        if (lead === 'epic') { choir(tt, n[0], dd, 0.1); cello(tt, n[0] - 12, dd, 0.07); if (n[1] >= 3) brass(tt, n[0] - 24, dd, 0.05); } else if (lead === 'piano') piano(tt, n[0], dd, 0.13); else if (lead === 'cello') cello(tt, n[0] + (TRACKS[cur].oct || 0), dd, 0.075); else if (lead === 'brass') brass(tt, n[0] - 12, dd, 0.075); else if (lead === 'bell') bellTone(tt, n[0], dd, 0.09); else flute(tt, n[0], dd, 0.07, n[1] >= 2);
        if (cur === 'campo') bellTone(tt, n[0] + 12, Math.min(dd, BEAT), 0.03); // brilho de sininho por cima da flauta
      }
      pos += n[1];
    }
  }
  function musicSchedule(until) {
    while (mNext < until) {
      if (mNext < ctx.currentTime - 0.05) mNext = ctx.currentTime + 0.05;
      if (!same(want)) setTrack(want); // troca de trilha só na virada do compasso
      scheduleBar(mNext, mSec, mBar);
      scheduleFlute(mNext, mSec, mBar);
      mNext += BEAT * 4; mBar++;
      if (mBar >= BARS) {
        mBar = 0; mSec = (mSec + 1) % SECTIONS.length;
        if (mSec === 0 && CHAIN[want]) { var ch = CHAIN[want]; setTrack(ch[(ch.indexOf(cur) + 1) % ch.length]); } // acabou um tema: segue para o próximo da cadeia
      }
    }
  }

  /* ---------- ambiente: vento e pássaros ---------- */
  var windStarted = false;
  function startWind() {
    if (windStarted) return; windStarted = true;
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
    g.gain.value = 0.022; lfo.frequency.value = 0.11; lg.gain.value = 0.014; lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(); lfo.start();
  }
  function bird(t) {
    var n = 2 + Math.floor(Math.random() * 3), base = rnd(2300, 3600), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, out = sfxBus;
    if (pan) { pan.pan.value = rnd(-0.8, 0.8); pan.connect(sfxBus); out = pan; }
    for (var i = 0; i < n; i++) { var tt = t + i * 0.13; osc('sine', base * rnd(0.95, 1.1), base * rnd(1.15, 1.45), tt, 0.09, 0.024, out, 0.01); }
  }

  /* ---------- efeitos ---------- */
  var FX = {};
  FX.step = function (t, o, v) { var f = rnd(190, 250); osc('sine', f, f * 0.5, t, 0.09, 0.13 * v, o, 0.006); noise(t, 0.05, 'lowpass', 500, 220, 0.8, 0.06 * v, o, 0.004); };
  FX.stab = function (t, o, v) { noise(t, 0.09, 'bandpass', 1700, 3600, 1.4, 0.16 * v, o, 0.006); osc('triangle', 780, 1300, t, 0.05, 0.05 * v, o, 0.003); };
  FX.slash = function (t, o, v) { noise(t, 0.17, 'bandpass', 800, 3800, 1.1, 0.2 * v, o, 0.01); osc('sine', 2500, 2300, t + 0.07, 0.18, 0.03 * v, o, 0.004); osc('sine', 3700, 3500, t + 0.07, 0.12, 0.018 * v, o, 0.004); };
  FX.smash = function (t, o, v) { noise(t, 0.2, 'bandpass', 300, 1200, 1, 0.2 * v, o, 0.02); var h = t + 0.26; osc('sine', 120, 38, h, 0.32, 0.4 * v, o, 0.004); noise(h, 0.14, 'lowpass', 900, 160, 0.8, 0.2 * v, o, 0.002); };
  FX.bow = function (t, o, v) { osc('triangle', 210, 95, t, 0.18, 0.18 * v, o, 0.002); noise(t, 0.1, 'bandpass', 2400, 900, 1.2, 0.09 * v, o, 0.003); };
  FX.zap = function (t, o, v) { osc('sine', 520, 1500, t, 0.18, 0.12 * v, o, 0.01); osc('triangle', 1040, 2200, t + 0.03, 0.14, 0.05 * v, o, 0.01); noise(t, 0.12, 'highpass', 5000, 7000, 1, 0.04 * v, o, 0.01); };
  FX.bell = function (t, o, v) { [1318, 1976, 2637, 3322].forEach(function (f, i) { osc('sine', f, f, t, 0.9 - i * 0.12, (0.1 - i * 0.02) * v, o, 0.002); }); };
  FX.skill = function (t, o, v) { [74, 77, 81, 86].forEach(function (m, i) { osc('sine', mtof(m + 12), mtof(m + 12), t + 0.05 + i * 0.05, 0.4, 0.05 * v, o, 0.004); }); noise(t, 0.35, 'bandpass', 600, 5000, 1, 0.1 * v, o, 0.03); };
  FX.hitMob = function (t, o, v) { osc('sine', 330, 110, t, 0.11, 0.2 * v, o, 0.003); noise(t, 0.06, 'lowpass', 1100, 300, 0.8, 0.16 * v, o, 0.002); };
  FX.hitBig = function (t, o, v) { FX.hitMob(t, o, v * 1.2); osc('sine', 130, 40, t, 0.28, 0.32 * v, o, 0.003); noise(t, 0.12, 'bandpass', 1800, 600, 1.2, 0.1 * v, o, 0.002); };
  FX.hitPlayer = function (t, o, v) { osc('sine', 760, 300, t, 0.14, 0.2 * v, o, 0.003); osc('triangle', 380, 190, t, 0.1, 0.1 * v, o, 0.003); };
  FX.pop = function (t, o, v) { osc('sine', 520, 70, t, 0.2, 0.28 * v, o, 0.002); noise(t, 0.12, 'lowpass', 1400, 200, 0.8, 0.14 * v, o, 0.002); osc('sine', 880, 330, t + 0.03, 0.1, 0.07 * v, o, 0.002); };
  FX.die = function (t, o, v) { osc('sine', 620, 110, t, 0.5, 0.3 * v, o, 0.005); osc('triangle', 310, 70, t, 0.45, 0.15 * v, o, 0.005); noise(t, 0.3, 'lowpass', 1800, 150, 0.7, 0.12 * v, o, 0.005); };
  FX.lvl = function (t, o, v) { [62, 65, 67, 69, 72, 74].forEach(function (m, i) { var tt = t + i * 0.085; osc('triangle', mtof(m + 12), mtof(m + 12), tt, 0.5, 0.11 * v, o, 0.005); osc('sine', mtof(m + 24), mtof(m + 24), tt, 0.4, 0.05 * v, o, 0.005); }); noise(t + 0.4, 0.7, 'highpass', 6000, 8000, 1, 0.04 * v, o, 0.05); };
  FX.ui = function (t, o, v) { osc('sine', 900, 1300, t, 0.05, 0.07 * v, o, 0.002); };
  FX.start = function (t, o, v) { [62, 69, 74].forEach(function (m, i) { osc('triangle', mtof(m + 12), mtof(m + 12), t + i * 0.09, 0.7, 0.09 * v, o, 0.005); }); };
  FX.respawn = function (t, o, v) { [67, 74].forEach(function (m, i) { osc('sine', mtof(m + 12), mtof(m + 12), t + i * 0.12, 0.6, 0.09 * v, o, 0.01); }); };
  // bichos atacando
  FX.m_coelho = function (t, o, v) { osc('sine', 300, 800, t, 0.12, 0.18 * v, o, 0.005); osc('sine', 800, 330, t + 0.12, 0.14, 0.15 * v, o, 0.003); };
  FX.m_lobo = function (t, o, v) { osc('sawtooth', 120, 85, t, 0.28, 0.1 * v, o, 0.02); noise(t, 0.28, 'bandpass', 500, 300, 1.5, 0.14 * v, o, 0.03); osc('sawtooth', 100, 70, t + 0.05, 0.22, 0.07 * v, o, 0.02); };
  FX.m_javali = function (t, o, v) { osc('sawtooth', 85, 55, t, 0.26, 0.14 * v, o, 0.01); noise(t, 0.2, 'lowpass', 700, 250, 1, 0.16 * v, o, 0.01); };
  FX.m_cogumelo = function (t, o, v) { noise(t, 0.16, 'lowpass', 1500, 400, 0.8, 0.2 * v, o, 0.01); osc('sine', 220, 150, t, 0.14, 0.12 * v, o, 0.005); };
  FX.m_broto = function (t, o, v) { var f = osc('triangle', 170, 120, t, 0.3, 0.13 * v, o, 0.02); noise(t, 0.26, 'bandpass', 280, 180, 3, 0.09 * v, o, 0.03); };
  FX.m_aranha = function (t, o, v) { noise(t, 0.26, 'highpass', 4200, 6500, 1, 0.12 * v, o, 0.02); for (var i = 0; i < 3; i++) osc('square', 1900, 1500, t + i * 0.05, 0.02, 0.05 * v, o, 0.001); };
  FX.ms_cogumelo = function (t, o, v) { noise(t, 0.5, 'bandpass', 900, 400, 1, 0.16 * v, o, 0.05); osc('sine', 300, 120, t, 0.4, 0.1 * v, o, 0.02); };
  FX.ms_coelho = function (t, o, v) { osc('sine', 220, 60, t, 0.3, 0.22 * v, o, 0.005); noise(t, 0.3, 'lowpass', 900, 200, 1, 0.16 * v, o, 0.01); };
  FX.ms_lobo = function (t, o, v) { noise(t, 0.22, 'highpass', 2500, 5000, 1, 0.18 * v, o, 0.01); noise(t + 0.09, 0.22, 'highpass', 2500, 5000, 1, 0.16 * v, o, 0.01); };
  FX.ms_javali = function (t, o, v) { noise(t, 0.5, 'lowpass', 700, 200, 1, 0.2 * v, o, 0.02); osc('sawtooth', 90, 50, t, 0.4, 0.14 * v, o, 0.01); };
  FX.ms_broto = function (t, o, v) { noise(t, 0.5, 'lowpass', 500, 150, 2, 0.2 * v, o, 0.03); osc('triangle', 110, 70, t, 0.4, 0.14 * v, o, 0.02); };
  FX.ms_aranha = function (t, o, v) { noise(t, 0.35, 'highpass', 3000, 7000, 1, 0.14 * v, o, 0.01); osc('sine', 2400, 900, t, 0.3, 0.06 * v, o, 0.01); };
  FX.ms_arvore = function (t, o, v) { osc('sawtooth', 60, 32, t, 0.6, 0.22 * v, o, 0.02); noise(t, 0.5, 'lowpass', 600, 120, 2, 0.22 * v, o, 0.03); };
  FX.m_arvore = function (t, o, v) { osc('sawtooth', 70, 42, t, 0.4, 0.15 * v, o, 0.02); noise(t, 0.34, 'lowpass', 520, 160, 2, 0.14 * v, o, 0.03); };
  // dragão
  FX.d_inhale = function (t, o, v) { noise(t, 0.8, 'bandpass', 300, 1100, 1.2, 0.25 * v, o, 0.5); osc('sawtooth', 60, 110, t, 0.8, 0.07 * v, o, 0.4); };
  FX.d_breath = function (t, o, v) { noise(t, 0.95, 'bandpass', 500, 2200, 0.7, 0.42 * v, o, 0.04); osc('sawtooth', 95, 45, t, 0.9, 0.2 * v, o, 0.02); for (var i = 0; i < 9; i++) noise(t + rnd(0.05, 0.8), 0.03, 'highpass', 3000, 3000, 1, 0.1 * v, o, 0.001); };
  FX.d_slam = function (t, o, v) { osc('sine', 100, 28, t, 0.7, 0.6 * v, o, 0.004); noise(t, 0.4, 'lowpass', 1100, 90, 0.8, 0.4 * v, o, 0.003); noise(t + 0.05, 0.5, 'bandpass', 200, 90, 1, 0.2 * v, o, 0.01); };
  FX.d_claw = function (t, o, v) { FX.slash(t, o, v * 1.3); osc('sawtooth', 130, 70, t, 0.3, 0.12 * v, o, 0.02); };
  FX.d_roar = function (t, o, v) {
    var oo = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), tr = ctx.createOscillator(), tg = ctx.createGain();
    oo.type = 'sawtooth'; oo.frequency.setValueAtTime(95, t); oo.frequency.exponentialRampToValueAtTime(48, t + 2.2);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1300, t); lp.frequency.exponentialRampToValueAtTime(180, t + 2.2); lp.Q.value = 3;
    tr.frequency.value = 22; tg.gain.value = 0.35; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    tr.connect(tg); tg.connect(g.gain); oo.connect(lp); lp.connect(g); g.connect(o); oo.start(t); tr.start(t); oo.stop(t + 2.5); tr.stop(t + 2.5);
    noise(t, 2, 'bandpass', 500, 120, 1, 0.3 * v, o, 0.05); osc('sine', 70, 25, t + 0.1, 1.2, 0.5 * v, o, 0.01);
  };

  /* Quanto cada som pode se repetir (segundos) para não virar barulheira */
  var GAP = { step: 0.2, hitMob: 0.045, hitBig: 0.07, hitPlayer: 0.06, stab: 0.06, slash: 0.06, smash: 0.08, bow: 0.06, zap: 0.06, bell: 0.08, skill: 0.1, pop: 0.05, ui: 0.04 };
  var lastAt = {};
  // Destaque de cada som: os ataques (golpes, habilidades, bichos e dragão) ficam na frente; passos e interface ficam mais discretos
  var VOL = { stab: 1.7, slash: 1.7, smash: 1.7, bow: 1.7, zap: 1.7, bell: 1.5, skill: 1.7, m_coelho: 1.6, m_lobo: 1.6, m_javali: 1.6, m_cogumelo: 1.6, m_broto: 1.6, m_aranha: 1.6, m_arvore: 1.6, ms_cogumelo: 1.5, ms_coelho: 1.5, ms_lobo: 1.5, ms_javali: 1.5, ms_broto: 1.5, ms_aranha: 1.5, ms_arvore: 1.6, d_inhale: 1.3, d_breath: 1.4, d_slam: 1.4, d_claw: 1.5, d_roar: 1.3, hitMob: 1.1, hitBig: 1.2, step: 0.55, ui: 0.6, pop: 0.9 };

  // Devolve onde ligar o som: volume e panorama pela distância e posição em relação a quem ouve. null = longe demais.
  function spatial(x, y, base) {
    if (x === undefined || x === null) { var g0 = ctx.createGain(); g0.gain.value = base; g0.connect(sfxBus); return g0; }
    var d = Math.hypot(x - L.x, y - L.y), k = Math.max(0, 1 - d / 1100); k = Math.sqrt(k) * 0.6 + k * 0.4;
    if (k < 0.03) return null;
    var g = ctx.createGain(); g.gain.value = base * k * k;
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (x - L.x) / 650)) * 0.8; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
    return g;
  }
  function play(name, x, y, o) {
    if (!ctx || mode === 2 || !FX[name]) return;
    o = o || {};
    var now = ctx.currentTime, t = o.t === undefined ? now + 0.005 : o.t;
    if (!offline) {
      if (ctx.state !== 'running') return;
      if (GAP[name] && lastAt[name] !== undefined && now - lastAt[name] < GAP[name]) return;
      if (voices > 40) return;
      lastAt[name] = now;
    }
    var out = spatial(x, y, (o.v === undefined ? 1 : o.v) * (VOL[name] || 1)); if (!out) return;
    voices++; setTimeout(function () { voices--; }, 700);
    FX[name](t, out, 1);
  }

  /* ---------- controle ---------- */
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function unlock() {
    if (ctx) { resume(); return; }
    var c; try { c = new AC(); } catch (e) { return; }
    graph(c); resume();
    mNext = ctx.currentTime + 0.4; startWind();
    setInterval(function () {
      if (!ctx || ctx.state !== 'running') return;
      boss += (bossT - boss) * 0.12;
      musicSchedule(ctx.currentTime + 1.2);
    }, 150);
    (function birds() { setTimeout(function () { if (ctx && ctx.state === 'running' && mode < 2) bird(ctx.currentTime + 0.02); birds(); }, 4500 + Math.random() * 7000); })();
    started = true;
  }
  var cutNext = false;
  function cutTo(k) { // troca de trilha agora: a música antiga some num instante e a nova começa do zero
    if (!ctx || same(k)) return;
    var t = ctx.currentTime, old = musicBus;
    old.gain.cancelScheduledValues(t); old.gain.setTargetAtTime(0, t, 0.06);
    setTimeout(function () { try { old.disconnect(); } catch (e) { /* já solto */ } }, 900);
    musicBus = ctx.createGain(); musicBus.connect(musicMain);
    setTrack(k); mNext = t + 0.15;
  }
  var LABELS = ['Som: música e efeitos', 'Som: só efeitos', 'Som: mudo'];
  function label() { var els = document.querySelectorAll('.snd-btn'); for (var i = 0; i < els.length; i++) els[i].textContent = LABELS[mode]; }
  function cycle() { unlock(); mode = (mode + 1) % 3; try { localStorage.setItem('slimeio_snd', String(mode)); } catch (e) { /* ok */ } applyMode(); label(); if (mode < 2) play('ui'); return mode; }

  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  document.addEventListener('visibilitychange', function () { if (!ctx) return; if (document.hidden) ctx.suspend(); else resume(); });
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('button'); if (!b) return;
    if (b.id === 'playBtn') play('start'); else if (!b.classList.contains('snd-btn')) play('ui');
  });
  function bindButtons() {
    var els = document.querySelectorAll('.snd-btn');
    for (var i = 0; i < els.length; i++) els[i].addEventListener('click', cycle);
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindButtons); else bindButtons();

  window.SND = {
    unlock: unlock, play: play, cycle: cycle, mode: function () { return mode; },
    listen: function (x, y) { L.x = x; L.y = y; },
    boss: function (v) { // perto do dragão acordado: tema de guerra (com histerese para não ficar trocando)
      bossT = v;
      if (!fighting && v > 0.45) fighting = true; else if (fighting && v < 0.15) fighting = false;
      want = fighting ? 'dragao' : zoneWant;
    },
    // Ao entrar no jogo a música do menu (floresta) para na hora: assim que a primeira zona é conhecida, troca de trilha sem esperar o fim do compasso.
    enter: function () { cutNext = true; },
    track: function () { return cur; },
    zone: function (key) {
      zoneWant = ZONE_TRACK[key] || 'floresta'; if (!fighting) want = zoneWant;
      if (cutNext && key && ctx && !fighting) { cutNext = false; cutTo(want); }
    },
    // O dragão despertou: pancada grave, metais descendo e rugido; o tema de guerra começa já no próximo instante.
    stinger: function () {
      unlock(); if (!ctx || ctx.state !== 'running' || mode > 0) return;
      var t = ctx.currentTime + 0.02;
      osc('sine', 90, 28, t, 1.6, 0.5, musicBus, 0.005); noise(t, 0.9, 'lowpass', 1200, 120, 1, 0.3, musicBus, 0.005);
      [62, 61, 58, 55, 50].forEach(function (m, i) { brass(t + 0.15 + i * 0.28, m - 12, 0.35, 0.12); brass(t + 0.15 + i * 0.28, m - 24, 0.35, 0.14); });
      play('d_roar', undefined, undefined, { v: 1.2 });
      fighting = true; want = 'dragao'; mNext = t + 1.5; setTrack('dragao');
    },
    // Gera N segundos de música (e uma demonstração dos efeitos) fora do tempo real, para testar e para ouvir em arquivo.
    _render: function (secs, withSfx, bossLevel, track) {
      offline = true; mode = 0; want = track || 'floresta'; setTrack(want);
      var oc = new OfflineAudioContext(2, 44100 * secs, 44100); graph(oc);
      boss = bossT = bossLevel || 0; mNext = 0.2; mSec = 0; mBar = 0;
      musicSchedule(secs - 1);
      if (withSfx) {
        var seq = ['step', 'step', 'stab', 'slash', 'smash', 'bow', 'zap', 'bell', 'skill', 'hitMob', 'hitBig', 'hitPlayer', 'pop', 'die', 'lvl', 'm_coelho', 'm_lobo', 'm_javali', 'm_cogumelo', 'm_broto', 'm_aranha', 'm_arvore', 'd_inhale', 'd_breath', 'd_claw', 'd_slam', 'd_roar', 'ms_cogumelo', 'ms_coelho', 'ms_lobo', 'ms_javali', 'ms_broto', 'ms_aranha', 'ms_arvore'];
        seq.forEach(function (n, i) { play(n, undefined, undefined, { t: 1 + i * 1.3 }); });
      }
      return oc.startRendering();
    }
  };
})();
