(function () {
  function initials(name, email) {
    var src = String(name || email || 'U').trim();
    var parts = src.split(/[\s@._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  }

  function closeMenus(except) {
    document.querySelectorAll('[data-header-auth]').forEach(function (root) {
      if (except && root === except) return;
      var menu = root.querySelector('[data-auth-menu]');
      var btn = root.querySelector('[data-auth-avatar]');
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function render(root, user) {
    var signIn = root.querySelector('[data-auth-signin]');
    var userBox = root.querySelector('[data-auth-user]');
    if (!signIn || !userBox) return;
    if (!user) {
      signIn.hidden = false;
      userBox.hidden = true;
      return;
    }
    signIn.hidden = true;
    userBox.hidden = false;
    var initialsEl = root.querySelector('[data-auth-initials]');
    var nameEl = root.querySelector('[data-auth-name]');
    var emailEl = root.querySelector('[data-auth-email]');
    if (initialsEl) initialsEl.textContent = initials(user.name, user.email);
    if (nameEl) nameEl.textContent = user.name || user.email || 'Account';
    if (emailEl) emailEl.textContent = user.email || '';
  }

  function bind(root) {
    var avatar = root.querySelector('[data-auth-avatar]');
    var menu = root.querySelector('[data-auth-menu]');
    var signOut = root.querySelector('[data-auth-signout]');
    if (avatar && menu) {
      avatar.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.hidden;
        closeMenus();
        menu.hidden = !open;
        avatar.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    if (signOut) {
      signOut.addEventListener('click', function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
          .catch(function () {})
          .finally(function () {
            location.reload();
          });
      });
    }
  }

  function boot() {
    var roots = document.querySelectorAll('[data-header-auth]');
    if (!roots.length) return;
    roots.forEach(bind);
    document.addEventListener('click', function () {
      closeMenus();
    });
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var user = data && data.user ? data.user : null;
        roots.forEach(function (root) {
          render(root, user);
        });
        window.__VT_SESSION__ = user;
        document.dispatchEvent(new CustomEvent('vt:session', { detail: { user: user } }));
      })
      .catch(function () {
        roots.forEach(function (root) {
          render(root, null);
        });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
