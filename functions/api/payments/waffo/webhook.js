import { getDb } from '../../../_lib/account-db.js';
import { handleWaffoNotification } from '../../../_lib/waffo.js';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return json({ message: 'failed' }, 503);
  const rawBody = await context.request.text();
  const signature = context.request.headers.get('x-signature') || '';
  try {
    const result = await handleWaffoNotification({
      db,
      env: context.env,
      rawBody,
      signature,
    });
    return json(result.body, result.http);
  } catch (err) {
    console.error('checkout_notice', err && err.code ? err.code : 'error');
    return json({ message: 'failed' }, 200);
  }
}
