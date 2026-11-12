# template-pipeline (vendored snapshot)

Source of truth: the private Origin repo `ylwlceo/template-pipeline`
(https://cursor.com/codebase/ylwlceo/template-pipeline). This folder is a
snapshot so Cloudflare Pages and GitHub Actions do not fetch that private
repo at build time. Do not point a package registry or a GitHub URL at it.

Runtime used by the site:

- `adaptPack(pack, customerImages)` rewrites identity, count, and interaction only.
  Aspect ratio, duration, editorial cuts, time codes, and the beat meaning stay put.
- `formatAgnesCreatePayload` returns a not-sent body: images only, no input video,
  720P, 9:16, mode `reference`, model `agnes-video-2.5`.
- Vision, if a caller injects a rewrite, may use `agnes-3.0-flash` and fall back
  to `agnes-2.5-flash`. `agnes-2.5-pro` and `agnes-3.0-pro` are refused.
  Invalid JSON or moved time codes / cuts are discarded. The deterministic
  rewrite wins. This package does not call a network API.

`packs/tiny-desk-pets/pack.json` is the Tiny Desk pet pack (17.76s, editorial
cuts at 5.375 / 11.625 / 15.0, generation segments inside 4–12s).
`examples/tiny-desk-pets-5s-test.json` holds the short timed-beats and
locked-segment prompts. This VM could not clone Origin (no user Origin session
was injected), so these files are the runtime contract and pet prompts aligned
to those published timings. Replace them with a byte copy from Origin when a
session can read that repo.
