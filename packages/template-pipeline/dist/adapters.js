import { adaptMetadata } from './metadata.js';
const TIME_CODE = /\d+(?:\.\d+)?s/g;
function codes(text) {
    return text.match(TIME_CODE) || [];
}
/** Deterministic rewrite. No network. */
export class MetadataVisionAdapter {
    adapt(pack, customerImages) {
        return adaptMetadata(pack, customerImages);
    }
}
function failClosed(base, raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return base;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return base;
    const record = parsed;
    if (JSON.stringify(record.shotBoundariesSec) !== JSON.stringify(base.shotBoundariesSec))
        return base;
    if (Number(record.sourceDurationSec) !== Number(base.sourceDurationSec))
        return base;
    if (!Array.isArray(record.segments) || record.segments.length !== base.segments.length)
        return base;
    const incoming = record.segments;
    const next = base.segments.map((segment, index) => {
        const item = incoming[index];
        if (!item || item.id !== segment.id || typeof item.prompt !== 'string')
            return null;
        if (Number(item.startSec) !== segment.startSec || Number(item.endSec) !== segment.endSec)
            return null;
        if (codes(item.prompt).join(',') !== codes(segment.prompt).join(','))
            return null;
        return { ...segment, prompt: item.prompt };
    });
    if (next.some((segment) => !segment))
        return base;
    return { ...base, segments: next };
}
/**
 * Optional vision rewrite. The site does not construct this unless a fetch
 * implementation is injected. Invalid JSON or moved time codes are discarded.
 */
export class AgnesVisionAdapter {
    fetchImpl;
    constructor(fetchImpl) {
        this.fetchImpl = fetchImpl;
    }
    async adapt(pack, customerImages) {
        const base = adaptMetadata(pack, customerImages);
        if (!this.fetchImpl)
            return base;
        try {
            const response = await this.fetchImpl('https://api.agnes-ai.cn/v1/chat/completions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ model: 'agnes-3.0-flash', packId: pack.id }),
            });
            const text = await response.text();
            return failClosed(base, text);
        }
        catch {
            return base;
        }
    }
}
