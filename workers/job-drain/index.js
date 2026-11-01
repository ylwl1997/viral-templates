/**
 * Scheduled drain for remake jobs.
 *
 * Cloudflare Pages Functions cannot run Cron Triggers. This Worker only
 * POSTs the existing Pages route. It does not talk to Bailian and it does
 * not read BAILIAN_API_KEY.
 *
 * Deploy (separate from Pages):
 *   npx wrangler deploy --config workers/job-drain/wrangler.toml
 *   npx wrangler secret put JOB_PROCESS_SECRET --config workers/job-drain/wrangler.toml
 */

const DEFAULT_ORIGIN = 'https://viral-templates.pages.dev';

export function processUrl(env) {
  const raw = typeof env?.PAGES_ORIGIN === 'string' ? env.PAGES_ORIGIN.trim() : '';
  const base = raw || DEFAULT_ORIGIN;
  let url;
  try {
    url = new URL(base.includes('://') ? base : `https://${base}`);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (url.username || url.password) return '';
  return `${url.origin}/api/jobs/process`;
}

export async function drainRemakeJobs(env, fetchImpl = fetch) {
  const secret = typeof env?.JOB_PROCESS_SECRET === 'string' ? env.JOB_PROCESS_SECRET.trim() : '';
  if (secret.length < 16) return { ok: false, error: 'job_process_unconfigured' };
  const endpoint = processUrl(env);
  if (!endpoint) return { ok: false, error: 'bad_origin' };
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ limit: 3 }),
  });
  return { ok: Boolean(res && res.ok), status: res ? res.status : 0 };
}

export default {
  async scheduled(_controller, env, ctx) {
    const task = drainRemakeJobs(env).catch((err) => {
      console.error('job_drain', err && err.name ? err.name : 'error');
      return { ok: false, error: 'job_drain' };
    });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
    return task;
  },
};
