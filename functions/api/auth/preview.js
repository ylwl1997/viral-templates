import {
  authStatus,
  cleanPreviewProfile,
  issueSessionCookie,
  jsonNoStore,
  previewLoginAllowed,
  resolveAuthSecret,
  safeNext,
  stableUserId,
} from '../../_lib/session.js';

export async function onRequestPost(context) {
  const host = new URL(context.request.url).hostname;
  if (!previewLoginAllowed(context.env, host)) {
    return jsonNoStore(
      {
        ok: false,
        error: 'preview_disabled',
        message: 'Preview sign-in is off. Set AUTH_PREVIEW_LOGIN=1 or leave Google OAuth unconfigured on *.pages.dev.',
      },
      403,
    );
  }
  if (!resolveAuthSecret(context.env, host).secret) {
    return jsonNoStore(
      {
        ok: false,
        error: 'auth_secret_missing',
        message: 'Set AUTH_SECRET (16+ characters) before signing in on this host.',
      },
      503,
    );
  }

  let body = {};
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const profile = cleanPreviewProfile(body);
  if (!profile) return jsonNoStore({ ok: false, error: 'email_required' }, 400);

  const user_id = await stableUserId('preview', profile.email);
  const user = {
    user_id,
    email: profile.email,
    name: profile.name,
    avatar_url: '',
    providers: ['preview'],
  };
  const cookie = await issueSessionCookie(context.request, context.env, user);
  if (!cookie) return jsonNoStore({ ok: false, error: 'auth_secret_missing' }, 503);

  const next = safeNext(typeof body.next === 'string' ? body.next : '', '/account/');
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
