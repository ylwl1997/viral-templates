import { jsonNoStore, readSession } from './session.js';
import { getDb } from './account-db.js';

export function accountError(err) {
  const code = err && err.code ? err.code : '';
  if (code === 'bad_status' || code === 'bad_template' || code === 'bad_json' || code === 'bad_limit') {
    return jsonNoStore({ ok: false, error: code }, 400);
  }
  if (code === 'insufficient_credits') {
    return jsonNoStore({ ok: false, error: code }, 409);
  }
  if (code === 'unauthorized') {
    return jsonNoStore({ ok: false, error: 'unauthorized' }, 401);
  }
  console.error('account_api', code || 'storage_error', err);
  return jsonNoStore({ ok: false, error: 'storage_error' }, 500);
}

export async function openAccount(context) {
  const user = await readSession(context.request, context.env);
  if (!user) return { error: jsonNoStore({ ok: false, error: 'unauthorized' }, 401) };
  const db = getDb(context.env);
  if (!db) {
    return {
      error: jsonNoStore(
        {
          ok: false,
          error: 'd1_unbound',
          message: 'Account storage is not connected on this host.',
        },
        503,
      ),
    };
  }
  return { user, db };
}
