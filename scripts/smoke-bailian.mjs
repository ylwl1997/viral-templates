/**
 * Wake the Pages worker that calls Bailian. This script does not call DashScope
 * and does not send BAILIAN_API_KEY. The key stays in the Pages secret.
 *
 *   JOB_PROCESS_SECRET='...' node scripts/smoke-bailian.mjs
 *   SMOKE_BASE_URL=https://viral-templates.pages.dev   (default)
 *   SMOKE_JOB_ID=job_...                               (optional)
 *   SMOKE_INTERVAL_MS=15000
 *   SMOKE_ATTEMPTS=40
 *
 * Create a signed-in job first (POST /api/jobs with a photo). Then run this
 * until the job is ready or failed. See docs/bailian-animate.md.
 */

const secret = typeof process.env.JOB_PROCESS_SECRET === 'string' ? process.env.JOB_PROCESS_SECRET.trim() : '';
const base = (process.env.SMOKE_BASE_URL || 'https://viral-templates.pages.dev').replace(/\/$/, '');
const jobId = typeof process.env.SMOKE_JOB_ID === 'string' ? process.env.SMOKE_JOB_ID.trim() : '';
const intervalMs = clamp(process.env.SMOKE_INTERVAL_MS, 15_000, 2_000, 60_000);
const attempts = clamp(process.env.SMOKE_ATTEMPTS, 40, 1, 80);

if (secret.length < 16) {
  console.error('Set JOB_PROCESS_SECRET (16+ characters). Do not put BAILIAN_API_KEY in this command.');
  process.exit(1);
}

const endpoint = `${base}/api/jobs/process`;
let last = null;

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const payload = { limit: 1 };
  if (jobId) payload.job_id = jobId;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`attempt ${attempt}: ${err && err.message ? err.message : 'network error'}`);
    process.exit(1);
  }
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  if (!response.ok) {
    console.error(`attempt ${attempt}: HTTP ${response.status}`);
    console.error(JSON.stringify(redact(body), null, 2));
    process.exit(1);
  }
  const processed = Array.isArray(body.processed) ? body.processed : [];
  const row = jobId ? processed.find((item) => item && item.id === jobId) || processed[0] : processed[0];
  last = row || null;
  const summary = row
    ? `${row.id} ${row.status} ${row.action || ''}${row.error ? ` ${row.error}` : ''}`
    : 'no queued or running jobs';
  console.log(`attempt ${attempt}/${attempts}: ${summary}`);
  if (row && row.detail) console.log(`  detail: ${row.detail}`);
  if (row && row.result_url) console.log(`  result_url: ${row.result_url}`);
  if (!row) {
    console.log('Nothing to process. Queue a job from Create, then run this again.');
    process.exit(0);
  }
  if (row.status === 'ready') {
    console.log('Ready. Open the result_url or the account creations page.');
    process.exit(0);
  }
  if (row.status === 'failed') {
    console.error('Job failed. See detail and the job note. Fix the input and queue a new job.');
    process.exit(1);
  }
  if (attempt < attempts) await delay(intervalMs);
}

console.error(last ? `Still ${last.status} after ${attempts} attempts.` : 'No result.');
process.exit(1);

function clamp(raw, fallback, min, max) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => (key === 'authorization' ? undefined : item)));
}
