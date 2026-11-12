# template-pipeline (vendored snapshot)

Source of truth: the private Origin repo `ylwlceo/template-pipeline`
(https://cursor.com/codebase/ylwlceo/template-pipeline), package `template-pipeline` 0.1.0.

This folder is a snapshot so Cloudflare Pages and GitHub Actions do not fetch
that private repo. `packs/tiny-desk-pets/pack.json` is a byte copy of Origin
blob `3630b0a3ca1ae5fa44cb3f1bfeaa1ac7251e84fc`. Bby Wow and Ceiling Fan are
authored here in the same schema (`schemaVersion` 1.0.0) because they are not
in Origin yet.

Public runtime, compiled from `src/` to `dist/index.js`:

- `parseTemplatePack`
- `adaptPack` (async, returns an `AdaptedPromptSet`)
- `formatAgnesCreatePayload(adapted, segmentId)`
- `planGenerationSegments`, `splitDurationEven`, `toPromptSeconds`
- `MetadataVisionAdapter` (default, no network)
- `AgnesVisionAdapter` (injected `fetch` only; invalid output falls back to the deterministic rewrite)

This package does not call a generation API.
