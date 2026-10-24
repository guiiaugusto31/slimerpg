(function () {
  'use strict';
  // PWA: registra o service worker (só em https ou localhost) e cuida do botão "Instalar o jogo".
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* sem service worker o jogo roda igual */ }); });
  }

  var btn = null, adiado = null;
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function mostrar() { if (btn && !standalone) btn.hidden = false; }
  function dica(txt) { var s = document.getElementById('status'); if (s) s.textContent = txt; }

  function ligar() {
    btn = document.getElementById('installBtn');
    if (!btn) return;
    if (ios && !standalone) mostrar(); // o iPhone não tem o aviso automático: o botão explica o caminho
    btn.addEventListener('click', function () {
      if (adiado) {
        adiado.prompt();
        adiado.userChoice.then(function () { adiado = null; btn.hidden = true; }, function () { /* fechou o aviso */ });
      } else if (ios) {
        dica('No iPhone: toque em Compartilhar (o quadrado com a seta) e depois em "Adicionar à Tela de Início".');
      } else {
        dica('Abra o menu do navegador e escolha "Instalar app" ou "Adicionar à tela inicial".');
      }
    });
    if (adiado) mostrar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();

  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); adiado = e; mostrar(); });
  window.addEventListener('appinstalled', function () { adiado = null; if (btn) btn.hidden = true; });
})();
