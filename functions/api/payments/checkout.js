import { accountError, openAccount } from '../../_lib/account-api.js';
import { jsonNoStore } from '../../_lib/session.js';
import { createCheckout } from '../../_lib/waffo.js';

export async function onRequestPost(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return jsonNoStore({ ok: false, error: 'bad_json' }, 400);
  }
  try {
    const result = await createCheckout({
      db: opened.db,
      env: context.env,
      user: opened.user,
      packId: body && body.pack,
      origin: new URL(context.request.url).origin,
    });
    return jsonNoStore(result);
  } catch (err) {
    return accountError(err);
  }
}
