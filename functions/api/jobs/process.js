import { accountError } from '../../_lib/account-api.js';
import { fail, getDb } from '../../_lib/account-db.js';
import { processRemakeJobs } from '../../_lib/bailian-worker.js';
import { bearerAuthorized } from '../../_lib/job-media.js';
import { mediaConfigured } from '../../_lib/r2-media.js';
import { jsonNoStore } from '../../_lib/session.js';
import { providerConfigured, videoBackends } from '../../_lib/video-provider.js';

/**
 * Ops trigger for Bailian remake jobs.
 * Authorization: Bearer JOB_PROCESS_SECRET.
 * Does not accept the Bailian API key from the caller. That key is BAILIAN_API_KEY.
 *
 * Create starts the same worker with waitUntil and does not send this secret.
 * This route still drains every user's queued and running jobs. The drain
 * Worker and scripts/smoke-bailian.mjs call it. One call submits queued jobs
 * and polls running ones once. Pass wait_ms to poll again inside this request.
 */
export async function onRequestPost(context) {
  const gate = bearerAuthorized(context.env, context.request, 'JOB_PROCESS_SECRET');
  if (gate === 'unconfigured') {
    return jsonNoStore(
      {
        ok: false,
        error: 'job_process_unconfigured',
        message: 'Set JOB_PROCESS_SECRET (16+ characters) before processing jobs.',
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

  let backends;
  try {
    backends = videoBackends(context.env);
  } catch (err) {
    const code = err && err.code ? err.code : 'video_provider';
    return jsonNoStore({ ok: false, error: code }, 503);
  }
  if (!providerConfigured(backends)) {
    const bailianOnly = backends.selected === 'bailian';
    return jsonNoStore(
      {
        ok: false,
        error: 'bailian_unconfigured',
        message: bailianOnly
          ? 'Set the Pages secret BAILIAN_API_KEY. Do not commit it.'
          : 'Set the Pages secret AGNES_API_KEY or BAILIAN_API_KEY. Do not commit it.',
      },
      503,
    );
  }

  try {
    const body = await readProcessBody(context.request);
    const result = await processRemakeJobs({
      db,
      env: context.env,
      request: context.request,
      limit: clampProcessLimit(body.limit),
      jobId: typeof body.job_id === 'string' ? body.job_id.trim() : '',
      waitMs: clampWait(body.wait_ms),
      pollIntervalMs: clampInterval(body.poll_interval_ms),
    });
    return jsonNoStore({ ok: true, ...result });
  } catch (err) {
    return accountError(err);
  }
}

async function readProcessBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return {};
  const raw = await request.text();
  if (!raw.trim()) return {};
  if (raw.length > 4000) throw fail('bad_json');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw fail('bad_json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('bad_json');
  return body;
}

function clampProcessLimit(raw) {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw fail('bad_limit');
  return n;
}

function clampWait(raw) {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 90_000) throw fail('bad_limit');
  return n;
}

function clampInterval(raw) {
  if (raw == null || raw === '') return 6_000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 5_000 || n > 20_000) throw fail('bad_limit');
  return n;
}
