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

  function googleLink(lang, next) {
    var link = document.createElement('a');
    link.className = 'btn btn-google';
    link.id = 'sign-in-google';
    link.href =
      '/api/auth/google/start?next=' +
      encodeURIComponent(next) +
      '&from=' +
      encodeURIComponent(location.pathname);
    link.appendChild(googleMark());
    link.appendChild(document.createTextNode(lang === 'zh' ? '使用 Google 继续' : 'Continue with Google'));
    return link;
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
    var or = document.getElementById('sign-in-or');

    var errorCopy = {
      google_denied: ['Google sign-in was cancelled.', '已取消 Google 登录。'],
      google_failed: ['Google sign-in did not work. Try again.', 'Google 登录没有成功，请再试一次。'],
      google_state: ['That sign-in link expired. Start again.', '登录链接已过期，请重新开始。'],
      google_unavailable: ['Google sign-in is not available on this site yet.', '这个站点暂时还不能用 Google 登录。'],
    };

    function showError(msg) {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || '';
    }

    var errorKey = params.get('error') || '';
    if (errorCopy[errorKey]) showError(errorCopy[errorKey][lang === 'zh' ? 1 : 0]);

    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.user) {
          location.replace(next);
          return;
        }
        var googleReady = !!(data && data.google && data.auth_secret);
        var previewOk = !!(data && data.preview);

        if (googleReady && googleWrap) {
          googleWrap.hidden = false;
          googleWrap.replaceChildren(googleLink(lang, next));
          if (lede) {
            lede.textContent = previewOk
              ? lang === 'zh'
                ? '使用你的 Google 账户，或使用下方的预览登录。'
                : 'Use your Google account, or the preview sign-in below.'
              : lang === 'zh'
                ? '使用你的 Google 账户继续。'
                : 'Use your Google account to continue.';
          }
        }

        if (previewWrap) previewWrap.hidden = !previewOk;
        if (or) {
          or.hidden = !(googleReady && previewOk);
          or.textContent = lang === 'zh' ? '或' : 'or';
        }
        if (previewOk && !googleReady && lede) {
          lede.textContent = lang === 'zh' ? '使用预览登录继续（演示）。' : 'Continue with Preview sign-in (demo).';
        }

        if (!googleReady && !previewOk) {
          if (soon) {
            soon.hidden = false;
            if (data && data.google && !data.auth_secret) {
              soon.textContent =
                lang === 'zh' ? '这个站点暂时还不能登录。' : 'Sign-in is not available on this site yet.';
            }
          }
          if (lede && !(data && data.google && !data.auth_secret)) {
            lede.textContent = lang === 'zh' ? '登录即将开放。' : 'Sign-in coming soon.';
          }
          if (data && data.google && !data.auth_secret && lede) {
            lede.textContent = lang === 'zh' ? '登录暂时还不能用。' : 'Sign-in is not available on this site yet.';
          }
          if (status) status.textContent = '';
        } else if (status) {
          status.textContent =
            previewOk && !googleReady
              ? lang === 'zh'
                ? '演示环境可用预览登录。'
                : 'Preview sign-in is available on this host.'
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
