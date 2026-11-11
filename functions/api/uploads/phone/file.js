import { accountError } from '../../../_lib/account-api.js';
import { getDb } from '../../../_lib/account-db.js';
import { savePhonePhoto } from '../../../_lib/phone-upload.js';
import { jsonNoStore } from '../../../_lib/session.js';
import { PHOTO_MAX_BYTES } from '../../../_lib/r2-media.js';

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return jsonNoStore({ ok: false, error: 'd1_unbound' }, 503);
  let form;
  try {
    form = await context.request.formData();
  } catch {
    return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  }
  const token = form.get('token');
  const raw = form.get('photo');
  if (typeof token !== 'string' || !raw || typeof raw === 'string' || typeof raw.arrayBuffer !== 'function') {
    return jsonNoStore({ ok: false, error: 'bad_photo' }, 400);
  }
  if (typeof raw.size === 'number' && raw.size > PHOTO_MAX_BYTES) {
    return jsonNoStore({ ok: false, error: 'photo_too_large' }, 400);
  }
  try {
    const bytes = new Uint8Array(await raw.arrayBuffer());
    const saved = await savePhonePhoto({ db, env: context.env, token, bytes });
    return jsonNoStore(saved);
  } catch (err) {
    return accountError(err);
  }
}
