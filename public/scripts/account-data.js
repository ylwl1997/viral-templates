(function () {
  var STATUSES = {
    queued: { en: 'Queued', zh: '排队中' },
    running: { en: 'Running', zh: '生成中' },
    ready: { en: 'Ready', zh: '已完成' },
    failed: { en: 'Failed', zh: '失败' },
  };
  var KINDS = {
    topup: { en: 'Top-up', zh: '充值' },
    deduction: { en: 'Deduction', zh: '扣费' },
    refund: { en: 'Refund', zh: '退还' },
  };
  var COPY = {
    en: {
      unbound: 'Could not load your saved creations and credits yet.',
      error: 'Could not load this yet.',
      retry: 'Try again',
      filterTitle: 'Nothing with this status',
      filterBody: 'Try another filter. Finished videos are not available yet.',
      reference: 'Reference',
      download: 'Download',
    },
    zh: {
      unbound: '暂时无法加载已保存的作品和积分。',
      error: '暂时无法加载。',
      retry: '重试',
      filterTitle: '这个状态下没有记录',
      filterBody: '可以换一个筛选。目前还没有成片。',
      reference: '编号',
      download: '下载',
    },
  };

  function text(lang, key) {
    var pack = COPY[lang] || COPY.en;
    return pack[key] || COPY.en[key] || '';
  }

  function getJson(url) {
    return fetch(url, { credentials: 'same-origin', headers: { accept: 'application/json' } }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok || !data || !data.ok) {
          var err = new Error((data && data.error) || 'request_failed');
          err.code = (data && data.error) || 'request_failed';
          throw err;
        }
        return data;
      });
    });
  }

  function formatWhen(iso, lang) {
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    try {
      return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch (e) {
      return iso || '';
    }
  }

  function safeMediaUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value, location.origin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.href;
    } catch (e) {
      return '';
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function pill(status, lang) {
    var span = document.createElement('span');
    span.className = 'status-pill status-' + status;
    var label = STATUSES[status];
    span.textContent = label ? label[lang] || label.en : status;
    return span;
  }

  function renderJobs(list, jobs, lang) {
    clear(list);
    (jobs || []).forEach(function (job) {
      var li = document.createElement('li');
      li.className = 'creation-row card';
      var head = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = lang === 'zh' ? job.template_name_zh || job.template_name || '' : job.template_name || '';
      head.appendChild(name);
      if (STATUSES[job.status]) head.appendChild(pill(job.status, lang));
      li.appendChild(head);
      var meta = document.createElement('p');
      meta.className = 'creation-meta';
      meta.textContent = text(lang, 'reference') + ' ' + (job.id || '');
      li.appendChild(meta);
      var note = document.createElement('p');
      note.textContent = lang === 'zh' ? job.note_zh || job.note_en || '' : job.note_en || '';
      li.appendChild(note);
      if (job.created_at) {
        var time = document.createElement('time');
        time.dateTime = job.created_at;
        time.textContent = formatWhen(job.created_at, lang);
        li.appendChild(time);
      }
      var media = job.status === 'ready' ? safeMediaUrl(job.result_url) : '';
      if (media) {
        var link = document.createElement('a');
        link.className = 'btn btn-ghost btn-sm creation-download';
        link.href = media;
        link.rel = 'noopener noreferrer';
        link.textContent = text(lang, 'download');
        li.appendChild(link);
      }
      list.appendChild(li);
    });
  }

  function renderLedger(list, rows, lang) {
    clear(list);
    (rows || []).forEach(function (row) {
      var li = document.createElement('li');
      li.className = 'ledger-row card';
      var head = document.createElement('div');
      var delta = document.createElement('strong');
      var amount = Number(row.delta);
      delta.className = amount > 0 ? 'delta-pos' : 'delta-neg';
      delta.textContent = amount > 0 ? '+' + amount : String(amount);
      head.appendChild(delta);
      var kind = document.createElement('span');
      kind.className = 'badge';
      var kindLabel = KINDS[row.kind];
      kind.textContent = kindLabel ? kindLabel[lang] || kindLabel.en : row.kind || '';
      head.appendChild(kind);
      var label = document.createElement('span');
      label.textContent = lang === 'zh' ? row.label_zh || row.label_en || '' : row.label_en || '';
      head.appendChild(label);
      li.appendChild(head);
      if (row.created_at) {
        var time = document.createElement('time');
        time.dateTime = row.created_at;
        time.textContent = formatWhen(row.created_at, lang);
        li.appendChild(time);
      }
      list.appendChild(li);
    });
  }

  function showAlert(panel, lang, code) {
    var alert = panel.querySelector('[data-account-alert]');
    var slot = panel.querySelector('[data-alert-text]');
    var retry = panel.querySelector('[data-retry]');
    if (!alert) return;
    var message = code === 'd1_unbound' ? text(lang, 'unbound') : text(lang, 'error');
    if (slot) slot.textContent = message;
    else alert.textContent = message;
    if (retry) {
      retry.hidden = false;
      retry.textContent = text(lang, 'retry');
    }
    alert.hidden = false;
  }

  function hideAlert(panel) {
    var alert = panel.querySelector('[data-account-alert]');
    if (alert) alert.hidden = true;
  }

  function setLoading(panel, on) {
    var el = panel.querySelector('[data-loading]');
    if (el) el.hidden = !on;
  }

  function bootPanel(panel) {
    var lang = panel.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';
    var view = panel.getAttribute('data-account-panel');
    var list = panel.querySelector('[data-list]');
    var empty = panel.querySelector('[data-empty]');
    var emptyTitle = empty ? empty.querySelector('h3') : null;
    var emptyBody = empty ? empty.querySelector('p') : null;
    var emptyCta = empty ? empty.querySelector('[data-empty-cta]') : null;
    var defaultTitle = emptyTitle ? emptyTitle.textContent : '';
    var defaultBody = emptyBody ? emptyBody.textContent : '';
    var status = '';
    if (view === 'creations') {
      try {
        status = new URLSearchParams(location.search).get('status') || '';
      } catch (e) {
        status = '';
      }
      if (!STATUSES[status]) status = '';
    }

    function paintFilters() {
      panel.querySelectorAll('[data-status]').forEach(function (btn) {
        var on = (btn.getAttribute('data-status') || '') === status;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('is-on', on);
      });
    }

    function showEmpty(filtered) {
      if (list) list.hidden = true;
      if (!empty) return;
      if (emptyTitle) emptyTitle.textContent = filtered ? text(lang, 'filterTitle') : defaultTitle;
      if (emptyBody) emptyBody.textContent = filtered ? text(lang, 'filterBody') : defaultBody;
      if (emptyCta) emptyCta.hidden = !!filtered;
      empty.hidden = false;
    }

    function showList() {
      if (empty) empty.hidden = true;
      if (list) list.hidden = false;
    }

    function load() {
      hideAlert(panel);
      setLoading(panel, true);
      if (list) list.hidden = true;
      if (empty) empty.hidden = true;
      var task;
      if (view === 'overview') {
        task = Promise.all([
          getJson('/api/account/credits?ledger=0'),
          getJson('/api/account/creations?limit=3'),
        ]).then(function (pair) {
          var credits = pair[0];
          var creations = pair[1];
          var balance = panel.querySelector('[data-balance]');
          var count = panel.querySelector('[data-count]');
          if (balance) balance.textContent = String(credits.balance);
          if (count) count.textContent = String(creations.total);
          if (!creations.jobs || !creations.jobs.length) showEmpty(false);
          else {
            renderJobs(list, creations.jobs, lang);
            showList();
          }
        });
      } else if (view === 'creations') {
        var query = status ? '?status=' + encodeURIComponent(status) : '';
        task = getJson('/api/account/creations' + query).then(function (data) {
          paintFilters();
          if (!data.jobs || !data.jobs.length) showEmpty(!!status);
          else {
            renderJobs(list, data.jobs, lang);
            showList();
          }
        });
      } else if (view === 'credits') {
        task = getJson('/api/account/credits').then(function (data) {
          var balance = panel.querySelector('[data-balance]');
          if (balance) balance.textContent = String(data.balance);
          if (!data.ledger || !data.ledger.length) showEmpty(false);
          else {
            renderLedger(list, data.ledger, lang);
            showList();
          }
        });
      } else {
        setLoading(panel, false);
        return;
      }
      task
        .catch(function (err) {
          if (list) list.hidden = true;
          if (empty) empty.hidden = true;
          showAlert(panel, lang, err && err.code);
        })
        .finally(function () {
          setLoading(panel, false);
        });
    }

    paintFilters();
    panel.querySelectorAll('[data-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        status = btn.getAttribute('data-status') || '';
        paintFilters();
        try {
          var url = new URL(location.href);
          if (status) url.searchParams.set('status', status);
          else url.searchParams.delete('status');
          history.replaceState(null, '', url.pathname + url.search + url.hash);
        } catch (e) {}
        load();
      });
    });
    var retry = panel.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', load);
    load();
  }

  var started = false;
  function start(user) {
    if (!user || started) return;
    var panel = document.querySelector('[data-account-panel]');
    if (!panel) return;
    started = true;
    bootPanel(panel);
  }

  document.addEventListener('vt:session', function (ev) {
    start(ev.detail && ev.detail.user);
  });
  if (window.__VT_SESSION__) start(window.__VT_SESSION__);
})();
