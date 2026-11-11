/**
 * Cut and join progressive MP4s without re-encoding.
 * A long template is cut on keyframes into 4–12s pieces. Each piece is its
 * own Agnes input. Finished pieces are joined back into one clip when they
 * share a codec family, frame size, and timescale. Byte-identical stsd or
 * avcC is not required. Fragmented files and 64-bit chunk offsets are refused
 * so the caller can fall back instead of shipping a broken segment.
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

function segmentFail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function typeAt(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readBoxes(bytes, start, end) {
  const view = viewOf(bytes);
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      const large = view.getBigUint64(p + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw segmentFail('segment_media');
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < header || p + size > end) break;
    out.push({
      type: typeAt(bytes, p + 4),
      start: p,
      size,
      header,
      contentStart: p + header,
      contentEnd: p + size,
    });
    p += size;
  }
  return out;
}

function findChild(bytes, parent, type) {
  const start = parent ? parent.contentStart : 0;
  const end = parent ? parent.contentEnd : bytes.length;
  return readBoxes(bytes, start, end).find((box) => box.type === type) || null;
}

function findDescendant(bytes, parent, type) {
  const start = parent ? parent.contentStart : 0;
  const end = parent ? parent.contentEnd : bytes.length;
  const stack = readBoxes(bytes, start, end);
  while (stack.length) {
    const box = stack.shift();
    if (box.type === type) return box;
    if (CONTAINERS.has(box.type)) stack.push(...readBoxes(bytes, box.contentStart, box.contentEnd));
  }
  return null;
}

function sliceBox(bytes, box) {
  return bytes.slice(box.start, box.contentEnd);
}

function handlerOf(bytes, trak) {
  const hdlr = findDescendant(bytes, trak, 'hdlr');
  if (!hdlr || hdlr.contentStart + 12 > bytes.length) return '';
  return typeAt(bytes, hdlr.contentStart + 8);
}

function readEntries(bytes, box, width) {
  const view = viewOf(bytes);
  const count = view.getUint32(box.contentStart + 4);
  if (count > 200000) throw segmentFail('segment_media');
  const entries = [];
  const base = box.contentStart + 8;
  for (let i = 0; i < count; i += 1) {
    const at = base + i * width;
    if (at + width > box.contentEnd) throw segmentFail('segment_media');
    if (width === 4) entries.push(view.getUint32(at));
    else if (width === 8) entries.push([view.getUint32(at), view.getInt32(at + 4)]);
    else entries.push({ first: view.getUint32(at), per: view.getUint32(at + 4), desc: view.getUint32(at + 8) });
  }
  return entries;
}

function expandPairs(pairs, signed) {
  const out = [];
  for (const [count, value] of pairs) {
    if (count > 200000) throw segmentFail('segment_media');
    for (let i = 0; i < count; i += 1) out.push(signed ? value : value >>> 0);
  }
  return out;
}

function trackSamples(bytes, trak) {
  const stbl = findDescendant(bytes, trak, 'stbl');
  if (!stbl) throw segmentFail('segment_media');
  const stscBox = findChild(bytes, stbl, 'stsc');
  const stszBox = findChild(bytes, stbl, 'stsz');
  const stcoBox = findChild(bytes, stbl, 'stco');
  const sttsBox = findChild(bytes, stbl, 'stts');
  if (!stscBox || !stszBox || !stcoBox || !sttsBox) throw segmentFail('segment_media');
  if (findChild(bytes, stbl, 'co64')) throw segmentFail('segment_media');
  const stsc = readEntries(bytes, stscBox, 12);
  const chunks = readEntries(bytes, stcoBox, 4);
  const deltas = expandPairs(readEntries(bytes, sttsBox, 8), false);
  const cttsBox = findChild(bytes, stbl, 'ctts');
  const offsets = cttsBox ? expandPairs(readEntries(bytes, cttsBox, 8), true) : deltas.map(() => 0);
  const stssBox = findChild(bytes, stbl, 'stss');
  const syncSet = new Set(stssBox ? readEntries(bytes, stssBox, 4) : []);
  const view = viewOf(bytes);
  const uniform = view.getUint32(stszBox.contentStart + 4);
  const sampleCount = view.getUint32(stszBox.contentStart + 8);
  if (!sampleCount || sampleCount !== deltas.length) throw segmentFail('segment_media');
  const sizes = [];
  if (uniform) {
    for (let i = 0; i < sampleCount; i += 1) sizes.push(uniform);
  } else {
    for (let i = 0; i < sampleCount; i += 1) sizes.push(view.getUint32(stszBox.contentStart + 12 + i * 4));
  }
  const perChunk = new Array(chunks.length);
  let idx = 0;
  for (let chunk = 1; chunk <= chunks.length; chunk += 1) {
    while (idx + 1 < stsc.length && stsc[idx + 1].first <= chunk) idx += 1;
    perChunk[chunk - 1] = stsc[idx].per;
  }
  const samples = [];
  let sample = 0;
  let ticks = 0;
  for (let c = 0; c < chunks.length; c += 1) {
    let offset = chunks[c];
    const count = perChunk[c];
    if (!count) throw segmentFail('segment_media');
    for (let i = 0; i < count; i += 1) {
      if (sample >= sizes.length) throw segmentFail('segment_media');
      const size = sizes[sample];
      if (offset + size > bytes.length) throw segmentFail('segment_media');
      samples.push({
        offset,
        size,
        delta: deltas[sample],
        ctts: offsets[sample] || 0,
        sync: syncSet.size ? syncSet.has(sample + 1) : true,
        time: ticks,
      });
      offset += size;
      ticks += deltas[sample];
      sample += 1;
    }
  }
  if (sample !== sizes.length) throw segmentFail('segment_media');
  return samples;
}

function trackMeta(bytes, trak) {
  const mdhd = findDescendant(bytes, trak, 'mdhd');
  const hdlr = findDescendant(bytes, trak, 'hdlr');
  const stsd = findDescendant(bytes, trak, 'stsd');
  const tkhd = findChild(bytes, trak, 'tkhd');
  const vmhd = findDescendant(bytes, trak, 'vmhd');
  const smhd = findDescendant(bytes, trak, 'smhd');
  const dinf = findDescendant(bytes, trak, 'dinf');
  if (!mdhd || !hdlr || !stsd || !tkhd || !dinf || (!vmhd && !smhd)) throw segmentFail('segment_media');
  const timing = mediaTiming(bytes, mdhd);
  if (!timing) throw segmentFail('segment_media');
  return {
    handler: handlerOf(bytes, trak),
    timescale: timing.scale,
    editMediaTime: editMediaTime(bytes, trak),
    tkhd: sliceBox(bytes, tkhd),
    hdlr: sliceBox(bytes, hdlr),
    stsd: sliceBox(bytes, stsd),
    mediaHeader: sliceBox(bytes, vmhd || smhd),
    dinf: sliceBox(bytes, dinf),
    samples: trackSamples(bytes, trak),
  };
}

/** First edit-list media time, in this track's timescale. 0 when there is no edit. */
function editMediaTime(bytes, trak) {
  const edts = findChild(bytes, trak, 'edts');
  const elst = edts ? findChild(bytes, edts, 'elst') : null;
  if (!elst || elst.contentStart + 16 > elst.contentEnd) return 0;
  const view = viewOf(bytes);
  const version = bytes[elst.contentStart];
  const count = view.getUint32(elst.contentStart + 4);
  if (!count) return 0;
  const at = elst.contentStart + 8;
  if (version === 1) {
    if (at + 20 > elst.contentEnd) return 0;
    const mediaTime = Number(view.getBigInt64(at + 8));
    return mediaTime > 0 ? mediaTime : 0;
  }
  if (at + 12 > elst.contentEnd) return 0;
  const mediaTime = view.getInt32(at + 4);
  return mediaTime > 0 ? mediaTime : 0;
}

/** Drop leading audio samples that an edit list marks as encoder delay. */
function trimAudioPriming(samples, mediaTime) {
  if (!mediaTime || mediaTime < 0) return samples;
  let dropped = 0;
  let index = 0;
  while (index < samples.length && dropped + samples[index].delta <= mediaTime) {
    dropped += samples[index].delta;
    index += 1;
  }
  return index ? samples.slice(index) : samples;
}

function mediaTiming(bytes, box) {
  if (!box || box.contentStart + 20 > bytes.length) return null;
  const view = viewOf(bytes);
  const version = bytes[box.contentStart];
  const scaleAt = version === 1 ? box.contentStart + 20 : box.contentStart + 12;
  const durAt = version === 1 ? box.contentStart + 24 : box.contentStart + 16;
  if (durAt + (version === 1 ? 8 : 4) > box.contentEnd) return null;
  const scale = view.getUint32(scaleAt);
  if (!scale) return null;
  const duration = version === 1 ? Number(view.getBigUint64(durAt)) : view.getUint32(durAt);
  return { scale, duration };
}

function parseMovie(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32) throw segmentFail('segment_media');
  const top = readBoxes(bytes, 0, bytes.byteLength);
  const ftyp = top.find((box) => box.type === 'ftyp');
  const moov = top.find((box) => box.type === 'moov');
  if (!ftyp || !moov) throw segmentFail('segment_media');
  const mvhd = findChild(bytes, moov, 'mvhd');
  const movie = mediaTiming(bytes, mvhd);
  if (!movie) throw segmentFail('segment_media');
  const tracks = readBoxes(bytes, moov.contentStart, moov.contentEnd)
    .filter((box) => box.type === 'trak')
    .map((trak) => trackMeta(bytes, trak))
    .filter((track) => track.handler === 'vide' || track.handler === 'soun');
  const video = tracks.find((track) => track.handler === 'vide');
  const audio = tracks.find((track) => track.handler === 'soun');
  if (!video) throw segmentFail('segment_media');
  return {
    bytes,
    ftyp: sliceBox(bytes, ftyp),
    movieScale: movie.scale,
    video,
    audio: audio || null,
  };
}

function box(type, payload) {
  const out = new Uint8Array(8 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, out.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(payload, 8);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function patchDuration(header, seconds, movieScale) {
  const out = header.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const version = out[8];
  const ticks = Math.max(1, Math.round(seconds * movieScale));
  if (version === 1) {
    view.setBigUint64(8 + 28, BigInt(ticks));
  } else {
    if (ticks > 0xffffffff) throw segmentFail('segment_media');
    view.setUint32(8 + 20, ticks);
  }
  return out;
}

function mdhd(timescale, ticks) {
  const payload = new Uint8Array(24);
  const view = new DataView(payload.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, ticks >>> 0);
  view.setUint16(20, 0x55c4);
  return box('mdhd', payload);
}

function runLength(values, signed) {
  const runs = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && last.value === value) last.count += 1;
    else runs.push({ count: 1, value });
  }
  const payload = new Uint8Array(8 + runs.length * 8);
  const view = new DataView(payload.buffer);
  view.setUint32(4, runs.length);
  runs.forEach((run, i) => {
    view.setUint32(8 + i * 8, run.count);
    if (signed) view.setInt32(12 + i * 8, run.value);
    else view.setUint32(12 + i * 8, run.value >>> 0);
  });
  return payload;
}

function fullElst(movieTicks, mediaTime) {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setUint32(4, 1);
  view.setUint32(8, movieTicks >>> 0);
  view.setInt32(12, mediaTime | 0);
  view.setUint32(16, 0x00010000);
  return box('elst', payload);
}

function tableEntries(samples, chunkOffset) {
  const deltas = samples.map((sample) => sample.delta);
  const ctss = samples.map((sample) => sample.ctts || 0);
  const stts = box('stts', runLength(deltas, false));
  const tables = [stts];
  if (ctss.some((value) => value !== 0)) tables.push(box('ctts', runLength(ctss, true)));
  const syncs = [];
  samples.forEach((sample, index) => {
    if (sample.sync) syncs.push(index + 1);
  });
  if (syncs.length && syncs.length < samples.length) {
    const payload = new Uint8Array(8 + syncs.length * 4);
    const view = new DataView(payload.buffer);
    view.setUint32(4, syncs.length);
    syncs.forEach((sample, index) => view.setUint32(8 + index * 4, sample));
    tables.push(box('stss', payload));
  }
  const stsc = new Uint8Array(20);
  const stscView = new DataView(stsc.buffer);
  stscView.setUint32(4, 1);
  stscView.setUint32(8, 1);
  stscView.setUint32(12, samples.length);
  stscView.setUint32(16, 1);
  tables.push(box('stsc', stsc));
  const stsz = new Uint8Array(12 + samples.length * 4);
  const stszView = new DataView(stsz.buffer);
  stszView.setUint32(8, samples.length);
  samples.forEach((sample, index) => stszView.setUint32(12 + index * 4, sample.size));
  tables.push(box('stsz', stsz));
  const stco = new Uint8Array(12);
  const stcoView = new DataView(stco.buffer);
  stcoView.setUint32(4, 1);
  stcoView.setUint32(8, chunkOffset >>> 0);
  tables.push(box('stco', stco));
  return tables;
}

function sampleTable(meta, samples, chunkOffset) {
  return box('stbl', concatBytes([meta.stsd, ...tableEntries(samples, chunkOffset)]));
}

function buildTrack(meta, samples, movieScale, chunkOffset) {
  const ticks = samples.reduce((sum, sample) => sum + sample.delta, 0);
  if (!ticks || ticks > 0xffffffff) throw segmentFail('segment_media');
  const seconds = ticks / meta.timescale;
  const movieTicks = Math.max(1, Math.round(seconds * movieScale));
  const tkhd = patchDuration(meta.tkhd, seconds, movieScale);
  const firstCtts = samples[0].ctts || 0;
  const edts = firstCtts > 0 ? box('edts', fullElst(movieTicks, firstCtts)) : new Uint8Array(0);
  const minf = box('minf', concatBytes([meta.mediaHeader, meta.dinf, sampleTable(meta, samples, chunkOffset)]));
  const mdia = box('mdia', concatBytes([mdhd(meta.timescale, ticks), meta.hdlr, minf]));
  return { box: box('trak', concatBytes([tkhd, edts, mdia])), bytes: samples.reduce((sum, sample) => sum + sample.size, 0), seconds };
}

function mvhd(movieScale, seconds, nextTrack) {
  const payload = new Uint8Array(100);
  const view = new DataView(payload.buffer);
  view.setUint32(12, movieScale);
  const ticks = Math.max(1, Math.round(seconds * movieScale));
  if (ticks > 0xffffffff) throw segmentFail('segment_media');
  view.setUint32(16, ticks);
  view.setUint32(20, 0x00010000);
  view.setUint16(24, 0x0100);
  view.setUint32(36, 0x00010000);
  view.setUint32(52, 0x00010000);
  view.setUint32(68, 0x40000000);
  view.setUint32(96, nextTrack);
  return box('mvhd', payload);
}

function assemble(source, tracks) {
  const movieScale = source.movieScale || 1000;
  // Placeholder offsets. stco is a fixed size, so the moov size does not change when patched.
  const built = tracks.map((track) => buildTrack(track.meta, track.samples, movieScale, 0));
  const seconds = Math.max(...built.map((track) => track.seconds));
  let moov = box('moov', concatBytes([mvhd(movieScale, seconds, tracks.length + 1), ...built.map((track) => track.box)]));
  const mdatPayload = tracks.reduce((sum, track) => sum + track.samples.reduce((inner, sample) => inner + sample.size, 0), 0);
  const mdatStart = source.ftyp.length + moov.length + 8;
  let cursor = mdatStart;
  const offsets = tracks.map((track) => {
    const at = cursor;
    cursor += track.samples.reduce((sum, sample) => sum + sample.size, 0);
    return at;
  });
  moov = box('moov', concatBytes([mvhd(movieScale, seconds, tracks.length + 1), ...tracks.map((track, index) => buildTrack(track.meta, track.samples, movieScale, offsets[index]).box)]));
  const payload = new Uint8Array(mdatPayload);
  let writeAt = 0;
  for (const track of tracks) {
    for (const sample of track.samples) {
      payload.set(source.bytes.subarray(sample.offset, sample.offset + sample.size), writeAt);
      writeAt += sample.size;
    }
  }
  const mdat = new Uint8Array(8 + payload.length);
  const view = new DataView(mdat.buffer);
  view.setUint32(0, mdat.length);
  mdat.set([0x6d, 0x64, 0x61, 0x74], 4);
  mdat.set(payload, 8);
  if (mdat.length > 0xffffffff) throw segmentFail('segment_media');
  return concatBytes([source.ftyp, moov, mdat]);
}

function takeRange(samples, timescale, start, end, requireSync) {
  const startTick = Math.round(start * timescale);
  const endTick = Math.round(end * timescale);
  const selected = samples.filter((sample) => sample.time >= startTick && sample.time < endTick);
  if (!selected.length) throw segmentFail('segment_media');
  if (requireSync && !selected[0].sync) throw segmentFail('segment_media');
  return selected;
}

/**
 * Bytes for the half-open media range [startSec, endSec).
 * The video range must start on a sync sample.
 */
export function cutReferenceMp4(bytes, startSec, endSec) {
  const movie = parseMovie(bytes);
  const video = takeRange(movie.video.samples, movie.video.timescale, startSec, endSec, true);
  const tracks = [{ meta: movie.video, samples: video }];
  if (movie.audio) {
    const audio = takeRange(movie.audio.samples, movie.audio.timescale, startSec, endSec, false);
    tracks.push({ meta: movie.audio, samples: audio });
  }
  // Sample payloads still point at the source file.
  const assembled = assemble({ ...movie, bytes }, tracks);
  return assembled;
}

function codecFamily(type) {
  if (type === 'avc1' || type === 'avc3') return 'avc';
  if (type === 'hvc1' || type === 'hev1') return 'hevc';
  if (type === 'mp4a') return 'aac';
  return type || '';
}

/** Sample entry fourcc inside an stsd box. */
function sampleEntryType(stsd) {
  if (!stsd || stsd.length < 24) return '';
  const count = new DataView(stsd.buffer, stsd.byteOffset, stsd.byteLength).getUint32(12);
  if (count !== 1) return '';
  return typeAt(stsd, 20);
}

function videoSize(stsd) {
  if (!stsd || stsd.length < 16 + 36) return null;
  const view = new DataView(stsd.buffer, stsd.byteOffset, stsd.byteLength);
  const width = view.getUint16(16 + 32);
  const height = view.getUint16(16 + 34);
  if (!width || !height) return null;
  return { width, height };
}

function audioLayout(stsd) {
  if (!stsd || stsd.length < 16 + 36) return null;
  const view = new DataView(stsd.buffer, stsd.byteOffset, stsd.byteLength);
  // Version 0 audio sample entry. Version 1/2 inserts extra fields.
  if (view.getUint16(16 + 16) !== 0) return null;
  const channels = view.getUint16(16 + 24);
  const rate = view.getUint32(16 + 32) >>> 16;
  if (!channels || !rate) return null;
  return { channels, rate };
}

/**
 * Two generated pieces can be remuxed when codec family, frame size, and
 * timescale match. Independent encodes often differ in stsd/avcC bytes
 * (bitrate boxes, parameter-set padding) and still concatenate.
 */
function tracksCompatible(a, b, kind) {
  if (!a || !b || a.timescale !== b.timescale) return false;
  const familyA = codecFamily(sampleEntryType(a.stsd));
  const familyB = codecFamily(sampleEntryType(b.stsd));
  if (!familyA || familyA !== familyB) return false;
  if (kind === 'video') {
    const sizeA = videoSize(a.stsd);
    const sizeB = videoSize(b.stsd);
    return Boolean(sizeA && sizeB && sizeA.width === sizeB.width && sizeA.height === sizeB.height);
  }
  const layoutA = audioLayout(a.stsd);
  const layoutB = audioLayout(b.stsd);
  return Boolean(layoutA && layoutB && layoutA.channels === layoutB.channels && layoutA.rate === layoutB.rate);
}

/** Join generated pieces that share codec family, size, and timescale. */
export function concatMp4(parts) {
  if (!Array.isArray(parts) || parts.length < 2) throw segmentFail('segment_media');
  const movies = parts.map((part) => parseMovie(part));
  const first = movies[0];
  for (const movie of movies) {
    if (!tracksCompatible(movie.video, first.video, 'video')) throw segmentFail('segment_media');
    if (first.audio) {
      if (!tracksCompatible(movie.audio, first.audio, 'audio')) throw segmentFail('segment_media');
    }
  }
  return assembleWithSources(first, movies);
}

function assembleWithSources(first, movies) {
  // Samples keep the offset into their own source. Tag each sample with its bytes.
  const video = [];
  const audio = [];
  for (const movie of movies) {
    for (const sample of movie.video.samples) video.push({ ...sample, file: movie.bytes });
    if (first.audio && movie.audio) {
      // Each generated piece hides one AAC priming frame in its edit list.
      // Keeping both would put a silent frame at the junction.
      const trimmed = trimAudioPriming(movie.audio.samples, movie.audio.editMediaTime);
      for (const sample of trimmed) audio.push({ ...sample, file: movie.bytes });
    }
  }
  const joined = [
    { meta: first.video, samples: video },
    ...(first.audio ? [{ meta: first.audio, samples: audio }] : []),
  ];
  return assembleSources(first, joined);
}

function assembleSources(source, tracks) {
  const movieScale = source.movieScale || 1000;
  const built = tracks.map((track) => buildTrack(track.meta, track.samples, movieScale, 0));
  const seconds = Math.max(...built.map((track) => track.seconds));
  const probeMoov = box('moov', concatBytes([mvhd(movieScale, seconds, tracks.length + 1), ...built.map((track) => track.box)]));
  const mdatPayload = tracks.reduce((sum, track) => sum + track.samples.reduce((inner, sample) => inner + sample.size, 0), 0);
  const mdatStart = source.ftyp.length + probeMoov.length + 8;
  let cursor = mdatStart;
  const offsets = tracks.map((track) => {
    const at = cursor;
    cursor += track.samples.reduce((sum, sample) => sum + sample.size, 0);
    return at;
  });
  const moov = box(
    'moov',
    concatBytes([
      mvhd(movieScale, seconds, tracks.length + 1),
      ...tracks.map((track, index) => buildTrack(track.meta, track.samples, movieScale, offsets[index]).box),
    ]),
  );
  const payload = new Uint8Array(mdatPayload);
  let writeAt = 0;
  for (const track of tracks) {
    for (const sample of track.samples) {
      const file = sample.file || source.bytes;
      payload.set(file.subarray(sample.offset, sample.offset + sample.size), writeAt);
      writeAt += sample.size;
    }
  }
  const mdat = new Uint8Array(8 + payload.length);
  new DataView(mdat.buffer).setUint32(0, mdat.length);
  mdat.set([0x6d, 0x64, 0x61, 0x74], 4);
  mdat.set(payload, 8);
  return concatBytes([source.ftyp, moov, mdat]);
}
