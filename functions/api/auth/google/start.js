import {
  buildAuthorizeUrl,
  googleClient,
  googleRedirectUri,
  issueOauthStateCookie,
  oauthOrigin,
  randomToken,
  redirectNoStore,
  signInErrorLocation,
} from '../../../_lib/google-oauth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const next = url.searchParams.get('next') || '';
  const from = url.searchParams.get('from') || '';
  const fail = (error) => redirectNoStore(signInErrorLocation(from, error, next));

  const client = googleClient(env);
  const origin = oauthOrigin(request);
  const redirectUri = googleRedirectUri(origin);
  if (!client || !redirectUri) return fail('google_unavailable');

  const state = randomToken();
  const verifier = randomToken();
  const cookie = await issueOauthStateCookie(request, env, { state, verifier, next, from });
  if (!cookie) return fail('google_unavailable');

  const location = await buildAuthorizeUrl({
    clientId: client.id,
    redirectUri,
    state,
    verifier,
  });
  if (!location.startsWith('https://accounts.google.com/')) return fail('google_unavailable');
  return redirectNoStore(location, [cookie]);
}
