import { accountError, openAccount } from '../../_lib/account-api.js';
import { bailianRuntime } from '../../_lib/bailian.js';
import { processRemakeJobs } from '../../_lib/bailian-worker.js';
import { mediaConfigured } from '../../_lib/r2-media.js';
import { jsonNoStore } from '../../_lib/session.js';

/**
 * Signed-in drain for this user's queued or running remake.
 * One job per call: submit if it is still queued, otherwise poll once.
 * The browser does not send JOB_PROCESS_SECRET. Bailian credentials stay
 * in the Pages env.
 */
export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  if (!mediaConfigured(context.env)) {
    return jsonNoStore({ ok: true, processed: [], skipped: 'r2_unbound' });
  }
  let runtime;
  try {
    runtime = bailianRuntime(context.env);
  } catch (err) {
    const code = err && err.code ? err.code : 'bailian_bad_base';
    return jsonNoStore({ ok: true, processed: [], skipped: code });
  }
  if (!runtime.configured) {
    return jsonNoStore({ ok: true, processed: [], skipped: 'bailian_unconfigured' });
  }
  try {
    const result = await processRemakeJobs({
      db: opened.db,
      env: context.env,
      request: context.request,
      limit: 1,
      userId: opened.user.user_id,
      waitMs: 0,
    });
    const processed = (result.processed || []).map((row) => ({
      id: row.id,
      status: row.status,
      error: row.error || '',
    }));
    return jsonNoStore({ ok: true, processed });
  } catch (err) {
    return accountError(err);
  }
}
