import { accountError } from '../../../_lib/account-api.js';
import { getDb } from '../../../_lib/account-db.js';
import { ingestAuthorized, readResultBody, storeJobResult } from '../../../_lib/job-media.js';
import { jsonNoStore } from '../../../_lib/session.js';
import { mediaConfigured } from '../../../_lib/r2-media.js';

/**
 * Ops ingest for a finished MP4. Not used by Create.
 * Requires Authorization: Bearer RESULT_INGEST_SECRET.
 * Does not call a video provider.
 */
export async function onRequestPost(context) {
  const gate = ingestAuthorized(context.env, context.request);
  if (gate === 'unconfigured') {
    return jsonNoStore(
      {
        ok: false,
        error: 'result_ingest_unconfigured',
        message: 'Set RESULT_INGEST_SECRET (16+ characters) before storing a finished clip.',
      },
      503,
    );
  }
  if (gate !== 'ok') return jsonNoStore({ ok: false, error: 'unauthorized' }, 401);

  const db = getDb(context.env);
  if (!db) {
    return jsonNoStore(
      { ok: false, error: 'd1_unbound', message: 'Account storage is not connected on this host.' },
      503,
    );
  }
  if (!mediaConfigured(context.env)) {
    return jsonNoStore(
      { ok: false, error: 'r2_unbound', message: 'Media storage is not connected on this host.' },
      503,
    );
  }

  const jobId = context.params && context.params.id;
  try {
    const video = await readResultBody(context.request);
    const attached = await storeJobResult(db, context.env, context.request, jobId, video);
    return jsonNoStore(
      {
        ok: true,
        job: attached.job,
        media: { stored: true, r2_configured: true, result_key: attached.record.result_key },
      },
      200,
    );
  } catch (err) {
    return accountError(err);
  }
}
