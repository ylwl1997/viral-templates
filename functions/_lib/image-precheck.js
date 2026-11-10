/**
 * Reference-photo gate. Reads width and height from the file header only.
 * It does not decode pixels, so a large phone photo does not spend Function CPU.
 * The browser is expected to shrink oversized photos before upload.
 */

import { PHOTO_MAX_BYTES, sniffImage } from './r2-media.js';

export const MIN_SHORT_SIDE = 300;
/** Long side / short side. Equal to 2.5 is accepted. */
export const MAX_ASPECT = 2.5;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function u16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function jpegSize(bytes) {
  let p = 2;
  const limit = Math.min(bytes.length, 2 * 1024 * 1024);
  while (p + 3 < limit) {
    if (bytes[p] !== 0xff) {
      p += 1;
      continue;
    }
    while (p < limit && bytes[p] === 0xff) p += 1;
    if (p >= limit) return null;
    const marker = bytes[p];
    p += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (p + 1 >= bytes.length) return null;
    const len = u16(bytes, p);
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (p + 6 >= bytes.length) return null;
      const height = u16(bytes, p + 3);
      const width = u16(bytes, p + 5);
      if (!width || !height) return null;
      return { width, height };
    }
    p += len;
  }
  return null;
}

function pngSize(bytes) {
  if (bytes.length < 24) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  if (!width || !height) return null;
  return { width, height };
}

function webpSize(bytes) {
  if (bytes.length < 30) return null;
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (tag === 'VP8X' && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    if (!width || !height) return null;
    return { width, height };
  }
  if (tag === 'VP8 ' && bytes.length >= 30) {
    const frame = 20;
    if (bytes[frame] !== 0x9d || bytes[frame + 1] !== 0x01 || bytes[frame + 2] !== 0x2a) return null;
    const width = (bytes[frame + 6] | (bytes[frame + 7] << 8)) & 0x3fff;
    const height = (bytes[frame + 8] | (bytes[frame + 9] << 8)) & 0x3fff;
    if (!width || !height) return null;
    return { width, height };
  }
  if (tag === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    if (!width || !height) return null;
    return { width, height };
  }
  return null;
}

export function readImageSize(bytes, ext) {
  if (!(bytes instanceof Uint8Array)) return null;
  if (ext === 'jpg') return jpegSize(bytes);
  if (ext === 'png') return pngSize(bytes);
  if (ext === 'webp') return webpSize(bytes);
  return null;
}

export function aspectTooWide(width, height) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (!short || !long) return true;
  return long * 2 > short * 5;
}

/**
 * Accept a JPG, PNG, or WebP whose shorter side is at least 300
 * and whose long/short ratio is at most 2.5.
 */
export function assertReferenceImage(bytes) {
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw fail(bytes && bytes.byteLength > PHOTO_MAX_BYTES ? 'photo_too_large' : 'bad_photo');
  const size = readImageSize(bytes, sniffed.ext);
  if (!size) throw fail('bad_photo');
  const short = Math.min(size.width, size.height);
  if (short < MIN_SHORT_SIDE) throw fail('photo_too_small');
  if (aspectTooWide(size.width, size.height)) throw fail('photo_aspect');
  return { ...sniffed, width: size.width, height: size.height };
}

function putU16(bytes, offset, value) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function putU32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

/** Tiny valid header for tests. Dimensions are real; pixels are not. */
export function probeImage(kind, width, height, minBytes = 32) {
  const w = width >>> 0;
  const h = height >>> 0;
  let bytes;
  if (kind === 'png') {
    bytes = new Uint8Array(Math.max(minBytes, 24));
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    putU32(bytes, 16, w);
    putU32(bytes, 20, h);
  } else if (kind === 'webp') {
    bytes = new Uint8Array(Math.max(minBytes, 30));
    bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0]);
    const ww = Math.max(1, w) - 1;
    const hh = Math.max(1, h) - 1;
    bytes[24] = ww & 0xff;
    bytes[25] = (ww >> 8) & 0xff;
    bytes[26] = (ww >> 16) & 0xff;
    bytes[27] = hh & 0xff;
    bytes[28] = (hh >> 8) & 0xff;
    bytes[29] = (hh >> 16) & 0xff;
  } else {
    bytes = new Uint8Array(Math.max(minBytes, 20));
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    bytes[3] = 0xc0;
    putU16(bytes, 4, 11);
    bytes[6] = 8;
    putU16(bytes, 7, h);
    putU16(bytes, 9, w);
    bytes[11] = 1;
    bytes[12] = 1;
    bytes[13] = 0x11;
    if (bytes.length > 15) bytes[bytes.length - 2] = 0xff;
    if (bytes.length > 14) bytes[bytes.length - 1] = 0xd9;
  }
  return bytes;
}
