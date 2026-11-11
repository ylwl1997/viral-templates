import { checkoutStatus } from '../../_lib/waffo.js';
import { jsonNoStore } from '../../_lib/session.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const body = checkoutStatus(context.env, { debug: url.searchParams.get('debug') === '1' });
  return jsonNoStore(body);
}
