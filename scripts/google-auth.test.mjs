import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestGet as onCallback } from '../functions/api/auth/google/callback.js';
import { onRequestGet as onStart } from '../functions/api/auth/google/start.js';
import { onRequestPost as onPassword } from '../functions/api/auth/password.js';
import { onRequestPost as onPreview } from '../functions/api/auth/preview.js';
import { onRequestGet as onSession } from '../functions/api/auth/session.js';
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
  allowedAuthEmails,
  authEmailAllowed,
  authStatus,
  googleConfigured,
  passwordAuthConfigured,
  PREVIEW_AUTH_SECRET,
  previewLoginAllowed,
  readSession,
  stableUserId,
  timingSafeEqualString,
} from '../functions/_lib/session.js';

const AUTH_SECRET = 'test-auth-secret-value';
const CLIENT_ID = '123.apps.googleusercontent.com';
const CLIENT_SECRET = 'google-client-secret-value';
const APEX = 'https://viral-templates.pages.dev';
const BRAND = 'https://bby-wow.example.com';
const SUB = '109876543210987654321';
const OWNER_EMAIL = '1316805445@qq.com';

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
  AUTH_ALLOWED_EMAILS: ' Ada@Example.com ',
  DB: db,
};
const closedEnv = {
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
assert(previewLoginAllowed({}, '127.0.0.1') === true, 'ipv4 local preview');
assert(previewLoginAllowed({}, '::1') === true, 'ipv6 local preview');
assert(previewLoginAllowed({}, 'viral-templates.pages.dev') === false, 'pages.dev preview is closed');
assert(previewLoginAllowed({}, 'abc.viral-templates.pages.dev') === false, 'branch preview host is closed');
assert(previewLoginAllowed({}, 'example.com') === false, 'custom host without google');
assert(
  previewLoginAllowed({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET }, 'localhost') === false,
  'google hides preview',
);
assert(
  previewLoginAllowed(
    { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, AUTH_PREVIEW_LOGIN: '1' },
    'example.com',
  ) === false,
  'preview override does not open public hosts',
);
assert(
  previewLoginAllowed(
    { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, AUTH_PREVIEW_LOGIN: '1' },
    'viral-templates.pages.dev',
  ) === false,
  'preview override does not open pages.dev',
);
assert(
  previewLoginAllowed(
    { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, AUTH_PREVIEW_LOGIN: '1' },
    'localhost',
  ) === true,
  'preview override is localhost only',
);
assert(previewLoginAllowed({ AUTH_PREVIEW_LOGIN: '0' }, 'localhost') === false, 'preview force off');
assert(previewLoginAllowed({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: '  ' }, 'localhost') === true, 'blank is unset');
assert(JSON.stringify(allowedAuthEmails({})) === JSON.stringify([OWNER_EMAIL]), 'unset allowlist is the owner fallback');
assert(JSON.stringify(allowedAuthEmails({ AUTH_ALLOWED_EMAILS: '' })) === JSON.stringify([OWNER_EMAIL]), 'empty allowlist');
assert(JSON.stringify(allowedAuthEmails({ AUTH_ALLOWED_EMAILS: '  ,  ' })) === JSON.stringify([OWNER_EMAIL]), 'blank allowlist');
assert(
  JSON.stringify(allowedAuthEmails({ AUTH_ALLOWED_EMAILS: ' A@B.co , C@D.co ' })) === JSON.stringify(['a@b.co', 'c@d.co']),
  'allowlist trims and lowercases',
);
assert(authEmailAllowed({ AUTH_ALLOWED_EMAILS: 'A@B.co' }, 'a@b.co') === true, 'listed email');
assert(authEmailAllowed({ AUTH_ALLOWED_EMAILS: 'A@B.co' }, 'other@b.co') === false, 'unlisted email');
assert(authEmailAllowed({}, '1316805445@QQ.com') === true, 'fallback ignores case');
assert(authEmailAllowed({}, 'ada@example.com') === false, 'fallback denies everyone else');
assert(authEmailAllowed({}, '') === false, 'empty email is denied');

const status = authStatus(new Request(`${APEX}/api/auth/session`), googleEnv);
assert(
  status.google === true && status.auth_secret === true && status.preview === false && status.password === false,
  'auth status',
);
const fallback = authStatus(new Request(`${APEX}/api/auth/session`), {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
});
assert(
  fallback.google === true && fallback.auth_secret === false && fallback.preview === false && fallback.password === false,
  'no public secret for google',
);

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
  env: { AUTH_ALLOWED_EMAILS: 'preview@viral-templates.local' },
});
assert(previewOn.status === 200, `preview login ${previewOn.status}`);
const previewBody = await previewOn.json();
assert(previewBody.user.providers[0] === 'preview', 'preview provider');
assert(previewBody.next === '/account/', previewBody.next);
assert(setCookie(previewOn, 'vt_session').includes('HttpOnly'), 'preview session cookie');

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
const deniedMsg = acceptAuthMessage(
  { origin: APEX, data: { type: 'vt-auth', ok: false, error: 'email_not_allowed', next: '/account/' } },
  APEX,
);
assert(deniedMsg.ok === false && deniedMsg.error === 'email_not_allowed', 'popup error code survives');

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

function userCount() {
  return sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function throwingDb() {
  return {
    prepare() {
      throw new Error('ensureUser must not run');
    },
  };
}

await withGoogle(profile({ sub: 'stranger-sub', email: 'Stranger@Example.com', name: 'Stranger' }), async () => {
  const before = userCount();
  const started = await startSignIn(APEX, closedEnv);
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/stranger&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: { ...closedEnv, DB: throwingDb() },
  });
  assert((cb.headers.get('location') || '').includes('error=email_not_allowed'), cb.headers.get('location'));
  assert(!(cb.headers.get('location') || '').includes('stranger@example.com'), 'deny URL does not echo the email');
  assert(!setCookie(cb, 'vt_session'), 'denied Google login sets no session');
  assert(setCookie(cb, 'vt_oauth').includes('Max-Age=0'), 'denied login still clears oauth state');
  assert(userCount() === before, 'denied login did not insert a user');
  const ada = sqlite.prepare('SELECT name FROM users WHERE email = ?').get('ada@example.com');
  assert(ada.name === 'Ada Lovelace', `allowlist miss must not rewrite an existing user (${ada && ada.name})`);
});

await withGoogle(profile({ email_verified: false, email: OWNER_EMAIL }), async () => {
  const started = await startSignIn(APEX, closedEnv);
  const state = started.auth.searchParams.get('state');
  const before = userCount();
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/unverified&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: { ...closedEnv, DB: throwingDb() },
  });
  assert((cb.headers.get('location') || '').includes('error=email_not_allowed'), 'unverified email is not the allowlisted address');
  assert(!setCookie(cb, 'vt_session'), 'unverified email sets no session');
  assert(userCount() === before, 'unverified email did not insert a user');
});

await withGoogle(profile({ sub: 'owner-sub', email: '1316805445@QQ.com', name: 'Owner' }), async () => {
  const before = userCount();
  const started = await startSignIn(APEX, closedEnv, 'next=/account/&from=/account/sign-in/');
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/owner&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: { ...closedEnv, AUTH_ALLOWED_EMAILS: '' },
  });
  assert(cb.status === 302, `owner fallback callback ${cb.status}`);
  assert(cb.headers.get('location') === '/account/', cb.headers.get('location'));
  const sessionLine = setCookie(cb, 'vt_session');
  assert(sessionLine.includes('HttpOnly'), 'owner fallback sets a session');
  const user = await readSession(
    new Request(`${APEX}/api/auth/session`, { headers: { cookie: cookieHeader(cb) } }),
    closedEnv,
  );
  assert(user.email === OWNER_EMAIL, user.email);
  assert(userCount() === before + 1, 'owner fallback created one user');
  const row = sqlite.prepare('SELECT email, name FROM users WHERE email = ?').get(OWNER_EMAIL);
  assert(row.name === 'Owner' && row.email === OWNER_EMAIL, 'owner row stored lowercase');
});

await withGoogle(profile({ sub: 'other-sub', email: 'other@example.com', name: 'Other' }), async () => {
  const before = userCount();
  const started = await startSignIn(APEX, googleEnv, 'next=/account/&from=/account/sign-in/&popup=1');
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/popup-deny&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: { ...googleEnv, AUTH_ALLOWED_EMAILS: ` ${OWNER_EMAIL.toUpperCase()} `, DB: throwingDb() },
  });
  assert(cb.status === 200, 'popup deny is HTML');
  assert(!setCookie(cb, 'vt_session'), 'popup deny sets no session');
  const html = await cb.text();
  assert(html.includes('"error":"email_not_allowed"'), html);
  assert(html.includes('"ok":false'), html);
  assert(!html.includes('other@example.com'), 'popup deny does not echo the email');
  assert(userCount() === before, 'popup deny did not insert a user');
});

await withGoogle(profile({ name: 'Should Not Stick' }), async () => {
  const started = await startSignIn(APEX, googleEnv);
  const state = started.auth.searchParams.get('state');
  const cb = await onCallback({
    request: new Request(`${APEX}/api/auth/google/callback?code=4/ada-denied&state=${encodeURIComponent(state)}`, {
      headers: { cookie: started.cookie },
    }),
    env: { ...googleEnv, AUTH_ALLOWED_EMAILS: OWNER_EMAIL },
  });
  assert((cb.headers.get('location') || '').includes('error=email_not_allowed'), 'listed owner does not admit ada');
  assert(!setCookie(cb, 'vt_session'), 'ada gets no session when unlisted');
  const ada = sqlite.prepare('SELECT name FROM users WHERE email = ?').get('ada@example.com');
  assert(ada.name === 'Ada Lovelace', `ensureUser did not run (${ada && ada.name})`);
});

const publicPreview = await onPreview({
  request: new Request(`${APEX}/api/auth/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, name: 'Owner' }),
  }),
  env: { AUTH_SECRET, AUTH_PREVIEW_LOGIN: '1', AUTH_ALLOWED_EMAILS: OWNER_EMAIL },
});
assert(publicPreview.status === 403, `public preview ${publicPreview.status}`);
const publicPreviewBody = await publicPreview.json();
assert(publicPreviewBody.error === 'preview_disabled', publicPreviewBody.error);
assert(!setCookie(publicPreview, 'vt_session'), 'public preview sets no session');
assert(publicPreview.headers.getSetCookie().length === 0, 'public preview sets no cookies');

const localStranger = await onPreview({
  request: new Request('http://localhost:8788/api/auth/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'stranger@example.com', name: 'Stranger' }),
  }),
  env: {},
});
assert(localStranger.status === 403, `local stranger preview ${localStranger.status}`);
const localStrangerBody = await localStranger.json();
assert(localStrangerBody.error === 'email_not_allowed', localStrangerBody.error);
assert(!setCookie(localStranger, 'vt_session'), 'unlisted preview sets no session');

const localOwner = await onPreview({
  request: new Request('http://127.0.0.1:8788/api/auth/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: '1316805445@QQ.com', name: 'Owner' }),
  }),
  env: { AUTH_ALLOWED_EMAILS: ' , ' },
});
assert(localOwner.status === 200, `local owner preview ${localOwner.status}`);
const localOwnerBody = await localOwner.json();
assert(localOwnerBody.user.email === OWNER_EMAIL, localOwnerBody.user.email);
assert(setCookie(localOwner, 'vt_session').includes('HttpOnly'), 'allowlisted localhost preview sets a session');

const TEST_PASSWORD = 'test-password-value';
const FRESH_EMAIL = 'fresh-owner@example.com';
const OTHER_EMAIL = 'other-owner@example.com';
const UNLISTED_EMAIL = 'not-listed@example.com';
const PASSWORD_ALLOWLIST = 'ada@example.com, fresh-owner@example.com, other-owner@example.com';

function passwordEnv(overrides = {}) {
  return {
    AUTH_SECRET,
    AUTH_TEST_EMAIL: 'ada@example.com',
    AUTH_TEST_PASSWORD: TEST_PASSWORD,
    AUTH_ALLOWED_EMAILS: PASSWORD_ALLOWLIST,
    DB: db,
    ...overrides,
  };
}

async function postPassword(origin, env, body) {
  const logs = [];
  const previous = {
    log: console.log,
    error: console.error,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
  };
  const capture = (...args) => {
    logs.push(args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' '));
  };
  console.log = capture;
  console.error = capture;
  console.info = capture;
  console.debug = capture;
  console.warn = capture;
  try {
    const res = await onPassword({
      request: new Request(`${origin}/api/auth/password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
      env,
    });
    return { res, logs };
  } finally {
    console.log = previous.log;
    console.error = previous.error;
    console.info = previous.info;
    console.debug = previous.debug;
    console.warn = previous.warn;
  }
}

function userByEmail(email) {
  return sqlite.prepare('SELECT user_id, email, name FROM users WHERE lower(email) = ?').get(email) ?? null;
}

function creditBalance(userId) {
  const row = sqlite.prepare('SELECT balance FROM credit_accounts WHERE user_id = ?').get(userId);
  return row ? row.balance : null;
}

assert((await timingSafeEqualString(TEST_PASSWORD, TEST_PASSWORD)) === true, 'equal secrets match');
assert((await timingSafeEqualString(TEST_PASSWORD, `${TEST_PASSWORD} `)) === false, 'trailing space differs');
assert((await timingSafeEqualString('a', 'ab')) === false, 'different lengths differ');
assert((await timingSafeEqualString('', TEST_PASSWORD)) === false, 'empty secret differs');

assert(
  passwordAuthConfigured(
    { AUTH_SECRET, AUTH_TEST_EMAIL: ' A@B.co ', AUTH_TEST_PASSWORD: TEST_PASSWORD },
    'viral-templates.pages.dev',
  ) === true,
  'real secret enables password on pages.dev',
);
assert(
  passwordAuthConfigured(
    { AUTH_TEST_EMAIL: 'a@b.co', AUTH_TEST_PASSWORD: TEST_PASSWORD, AUTH_PREVIEW_LOGIN: '1' },
    'viral-templates.pages.dev',
  ) === false,
  'preview fallback does not enable password',
);
assert(
  passwordAuthConfigured({ AUTH_TEST_EMAIL: 'a@b.co', AUTH_TEST_PASSWORD: TEST_PASSWORD }, 'localhost') === false,
  'localhost fallback does not enable password',
);
assert(
  passwordAuthConfigured({ AUTH_SECRET, AUTH_TEST_PASSWORD: TEST_PASSWORD }, 'example.com') === false,
  'missing test email',
);
assert(
  passwordAuthConfigured({ AUTH_SECRET, AUTH_TEST_EMAIL: '   ', AUTH_TEST_PASSWORD: TEST_PASSWORD }, 'example.com') ===
    false,
  'blank test email',
);
assert(
  passwordAuthConfigured({ AUTH_SECRET, AUTH_TEST_EMAIL: 'not-an-email', AUTH_TEST_PASSWORD: TEST_PASSWORD }, 'example.com') ===
    false,
  'test email must be an email',
);
assert(
  passwordAuthConfigured({ AUTH_SECRET, AUTH_TEST_EMAIL: 'a@b.co' }, 'example.com') === false,
  'missing test password',
);
assert(
  passwordAuthConfigured({ AUTH_SECRET, AUTH_TEST_EMAIL: 'a@b.co', AUTH_TEST_PASSWORD: '   ' }, 'example.com') === false,
  'whitespace test password',
);
assert(
  passwordAuthConfigured(
    { AUTH_SECRET: 'short-secret', AUTH_TEST_EMAIL: 'a@b.co', AUTH_TEST_PASSWORD: TEST_PASSWORD },
    'example.com',
  ) === false,
  'short secret is not real',
);
assert(
  passwordAuthConfigured(
    { AUTH_SECRET: PREVIEW_AUTH_SECRET, AUTH_TEST_EMAIL: 'a@b.co', AUTH_TEST_PASSWORD: TEST_PASSWORD },
    'viral-templates.pages.dev',
  ) === false,
  'public preview string is not a real secret',
);

const statusEmail = 'owner-test@example.com';
const configuredStatus = passwordEnv({ AUTH_TEST_EMAIL: statusEmail });
const sessionRes = await onSession({
  request: new Request(`${APEX}/api/auth/session`),
  env: configuredStatus,
});
const sessionBody = await sessionRes.json();
assert(sessionBody.password === true && sessionBody.user === null, 'session reports password without a user');
assert(!JSON.stringify(sessionBody).includes(statusEmail), 'session status does not expose the test email');
assert(sessionBody.test_email === undefined && sessionBody.AUTH_TEST_EMAIL === undefined, 'no email field on status');
const offStatus = authStatus(new Request(`${APEX}/api/auth/session`), { AUTH_SECRET });
assert(offStatus.password === false, 'password flag is false when the test secrets are missing');

const missingSecretCases = [
  ['no AUTH_SECRET on pages.dev', APEX, passwordEnv({ AUTH_SECRET: undefined })],
  ['no AUTH_SECRET on localhost', 'http://localhost:8788', passwordEnv({ AUTH_SECRET: undefined })],
  ['preview string as AUTH_SECRET', APEX, passwordEnv({ AUTH_SECRET: PREVIEW_AUTH_SECRET })],
  ['missing email', APEX, passwordEnv({ AUTH_TEST_EMAIL: undefined })],
  ['blank email', APEX, passwordEnv({ AUTH_TEST_EMAIL: '  ' })],
  ['missing password', APEX, passwordEnv({ AUTH_TEST_PASSWORD: undefined })],
  ['blank password', APEX, passwordEnv({ AUTH_TEST_PASSWORD: ' \n ' })],
  ['preview flag cannot enable it', 'https://abc.viral-templates.pages.dev', passwordEnv({ AUTH_SECRET: undefined, AUTH_PREVIEW_LOGIN: '1' })],
];
const unavailableShapes = [];
for (const [label, origin, env] of missingSecretCases) {
  const { res, logs } = await postPassword(origin, env, { email: 'ada@example.com', password: TEST_PASSWORD });
  const payload = await res.json();
  assert(res.status === 403, `${label} status ${res.status}`);
  assert(payload.error === 'password_unavailable', label);
  assert(!JSON.stringify(payload).includes(TEST_PASSWORD), `${label} leaked the password`);
  assert(!logs.join('\n').includes(TEST_PASSWORD), `${label} logged the password`);
  assert(res.headers.getSetCookie().length === 0, `${label} set a cookie`);
  unavailableShapes.push(JSON.stringify(payload));
}
assert(new Set(unavailableShapes).size === 1, 'missing secrets share one response');

const branchPreview = await onPreview({
  request: new Request('https://abc.viral-templates.pages.dev/api/auth/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', name: 'Ada' }),
  }),
  env: { ...passwordEnv(), AUTH_PREVIEW_LOGIN: '1', GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
});
assert(branchPreview.status === 403, `pages.dev preview ${branchPreview.status}`);
const branchPreviewBody = await branchPreview.json();
assert(branchPreviewBody.error === 'preview_disabled', branchPreviewBody.error);
assert(!setCookie(branchPreview, 'vt_session'), 'password secrets do not open preview on pages.dev');
assert(
  previewLoginAllowed(
    { ...passwordEnv(), AUTH_PREVIEW_LOGIN: '1' },
    'abc.viral-templates.pages.dev',
  ) === false,
  'previewLoginAllowed stays closed on pages.dev',
);

const adaBefore = userByEmail('ada@example.com');
const adaCredits = creditBalance(adaBefore.user_id);
const usersBeforePassword = userCount();

async function assertInvalid(label, env, body) {
  const { res, logs } = await postPassword(APEX, env, body);
  const payload = await res.json();
  const postedPassword = body && typeof body.password === 'string' ? body.password : '';
  assert(res.status === 401, `${label} status ${res.status}`);
  assert(payload.ok === false && payload.error === 'invalid_credentials', label);
  assert(payload.message === 'Invalid email or password.', label);
  assert(!JSON.stringify(payload).includes(postedPassword), `${label} leaked the password`);
  assert(!JSON.stringify(payload).includes('AUTH_TEST_'), `${label} named a secret`);
  assert(res.headers.getSetCookie().length === 0, `${label} set a cookie`);
  assert(!logs.join('\n').includes(postedPassword), `${label} logged the password`);
  return JSON.stringify(payload);
}

const wrongPassword = await assertInvalid('wrong password', passwordEnv(), {
  email: 'Ada@Example.com',
  password: 'wrong-password-value',
});
const otherEmail = await assertInvalid('email is not AUTH_TEST_EMAIL', passwordEnv(), {
  email: OTHER_EMAIL,
  password: TEST_PASSWORD,
});
const unlisted = await assertInvalid(
  'email is not allowlisted',
  passwordEnv({ AUTH_TEST_EMAIL: UNLISTED_EMAIL, AUTH_ALLOWED_EMAILS: 'ada@example.com' }),
  { email: 'Not-Listed@Example.com', password: TEST_PASSWORD },
);
const spacedPassword = await assertInvalid('password is exact', passwordEnv(), {
  email: 'ada@example.com',
  password: `${TEST_PASSWORD} `,
});
const badJson = await onPassword({
  request: new Request(`${APEX}/api/auth/password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }),
  env: passwordEnv(),
});
const badJsonBody = await badJson.json();
assert(badJson.status === 401 && badJsonBody.error === 'invalid_credentials', 'malformed JSON is invalid credentials');
assert(!setCookie(badJson, 'vt_session'), 'malformed JSON sets no session');
assert(wrongPassword === otherEmail && otherEmail === unlisted && unlisted === spacedPassword, 'credential failures match');
assert(wrongPassword === JSON.stringify(badJsonBody), 'malformed JSON matches the credential error');
assert(userCount() === usersBeforePassword, 'failed password logins did not create users');
assert(userByEmail(OTHER_EMAIL) === null, 'a different allowlisted email was not signed in');
assert(userByEmail(UNLISTED_EMAIL) === null, 'an unlisted test email was not created');
const adaAfterFail = userByEmail('ada@example.com');
assert(adaAfterFail.user_id === adaBefore.user_id && adaAfterFail.name === adaBefore.name, 'failed login left the user row');
assert(creditBalance(adaBefore.user_id) === adaCredits, 'failed login left credits');

const created = await postPassword(APEX, passwordEnv({ AUTH_TEST_EMAIL: ` ${FRESH_EMAIL.toUpperCase()} ` }), {
  email: ` ${FRESH_EMAIL.toUpperCase()} `,
  password: TEST_PASSWORD,
  next: 'https://evil.example/phish',
});
assert(created.res.status === 200, `password success ${created.res.status}`);
const createdBody = await created.res.json();
const freshId = await stableUserId('password', FRESH_EMAIL);
assert(createdBody.ok === true, 'password success');
assert(createdBody.user.email === FRESH_EMAIL, createdBody.user.email);
assert(createdBody.user.user_id === freshId, 'new password user id');
assert(JSON.stringify(createdBody.user.providers) === '["password"]', 'password provider');
assert(createdBody.next === '/account/', createdBody.next);
assert(createdBody.auth.password === true && createdBody.auth.google === false, 'success status keeps the flag');
assert(!JSON.stringify(createdBody.auth).includes(FRESH_EMAIL), 'auth status still hides the test email');
assert(!JSON.stringify(createdBody).includes(TEST_PASSWORD), 'success body has no password');
assert(!created.logs.join('\n').includes(TEST_PASSWORD), 'success does not log the password');
const createdCookie = setCookie(created.res, 'vt_session');
assert(createdCookie.includes('HttpOnly') && createdCookie.includes('Secure'), createdCookie);
const createdSession = await readSession(
  new Request(`${APEX}/api/auth/session`, { headers: { cookie: cookieHeader(created.res) } }),
  passwordEnv(),
);
assert(createdSession.user_id === freshId && createdSession.email === FRESH_EMAIL, 'session cookie is the new user');
const freshRow = userByEmail(FRESH_EMAIL);
assert(freshRow.user_id === freshId, 'fresh row stored');
assert(creditBalance(freshId) === 0, `fresh balance ${creditBalance(freshId)}`);
assert(userCount() === usersBeforePassword + 1, 'one new user');

const secondPassword = await postPassword('http://localhost:8788', passwordEnv({ AUTH_TEST_EMAIL: FRESH_EMAIL }), {
  email: FRESH_EMAIL,
  password: TEST_PASSWORD,
});
assert(secondPassword.res.status === 200, `localhost password ${secondPassword.res.status}`);
const secondPasswordBody = await secondPassword.res.json();
assert(secondPasswordBody.user.user_id === freshId, 'second password login reuses the row');
assert(userCount() === usersBeforePassword + 1, 'second login did not add a user');
assert(creditBalance(freshId) === 0, 'second login did not grant credits');

const jobNow = new Date().toISOString();
sqlite
  .prepare(
    `INSERT INTO jobs (id, user_id, template_slug, template_name, template_name_zh, status, note_en, note_zh, created_at, updated_at)
     VALUES ('job_password_reuse', ?, 'bby-wow', 'Bby Wow', '名字', 'queued', '', '', ?, ?)`,
  )
  .run(adaBefore.user_id, jobNow, jobNow);
const reuse = await postPassword(APEX, passwordEnv({ AUTH_TEST_EMAIL: 'Ada@Example.com' }), {
  email: 'ADA@example.com',
  password: TEST_PASSWORD,
  next: '/account/credits/',
});
assert(reuse.res.status === 200, `reuse status ${reuse.res.status}`);
const reuseBody = await reuse.res.json();
const passwordOnlyId = await stableUserId('password', 'ada@example.com');
assert(reuseBody.user.user_id === adaBefore.user_id, 'password login uses the Google user id');
assert(reuseBody.user.user_id !== passwordOnlyId, 'password login does not mint a second id');
assert(reuseBody.user.email === 'ada@example.com', reuseBody.user.email);
assert(reuseBody.user.name === adaBefore.name, 'reuse keeps the existing name');
assert(reuseBody.next === '/account/credits/', reuseBody.next);
assert(setCookie(reuse.res, 'vt_session').includes('HttpOnly'), 'reuse sets a session');
const reuseSession = await readSession(
  new Request(`${APEX}/api/auth/session`, { headers: { cookie: cookieHeader(reuse.res) } }),
  passwordEnv(),
);
assert(reuseSession.user_id === adaBefore.user_id, 'reuse cookie is the Google user');
assert(userByEmail('ada@example.com').user_id === adaBefore.user_id, 'still one ada row');
assert(
  sqlite.prepare(`SELECT COUNT(*) AS n FROM users WHERE lower(email) = 'ada@example.com'`).get().n === 1,
  'ada email was not duplicated',
);
assert(creditBalance(adaBefore.user_id) === adaCredits, 'reuse did not change credits');
const reusedJob = sqlite.prepare('SELECT user_id FROM jobs WHERE id = ?').get('job_password_reuse');
assert(reusedJob.user_id === adaBefore.user_id, 'job stays on the Google user');
assert(!reuse.logs.join('\n').includes(TEST_PASSWORD), 'reuse does not log the password');

const panel = readFileSync(new URL('../src/components/account/SignInPanel.astro', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../public/scripts/login-modal.js', import.meta.url), 'utf8');
assert(panel.includes('id="password-wrap" hidden'), 'password fields start hidden');
assert(panel.includes('type="password"'), 'sign-in page has a password field');
assert(modal.includes("google: 'Continue with Google'"), 'dialog keeps Continue with Google');
assert(modal.includes('passwordWrap.hidden = !passwordOk'), 'dialog shows password fields only when configured');
assert(!panel.includes('AUTH_TEST_') && !modal.includes('AUTH_TEST_'), 'ui does not name the test secrets');
assert(!panel.includes(TEST_PASSWORD) && !modal.includes(TEST_PASSWORD), 'ui does not embed the test password');

console.log('google auth tests passed');
