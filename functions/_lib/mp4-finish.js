/**
 * Finish a generated MP4 in this worker:
 * - copy the look's audio bed onto a clip that has no audio track
 * - append an XMP uuid box marking the file as algorithmically generated
 *
 * This does not re-encode. A fragmented MP4, or a file whose sample tables
 * we cannot rewrite, throws audio_mux so the job fails instead of shipping
 * a silent clip for a look that has music.
 */

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);
const XMP_UUID = Uint8Array.from([
  0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac,
]);

const XMP_PACKET = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">
   <dc:description>AI-generated video</dc:description>
   <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function copyBytes(bytes, start = 0, end = bytes.length) {
  const out = new Uint8Array(end - start);
  out.set(bytes.subarray(start, end));
  return out;
}

function asBytes(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 32) throw fail('audio_mux');
  return copyBytes(input);
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function typeAt(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function boxes(bytes, start, end) {
  const view = viewOf(bytes);
  const out = [];
  let p = start;
  while (p + 8 <= end) {
    let size = view.getUint32(p);
    let header = 8;
    if (size === 1) {
      if (p + 16 > end) break;
      const large = view.getBigUint64(p + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) throw fail('audio_mux');
      size = Number(large);
      header = 16;
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

function walk(bytes, start, end, fn) {
  for (const box of boxes(bytes, start, end)) {
    fn(box);
    if (CONTAINERS.has(box.type)) walk(bytes, box.contentStart, box.contentEnd, fn);
  }
}

function top(bytes, type) {
  return boxes(bytes, 0, bytes.length).find((box) => box.type === type) || null;
}

function findChild(bytes, parent, type) {
  return boxes(bytes, parent.contentStart, parent.contentEnd).find((box) => box.type === type) || null;
}

function findDescendant(bytes, parent, type) {
  let found = null;
  walk(bytes, parent.contentStart, parent.contentEnd, (box) => {
    if (!found && box.type === type) found = box;
  });
  return found;
}

function handlerOf(bytes, trak) {
  const mdia = findChild(bytes, trak, 'mdia');
  if (!mdia) return '';
  const hdlr = findChild(bytes, mdia, 'hdlr');
  if (!hdlr || hdlr.contentStart + 12 > bytes.length) return '';
  return typeAt(bytes, hdlr.contentStart + 8);
}

function findTrak(bytes, handler) {
  const moov = top(bytes, 'moov');
  if (!moov) return null;
  return (
    boxes(bytes, moov.contentStart, moov.contentEnd).find(
      (box) => box.type === 'trak' && handlerOf(bytes, box) === handler,
    ) || null
  );
}

export function mp4HasAudio(input) {
  try {
    const bytes = asBytes(input);
    return Boolean(findTrak(bytes, 'soun'));
  } catch {
    return false;
  }
}

function readEntries(bytes, box, width) {
  const view = viewOf(bytes);
  const count = view.getUint32(box.contentStart + 4);
  const entries = [];
  const base = box.contentStart + 8;
  for (let i = 0; i < count; i += 1) {
    const at = base + i * width;
    if (at + width > box.contentEnd) throw fail('audio_mux');
    if (width === 4) entries.push(view.getUint32(at));
    else {
      entries.push({
        first: view.getUint32(at),
        per: view.getUint32(at + 4),
        desc: view.getUint32(at + 8),
      });
    }
  }
  return entries;
}

function sampleRanges(bytes, trak) {
  const stbl = findDescendant(bytes, trak, 'stbl');
  if (!stbl) throw fail('audio_mux');
  const stscBox = findChild(bytes, stbl, 'stsc');
  const stszBox = findChild(bytes, stbl, 'stsz');
  const stcoBox = findChild(bytes, stbl, 'stco');
  if (!stscBox || !stszBox || !stcoBox) throw fail('audio_mux');
  if (findChild(bytes, stbl, 'co64')) throw fail('audio_mux');
  const stsc = readEntries(bytes, stscBox, 12);
  const chunks = readEntries(bytes, stcoBox, 4);
  if (!stsc.length || !chunks.length) throw fail('audio_mux');
  const view = viewOf(bytes);
  const uniform = view.getUint32(stszBox.contentStart + 4);
  const sampleCount = view.getUint32(stszBox.contentStart + 8);
  const sizes = [];
  if (uniform) {
    for (let i = 0; i < sampleCount; i += 1) sizes.push(uniform);
  } else {
    const base = stszBox.contentStart + 12;
    for (let i = 0; i < sampleCount; i += 1) {
      const at = base + i * 4;
      if (at + 4 > stszBox.contentEnd) throw fail('audio_mux');
      sizes.push(view.getUint32(at));
    }
  }
  const perChunk = new Array(chunks.length);
  let idx = 0;
  for (let chunk = 1; chunk <= chunks.length; chunk += 1) {
    while (idx + 1 < stsc.length && stsc[idx + 1].first <= chunk) idx += 1;
    perChunk[chunk - 1] = stsc[idx].per;
  }
  const ranges = [];
  let sample = 0;
  for (let c = 0; c < chunks.length; c += 1) {
    let offset = chunks[c];
    const count = perChunk[c];
    if (!count) throw fail('audio_mux');
    for (let i = 0; i < count; i += 1) {
      if (sample >= sizes.length) throw fail('audio_mux');
      const size = sizes[sample];
      if (offset + size > bytes.length) throw fail('audio_mux');
      ranges.push({ start: offset, size });
      offset += size;
      sample += 1;
    }
  }
  if (sample !== sizes.length) throw fail('audio_mux');
  return ranges;
}

export function audioPayload(input) {
  const bytes = asBytes(input);
  const trak = findTrak(bytes, 'soun');
  if (!trak) return null;
  const ranges = sampleRanges(bytes, trak);
  const total = ranges.reduce((sum, range) => sum + range.size, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const range of ranges) {
    out.set(bytes.subarray(range.start, range.start + range.size), p);
    p += range.size;
  }
  return out;
}

function ascii(text) {
  return Uint8Array.from(text, (ch) => ch.charCodeAt(0));
}

function makeStco(offset) {
  const box = new Uint8Array(20);
  const view = new DataView(box.buffer);
  view.setUint32(0, 20);
  box.set(ascii('stco'), 4);
  view.setUint32(12, 1);
  view.setUint32(16, offset >>> 0);
  return box;
}

function makeStsc(samples) {
  const box = new Uint8Array(28);
  const view = new DataView(box.buffer);
  view.setUint32(0, 28);
  box.set(ascii('stsc'), 4);
  view.setUint32(12, 1);
  view.setUint32(16, 1);
  view.setUint32(20, samples >>> 0);
  view.setUint32(24, 1);
  return box;
}

function replaceBox(bytes, box, next) {
  if (next.length > box.size) throw fail('audio_mux');
  bytes.set(next, box.start);
  const rest = box.size - next.length;
  if (!rest) return;
  if (rest < 8) throw fail('audio_mux');
  const view = viewOf(bytes);
  view.setUint32(box.start + next.length, rest);
  bytes.set(ascii('free'), box.start + next.length + 4);
}

function shiftChunkOffsets(bytes, delta, threshold) {
  const moov = top(bytes, 'moov');
  if (!moov) throw fail('audio_mux');
  const view = viewOf(bytes);
  walk(bytes, moov.contentStart, moov.contentEnd, (box) => {
    if (box.type === 'co64') throw fail('audio_mux');
    if (box.type !== 'stco') return;
    const count = view.getUint32(box.contentStart + 4);
    for (let i = 0; i < count; i += 1) {
      const at = box.contentStart + 8 + i * 4;
      const value = view.getUint32(at);
      if (value < threshold) continue;
      const moved = value + delta;
      if (moved < 0 || moved > 0xffffffff) throw fail('audio_mux');
      view.setUint32(at, moved >>> 0);
    }
  });
}

function trackId(bytes, trak) {
  const tkhd = findChild(bytes, trak, 'tkhd');
  if (!tkhd) return 0;
  const view = viewOf(bytes);
  const version = bytes[tkhd.contentStart];
  const at = version === 1 ? tkhd.contentStart + 20 : tkhd.contentStart + 12;
  if (at + 4 > tkhd.contentEnd) return 0;
  return view.getUint32(at);
}

function setTrackId(bytes, trak, id) {
  const tkhd = findChild(bytes, trak, 'tkhd');
  if (!tkhd) throw fail('audio_mux');
  const version = bytes[tkhd.contentStart];
  const at = version === 1 ? tkhd.contentStart + 20 : tkhd.contentStart + 12;
  viewOf(bytes).setUint32(at, id >>> 0);
}

function patchMovieHeader(bytes, audioTrak) {
  const moov = top(bytes, 'moov');
  const mvhd = moov && findChild(bytes, moov, 'mvhd');
  const mdhd = audioTrak && findDescendant(bytes, audioTrak, 'mdhd');
  if (!mvhd || !mdhd) return;
  const view = viewOf(bytes);
  const movieVersion = bytes[mvhd.contentStart];
  const audioVersion = bytes[mdhd.contentStart];
  const movieScaleAt = movieVersion === 1 ? mvhd.contentStart + 20 : mvhd.contentStart + 12;
  const movieDurAt = movieVersion === 1 ? mvhd.contentStart + 24 : mvhd.contentStart + 16;
  const audioScaleAt = audioVersion === 1 ? mdhd.contentStart + 20 : mdhd.contentStart + 12;
  const audioDurAt = audioVersion === 1 ? mdhd.contentStart + 24 : mdhd.contentStart + 16;
  const movieScale = view.getUint32(movieScaleAt);
  const audioScale = view.getUint32(audioScaleAt);
  if (!movieScale || !audioScale) return;
  const audioDur = audioVersion === 1 ? Number(view.getBigUint64(audioDurAt)) : view.getUint32(audioDurAt);
  const movieDur = movieVersion === 1 ? Number(view.getBigUint64(movieDurAt)) : view.getUint32(movieDurAt);
  const converted = Math.round((audioDur * movieScale) / audioScale);
  const next = Math.max(movieDur, converted);
  if (movieVersion === 1) view.setBigUint64(movieDurAt, BigInt(next));
  else if (next <= 0xffffffff) view.setUint32(movieDurAt, next >>> 0);
  if (movieVersion === 0 && mvhd.contentStart + 100 <= mvhd.contentEnd) {
    const ids = boxes(bytes, moov.contentStart, moov.contentEnd)
      .filter((box) => box.type === 'trak')
      .map((box) => trackId(bytes, box));
    const maxId = ids.reduce((max, id) => Math.max(max, id), 0);
    view.setUint32(mvhd.contentStart + 96, (maxId + 1) >>> 0);
  }
}

function prepareAudioTrak(music, dataOffset) {
  const source = findTrak(music, 'soun');
  if (!source) throw fail('no_music');
  const ranges = sampleRanges(music, source);
  const total = ranges.reduce((sum, range) => sum + range.size, 0);
  const payload = new Uint8Array(total);
  let cursor = 0;
  for (const range of ranges) {
    payload.set(music.subarray(range.start, range.start + range.size), cursor);
    cursor += range.size;
  }
  const trak = copyBytes(music, source.start, source.start + source.size);
  const local = { start: 0, size: trak.length, header: source.header, contentStart: source.header, contentEnd: trak.length };
  const stbl = findDescendant(trak, local, 'stbl');
  const stco = findChild(trak, stbl, 'stco');
  const stsc = findChild(trak, stbl, 'stsc');
  if (!stco || !stsc) throw fail('audio_mux');
  replaceBox(trak, stco, makeStco(dataOffset));
  replaceBox(trak, stsc, makeStsc(ranges.length));
  return trak;
}

/**
 * Copy the music file's audio track onto a video that has none.
 * Returns the video unchanged when it already has audio.
 */
export function muxStyleAudio(videoInput, musicInput) {
  const video = asBytes(videoInput);
  const music = asBytes(musicInput);
  if (top(video, 'moof') || top(music, 'moof')) throw fail('audio_mux');
  if (!findTrak(music, 'soun')) throw fail('no_music');
  if (findTrak(video, 'soun')) return copyBytes(video);
  const moov = top(video, 'moov');
  if (!moov || moov.header !== 8) throw fail('audio_mux');
  const insertAt = moov.start + moov.size;
  const draft = prepareAudioTrak(music, 0);
  const dataOffset = video.length + draft.length + 8;
  if (dataOffset > 0xffffffff) throw fail('audio_mux');
  const audioTrak = prepareAudioTrak(music, dataOffset);
  const ids = boxes(video, moov.contentStart, moov.contentEnd)
    .filter((box) => box.type === 'trak')
    .map((box) => trackId(video, box));
  const nextId = ids.reduce((max, id) => Math.max(max, id), 0) + 1;
  const localTrak = {
    start: 0,
    size: audioTrak.length,
    header: 8,
    contentStart: 8,
    contentEnd: audioTrak.length,
  };
  setTrackId(audioTrak, localTrak, nextId || 2);
  const shifted = copyBytes(video);
  shiftChunkOffsets(shifted, audioTrak.length, insertAt);
  const payload = audioPayload(music);
  const mdatSize = 8 + payload.length;
  const out = new Uint8Array(shifted.length + audioTrak.length + mdatSize);
  out.set(shifted.subarray(0, insertAt), 0);
  out.set(audioTrak, insertAt);
  out.set(shifted.subarray(insertAt), insertAt + audioTrak.length);
  const outView = viewOf(out);
  const grown = outView.getUint32(moov.start) + audioTrak.length;
  if (grown > 0xffffffff) throw fail('audio_mux');
  outView.setUint32(moov.start, grown >>> 0);
  const mdatAt = shifted.length + audioTrak.length;
  outView.setUint32(mdatAt, mdatSize);
  out.set(ascii('mdat'), mdatAt + 4);
  out.set(payload, mdatAt + 8);
  const placed = findTrak(out, 'soun');
  patchMovieHeader(out, placed);
  if (!mp4HasAudio(out)) throw fail('audio_mux');
  return out;
}

export function stampAiGenerated(input) {
  const bytes = asBytes(input);
  const packet = new TextEncoder().encode(XMP_PACKET);
  const box = new Uint8Array(8 + XMP_UUID.length + packet.length);
  const view = new DataView(box.buffer);
  view.setUint32(0, box.length);
  box.set(ascii('uuid'), 4);
  box.set(XMP_UUID, 8);
  box.set(packet, 8 + XMP_UUID.length);
  const out = new Uint8Array(bytes.length + box.length);
  out.set(bytes, 0);
  out.set(box, bytes.length);
  return out;
}

export function xmpDeclaresAi(input) {
  const bytes = asBytes(input);
  const marker = new TextEncoder().encode('trainedAlgorithmicMedia');
  outer: for (let i = 0; i + marker.length <= bytes.length; i += 1) {
    for (let j = 0; j < marker.length; j += 1) {
      if (bytes[i + j] !== marker[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Add the look's audio when the clip has none, then label the file.
 * A music file with no audio track is treated as a silent look.
 */
export function finishGeneratedMp4(videoBytes, musicBytes) {
  let video = asBytes(videoBytes);
  if (musicBytes && musicBytes.byteLength) {
    const music = asBytes(musicBytes);
    if (mp4HasAudio(music) && !mp4HasAudio(video)) {
      try {
        video = muxStyleAudio(video, music);
      } catch (err) {
        if (err && err.code === 'no_music') {
          /* silent look */
        } else {
          throw err && err.code ? err : fail('audio_mux');
        }
      }
    }
  }
  const labeled = stampAiGenerated(video);
  if (!xmpDeclaresAi(labeled)) throw fail('audio_mux');
  return labeled;
}

/** Drop the audio track. Used to prove the mux round-trips a real look. */
export function withoutAudioTrack(input) {
  const bytes = asBytes(input);
  const trak = findTrak(bytes, 'soun');
  if (!trak) return copyBytes(bytes);
  const moov = top(bytes, 'moov');
  if (!moov || trak.start < moov.start || trak.contentEnd > moov.contentEnd) throw fail('audio_mux');
  const out = new Uint8Array(bytes.length - trak.size);
  out.set(bytes.subarray(0, trak.start), 0);
  out.set(bytes.subarray(trak.start + trak.size), trak.start);
  const view = viewOf(out);
  view.setUint32(moov.start, (view.getUint32(moov.start) - trak.size) >>> 0);
  shiftChunkOffsets(out, -trak.size, trak.start);
  return out;
}
