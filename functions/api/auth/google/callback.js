import { ensureUser, getDb } from '../../../_lib/account-db.js';
import {
  cleanAuthCode,
  clearOauthStateCookie,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  googleClient,
  googleRedirectUri,
  oauthOrigin,
  oauthStateMatches,
  readOauthState,
  redirectNoStore,
  sessionUserFromGoogle,
  signInErrorLocation,
} from '../../../_lib/google-oauth.js';
import { issueSessionCookie } from '../../../_lib/session.js';

function fail(request, saved, error, next) {
  const from = saved && saved.from;
  const dest = signInErrorLocation(from, error, next || (saved && saved.next) || '');
  return redirectNoStore(dest, [clearOauthStateCookie(request)]);
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
  return redirectNoStore(saved.next, [sessionCookie, clearOauthStateCookie(request)]);
}
