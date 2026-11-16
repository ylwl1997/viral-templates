/**
 * Which backend generates a remake.
 * VIDEO_PROVIDER=agnes (default), bailian, or imagine.
 * Agnes is used only when the template media fits Video 2.5 reference limits
 * and a public custom-domain origin exists. Otherwise the job stays on
 * wan2.2-animate-mix. Imagine runs only when VIDEO_PROVIDER=imagine.
 * A configured XAI_API_KEY does not switch the provider by itself.
 * Imagine without that key fails the job. It does not call Agnes.
 * The switch does not change the credit charge.
 */

import { AGNES_MAX_REFERENCE_IMAGES, agnesRuntime, referencePhotoKinds } from './agnes.js';
import { fail } from './account-db.js';
import { BAILIAN_MAX_REFERENCE_IMAGES, bailianRuntime } from './bailian.js';
import { IMAGINE_MAX_REFERENCE_IMAGES, imagineRuntime } from './imagine.js';

export function resolveVideoProvider(env) {
  const raw = env && typeof env.VIDEO_PROVIDER === 'string' ? env.VIDEO_PROVIDER.trim().toLowerCase() : '';
  if (!raw || raw === 'agnes') return 'agnes';
  if (raw === 'bailian') return 'bailian';
  if (raw === 'imagine') return 'imagine';
  throw fail('video_provider');
}

export function videoBackends(env) {
  const selected = resolveVideoProvider(env);
  return {
    selected,
    agnes: agnesRuntime(env),
    bailian: bailianRuntime(env),
    imagine: imagineRuntime(env),
  };
}

/**
 * Agnes when it is selected, configured, and the clip can be one job or a
 * 4–12s split. Mix for an explicit bailian switch, a missing Agnes key, media
 * limits a split cannot fix, or no public custom-domain origin.
 * Imagine is returned only for an explicit imagine switch. A missing xAI key
 * stays on Imagine and is marked failed so the job can refund.
 */
export function selectRemakeProvider(backends, decision) {
  if (backends && backends.selected === 'imagine') {
    if (!backends.imagine || !backends.imagine.configured) {
      return { provider: 'imagine', reason: 'xai_unset', failed: true };
    }
    if (!decision || !decision.ok) {
      return { provider: 'imagine', reason: (decision && decision.reason) || 'media', failed: true };
    }
    if (!backends.imagine.publicOrigin) {
      return { provider: 'imagine', reason: 'public_origin', failed: true };
    }
    return {
      provider: 'imagine',
      reason: decision.reason || 'reference',
      seconds: decision.seconds,
      segments: decision.segments,
    };
  }
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

/** How many reference images this provider's create call can carry. */
export function providerReferenceLimit(provider) {
  if (provider === 'agnes') return AGNES_MAX_REFERENCE_IMAGES;
  if (provider === 'bailian') return BAILIAN_MAX_REFERENCE_IMAGES;
  if (provider === 'imagine') return IMAGINE_MAX_REFERENCE_IMAGES;
  return 0;
}

/**
 * Photo kinds the worker would put on this provider's create call.
 * Null when that path would send fewer images than photoCount.
 * Callers must fail the job instead of submitting a shorter list.
 */
export function plannedReferenceImages(template, provider) {
  const count = template && Number(template.photoCount);
  const kinds = referencePhotoKinds(count);
  if (!kinds || kinds.length !== count) return null;
  if (kinds.length > providerReferenceLimit(provider)) return null;
  return kinds;
}

export function providerConfigured(backends) {
  if (!backends) return false;
  // Imagine without a key still enters the worker so the job can fail and refund.
  if (backends.selected === 'imagine') return true;
  if (backends.selected === 'bailian') return Boolean(backends.bailian && backends.bailian.configured);
  return Boolean(
    (backends.agnes && backends.agnes.configured) || (backends.bailian && backends.bailian.configured),
  );
}
