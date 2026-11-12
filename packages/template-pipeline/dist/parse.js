import { fail } from './segments.js';
function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function segmentOf(value, index) {
    if (!isObject(value))
        throw fail('bad_pack');
    const startSec = Number(value.startSec);
    const endSec = Number(value.endSec);
    const durationSec = Number(value.durationSec);
    const promptSeconds = Number(value.promptSeconds);
    const prompts = isObject(value.variantPrompts) ? value.variantPrompts : null;
    const timed = prompts && typeof prompts['timed-beats'] === 'string' ? prompts['timed-beats'] : '';
    const locked = prompts && typeof prompts['locked-segment'] === 'string' ? prompts['locked-segment'] : '';
    if (!timed || !locked)
        throw fail('bad_pack');
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec)
        throw fail('bad_pack');
    if (Math.abs(endSec - startSec - durationSec) > 0.02)
        throw fail('bad_pack');
    if (durationSec < 3.99 || durationSec > 12.01)
        throw fail('bad_pack');
    if (!Number.isInteger(promptSeconds) || promptSeconds < 4 || promptSeconds > 12)
        throw fail('bad_pack');
    return {
        id: typeof value.id === 'string' && value.id ? value.id : `segment-${index + 1}`,
        startSec,
        endSec,
        durationSec,
        promptSeconds,
        beatIds: Array.isArray(value.beatIds) ? value.beatIds.filter((id) => typeof id === 'string') : undefined,
        variantPrompts: { 'timed-beats': timed, 'locked-segment': locked },
        script: isObject(value.script) ? value.script : undefined,
    };
}
export function parseTemplatePack(input) {
    if (!isObject(input))
        throw fail('bad_pack');
    if (input.schemaVersion !== '1.0.0')
        throw fail('bad_pack');
    if (input.aspectRatio !== '9:16')
        throw fail('bad_pack');
    if (typeof input.id !== 'string' || !input.id)
        throw fail('bad_pack');
    const sourceDurationSec = Number(input.sourceDurationSec);
    if (!Number.isFinite(sourceDurationSec) || sourceDurationSec <= 0)
        throw fail('bad_pack');
    if (!Array.isArray(input.roles) || !input.roles.length)
        throw fail('bad_pack');
    const roles = input.roles.map((role) => {
        if (!isObject(role) || typeof role.id !== 'string' || typeof role.label !== 'string')
            throw fail('bad_pack');
        return {
            id: role.id,
            label: role.label,
            required: role.required === true,
            position: typeof role.position === 'string' ? role.position : undefined,
            appearanceHints: typeof role.appearanceHints === 'string' ? role.appearanceHints : undefined,
            wardrobe: typeof role.wardrobe === 'string' ? role.wardrobe : undefined,
            promptToken: typeof role.promptToken === 'string' ? role.promptToken : undefined,
            staleTerms: Array.isArray(role.staleTerms) ? role.staleTerms.filter((term) => typeof term === 'string') : undefined,
        };
    });
    if (roles[0].id !== 'lead' || roles[0].required !== true)
        throw fail('bad_pack');
    if (!Array.isArray(input.generationSegments) || !input.generationSegments.length)
        throw fail('bad_pack');
    const generationSegments = input.generationSegments.map(segmentOf);
    let cursor = 0;
    for (const segment of generationSegments) {
        if (Math.abs(segment.startSec - cursor) > 0.02)
            throw fail('bad_pack');
        cursor = segment.endSec;
    }
    if (Math.abs(cursor - sourceDurationSec) > 0.02)
        throw fail('bad_pack');
    const hints = isObject(input.providerHints) ? input.providerHints : {};
    if (hints.imagesOnly !== true || hints.mode !== 'reference' || hints.resolution !== '720P')
        throw fail('bad_pack');
    if (hints.defaultModel !== 'agnes-video-2.5')
        throw fail('bad_pack');
    const provenance = isObject(input.provenance) ? input.provenance : undefined;
    return {
        schemaVersion: '1.0.0',
        id: input.id,
        title: typeof input.title === 'string' ? input.title : undefined,
        version: typeof input.version === 'string' ? input.version : undefined,
        aspectRatio: '9:16',
        sourceDurationSec,
        styleLine: typeof input.styleLine === 'string' ? input.styleLine : undefined,
        roles,
        generationSegments,
        providerHints: {
            defaultModel: 'agnes-video-2.5',
            resolution: '720P',
            imagesOnly: true,
            mode: 'reference',
        },
        provenance: provenance
            ? {
                shotBoundariesSec: Array.isArray(provenance.shotBoundariesSec)
                    ? provenance.shotBoundariesSec.map((value) => Number(value)).filter((value) => Number.isFinite(value))
                    : undefined,
                segmentStrategy: typeof provenance.segmentStrategy === 'string' ? provenance.segmentStrategy : undefined,
            }
            : undefined,
    };
}
