import { accountError, openAccount } from '../../_lib/account-api.js';
import { queueJobWithMedia, readCreateJobBody } from '../../_lib/job-media.js';
import { scheduleRemakeKick } from '../../_lib/remake-kick.js';
import { jsonNoStore } from '../../_lib/session.js';

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  try {
    const parsed = await readCreateJobBody(context.request);
    const result = await queueJobWithMedia({
      db: opened.db,
      env: context.env,
      request: context.request,
      user: opened.user,
      templateSlug: parsed.template_slug,
      photos: parsed.photos,
    });
    if (result.job && result.job.id) scheduleRemakeKick(context, result.job.id);
    return jsonNoStore({ ok: true, job: result.job, media: result.media }, 201);
  } catch (err) {
    return accountError(err);
  }
}
