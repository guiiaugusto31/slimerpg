'use strict';
// Service worker do SlimeRPG. O jogo é online (o servidor manda tudo em tempo real), então ele não guarda o jogo para jogar sem internet:
// só deixa o app instalável e abre a última tela conhecida se a rede falhar. Rede primeiro: quem sobe uma versão nova sempre recebe a nova.
// Para forçar todo mundo a limpar o que ficou guardado, troque o número de VERSAO.
var VERSAO = 'slimerpg-v1';
var SEMPRE_REDE = /^\/(api\/|admin\/|status$|data\.json$|img-list$)/; // dados vivos: nunca ficam guardados

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSAO; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || SEMPRE_REDE.test(url.pathname)) return; // fontes do Google, WebSocket e dados vivos seguem direto
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copia = res.clone();
        caches.open(VERSAO).then(function (c) { c.put(req, copia); }).catch(function () { /* sem espaço: segue sem guardar */ });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') {
          return caches.match('/index.html').then(function (idx) {
            return idx || caches.match('/') || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b140f;color:#e3e9da;font:18px system-ui,sans-serif;text-align:center;padding:24px"><p>Sem conexão.<br>O SlimeRPG precisa de internet para jogar. Tente de novo em instantes.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          });
        }
        return new Response('', { status: 504 });
      });
    })
  );
});
