(function () {
  function pathWithNext(signInPath) {
    try {
      var u = new URL(signInPath, location.origin);
      if (!u.searchParams.get('next')) {
        u.searchParams.set('next', location.pathname + location.search);
      }
      return u.pathname + u.search;
    } catch (e) {
      return signInPath;
    }
  }

  function apply(user) {
    var shell = document.querySelector('[data-account-shell]');
    if (!shell) return;
    var gate = shell.querySelector('[data-account-gate]');
    var body = shell.querySelector('[data-account-body]');
    var sidebar = shell.querySelector('[data-account-sidebar]');
    var link = shell.querySelector('[data-account-gate-signin]');
    if (link) link.href = pathWithNext(link.getAttribute('href') || '/account/sign-in/');
    if (user) {
      shell.classList.remove('is-logged-out');
      shell.classList.add('is-logged-in');
      if (gate) gate.hidden = true;
      if (body) body.hidden = false;
      if (sidebar) sidebar.hidden = false;
      shell.querySelectorAll('[data-session-name]').forEach(function (el) {
        el.textContent = user.name || user.email || '—';
      });
      shell.querySelectorAll('[data-session-email]').forEach(function (el) {
        el.textContent = user.email || '—';
      });
      shell.querySelectorAll('[data-session-id]').forEach(function (el) {
        el.textContent = user.user_id || '—';
      });
    } else {
      shell.classList.add('is-logged-out');
      shell.classList.remove('is-logged-in');
      if (gate) gate.hidden = false;
      if (body) body.hidden = true;
      if (sidebar) sidebar.hidden = true;
    }
  }

  function boot() {
    if (window.__VT_SESSION__ !== undefined) {
      apply(window.__VT_SESSION__);
      return;
    }
    document.addEventListener('vt:session', function (ev) {
      apply(ev.detail && ev.detail.user);
    });
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        apply(data && data.user ? data.user : null);
      })
      .catch(function () {
        apply(null);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
