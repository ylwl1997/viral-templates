import { accountError, openAccount } from '../../_lib/account-api.js';
import { createPhoneLink, readPhonePhoto } from '../../_lib/phone-upload.js';
import { jsonNoStore } from '../../_lib/session.js';

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  }
  try {
    const link = await createPhoneLink({
      db: opened.db,
      env: context.env,
      request: context.request,
      user: opened.user,
      templateSlug: body && body.template_slug,
      slot: body && body.slot,
    });
    return jsonNoStore({ ok: true, ...link });
  } catch (err) {
    return accountError(err);
  }
}

export async function onRequestGet(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  const token = new URL(context.request.url).searchParams.get('token') || '';
  try {
    const photo = await readPhonePhoto({
      db: opened.db,
      env: context.env,
      user: opened.user,
      token,
    });
    return jsonNoStore({ ok: true, ...photo });
  } catch (err) {
    return accountError(err);
  }
}
