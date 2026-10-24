import { authStatus, jsonNoStore, readSession } from '../../_lib/session.js';

export async function onRequestGet(context) {
  const status = authStatus(context.request, context.env);
  const user = await readSession(context.request, context.env);
  if (!user) {
    return jsonNoStore({ ok: true, user: null, ...status }, 200);
  }
  return jsonNoStore({ ok: true, user, ...status }, 200);
}
