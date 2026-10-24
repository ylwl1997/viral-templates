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
    var lede = document.getElementById('sign-in-lede');
    var previewForm = document.getElementById('preview-form');
    var previewWrap = document.getElementById('preview-wrap');
    var googleWrap = document.getElementById('google-wrap');
    var soon = document.getElementById('sign-in-soon');

    function showError(msg) {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || '';
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
        var googleWired = !!(data && data.google);
        var previewOk = !!(data && data.preview);

        if (googleWired && googleWrap) {
          googleWrap.hidden = false;
          googleWrap.innerHTML =
            '<button type="button" class="btn btn-ghost" id="sign-in-google" style="width:100%">' +
            (lang === 'zh' ? '使用 Google 继续' : 'Continue with Google') +
            '</button>';
          var googleBtn = document.getElementById('sign-in-google');
          if (googleBtn) {
            googleBtn.addEventListener('click', function (e) {
              e.preventDefault();
              showError(
                lang === 'zh'
                  ? 'Google 登录暂不可用，请稍后再试。'
                  : 'Google sign-in is unavailable right now. Try again later.'
              );
            });
          }
          if (lede) {
            lede.textContent =
              lang === 'zh' ? '使用 Google 登录继续。' : 'Continue with Google to sign in.';
          }
        }

        if (previewWrap) previewWrap.hidden = !previewOk;
        if (previewOk && !googleWired && lede) {
          lede.textContent =
            lang === 'zh'
              ? '使用预览登录继续（演示）。'
              : 'Continue with Preview sign-in (demo).';
        }

        if (!googleWired && !previewOk) {
          if (soon) soon.hidden = false;
          if (lede) {
            lede.textContent =
              lang === 'zh' ? '登录即将开放。' : 'Sign-in coming soon.';
          }
          if (status) status.textContent = '';
        } else if (status) {
          status.textContent = previewOk && !googleWired
            ? (lang === 'zh' ? '演示环境可用预览登录。' : 'Preview sign-in is available on this host.')
            : '';
        }
      })
      .catch(function () {
        if (soon) soon.hidden = false;
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
