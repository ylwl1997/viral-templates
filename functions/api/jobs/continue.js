import { accountError, openAccount } from '../../_lib/account-api.js';
import { listRemakeCandidates } from '../../_lib/account-db.js';
import { jsonNoStore } from '../../_lib/session.js';

/**
 * Signed-in status refresh. Does not call a video provider and does not
 * submit work. Generation is advanced by the create waitUntil follow and by
 * workers/job-drain. Customer JSON does not name a provider.
 */

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  try {
    const rows = await listRemakeCandidates(opened.db, {
      userId: opened.user.user_id,
      limit: 5,
    });
    const processed = rows.map((row) => ({
      id: row.id,
      status: row.status,
      error: '',
    }));
    return jsonNoStore({ ok: true, processed });
  } catch (err) {
    return accountError(err);
  }
}
