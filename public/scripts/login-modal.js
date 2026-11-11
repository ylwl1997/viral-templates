/**
 * In-page sign-in dialog and popup Google OAuth.
 * The registered redirect URI stays /api/auth/google/callback.
 * A popup callback postMessages this window, then the session is refetched.
 */
import {
  acceptAuthMessage,
  googleStartUrl,
  isSignInPath,
  popupFeatures,
  safeNext,
  safeSignInPath,
  AUTH_CHANNEL,
} from './login-popup.js';

(function () {
  var COPY = {
    en: {
      kicker: 'Account',
      title: 'Sign in',
      close: 'Close',
      lede: 'Use your Google account to continue.',
      ledeBoth: 'Use your Google account, or the preview sign-in below.',
      ledePassword: 'Use your Google account, or the owner test sign-in below.',
      ledePasswordOnly: 'Owner test sign-in. This is not a public account.',
      ledePreview: 'Continue with Preview sign-in (demo).',
      ledeSoon: 'Sign-in coming soon.',
      ledeOff: 'Sign-in is not available on this site yet.',
      google: 'Continue with Google',
      or: 'or',
      email: 'Email',
      password: 'Password',
      passwordSubmit: 'Sign in',
      invalidCredentials: 'Invalid email or password.',
      passwordUnavailable: 'Password sign-in is not available.',
      name: 'Display name',
      previewName: 'Preview User',
      preview: 'Preview sign-in',
      previewStatus: 'Preview sign-in is available on this host.',
      soon: 'Sign-in coming soon.',
      off: 'Sign-in is not available on this site yet.',
      loadError: 'Could not load sign-in status.',
      previewFail: 'Preview sign-in failed.',
      network: 'Network error.',
      waiting: 'Continue in the Google window.',
      blocked: 'The sign-in window was blocked. Continuing in this tab.',
      google_denied: 'Google sign-in was cancelled.',
      google_failed: 'Google sign-in did not work. Try again.',
      google_state: 'That sign-in link expired. Start again.',
      google_unavailable: 'Google sign-in is not available on this site yet.',
      email_not_allowed: 'This account is not allowed to sign in.',
    },
    zh: {
      kicker: '账户',
      title: '登录',
      close: '关闭',
      lede: '使用你的 Google 账户继续。',
      ledeBoth: '使用你的 Google 账户，或使用下方的预览登录。',
      ledePassword: '使用你的 Google 账户，或使用下方的站主测试登录。',
      ledePasswordOnly: '站主测试登录。这不是公开注册。',
      ledePreview: '使用预览登录继续（演示）。',
      ledeSoon: '登录即将开放。',
      ledeOff: '登录暂时还不能用。',
      google: '使用 Google 继续',
      or: '或',
      email: '邮箱',
      password: '密码',
      passwordSubmit: '登录',
      invalidCredentials: '邮箱或密码不正确。',
      passwordUnavailable: '邮箱登录暂时不可用。',
      name: '显示名',
      previewName: '预览用户',
      preview: '预览登录',
      previewStatus: '演示环境可用预览登录。',
      soon: '登录即将开放。',
      off: '这个站点暂时还不能登录。',
      loadError: '无法读取登录状态。',
      previewFail: '预览登录失败。',
      network: '网络错误。',
      waiting: '请在 Google 窗口中继续。',
      blocked: '登录窗口被拦截了，将在当前页面继续。',
      google_denied: '已取消 Google 登录。',
      google_failed: 'Google 登录没有成功，请再试一次。',
      google_state: '登录链接已过期，请重新开始。',
      google_unavailable: '这个站点暂时还不能用 Google 登录。',
      email_not_allowed: '这个账号不在允许登录的名单里。',
    },
  };

  function text(lang, key) {
    var pack = COPY[lang] || COPY.en;
    return pack[key] || COPY.en[key] || '';
  }

  function langOf(node) {
    var el = node && node.closest ? node.closest('[data-lang]') : null;
    var value = (el && el.getAttribute('data-lang')) || document.documentElement.lang || 'en';
    return value === 'zh' || String(value).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
  }

  function currentPath() {
    return location.pathname + location.search + location.hash;
  }

  function defaultFrom() {
    var root = document.querySelector('[data-header-auth]');
    var href = root && root.getAttribute('data-sign-in');
    if (!href) return '/account/sign-in/';
    try {
      return new URL(href, location.origin).pathname;
    } catch (e) {
      return '/account/sign-in/';
    }
  }

  function googleMark() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 18 18');
    svg.setAttribute('aria-hidden', 'true');
    var paths = [
      ['#4285F4', 'M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z'],
      ['#34A853', 'M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z'],
      ['#FBBC05', 'M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z'],
      ['#EA4335', 'M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z'],
    ];
    paths.forEach(function (item) {
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('fill', item[0]);
      path.setAttribute('d', item[1]);
      svg.appendChild(path);
    });
    return svg;
  }

  function publishSession(user) {
    window.__VT_SESSION__ = user || null;
    document.dispatchEvent(new CustomEvent('vt:session', { detail: { user: window.__VT_SESSION__ } }));
    return window.__VT_SESSION__;
  }

  function readSessionUser() {
    return fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        return data && data.user ? data.user : null;
      });
  }

  function refreshSession() {
    return readSessionUser().then(function (user) {
      return publishSession(user);
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  var pending = { popup: null, ui: null, settled: false, error: '', timer: 0 };
  var modal = null;
  var modalUi = null;
  var pageUi = null;
  var lastFocus = null;
  var inerted = [];

  function screenBox() {
    return {
      x: window.screenX,
      y: window.screenY,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      width: window.screen ? window.screen.width : 0,
      height: window.screen ? window.screen.height : 0,
    };
  }

  function showUiError(ui, message) {
    if (!ui || !ui.err) return;
    ui.err.hidden = !message;
    ui.err.textContent = message || '';
  }

  function setUiStatus(ui, message) {
    if (!ui || !ui.status) return;
    ui.status.textContent = message || '';
  }

  function authErrorCopy(lang, code) {
    if (!code || !COPY.en[code]) return '';
    if (code.indexOf('google_') === 0 || code === 'email_not_allowed') return text(lang, code);
    return '';
  }

  function errorText(lang, code) {
    return authErrorCopy(lang, code) || text(lang, 'google_failed');
  }

  function clearPendingTimer() {
    if (pending.timer) window.clearInterval(pending.timer);
    pending.timer = 0;
  }

  function closePopup() {
    clearPendingTimer();
    var popup = pending.popup;
    pending.popup = null;
    if (!popup) return;
    try {
      if (!popup.closed) popup.close();
    } catch (e) {}
  }

  function finishSuccess(next) {
    if (pending.settled) return;
    pending.settled = true;
    var ui = pending.ui;
    var dest = safeNext(next || (ui && ui.next), '/account/');
    closePopup();
    readSessionUser()
      .catch(function () {
        return null;
      })
      .then(function (user) {
        if (user) return user;
        return wait(280).then(readSessionUser);
      })
      .then(function (user) {
        if (!user) {
          pending.settled = false;
          if (ui) showUiError(ui, text(ui.lang, 'google_failed'));
          return;
        }
        publishSession(user);
        closeModal({ focusAccount: true });
        if (isSignInPath(location.pathname)) location.replace(dest);
      })
      .catch(function () {
        pending.settled = false;
        if (ui) showUiError(ui, text(ui.lang, 'network'));
      });
  }

  function finishError(code) {
    if (pending.settled) return;
    pending.settled = true;
    pending.error = code || 'google_failed';
    var ui = pending.ui;
    closePopup();
    if (ui) {
      setUiStatus(ui, '');
      showUiError(ui, errorText(ui.lang, pending.error));
    }
  }

  function onPopupClosed(ui) {
    if (pending.settled) return;
    readSessionUser()
      .catch(function () {
        return null;
      })
      .then(function (user) {
        if (user) return user;
        return wait(280).then(readSessionUser);
      })
      .then(function (user) {
        if (pending.settled) return;
        if (user) {
          finishSuccess(ui && ui.next);
          return;
        }
        if (pending.error) {
          finishError(pending.error);
          return;
        }
        if (ui) setUiStatus(ui, '');
      })
      .catch(function () {
        if (pending.settled) return;
        if (ui) setUiStatus(ui, '');
      });
  }

  function watchPopup(popup, ui) {
    clearPendingTimer();
    pending.timer = window.setInterval(function () {
      var closed = false;
      try {
        closed = !popup || popup.closed;
      } catch (e) {
        closed = true;
      }
      if (!closed) return;
      clearPendingTimer();
      if (pending.popup === popup) pending.popup = null;
      onPopupClosed(ui);
    }, 400);
  }

  function beginGoogle(ui) {
    if (pending.popup) {
      try {
        if (!pending.popup.closed) {
          pending.popup.focus();
          return;
        }
      } catch (e) {}
    }
    pending.settled = false;
    pending.error = '';
    pending.ui = ui;
    showUiError(ui, '');
    var popupUrl = googleStartUrl({ next: ui.next, from: ui.from, popup: true });
    var sameTab = googleStartUrl({ next: ui.next, from: ui.from, popup: false });
    var popup = null;
    try {
      popup = window.open(popupUrl, 'vt-google-auth', popupFeatures(screenBox()));
    } catch (e) {
      popup = null;
    }
    var blocked = !popup;
    try {
      if (popup && popup.closed) blocked = true;
    } catch (e) {
      blocked = true;
    }
    if (blocked) {
      setUiStatus(ui, text(ui.lang, 'blocked'));
      window.setTimeout(function () {
        location.assign(sameTab);
      }, 700);
      return;
    }
    pending.popup = popup;
    setUiStatus(ui, text(ui.lang, 'waiting'));
    try {
      popup.focus();
    } catch (e) {}
    watchPopup(popup, ui);
  }

  function wireGoogle(ui) {
    var link = document.createElement('a');
    link.className = 'btn btn-google';
    if (ui.mode === 'page') link.id = 'sign-in-google';
    link.href = googleStartUrl({ next: ui.next, from: ui.from, popup: false });
    link.appendChild(googleMark());
    link.appendChild(document.createTextNode(text(ui.lang, 'google')));
    link.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      beginGoogle(ui);
    });
    if (ui.googleWrap) {
      ui.googleWrap.hidden = false;
      ui.googleWrap.replaceChildren(link);
    }
    return link;
  }

  function paintAvailability(ui, data) {
    if (data && data.user) {
      publishSession(data.user);
      if (ui.redirectOnUser || isSignInPath(location.pathname)) {
        location.replace(ui.next || '/account/');
        return;
      }
      closeModal({ focusAccount: true });
      return;
    }
    var googleReady = !!(data && data.google && data.auth_secret);
    var previewOk = !!(data && data.preview);
    var passwordOk = !!(data && data.password);
    if (ui.googleWrap) {
      if (googleReady) wireGoogle(ui);
      else ui.googleWrap.replaceChildren();
      ui.googleWrap.hidden = !googleReady;
    }
    if (ui.passwordWrap) ui.passwordWrap.hidden = !passwordOk;
    if (ui.previewWrap) ui.previewWrap.hidden = !previewOk;
    if (ui.or) {
      ui.or.hidden = !(googleReady && (passwordOk || previewOk));
      ui.or.textContent = text(ui.lang, 'or');
    }
    if (ui.lede) {
      if (googleReady && passwordOk) ui.lede.textContent = text(ui.lang, 'ledePassword');
      else if (googleReady && previewOk) ui.lede.textContent = text(ui.lang, 'ledeBoth');
      else if (googleReady) ui.lede.textContent = text(ui.lang, 'lede');
      else if (passwordOk) ui.lede.textContent = text(ui.lang, 'ledePasswordOnly');
      else if (previewOk) ui.lede.textContent = text(ui.lang, 'ledePreview');
      else if (data && data.google && !data.auth_secret) ui.lede.textContent = text(ui.lang, 'ledeOff');
      else ui.lede.textContent = text(ui.lang, 'ledeSoon');
    }
    if (ui.soon) {
      var showSoon = !googleReady && !previewOk && !passwordOk;
      ui.soon.hidden = !showSoon;
      if (showSoon) {
        ui.soon.textContent =
          data && data.google && !data.auth_secret ? text(ui.lang, 'off') : text(ui.lang, 'soon');
      }
    }
    if (ui.status) {
      ui.status.textContent = previewOk && !googleReady && !passwordOk ? text(ui.lang, 'previewStatus') : '';
    }
  }

  function loadAvailability(ui) {
    return fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        paintAvailability(ui, data || {});
      })
      .catch(function () {
        if (ui.passwordWrap) ui.passwordWrap.hidden = true;
        if (ui.soon) ui.soon.hidden = false;
        setUiStatus(ui, text(ui.lang, 'loadError'));
      });
  }

  function wirePassword(ui) {
    if (!ui.passwordForm || ui.passwordForm.dataset.wired) return;
    ui.passwordForm.dataset.wired = '1';
    ui.passwordForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showUiError(ui, '');
      var fd = new FormData(ui.passwordForm);
      var payload = {
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
        next: ui.next,
      };
      var btn = ui.passwordForm.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.ok) {
            var code = res.j && res.j.error;
            showUiError(
              ui,
              code === 'password_unavailable' ? text(ui.lang, 'passwordUnavailable') : text(ui.lang, 'invalidCredentials'),
            );
            if (btn) btn.disabled = false;
            return;
          }
          var dest = safeNext(res.j.next, ui.next);
          if (res.j.user) publishSession(res.j.user);
          if (ui.mode === 'modal' && !isSignInPath(location.pathname)) {
            if (!res.j.user) refreshSession();
            closeModal({ focusAccount: true });
            return;
          }
          location.replace(dest);
        })
        .catch(function () {
          showUiError(ui, text(ui.lang, 'network'));
          if (btn) btn.disabled = false;
        });
    });
  }

  function wirePreview(ui) {
    if (!ui.previewForm || ui.previewForm.dataset.wired) return;
    ui.previewForm.dataset.wired = '1';
    ui.previewForm.addEventListener('submit', function (e) {
      e.preventDefault();
      showUiError(ui, '');
      var fd = new FormData(ui.previewForm);
      var payload = {
        email: String(fd.get('email') || '').trim(),
        name: String(fd.get('name') || '').trim(),
        next: ui.next,
      };
      var btn = ui.previewForm.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      fetch('/api/auth/preview', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          if (!res.ok || !res.j || !res.j.ok) {
            var code = res.j && res.j.error;
            showUiError(
              ui,
              authErrorCopy(ui.lang, code) || (res.j && res.j.message) || text(ui.lang, 'previewFail'),
            );
            if (btn) btn.disabled = false;
            return;
          }
          var dest = safeNext(res.j.next, ui.next);
          if (res.j.user) publishSession(res.j.user);
          if (ui.mode === 'modal' && !isSignInPath(location.pathname)) {
            if (!res.j.user) refreshSession();
            closeModal({ focusAccount: true });
            return;
          }
          location.replace(dest);
        })
        .catch(function () {
          showUiError(ui, text(ui.lang, 'network'));
          if (btn) btn.disabled = false;
        });
    });
  }

  function bootPage() {
    var root = document.getElementById('sign-in-panel');
    if (!root) return;
    var lang = root.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    var fallback = root.getAttribute('data-next-default') || '/account/';
    var params = new URLSearchParams(location.search);
    var next = safeNext(params.get('next') || '', fallback);
    var ui = {
      mode: 'page',
      lang: lang,
      next: next,
      from: safeSignInPath(location.pathname),
      redirectOnUser: true,
      lede: document.getElementById('sign-in-lede'),
      err: document.getElementById('sign-in-error'),
      status: document.getElementById('sign-in-status'),
      googleWrap: document.getElementById('google-wrap'),
      passwordWrap: document.getElementById('password-wrap'),
      passwordForm: document.getElementById('password-form'),
      previewWrap: document.getElementById('preview-wrap'),
      previewForm: document.getElementById('preview-form'),
      or: document.getElementById('sign-in-or'),
      soon: document.getElementById('sign-in-soon'),
    };
    pageUi = ui;
    var errorKey = params.get('error') || '';
    var errorCopy = authErrorCopy(lang, errorKey);
    if (errorCopy) showUiError(ui, errorCopy);
    wirePassword(ui);
    wirePreview(ui);
    loadAvailability(ui);
  }

  function field(label, input) {
    var wrap = document.createElement('label');
    var span = document.createElement('span');
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  function buildModal(lang) {
    var root = document.createElement('div');
    root.className = 'login-modal';
    root.setAttribute('data-login-modal', '');
    root.hidden = true;

    var backdrop = document.createElement('div');
    backdrop.className = 'login-modal-backdrop';
    backdrop.setAttribute('data-login-dismiss', '');

    var dialog = document.createElement('div');
    dialog.className = 'login-modal-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'login-modal-title');
    dialog.tabIndex = -1;

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'login-modal-close';
    close.setAttribute('data-login-dismiss', '');
    close.textContent = text(lang, 'close');

    var kicker = document.createElement('p');
    kicker.className = 'account-kicker';
    kicker.textContent = text(lang, 'kicker');

    var title = document.createElement('h2');
    title.id = 'login-modal-title';
    title.textContent = text(lang, 'title');

    var lede = document.createElement('p');
    lede.className = 'lede';
    lede.textContent = text(lang, 'lede');

    var err = document.createElement('p');
    err.className = 'sign-in-error';
    err.hidden = true;

    var googleWrap = document.createElement('div');
    googleWrap.hidden = true;

    var or = document.createElement('p');
    or.className = 'sign-in-divider';
    or.hidden = true;

    var passwordWrap = document.createElement('div');
    passwordWrap.hidden = true;
    var passwordForm = document.createElement('form');
    passwordForm.className = 'preview-form';
    passwordForm.method = 'post';
    passwordForm.action = '/api/auth/password';
    var passwordEmail = document.createElement('input');
    passwordEmail.name = 'email';
    passwordEmail.type = 'email';
    passwordEmail.autocomplete = 'username';
    passwordEmail.maxLength = 200;
    passwordEmail.required = true;
    var passwordInput = document.createElement('input');
    passwordInput.name = 'password';
    passwordInput.type = 'password';
    passwordInput.autocomplete = 'current-password';
    passwordInput.maxLength = 1024;
    passwordInput.required = true;
    var passwordSubmit = document.createElement('button');
    passwordSubmit.className = 'btn btn-primary';
    passwordSubmit.type = 'submit';
    passwordSubmit.style.width = '100%';
    passwordSubmit.textContent = text(lang, 'passwordSubmit');
    passwordForm.appendChild(field(text(lang, 'email'), passwordEmail));
    passwordForm.appendChild(field(text(lang, 'password'), passwordInput));
    passwordForm.appendChild(passwordSubmit);
    passwordWrap.appendChild(passwordForm);

    var previewWrap = document.createElement('div');
    previewWrap.hidden = true;
    var form = document.createElement('form');
    form.className = 'preview-form';
    var email = document.createElement('input');
    email.name = 'email';
    email.type = 'email';
    email.value = 'preview@viral-templates.local';
    email.autocomplete = 'username';
    var name = document.createElement('input');
    name.name = 'name';
    name.type = 'text';
    name.maxLength = 80;
    name.value = text(lang, 'previewName');
    name.autocomplete = 'nickname';
    var submit = document.createElement('button');
    submit.className = 'btn btn-primary';
    submit.type = 'submit';
    submit.style.width = '100%';
    submit.textContent = text(lang, 'preview');
    form.appendChild(field(text(lang, 'email'), email));
    form.appendChild(field(text(lang, 'name'), name));
    form.appendChild(submit);
    previewWrap.appendChild(form);

    var status = document.createElement('p');
    status.className = 'sign-in-status';

    var soon = document.createElement('p');
    soon.className = 'sign-in-soon';
    soon.hidden = true;
    soon.textContent = text(lang, 'soon');

    dialog.appendChild(close);
    dialog.appendChild(kicker);
    dialog.appendChild(title);
    dialog.appendChild(lede);
    dialog.appendChild(err);
    dialog.appendChild(googleWrap);
    dialog.appendChild(or);
    dialog.appendChild(passwordWrap);
    dialog.appendChild(previewWrap);
    dialog.appendChild(status);
    dialog.appendChild(soon);
    root.appendChild(backdrop);
    root.appendChild(dialog);
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-login-dismiss]')) closeModal();
    });

    return {
      root: root,
      dialog: dialog,
      closeBtn: close,
      lede: lede,
      err: err,
      status: status,
      googleWrap: googleWrap,
      passwordWrap: passwordWrap,
      passwordForm: passwordForm,
      previewWrap: previewWrap,
      previewForm: form,
      or: or,
      soon: soon,
      title: title,
      kicker: kicker,
    };
  }

  function lockPage(on) {
    if (on) {
      document.documentElement.classList.add('login-open');
      inerted = [];
      Array.prototype.forEach.call(document.body.children, function (el) {
        if (!modal || el === modal.root || el.hasAttribute('inert')) return;
        el.setAttribute('inert', '');
        inerted.push(el);
      });
      return;
    }
    document.documentElement.classList.remove('login-open');
    inerted.forEach(function (el) {
      el.removeAttribute('inert');
    });
    inerted = [];
  }

  function isOpen() {
    return !!(modal && modal.root && !modal.root.hidden);
  }

  function focusable(dialog) {
    return Array.prototype.filter.call(
      dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (el) {
        return !el.hidden && !el.closest('[hidden]');
      }
    );
  }

  function onKey(e) {
    if (!isOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== 'Tab' || !modal) return;
    var items = focusable(modal.dialog);
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function ensureModal(lang) {
    if (modal && modal.lang === lang) return modal;
    if (modal && modal.root) modal.root.remove();
    var built = buildModal(lang);
    built.lang = lang;
    modal = built;
    return modal;
  }

  function closeModal(opts) {
    opts = opts || {};
    if (!modal || !modal.root || modal.root.hidden) {
      lockPage(false);
      return;
    }
    modal.root.hidden = true;
    if (modalUi) modalUi.open = false;
    lockPage(false);
    var focusAccount = opts.focusAccount;
    var avatar = document.querySelector('[data-auth-avatar]');
    if (focusAccount && avatar) {
      try {
        avatar.focus();
      } catch (e) {}
      return;
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }

  function focusPageSignIn() {
    var panel = document.getElementById('sign-in-panel');
    var btn = document.getElementById('sign-in-google');
    var email = document.querySelector('#password-form input[name="email"]');
    if (!btn && email && email.closest && !email.closest('[hidden]')) btn = email;
    if (btn) {
      try {
        btn.focus();
      } catch (e) {}
      return;
    }
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: 'center' });
  }

  function openModal(intent) {
    var lang = intent.lang === 'zh' ? 'zh' : 'en';
    if (isSignInPath(location.pathname) && document.getElementById('sign-in-panel')) {
      if (window.__VT_SESSION__) location.replace(intent.next || '/account/');
      else focusPageSignIn();
      return;
    }
    if (window.__VT_SESSION__) {
      if (isSignInPath(location.pathname)) location.replace(intent.next || '/account/');
      return;
    }
    var built = ensureModal(lang);
    if (!built.ui) {
      built.ui = {
        mode: 'modal',
        open: true,
        lang: lang,
        next: intent.next,
        from: intent.from,
        redirectOnUser: isSignInPath(location.pathname),
        lede: built.lede,
        err: built.err,
        status: built.status,
        googleWrap: built.googleWrap,
        passwordWrap: built.passwordWrap,
        passwordForm: built.passwordForm,
        previewWrap: built.previewWrap,
        previewForm: built.previewForm,
        or: built.or,
        soon: built.soon,
      };
      wirePassword(built.ui);
      wirePreview(built.ui);
    }
    var ui = built.ui;
    ui.open = true;
    ui.lang = lang;
    ui.next = intent.next;
    ui.from = intent.from;
    ui.redirectOnUser = isSignInPath(location.pathname);
    modalUi = ui;
    built.closeBtn.textContent = text(lang, 'close');
    built.kicker.textContent = text(lang, 'kicker');
    built.title.textContent = text(lang, 'title');
    built.lede.textContent = text(lang, 'lede');
    showUiError(ui, '');
    setUiStatus(ui, '');
    if (built.googleWrap) {
      built.googleWrap.hidden = true;
      built.googleWrap.replaceChildren();
    }
    if (built.passwordWrap) built.passwordWrap.hidden = true;
    if (built.previewWrap) built.previewWrap.hidden = true;
    if (built.or) built.or.hidden = true;
    if (built.soon) built.soon.hidden = true;
    lastFocus = document.activeElement;
    built.root.hidden = false;
    lockPage(true);
    try {
      built.dialog.focus();
    } catch (e) {}
    loadAvailability(ui);
  }

  function intentFromAnchor(anchor) {
    var next = '';
    var from = '';
    try {
      var u = new URL(anchor.getAttribute('href') || '', location.origin);
      next = u.searchParams.get('next') || '';
      from = u.pathname;
    } catch (e) {}
    if (!next) next = currentPath();
    return {
      lang: langOf(anchor),
      next: safeNext(next, '/account/'),
      from: safeSignInPath(from || defaultFrom()),
    };
  }

  function isSignInAnchor(anchor) {
    if (!anchor || anchor.tagName !== 'A') return false;
    if (anchor.target && anchor.target !== '_self') return false;
    try {
      var u = new URL(anchor.href, location.origin);
      return u.origin === location.origin && isSignInPath(u.pathname);
    } catch (e) {
      return false;
    }
  }

  function onAuthMessage(event) {
    var payload = acceptAuthMessage(event, location.origin);
    if (!payload) return;
    if (payload.ok) finishSuccess(payload.next);
    else finishError(payload.error || 'google_failed');
  }

  function boot() {
    bootPage();
    document.addEventListener('click', function (e) {
      var node = e.target && e.target.closest ? e.target.closest('a, button') : null;
      if (!node) return;
      var anchor = node.closest('a');
      var marked = node.closest('[data-auth-signin], [data-account-gate-signin], [data-open-login]');
      if (!marked && !isSignInAnchor(anchor)) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var source = marked || anchor;
      if (!source) return;
      e.preventDefault();
      openModal(intentFromAnchor(source.tagName === 'A' ? source : anchor || source));
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onAuthMessage);
    try {
      var channel = new BroadcastChannel(AUTH_CHANNEL);
      channel.addEventListener('message', function (event) {
        onAuthMessage({ origin: location.origin, data: event.data });
      });
    } catch (e) {}
    window.vtOpenLogin = function (opts) {
      opts = opts || {};
      var next = safeNext(opts.next || currentPath(), '/account/');
      var from = safeSignInPath(opts.from || defaultFrom());
      var lang = opts.lang === 'zh' ? 'zh' : langOf(document.body);
      if (window.__VT_SESSION__) {
        if (isSignInPath(location.pathname)) location.replace(next);
        return false;
      }
      openModal({ lang: lang, next: next, from: from });
      return true;
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
