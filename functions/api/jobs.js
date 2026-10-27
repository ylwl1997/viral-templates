import { accountError, openAccount } from '../_lib/account-api.js';
import { createStubJob } from '../_lib/account-db.js';
import { jsonNoStore } from '../_lib/session.js';

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  let body = null;
  try {
    body = await context.request.json();
  } catch {
    return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  }
  if (!body || typeof body !== 'object') return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  try {
    const job = await createStubJob(opened.db, opened.user, body.template_slug);
    return jsonNoStore({ ok: true, job }, 201);
  } catch (err) {
    return accountError(err);
  }
}
