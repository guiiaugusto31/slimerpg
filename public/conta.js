// Contas por e-mail (tela inicial): entrar, criar conta, confirmar o e-mail com código, recuperar a senha e excluir a conta.
// O progresso fica no servidor; aqui só guardamos o "token" de login no navegador. Se o servidor não tem contas, esta parte some.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'slimeio_token', KEYM = 'slimeio_email';
  var st = { cfg: null, token: '', email: '', verified: true, mail: false, step: null, email2: '', busy: false };
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }
  st.token = lsGet(KEY); st.email = lsGet(KEYM);

  function api(method, url, body, auth) {
    var h = { 'Content-Type': 'application/json' };
    if (auth && st.token) h.Authorization = 'Bearer ' + st.token;
    return fetch(url, { method: method, headers: h, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function localSaveCount() { try { var s = JSON.parse(localStorage.getItem('slimeio_save') || 'null'); return s && s.items ? s.items.length : 0; } catch (e) { return 0; } }

  /* ---- faixa da tela inicial ---- */
  function paintStrip() {
    $('acctOut').hidden = !!st.token; $('acctIn').hidden = !st.token;
    if (!st.token) return;
    $('acctMail').textContent = st.email || 'sua conta';
    $('acctNote').textContent = st.verified || !st.mail ? '' : 'E-mail ainda não confirmado.';
  }
  function setSession(b) {
    st.token = b.token; st.email = b.email; st.verified = b.verified !== false; st.mail = !!b.mail;
    lsSet(KEY, st.token); lsSet(KEYM, st.email);
    paintStrip(); refreshInfo(); fireChange();
  }
  function dropToken() { st.token = ''; st.email = ''; lsSet(KEY, ''); lsSet(KEYM, ''); }
  // o que a tela inicial mostra quando não há conta: o progresso guardado neste navegador
  function localInfo() {
    var s = null; try { s = JSON.parse(localStorage.getItem('slimeio_save') || 'null'); } catch (e) { /* ignora */ }
    if (!s || !s.items) return '';
    var n = s.items.length, dn = (s.done || []).length;
    return 'Progresso guardado: ' + n + (n === 1 ? ' item' : ' itens') + ' e ' + dn + (dn === 1 ? ' missão concluída.' : ' missões concluídas.');
  }
  function fireChange() { try { window.dispatchEvent(new Event('slimeconta')); } catch (e) { /* navegador antigo */ } }
  function clearSession() { dropToken(); paintStrip(); $('saveInfo').textContent = localInfo(); fireChange(); }
  function refreshInfo() {
    if (!st.token) return;
    api('GET', '/api/me', null, true).then(function (r) {
      if (r.status === 401) { clearSession(); return; }
      if (!r.ok) return;
      var b = r.body; st.verified = !!b.verified; st.mail = !!b.mail; st.email = b.email; lsSet(KEYM, st.email);
      $('saveInfo').textContent = b.hasSave ? 'Progresso na sua conta: ' + b.items + (b.items === 1 ? ' item' : ' itens') + ' e ' + b.quests + (b.quests === 1 ? ' missão concluída.' : ' missões concluídas.') : 'Conta pronta. O progresso será guardado nela.';
      paintStrip();
    }).catch(function () { /* sem rede: mantém o que já sabemos */ });
  }

  /* ---- janela ---- */
  function card() { return $('acctModal').firstElementChild; }
  function open(step) { st.step = step; $('acctModal').hidden = false; render(); }
  function close() { $('acctModal').hidden = true; st.step = null; }
  function field(id, label, type, extra) {
    var i = el('input', Object.assign({ id: id, type: type, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' }, extra || {}));
    var box = [i];
    if (type === 'password') { // olho para conferir o que foi digitado (útil no celular)
      var t = el('button', { type: 'button', class: 'acct-eye', 'aria-pressed': 'false', 'aria-label': 'Mostrar a senha', text: 'Mostrar' });
      t.addEventListener('click', function () {
        var show = i.type === 'password'; i.type = show ? 'text' : 'password';
        t.setAttribute('aria-pressed', String(show)); t.textContent = show ? 'Ocultar' : 'Mostrar'; t.setAttribute('aria-label', show ? 'Ocultar a senha' : 'Mostrar a senha');
      });
      box.push(t);
    }
    return el('div', { class: 'acct-f' }, [el('label', { for: id, text: label }), el('div', { class: 'acct-in' }, box)]);
  }
  function submitBtn(text) { return el('button', { type: 'submit', class: 'primary', text: text }); }
  function linkBtn(text, fn) { var b = el('button', { type: 'button', class: 'acct-link', text: text }); b.addEventListener('click', fn); return b; }
  function errBox() { return el('p', { class: 'acct-err', id: 'acctErr', role: 'alert' }); }
  function setErr(msg) { var e = $('acctErr'); if (e) e.textContent = msg || ''; }
  function run(btn, fn) {
    if (st.busy) return; st.busy = true; setErr(''); if (btn) btn.disabled = true;
    Promise.resolve().then(fn).catch(function () { setErr('Sem conexão com o servidor. Tente de novo.'); }).then(function () { st.busy = false; if (btn) btn.disabled = false; });
  }
  function tabs(active) {
    var w = el('div', { class: 'acct-tabs', role: 'tablist' });
    [['login', 'Entrar'], ['register', 'Criar conta']].forEach(function (t) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(active === t[0]), text: t[1] });
      b.addEventListener('click', function () { st.step = t[0]; render(); }); w.appendChild(b);
    });
    return w;
  }
  function form(children, onSubmit) {
    var f = el('form', { novalidate: 'novalidate' }, children);
    f.addEventListener('submit', function (e) { e.preventDefault(); onSubmit(f.querySelector('button[type=submit]')); });
    return f;
  }
  function val(id) { var e = $(id); return e ? e.value : ''; }

  function render() {
    var c = card(); c.textContent = '';
    var step = st.step, kids = [];
    var x = el('button', { type: 'button', class: 'acct-x', 'aria-label': 'Fechar', text: '×' }); x.addEventListener('click', close);
    var title = el('h2', { id: 'acctTitle' });
    c.setAttribute('aria-labelledby', 'acctTitle');
    c.appendChild(x); c.appendChild(title);
    if (step === 'login' || step === 'register') {
      title.textContent = 'Sua conta do SlimeRPG';
      c.appendChild(tabs(step));
      var reg = step === 'register';
      if (reg) {
        var n = localSaveCount();
        c.appendChild(el('p', { class: 'hint acct-hint', text: 'Use o seu e-mail: ele identifica a conta. O progresso (itens, missões e abates) fica guardado no servidor e vale em qualquer aparelho.' + (n && st.cfg && st.cfg.import ? ' Os ' + n + ' itens deste navegador vão junto para a conta nova.' : '') }));
      }
      var pw = field('acctPw', reg ? 'Senha (8 ou mais caracteres)' : 'Senha', 'password', { autocomplete: reg ? 'new-password' : 'current-password' });
      c.appendChild(form([field('acctEmail', 'E-mail', 'email', { autocomplete: 'email', inputmode: 'email' }), pw, errBox(), submitBtn(reg ? 'Criar conta' : 'Entrar')], function (btn) {
        run(btn, function () {
          return api('POST', reg ? '/api/register' : '/api/login', { email: val('acctEmail'), password: val('acctPw') }).then(function (r) {
            if (!r.ok) return setErr(r.body.error || 'Não deu certo. Tente de novo.');
            setSession(r.body);
            if (reg && r.body.verified === false) { st.step = 'code'; render(); } else { close(); }
          });
        });
      }));
      if (!reg && st.cfg && st.cfg.mail) c.appendChild(el('p', { class: 'acct-alt' }, [linkBtn('Esqueci a senha', function () { st.step = 'forgot'; render(); })]));
    } else if (step === 'code') {
      title.textContent = 'Confirme seu e-mail';
      c.appendChild(el('p', { class: 'hint acct-hint', text: 'Enviamos um código de 6 dígitos para ' + st.email + '. Ele vale por 15 minutos. Veja também a caixa de spam.' }));
      c.appendChild(form([field('acctCode', 'Código', 'text', { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' }), errBox(), submitBtn('Confirmar')], function (btn) {
        run(btn, function () {
          return api('POST', '/api/verify', { code: val('acctCode') }, true).then(function (r) {
            if (!r.ok) return setErr(r.body.error || 'Código errado.');
            st.verified = true; paintStrip(); refreshInfo(); close();
          });
        });
      }));
      c.appendChild(el('p', { class: 'acct-alt' }, [
        linkBtn('Mandar o código de novo', function () { run(null, function () { return api('POST', '/api/resend', {}, true).then(function (r) { setErr(r.ok ? 'Código enviado.' : (r.body.error || 'Não consegui enviar.')); }); }); }),
        linkBtn('Agora não', close)
      ]));
    } else if (step === 'forgot') {
      title.textContent = 'Recuperar a senha';
      c.appendChild(el('p', { class: 'hint acct-hint', text: 'Digite o e-mail da conta. Se ela existir, enviamos um código para criar uma senha nova.' }));
      c.appendChild(form([field('acctEmail', 'E-mail', 'email', { autocomplete: 'email', inputmode: 'email' }), errBox(), submitBtn('Enviar código')], function (btn) {
        run(btn, function () {
          return api('POST', '/api/forgot', { email: val('acctEmail') }).then(function (r) {
            if (!r.ok) return setErr(r.body.error || 'Não deu certo.');
            st.email2 = val('acctEmail'); st.step = 'reset'; render();
          });
        });
      }));
      c.appendChild(el('p', { class: 'acct-alt' }, [linkBtn('Voltar', function () { st.step = 'login'; render(); })]));
    } else if (step === 'reset') {
      title.textContent = 'Criar senha nova';
      c.appendChild(el('p', { class: 'hint acct-hint', text: 'Se existe uma conta com ' + st.email2 + ', o código chegou no e-mail dela.' }));
      c.appendChild(form([field('acctCode', 'Código', 'text', { inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code' }), field('acctPw', 'Senha nova (8 ou mais caracteres)', 'password', { autocomplete: 'new-password' }), errBox(), submitBtn('Trocar a senha')], function (btn) {
        run(btn, function () {
          return api('POST', '/api/reset', { email: st.email2, code: val('acctCode'), password: val('acctPw') }).then(function (r) {
            if (!r.ok) return setErr(r.body.error || 'Não deu certo.');
            st.step = 'login'; render(); setErr('Senha trocada. Entre com a senha nova.'); var em = $('acctEmail'); if (em) em.value = st.email2;
          });
        });
      }));
    } else if (step === 'manage') {
      title.textContent = 'Sua conta';
      c.appendChild(el('p', { class: 'hint acct-hint', text: st.email + (st.mail ? (st.verified ? ' (e-mail confirmado)' : ' (e-mail ainda não confirmado)') : '') }));
      var row = el('div', { class: 'acct-actions' });
      if (st.mail && !st.verified) { var cf = el('button', { type: 'button', text: 'Confirmar e-mail' }); cf.addEventListener('click', function () { api('POST', '/api/resend', {}, true); st.step = 'code'; render(); }); row.appendChild(cf); }
      var lo = el('button', { type: 'button', text: 'Sair da conta' }); lo.addEventListener('click', function () { logout(); close(); }); row.appendChild(lo);
      var dl = el('button', { type: 'button', class: 'acct-danger', text: 'Excluir conta' }); dl.addEventListener('click', function () { st.step = 'delete'; render(); }); row.appendChild(dl);
      c.appendChild(row);
    } else if (step === 'delete') {
      title.textContent = 'Excluir a conta';
      c.appendChild(el('p', { class: 'hint acct-hint', text: 'Isso apaga a conta e todo o progresso guardado nela, e não tem volta. Digite a senha para confirmar.' }));
      c.appendChild(form([field('acctPw', 'Senha', 'password', { autocomplete: 'current-password' }), errBox(), el('button', { type: 'submit', class: 'acct-danger', text: 'Excluir para sempre' })], function (btn) {
        run(btn, function () {
          return api('POST', '/api/delete', { password: val('acctPw') }, true).then(function (r) {
            if (!r.ok) return setErr(r.body.error || 'Não deu certo.');
            clearSession(); close();
          });
        });
      }));
      c.appendChild(el('p', { class: 'acct-alt' }, [linkBtn('Voltar', function () { st.step = 'manage'; render(); })]));
    }
    if (st.cfg && !st.cfg.persistent && step !== 'delete') c.appendChild(el('p', { class: 'acct-warn', text: 'Atenção: este servidor guarda as contas em um arquivo temporário. Elas podem sumir quando ele reiniciar.' }));
    var first = c.querySelector('input'); if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function logout() {
    var t = st.token;
    if (t) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {});
    clearSession();
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('acctModal').hidden) close(); });
  $('acctModal').addEventListener('mousedown', function (e) { if (e.target === $('acctModal')) close(); });
  $('acctOpen').addEventListener('click', function () { open('login'); });
  $('acctManage').addEventListener('click', function () { open('manage'); });
  $('acctLogout').addEventListener('click', logout);

  window.Conta = {
    token: function () { return st.token || ''; },
    // o servidor recusou o login guardado (venceu, conta excluída...)
    expired: function () { clearSession(); },
    enabled: function () { return !!st.cfg; },
    openLogin: function () { open('login'); }
  };

  // só aparece se este servidor tem contas (aberto direto do arquivo não há servidor para perguntar)
  if (location.protocol === 'file:') return;
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
    if (!cfg || !cfg.enabled) { dropToken(); return; }
    st.cfg = cfg; $('acct').hidden = false; paintStrip(); refreshInfo();
  }).catch(function () { /* sem servidor de contas (versão de teste): fica tudo como antes */ });
})();
