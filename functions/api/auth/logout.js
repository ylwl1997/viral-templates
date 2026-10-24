import { clearSessionCookie, jsonNoStore } from '../../_lib/session.js';

export async function onRequestPost(context) {
  const cookie = clearSessionCookie(context.request);
  return jsonNoStore({ ok: true }, 200, [cookie]);
}

export async function onRequestGet(context) {
  return onRequestPost(context);
}
