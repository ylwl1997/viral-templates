import { fail } from './segments.js';
/** Not-sent images-only body for one generation segment. No input video. */
export function formatAgnesCreatePayload(adapted, segmentId) {
    const segment = adapted.segments.find((item) => item.id === segmentId);
    if (!segment)
        throw fail('bad_segment');
    const images = adapted.images.map((image) => image.url).filter((url) => url);
    if (!images.length)
        throw fail('image_count');
    if (segment.prompt.includes('<Video') || /\bperson\b/i.test(segment.prompt))
        throw fail('bad_prompt');
    const mentioned = segment.prompt.match(/<Image \d+>/g) || [];
    if (!mentioned.length)
        throw fail('bad_prompt');
    for (const token of mentioned) {
        const index = Number(token.replace(/\D/g, ''));
        if (index < 1 || index > images.length)
            throw fail('bad_prompt');
    }
    return {
        sent: false,
        imagesOnly: true,
        segmentId,
        body: {
            model: 'agnes-video-2.5',
            prompt: segment.prompt,
            seconds: String(segment.promptSeconds),
            mode: 'reference',
            size: '720P',
            aspect_ratio: '9:16',
            images,
        },
    };
}
