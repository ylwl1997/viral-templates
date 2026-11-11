import { getDb } from '../../_lib/account-db.js';
import { handlePancakeNotification } from '../../_lib/pancake.js';

function text(body, status) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost(context) {
  const db = getDb(context.env);
  if (!db) return text('failed', 503);
  const rawBody = await context.request.text();
  const signature = context.request.headers.get('x-waffo-signature') || '';
  try {
    const result = await handlePancakeNotification({
      db,
      env: context.env,
      rawBody,
      signature,
    });
    return text(result.body, result.http);
  } catch (err) {
    console.error('checkout_notice', err && err.code ? err.code : 'error');
    return text('failed', 500);
  }
}
