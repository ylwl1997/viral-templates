/**
 * Which backend generates a remake.
 * VIDEO_PROVIDER=agnes (default) or bailian.
 * Agnes is used only when the template media fits Video 2.5 reference limits
 * and a public custom-domain origin exists. Otherwise the job stays on
 * wan2.2-animate-mix. The switch does not change the credit charge.
 */

import { agnesRuntime } from './agnes.js';
import { fail } from './account-db.js';
import { bailianRuntime } from './bailian.js';

export function resolveVideoProvider(env) {
  const raw = env && typeof env.VIDEO_PROVIDER === 'string' ? env.VIDEO_PROVIDER.trim().toLowerCase() : '';
  if (!raw || raw === 'agnes') return 'agnes';
  if (raw === 'bailian') return 'bailian';
  throw fail('video_provider');
}

export function videoBackends(env) {
  const selected = resolveVideoProvider(env);
  return {
    selected,
    agnes: agnesRuntime(env),
    bailian: bailianRuntime(env),
  };
}

/**
 * Agnes when it is selected, configured, and the clip can be one job or a
 * 4–12s split. Mix for an explicit bailian switch, a missing key, media
 * limits a split cannot fix, or no public custom-domain origin.
 */
export function selectRemakeProvider(backends, decision) {
  if (!backends || backends.selected === 'bailian') return { provider: 'bailian', reason: 'switch' };
  if (!backends.agnes || !backends.agnes.configured) return { provider: 'bailian', reason: 'agnes_unset' };
  if (!decision || !decision.ok) return { provider: 'bailian', reason: (decision && decision.reason) || 'media' };
  if (!backends.agnes.publicOrigin) return { provider: 'bailian', reason: 'public_origin' };
  return {
    provider: 'agnes',
    reason: decision.reason || 'reference',
    seconds: decision.seconds,
    segments: decision.segments,
  };
}

export function providerConfigured(backends) {
  if (!backends) return false;
  if (backends.selected === 'bailian') return Boolean(backends.bailian && backends.bailian.configured);
  return Boolean(
    (backends.agnes && backends.agnes.configured) || (backends.bailian && backends.bailian.configured),
  );
}
