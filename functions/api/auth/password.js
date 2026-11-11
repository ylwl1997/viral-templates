/**
 * POST /api/auth/password — owner test sign-in so checkout can be tried without Google.
 * Not public registration. Off unless passwordAuthConfigured is true.
 * Failures share one invalid-credentials response. The password is never logged.
 */
import { ensureUser, findUserByEmail, getDb } from '../../_lib/account-db.js';
import {
  authEmailAllowed,
  authStatus,
  issueSessionCookie,
  jsonNoStore,
  normalizeAuthEmail,
  passwordAuthConfigured,
  safeNext,
  stableUserId,
  timingSafeEqualString,
} from '../../_lib/session.js';

const INVALID = { ok: false, error: 'invalid_credentials', message: 'Invalid email or password.' };
const UNAVAILABLE = {
  ok: false,
  error: 'password_unavailable',
  message: 'Password sign-in is not available on this host.',
};

function invalid() {
  return jsonNoStore(INVALID, 401);
}

function unavailable() {
  return jsonNoStore(UNAVAILABLE, 403);
}

function displayName(email, existingName) {
  const name = typeof existingName === 'string' ? existingName.trim() : '';
  if (name) return name.slice(0, 80);
  return (email.split('@')[0] || 'Member').slice(0, 80);
}

export async function onRequestPost(context) {
  const host = new URL(context.request.url).hostname;
  if (!passwordAuthConfigured(context.env, host)) return unavailable();

  let body = null;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }

  const expectedEmail = normalizeAuthEmail(context.env?.AUTH_TEST_EMAIL);
  const expectedPassword = typeof context.env?.AUTH_TEST_PASSWORD === 'string' ? context.env.AUTH_TEST_PASSWORD : '';
  const postedEmail = body && typeof body.email === 'string' ? normalizeAuthEmail(body.email) : '';
  const postedPassword = body && typeof body.password === 'string' ? body.password : '';
  const passwordCandidate =
    postedPassword.length > 0 && postedPassword.length <= 1024 ? postedPassword : '\0';
  const [passwordMatch, emailMatch] = await Promise.all([
    timingSafeEqualString(passwordCandidate, expectedPassword),
    timingSafeEqualString(postedEmail, expectedEmail),
  ]);
  const passwordOk = postedPassword.length > 0 && postedPassword.length <= 1024 && passwordMatch;
  const emailOk = postedEmail.length > 0 && emailMatch;
  const allowed = authEmailAllowed(context.env, postedEmail);
  if (!passwordOk || !emailOk || !allowed) return invalid();

  const email = postedEmail;
  let user = {
    user_id: await stableUserId('password', email),
    email,
    name: displayName(email),
    avatar_url: '',
    providers: ['password'],
  };
  const db = getDb(context.env);
  if (db) {
    try {
      const existing = await findUserByEmail(db, email);
      if (existing) {
        user = {
          user_id: existing.user_id,
          email,
          name: displayName(email, existing.name),
          avatar_url: '',
          providers: ['password'],
        };
      }
      await ensureUser(db, user);
    } catch {
      return jsonNoStore({ ok: false, error: 'auth_failed' }, 500);
    }
  }

  const cookie = await issueSessionCookie(context.request, context.env, user);
  if (!cookie) return unavailable();
  const next = safeNext(body && typeof body.next === 'string' ? body.next : '', '/account/');
  return jsonNoStore(
    {
      ok: true,
      user,
      next,
      auth: authStatus(context.request, context.env),
    },
    200,
    [cookie],
  );
}
