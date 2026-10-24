(function () {
  function safeNext(raw, fallback) {
    if (typeof raw !== 'string') return fallback;
    var value = raw.trim();
    if (!value || value.length > 512) return fallback;
    for (var i = 0; i < 2; i++) {
      try {
        var decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch (e) {
        return fallback;
      }
    }
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
    if (value.indexOf('\\') >= 0 || value.indexOf('://') >= 0) return fallback;
    return value;
  }

  function boot() {
    var root = document.getElementById('sign-in-panel');
    if (!root) return;
    var lang = root.getAttribute('data-lang') || 'en';
    var fallback = root.getAttribute('data-next-default') || '/account/';
    var params = new URLSearchParams(location.search);
    var next = safeNext(params.get('next') || '', fallback);
    var err = document.getElementById('sign-in-error');
    var status = document.getElementById('sign-in-status');
    var googleBtn = document.getElementById('sign-in-google');
    var previewForm = document.getElementById('preview-form');
    var previewWrap = document.getElementById('preview-wrap');

    function showError(msg) {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || '';
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        showError(
          lang === 'zh'
            ? 'Google 登录尚未配置。请使用下方预览登录完成验收。'
            : 'Google sign-in is not configured yet. Use preview sign-in below for acceptance.'
        );
      });
    }

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.user) {
          location.replace(next);
          return;
        }
        if (previewWrap) {
          previewWrap.hidden = !(data && data.preview);
        }
        if (status) {
          status.textContent =
            data && data.preview
              ? lang === 'zh'
                ? '预览环境可用一键假登录（写入会话 Cookie）。'
                : 'Preview hosts can use one-click fake login (writes a session cookie).'
              : lang === 'zh'
                ? '预览登录未开启。'
                : 'Preview sign-in is not available on this host.';
        }
      })
      .catch(function () {
        if (status) {
          status.textContent =
            lang === 'zh' ? '无法读取登录状态。' : 'Could not load sign-in status.';
        }
      });

    if (previewForm) {
      previewForm.addEventListener('submit', function (e) {
        e.preventDefault();
        showError('');
        var fd = new FormData(previewForm);
        var payload = {
          email: String(fd.get('email') || '').trim(),
          name: String(fd.get('name') || '').trim(),
          next: next,
        };
        var btn = previewForm.querySelector('[type="submit"]');
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
              showError(
                (res.j && (res.j.message || res.j.error)) ||
                  (lang === 'zh' ? '预览登录失败。' : 'Preview sign-in failed.')
              );
              if (btn) btn.disabled = false;
              return;
            }
            location.replace(safeNext(res.j.next, next));
          })
          .catch(function () {
            showError(lang === 'zh' ? '网络错误。' : 'Network error.');
            if (btn) btn.disabled = false;
          });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
