import { accountError, openAccount } from '../../_lib/account-api.js';
import { ensureSchema, ensureUser, newId } from '../../_lib/account-db.js';
import { jsonNoStore } from '../../_lib/session.js';

function oneLine(value) {
  return String(value || '')
    .replace(/[\r\n\u0000]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  }
  const message = oneLine(body && body.message);
  if (message.length < 8) return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  try {
    const user = await ensureUser(opened.db, opened.user);
    await ensureSchema(opened.db);
    const id = newId('note');
    await opened.db
      .prepare(`INSERT INTO support_requests (id, user_id, message, created_at) VALUES (?, ?, ?, ?)`)
      .bind(id, user.user_id, message, new Date().toISOString())
      .run();
    return jsonNoStore({ ok: true });
  } catch (err) {
    return accountError(err);
  }
}
