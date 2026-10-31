import { accountError, openAccount } from '../../_lib/account-api.js';
import { listJobs } from '../../_lib/account-db.js';
import { resultUrlSigner } from '../../_lib/job-media.js';
import { jsonNoStore } from '../../_lib/session.js';

export async function onRequestGet(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  try {
    const url = new URL(context.request.url);
    const data = await listJobs(opened.db, opened.user, {
      status: url.searchParams.get('status') || '',
      limit: url.searchParams.get('limit') || '',
      signResult: resultUrlSigner(context.env, context.request),
    });
    return jsonNoStore({ ok: true, ...data });
  } catch (err) {
    return accountError(err);
  }
}
