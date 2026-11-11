/**
 * Start generation for one job the create request just queued.
 * Uses env provider keys / MEDIA / DB. Does not read JOB_PROCESS_SECRET and
 * does not use the caller's Authorization header.
 *
 * Submits the task, then polls that task inside this isolate for up to
 * REMAKE_FOLLOW_MS. The interval stays at least 6s and honors provider backoff.
 * A later drain pass finishes anything still running. The browser does not
 * call the provider.
 */

import { getDb } from './account-db.js';
import { processRemakeJobs } from './bailian-worker.js';
import { mediaConfigured } from './r2-media.js';
import { providerConfigured, videoBackends } from './video-provider.js';

export const REMAKE_FOLLOW_MS = 45_000;
export const REMAKE_POLL_INTERVAL_MS = 6_000;

const QUIET = new Set(['bailian_unconfigured', 'r2_unbound', 'not_found']);

export async function kickRemakeJob({ env, request, db, jobId }) {
  const id = typeof jobId === 'string' ? jobId.trim() : '';
  if (!id || !env || !request) return null;
  if (!mediaConfigured(env)) return null;
  let backends;
  try {
    backends = videoBackends(env);
  } catch {
    return null;
  }
  if (!providerConfigured(backends)) return null;
  const database = db || getDb(env);
  if (!database) return null;
  const first = await processRemakeJobs({
    db: database,
    env,
    request,
    limit: 1,
    jobId: id,
    waitMs: 0,
  });
  const row = first.processed && first.processed[0];
  if (!row || row.status !== 'running') return first;
  const polled = await processRemakeJobs({
    db: database,
    env,
    request,
    limit: 1,
    jobId: id,
    waitMs: REMAKE_FOLLOW_MS,
    pollIntervalMs: REMAKE_POLL_INTERVAL_MS,
  });
  return polled;
}

/** Do not await this from the create handler. Pass the promise to waitUntil. */
export function scheduleRemakeKick(context, jobId) {
  const task = kickRemakeJob({
    env: context && context.env,
    request: context && context.request,
    jobId,
  }).catch((err) => {
    const code = err && err.code ? String(err.code) : 'error';
    if (!QUIET.has(code)) console.error('remake_kick', code);
    return null;
  });
  if (context && typeof context.waitUntil === 'function') {
    try {
      context.waitUntil(task);
    } catch (err) {
      console.error('remake_waituntil', err && err.name ? err.name : 'error');
    }
  }
  return task;
}
