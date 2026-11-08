/* Integração com portais de jogos (CrazyGames). Fora do portal não faz nada.
   No CrazyGames: carrega o kit deles, avisa quando a partida começa/para (eles usam isso para anúncios e métricas),
   comemora momentos bons, usa o link de convite deles e esconde o que o portal não permite (links externos e a loja com Pix). */
(function () {
  'use strict';
  var q = '';
  try { q = location.search; } catch (e) { /* sem URL */ }
  var framed = false;
  try { framed = window.top !== window; } catch (e) { framed = true; }
  var want = /[?&]portal=crazygames/.test(q) || /[?&]useLocalSdk=true/.test(q) || (framed && /crazygames\./i.test(document.referrer || ''));
  var P = { on: false, sdk: null, playing: false };
  window.Portal = P;
  function call(fn) { if (!P.on || !P.sdk) return; try { fn(P.sdk); } catch (e) { /* o portal recusou: segue o jogo */ } }
  P.start = function () { if (P.playing) return; P.playing = true; call(function (s) { s.game.gameplayStart(); }); };
  P.stop = function () { if (!P.playing) return; P.playing = false; call(function (s) { s.game.gameplayStop(); }); };
  P.happy = function () { call(function (s) { s.game.happytime(); }); };
  // link de convite do portal (abre o jogo no mesmo modo para quem receber)
  P.invite = function (mode) { var link = null; call(function (s) { link = s.game.inviteLink({ mode: mode || 'classic' }); }); return link; };
  P.inviteMode = function () { var m = null; call(function (s) { m = s.game.getInviteParam('mode'); }); return m; };
  if (!want) return;
  document.documentElement.classList.add('portal');
  var sc = document.createElement('script');
  sc.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
  sc.onload = function () {
    var S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    S.init().then(function () {
      if (S.environment !== 'crazygames' && S.environment !== 'local') return;
      P.sdk = S; P.on = true;
      document.documentElement.classList.add('portal-on');
      try { S.game.loadingStop(); } catch (e) { /* já parou */ }
      var ev = new Event('portalready'); window.dispatchEvent(ev);
    }).catch(function () { /* fora do portal */ });
  };
  document.head.appendChild(sc);
})();
