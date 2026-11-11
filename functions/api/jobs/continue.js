import { accountError, openAccount } from '../../_lib/account-api.js';
import { processRemakeJobs } from '../../_lib/bailian-worker.js';
import { mediaConfigured } from '../../_lib/r2-media.js';
import { jsonNoStore } from '../../_lib/session.js';
import { providerConfigured, videoBackends } from '../../_lib/video-provider.js';

/**
 * Signed-in drain for this user's queued or running remake.
 * One job per call: submit if it is still queued, otherwise poll once.
 * The browser does not send JOB_PROCESS_SECRET. Provider credentials stay
 * in the Pages env. This JSON does not name a provider.
 */

function customerError(error) {
  const text = String(error || '');
  if (!text) return '';
  if (/agnes|bailian|dashscope|waffo/i.test(text)) return 'failed';
  return text;
}

function customerSkip(code) {
  const text = String(code || '');
  if (!text) return '';
  if (/agnes|bailian|dashscope|waffo/i.test(text)) return 'video_unconfigured';
  return text;
}
export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  if (!mediaConfigured(context.env)) {
    return jsonNoStore({ ok: true, processed: [], skipped: 'r2_unbound' });
  }
  let backends;
  try {
    backends = videoBackends(context.env);
  } catch (err) {
    const code = err && err.code ? err.code : 'video_provider';
    return jsonNoStore({ ok: true, processed: [], skipped: customerSkip(code) });
  }
  if (!providerConfigured(backends)) {
    return jsonNoStore({ ok: true, processed: [], skipped: 'video_unconfigured' });
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
      error: customerError(row.error),
    }));
    return jsonNoStore({ ok: true, processed });
  } catch (err) {
    return accountError(err);
  }
}
