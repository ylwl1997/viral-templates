import { accountError } from '../../../../_lib/account-api.js';
import { getDb, getJobMediaRecord } from '../../../../_lib/account-db.js';
import { authorizeMediaRequest, keyForKind, loadStoredObject } from '../../../../_lib/job-media.js';
import { MEDIA_KINDS, getMediaBucket } from '../../../../_lib/r2-media.js';
import { jsonNoStore } from '../../../../_lib/session.js';

export async function onRequestGet(context) {
  const jobId = context.params && context.params.id;
  const kind = context.params && context.params.kind;
  if (!MEDIA_KINDS.has(kind)) return jsonNoStore({ ok: false, error: 'not_found' }, 404);

  const db = getDb(context.env);
  if (!db) {
    return jsonNoStore(
      { ok: false, error: 'd1_unbound', message: 'Account storage is not connected on this host.' },
      503,
    );
  }
  const bucket = getMediaBucket(context.env);
  if (!bucket) {
    return jsonNoStore(
      { ok: false, error: 'r2_unbound', message: 'Media storage is not connected on this host.' },
      503,
    );
  }

  try {
    const record = await getJobMediaRecord(db, jobId);
    if (!record) return jsonNoStore({ ok: false, error: 'not_found' }, 404);
    await authorizeMediaRequest(context.env, context.request, record, kind);
    const key = keyForKind(record, kind);
    if (!key) return jsonNoStore({ ok: false, error: 'not_found' }, 404);
    const obj = await loadStoredObject(bucket, key);
    if (!obj) return jsonNoStore({ ok: false, error: 'not_found' }, 404);
    const fallback = kind === 'result' ? 'video/mp4' : 'application/octet-stream';
    const contentType = (obj.httpMetadata && obj.httpMetadata.contentType) || fallback;
    const headers = new Headers({
      'content-type': contentType,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-disposition': kind === 'result' ? 'attachment; filename="clip.mp4"' : 'inline',
    });
    if (typeof obj.size === 'number') headers.set('content-length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    return accountError(err);
  }
}
