import { accountError, openAccount } from '../../_lib/account-api.js';
import { getCredits } from '../../_lib/account-db.js';
import { jsonNoStore } from '../../_lib/session.js';

export async function onRequestGet(context) {
  const opened = await openAccount(context);
  if (opened.error) return opened.error;
  try {
    const url = new URL(context.request.url);
    const includeLedger = url.searchParams.get('ledger') !== '0';
    const data = await getCredits(opened.db, opened.user, { includeLedger });
    return jsonNoStore({ ok: true, ...data });
  } catch (err) {
    return accountError(err);
  }
}
