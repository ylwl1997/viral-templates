import { ensureUser, getDb } from '../../../_lib/account-db.js';
import {
  cleanAuthCode,
  clearOauthStateCookie,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  googleClient,
  googleRedirectUri,
  oauthOrigin,
  oauthResultDocument,
  oauthStateMatches,
  readOauthState,
  redirectNoStore,
  sessionUserFromGoogle,
  signInErrorLocation,
} from '../../../_lib/google-oauth.js';
import { authEmailAllowed, issueSessionCookie } from '../../../_lib/session.js';

function fail(request, saved, error, next) {
  const destNext = next || (saved && saved.next) || '';
  const cookies = [clearOauthStateCookie(request)];
  if (saved && saved.popup) {
    return oauthResultDocument({ ok: false, error, next: destNext, setCookies: cookies });
  }
  const from = saved && saved.from;
  return redirectNoStore(signInErrorLocation(from, error, destNext), cookies);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const saved = await readOauthState(request, env);
  const googleError = url.searchParams.get('error') || '';
  if (googleError) {
    const code = googleError === 'access_denied' ? 'google_denied' : 'google_failed';
    return fail(request, saved, code);
  }
  if (!saved || !oauthStateMatches(saved.state, url.searchParams.get('state') || '')) {
    return fail(request, saved, 'google_state');
  }

  const client = googleClient(env);
  const redirectUri = googleRedirectUri(oauthOrigin(request));
  const code = cleanAuthCode(url.searchParams.get('code') || '');
  if (!client || !redirectUri) return fail(request, saved, 'google_unavailable');
  if (!code) return fail(request, saved, 'google_failed');

  const accessToken = await exchangeGoogleCode({
    code,
    clientId: client.id,
    clientSecret: client.secret,
    redirectUri,
    codeVerifier: saved.verifier,
  });
  const profile = accessToken ? await fetchGoogleUserInfo(accessToken) : null;
  const user = profile ? await sessionUserFromGoogle(profile) : null;
  if (!user) return fail(request, saved, 'google_failed');
  // Before ensureUser and before vt_session. A rejected Google account gets
  // no user row and no session cookie.
  if (!authEmailAllowed(env, user.email)) return fail(request, saved, 'email_not_allowed');

  const db = getDb(env);
  if (db) {
    try {
      await ensureUser(db, user);
    } catch {
      return fail(request, saved, 'google_failed');
    }
  }

  const sessionCookie = await issueSessionCookie(request, env, user);
  if (!sessionCookie) return fail(request, saved, 'google_unavailable');
  const cookies = [sessionCookie, clearOauthStateCookie(request)];
  if (saved.popup) return oauthResultDocument({ ok: true, next: saved.next, setCookies: cookies });
  return redirectNoStore(saved.next, cookies);
}
