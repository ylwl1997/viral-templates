import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as onCallback } from '../functions/api/auth/google/callback.js';
import { onRequestGet as onStart } from '../functions/api/auth/google/start.js';
import { onRequestPost as onPreview } from '../functions/api/auth/preview.js';
import {
  codeChallengeS256,
  googleRedirectUri,
  mapGoogleProfile,
  oauthResultDocument,
  readOauthState,
  sessionUserFromGoogle,
} from '../functions/_lib/google-oauth.js';
import {
  acceptAuthMessage,
  googleStartUrl,
  isSignInPath,
  popupFeatures,
  safeNext,
  safeSignInPath,
} from '../public/scripts/login-popup.js';
import {
  authStatus,
  googleConfigured,
  previewLoginAllowed,
  readSession,
  stableUserId,
} from '../functions/_lib/session.js';

const AUTH_SECRET = 'test-auth-secret-value';
const CLIENT_ID = '123.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-client-secret-value';
const APEX = 'https://viral-templates.pages.dev';
const BRAND = 'https://bby-wow.example.com';
const SUB = '109876543210987654321';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function wrap(sqlite) {
  function prepared(sql, params = []) {
    return {
      bind(...next) {
        return prepared(sql, next);
      },
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { meta: { changes: info.changes } };
      },
      async first() {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...params) };
      },
    };
  }
  return {
    prepare(sql) {
      return prepared(sql);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const stmt of statements) out.push(await stmt.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function cookieHeader(res) {
  const lines = res.headers.getSetCookie();
  return lines.map((line) => line.split(';')[0]).filter(Boolean).join('; ');
}

function setCookie(res, name) {
  return res.headers.getSetCookie().find((line) => line.startsWith(`${name}=`)) || '';
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
const googleEnv = {
  AUTH_SECRET,
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
  DB: db,
};

function profile(overrides = {}) {
  return {
    sub: SUB,
    email: 'Ada@Example.com',
    email_verified: true,
    name: 'Ada Lovelace',
    picture: 'https://lh3.googleusercontent.com/a/ada',
    ...overrides,
  };
}

async function withGoogle(profileBody, run) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    calls.push({ href, init });
    if (href === 'https://oauth2.googleapis.com/token') {
      return jsonResponse({ access_token: 'ya29.test-token', token_type: 'Bearer' });
    }
    if (href === 'https://openidconnect.googleapis.com/v1/userinfo') {
      const auth = init && init.headers && init.headers.authorization;
      assert(auth === 'Bearer ya29.test-token', 'userinfo bearer');
      return jsonResponse(profileBody);
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = previous;
  }
}

async function startSignIn(origin, env, query = 'next=/account/creations/&from=/zh/t/bby-wow/account/sign-in/') {
  const res = await onStart({
    request: new Request(`${origin}/api/auth/google/start?${query}`),
    env,
  });
  assert(res.status === 302, `start status ${res.status}`);
  const location = res.headers.get('location') || '';
  const auth = new URL(location);
  const cookie = cookieHeader(res);
  return { res, location, auth, cookie };
}

assert(googleConfigured({ GOOGLE_CLIENT_ID: ' id ', GOOGLE_CLIENT_SECRET: ' secret ' }) === true, 'trim');
assert(googleConfigured({ GOOGLE_CLIENT_ID: '   ', GOOGLE_CLIENT_SECRET: 'secret' }) === false, 'blank id');
assert(previewLoginAllowed({}, 'localhost') === true, 'local preview');
assert(previewLoginAllowed({}, 'viral-templates.pages.dev') === true, 'pages preview');
assert(previewLoginAllowed({}, 'example.com') === false, 'custom host without google');
assert(
  previewLoginAllowed({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET }, 'localhost') === false,
  'google hides preview',
);
assert(
  previewLoginAllowed(
    { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, AUTH_PREVIEW_LOGIN: '1' },
    'example.com',
  ) === true,
  'preview override',
);
assert(previewLoginAllowed({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: '  ' }, 'localhost') === true, 'blank is unset');

const status = authStatus(new Request(`${APEX}/api/auth/session`), googleEnv);
assert(status.google === true && status.auth_secret === true && status.preview === false, 'auth status');
const fallback = authStatus(new Request(`${APEX}/api/auth/session`), {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
});
assert(fallback.google === true && fallback.auth_secret === false && fallback.preview === false, 'no public secret for google');

assert(
  googleRedirectUri(APEX) === `${APEX}/api/auth/google/callback`,
  googleRedirectUri(APEX),
);
assert(googleRedirectUri('https://evil.example/phish') === '', 'redirect uri rejects a path');
assert(googleRedirectUri('javascript:alert(1)') === '', 'redirect uri rejects javascript');
assert(googleRedirectUri('http://localhost:8788') === 'http://localhost:8788/api/auth/google/callback', 'local callback');

const mapped = mapGoogleProfile(profile());
assert(mapped.email === 'ada@example.com' && mapped.name === 'Ada Lovelace', 'profile map');
assert(mapped.picture.startsWith('https://'), 'picture');
assert(mapGoogleProfile(profile({ email_verified: false })).email === '', 'unverified email dropped');
assert(mapGoogleProfile(profile({ picture: 'http://evil.example/a.png' })).picture === '', 'http picture dropped');
assert(mapGoogleProfile({ email: 'a@b.c' }) === null, 'sub required');
assert(mapGoogleProfile({ sub: 'bad sub' }) === null, 'sub spaces rejected');

const sessionUser = await sessionUserFromGoogle(profile());
const again = await sessionUserFromGoogle(profile());
assert(sessionUser.user_id === again.user_id, 'stable google id');
assert(sessionUser.providers.length === 1 && sessionUser.providers[0] === 'google', 'provider');
assert(sessionUser.user_id === (await stableUserId('google', SUB)), 'uses stableUserId');
assert(sessionUser.user_id !== (await stableUserId('preview', SUB)), 'provider separates ids');
assert(sessionUser.user_id.startsWith('u_'), sessionUser.user_id);

const blocked = await onStart({
  request: new Request('http://evil.example/api/auth/google/start?next=/account/'),
  env: googleEnv,
});
assert(blocked.status === 302, 'http public host');
assert(!(blocked.headers.get('location') || '').includes('accounts.google.com'), 'did not send people to Google');
assert((blocked.headers.get('location') || '').includes('error=google_unavailable'), blocked.headers.get('location'));

const missingSecret = await onStart({
  request: new Request(`${APEX}/api/auth/google/start?next=/account/`),
  env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
});
assert((missingSecret.headers.get('location') || '').includes('error=google_unavailable'), 'AUTH_SECRET required');
assert(!setCookie(missingSecret, 'vt_oauth'), 'no state cookie without AUTH_SECRET');

const open = await startSignIn(
  APEX,
  googleEnv,
  'next=https://evil.example/phish&from=https://evil.example/account/sign-in/',
);
assert(open.auth.origin === 'https://accounts.google.com', open.location);
assert(open.auth.pathname === '/o/oauth2/v2/auth', open.auth.pathname);
assert(open.auth.searchParams.get('client_id') === CLIENT_ID, 'client id');
assert(open.auth.searchParams.get('redirect_uri') === `${APEX}/api/auth/google/callback`, 'apex redirect');
assert(open.auth.searchParams.get('response_type') === 'code', 'code flow');
assert(open.auth.searchParams.get('scope') === 'openid email profile', 'scope');
assert(!open.location.includes(CLIENT_SECRET), 'secret left the authorize URL');
assert(!open.location.includes('evil.example'), 'next left the authorize URL');
assert(!open.auth.searchParams.has('code_verifier'), 'verifier stayed off the authorize URL');
const savedOpen = await readOauthState(new Request(`${APEX}/api/auth/session`, { headers: { cookie: open.cookie } }), googleEnv);
assert(savedOpen.next === '/account/', savedOpen.next);
assert(savedOpen.from === '/account/sign-in/', savedOpen.from);
assert(savedOpen.popup === false, 'full-page start is not a popup');
assert(open.auth.searchParams.get('code_challenge') === (await codeChallengeS256(savedOpen.verifier)), 'pkce');
assert(open.auth.searchParams.get('code_challenge_method') === 'S256', 's256');
const oauthCookie = setCookie(open.res, 'vt_oauth');
assert(oauthCookie.includes('HttpOnly') && oauthCookie.includes('SameSite=Lax') && oauthCookie.includes('Secure'), oauthCookie);
assert(oauthCookie.includes('Max-Age=600'), oauthCookie);

const brandStart = await startSignIn(BRAND, googleEnv, 'next=/t/bby-wow/account/&from=/t/bby-wow/account/sign-in/');
assert(
  brandStart.auth.searchParams.get('redirect_uri') === `${BRAND}/api/auth/google/callback`,
  'brand host redirect',
);

await withGoogle(profile(), async (calls) => {
  const started = await startSignIn(APEX, googleEnv);
  const state = started.auth.searchParams.get('state');
  const saved = await readOauthState(
    new Request(`${APEX}/api/auth/session`, { headers: { cookie: started.cookie } }),
    googleEnv,
  );
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=${encodeURIComponent('4/test-code')}&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(cb.status === 302, `callback ${cb.status}`);
  assert(cb.headers.get('location') === '/account/creations/', cb.headers.get('location'));
  assert(calls.length === 2, `fetch count ${calls.length}`);
  const tokenCall = calls.find((call) => call.href.endsWith('/token'));
  const body = new URLSearchParams(tokenCall.init.body);
  assert(body.get('grant_type') === 'authorization_code', 'grant');
  assert(body.get('code') === '4/test-code', 'code');
  assert(body.get('redirect_uri') === `${APEX}/api/auth/google/callback`, 'token redirect');
  assert(body.get('client_secret') === CLIENT_SECRET, 'secret in token body');
  assert(body.get('code_verifier') === saved.verifier, 'pkce verifier');
  const sessionLine = setCookie(cb, 'vt_session');
  assert(sessionLine.includes('HttpOnly') && sessionLine.includes('Secure'), 'session cookie');
  assert(setCookie(cb, 'vt_oauth').includes('Max-Age=0'), 'state cookie cleared');
  const user = await readSession(
    new Request(`${APEX}/api/auth/session`, { headers: { cookie: cookieHeader(cb) } }),
    googleEnv,
  );
  assert(user.user_id === sessionUser.user_id, 'session id');
  assert(user.email === 'ada@example.com', user.email);
  assert(user.name === 'Ada Lovelace', user.name);
  assert(user.avatar_url === 'https://lh3.googleusercontent.com/a/ada', user.avatar_url);
  assert(JSON.stringify(user.providers) === '["google"]', JSON.stringify(user.providers));
  const row = sqlite.prepare('SELECT user_id, email, name FROM users').get();
  assert(row.user_id === user.user_id && row.email === 'ada@example.com' && row.name === 'Ada Lovelace', 'user row');
  const credit = sqlite.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').get(user.user_id);
  assert(credit.balance === 0, `balance ${credit && credit.balance}`);
  assert(sqlite.prepare('SELECT COUNT(*) AS n FROM credit_ledger').get().n === 0, 'no ledger on login');
  assert(sqlite.prepare('SELECT COUNT(*) AS n FROM jobs').get().n === 0, 'no job on login');
});

sqlite.prepare('UPDATE credit_accounts SET balance = 7').run();
await withGoogle(profile({ name: 'Ada L.' }), async () => {
  const started = await startSignIn(BRAND, googleEnv, 'next=/account/&from=/account/sign-in/');
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${BRAND}/api/auth/google/callback?code=4/again&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(cb.headers.get('location') === '/account/', 'brand lands on relative account');
  const user = await readSession(
    new Request(`${BRAND}/account/`, { headers: { cookie: cookieHeader(cb) } }),
    googleEnv,
  );
  assert(user.user_id === sessionUser.user_id, 'same person on the brand host');
});
assert(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1, 'one user row');
assert(sqlite.prepare('SELECT balance FROM credit_accounts').get().balance === 7, 'login did not change credits');
assert(sqlite.prepare('SELECT COUNT(*) AS n FROM credit_ledger').get().n === 0, 'still no ledger');

await withGoogle(profile(), async (calls) => {
  const started = await startSignIn(APEX, googleEnv);
  calls.length = 0;
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/test-code&state=not-the-state`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(calls.length === 0, 'mismatch did not call Google');
  assert((cb.headers.get('location') || '').includes('error=google_state'), cb.headers.get('location'));
  assert(!setCookie(cb, 'vt_session'), 'no session on mismatch');
  assert((cb.headers.get('location') || '').startsWith('/zh/t/bby-wow/account/sign-in/'), cb.headers.get('location'));
});
assert(sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n === 1, 'mismatch did not add a user');

await withGoogle(profile(), async (calls) => {
  const started = await startSignIn(APEX, googleEnv);
  calls.length = 0;
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(calls.length === 0, 'cancel did not call Google');
  assert((cb.headers.get('location') || '').includes('error=google_denied'), cb.headers.get('location'));
  assert(!setCookie(cb, 'vt_session'), 'no session on cancel');
});

const previousFetch = globalThis.fetch;
globalThis.fetch = async () => jsonResponse({ error: 'invalid_grant' }, 400);
try {
  const started = await startSignIn(APEX, googleEnv);
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/bad&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert((cb.headers.get('location') || '').includes('error=google_failed'), cb.headers.get('location'));
  assert(!setCookie(cb, 'vt_session'), 'no session when Google rejects the code');
} finally {
  globalThis.fetch = previousFetch;
}

const previewOff = await onPreview({
  request: new Request(`${APEX}/api/auth/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'preview@viral-templates.local', name: 'Preview' }),
  }),
  env: googleEnv,
});
assert(previewOff.status === 403, `preview should be off when Google is set, got ${previewOff.status}`);

const previewOn = await onPreview({
  request: new Request('http://localhost:8788/api/auth/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'preview@viral-templates.local', name: 'Preview', next: 'https://evil.example' }),
  }),
  env: {},
});
assert(previewOn.status === 200, `preview login ${previewOn.status}`);
const previewBody = await previewOn.json();
assert(previewBody.user.providers[0] === 'preview', 'preview provider');
assert(previewBody.next === '/account/', previewBody.next);

assert(safeNext('https://evil.example', '/account/') === '/account/', 'client rejects absolute next');
assert(safeNext('//evil.example', '/account/') === '/account/', 'client rejects protocol-relative');
assert(safeNext('/account/</script>', '/account/') === '/account/', 'client rejects markup in next');
assert(safeNext('/zh/t/bby-wow/create/?x=1#photo', '/account/') === '/zh/t/bby-wow/create/?x=1#photo', 'client keeps relative next');
assert(safeSignInPath('/zh/t/bby-wow/account/sign-in') === '/zh/t/bby-wow/account/sign-in/', 'client sign-in path');
assert(safeSignInPath('/create/') === '/account/sign-in/', 'client sign-in fallback');
assert(isSignInPath('/t/bby-wow/account/sign-in/') === true, 'brand sign-in path');
assert(isSignInPath('/account/') === false, 'account overview is not sign-in');
assert(
  googleStartUrl({ next: '/create/', from: '/t/bby-wow/account/sign-in/', popup: true }) ===
    '/api/auth/google/start?next=%2Fcreate%2F&from=%2Ft%2Fbby-wow%2Faccount%2Fsign-in%2F&popup=1',
  'popup start url',
);
assert(!googleStartUrl({ next: '/account/', from: '/account/sign-in/' }).includes('popup'), 'same-tab start omits popup');
const features = popupFeatures({ x: 100, y: 40, outerWidth: 1200, outerHeight: 800 });
assert(features === 'popup=yes,width=480,height=640,left=460,top=120', features);
assert(!features.includes('noopener'), 'popup keeps opener');
assert(
  acceptAuthMessage({ origin: 'https://evil.example', data: { type: 'vt-auth', ok: true, next: '/account/' } }, APEX) ===
    null,
  'reject other origins',
);
assert(acceptAuthMessage({ origin: APEX, data: { type: 'other', ok: true } }, APEX) === null, 'reject other types');
const accepted = acceptAuthMessage(
  { origin: APEX, data: { type: 'vt-auth', ok: true, next: 'https://evil.example' } },
  APEX,
);
assert(accepted.ok === true && accepted.next === '/account/', 'message next is sanitized');

const popupStart = await startSignIn(
  APEX,
  googleEnv,
  'next=/create/%3C/script%3E&from=/account/sign-in/&popup=1',
);
assert(popupStart.res.status === 302, 'popup start still redirects to Google');
assert(popupStart.auth.origin === 'https://accounts.google.com', 'popup uses Google');
assert(
  popupStart.auth.searchParams.get('redirect_uri') === `${APEX}/api/auth/google/callback`,
  'popup does not invent a redirect URI',
);
assert(!popupStart.location.includes('popup'), 'popup flag stays out of the authorize URL');
const savedPopup = await readOauthState(
  new Request(`${APEX}/api/auth/session`, { headers: { cookie: popupStart.cookie } }),
  googleEnv,
);
assert(savedPopup.popup === true, 'popup flag stored');
assert(savedPopup.next === '/account/', 'unsafe popup next dropped');

const notPopup = await startSignIn(APEX, googleEnv, 'next=/account/&from=/account/sign-in/&popup=yes');
const savedNotPopup = await readOauthState(
  new Request(`${APEX}/api/auth/session`, { headers: { cookie: notPopup.cookie } }),
  googleEnv,
);
assert(savedNotPopup.popup === false, 'only popup=1 enables the handshake');

const popupFail = await onStart({
  request: new Request(`${APEX}/api/auth/google/start?popup=1&next=/create/`),
  env: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
});
assert(popupFail.status === 200, 'popup start failure is a handshake page');
assert(!popupFail.headers.get('location'), 'popup failure does not redirect');
const popupFailHtml = await popupFail.text();
assert(popupFailHtml.includes('"error":"google_unavailable"'), popupFailHtml);
assert(popupFailHtml.includes("postMessage(payload, target)"), 'posts to the page origin');
assert(!popupFailHtml.includes("postMessage(payload, '*')"), 'does not use a wildcard target');
assert(!popupFailHtml.includes(CLIENT_SECRET), 'secret stays out of the handshake');

await withGoogle(profile(), async () => {
  const started = await startSignIn(
    APEX,
    googleEnv,
    'next=/account/?a=1%26b=2&from=/zh/account/sign-in/&popup=1',
  );
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/popup&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(cb.status === 200, `popup callback ${cb.status}`);
  assert(!cb.headers.get('location'), 'popup callback does not navigate');
  assert(cb.headers.get('content-type').includes('text/html'), cb.headers.get('content-type'));
  const sessionLine = setCookie(cb, 'vt_session');
  assert(sessionLine.includes('HttpOnly') && sessionLine.includes('Secure'), 'popup sets the session cookie');
  assert(setCookie(cb, 'vt_oauth').includes('Max-Age=0'), 'popup clears the state cookie');
  const html = await cb.text();
  assert(html.includes('BroadcastChannel(\'vt-auth\')'), 'broadcast channel');
  assert(html.includes('"type":"vt-auth"'), 'message type');
  assert(html.includes('"ok":true'), 'success flag');
  assert(html.includes('href="/account/?a=1&amp;b=2"'), html);
  assert(!html.includes(CLIENT_SECRET), 'handshake has no client secret');
  assert(!html.includes('accounts.google.com'), 'handshake is not another authorize redirect');
  const user = await readSession(
    new Request(`${APEX}/api/auth/session`, { headers: { cookie: cookieHeader(cb) } }),
    googleEnv,
  );
  assert(user.user_id === sessionUser.user_id, 'popup session is the same user');
});
assert(sqlite.prepare('SELECT balance FROM credit_accounts').get().balance === 7, 'popup login did not change credits');

await withGoogle(profile(), async (calls) => {
  const started = await startSignIn(APEX, googleEnv, 'next=/account/&from=/account/sign-in/&popup=1');
  calls.length = 0;
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: googleEnv,
  });
  assert(calls.length === 0, 'popup cancel did not call Google');
  assert(cb.status === 200, 'popup cancel is HTML');
  assert(!cb.headers.get('location'), 'popup cancel does not open the sign-in route');
  assert(!setCookie(cb, 'vt_session'), 'popup cancel does not set a session');
  const html = await cb.text();
  assert(html.includes('"error":"google_denied"'), html);
  assert(html.includes('"ok":false'), html);
});

const injected = oauthResultDocument({
  ok: true,
  next: '/account/</script><script>alert(1)</script>',
});
const injectedHtml = await injected.text();
assert(!injectedHtml.includes('alert(1)'), 'callback HTML drops unsafe next');
assert(injectedHtml.includes('href="/account/"'), injectedHtml);

console.log('google auth tests passed');
