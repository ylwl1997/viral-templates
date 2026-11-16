# Grok Imagine video (ops)

Customer pages do not mention xAI, Grok, Imagine, Agnes, Bailian, or Waffo. This is an optional server path that turns a queued pet remake into an MP4.

The Worker calls the official xAI Video API only:

- `POST https://api.x.ai/v1/videos/generations` with `Authorization: Bearer $XAI_API_KEY`
- `GET https://api.x.ai/v1/videos/{request_id}` until `status` is `done` or `failed`

Model: `grok-imagine-video-1.5`. Do not use `grok-imagine-video-1.5-lite`. The lite model does not accept reference images.

Live looks stay pet-only (Bby Wow, Ceiling Fan, Tiny Desk). Kiss Cam stays retired. Generation is the official pack prompt plus the customer’s pet photos. No template video is sent. No Cursor, Grok Bot, or consumer-subscription video API is used.

## Switch

Default stays Agnes. A configured `XAI_API_KEY` does not change that.

| `VIDEO_PROVIDER` | `XAI_API_KEY` | Behavior |
|---|---|---|
| unset or `agnes` | set or unset | Agnes, as in [`agnes-video.md`](agnes-video.md). Imagine is not called. |
| `bailian` | set or unset | Mix only. Imagine is not called. |
| `imagine` | set | `grok-imagine-video-1.5` reference-to-video for official packs. |
| `imagine` | unset | The job fails with internal `error_code` `xai_unset`, the customer note says the clip did not start, and the credit charge is refunded once. Agnes is not called. The job is not left queued. |

Set both values in **Workers & Pages → viral-templates → Settings → Variables and Secrets**, for **Production** and **Preview**, after review. Do not commit the key. Do not put it in `wrangler.toml` or `.dev.vars` that is checked in.

Production go-live is two steps, in this order:

1. `npx wrangler pages secret put XAI_API_KEY --project-name=viral-templates`
2. Set the text variable `VIDEO_PROVIDER` to `imagine`.

Until step 2, live jobs stay on Agnes. This patch does not deploy and does not set the secret.

## Request

Official packs are images-only. The worker adapts the pack from the customer photos, then posts:

| Field | Value |
|---|---|
| `model` | `grok-imagine-video-1.5` |
| `aspect_ratio` | `9:16` |
| `resolution` | `720p` |
| `duration` | The pack segment’s `promptSeconds` (4–12). Imagine’s cap is 1–15, so these segments are not trimmed further. |
| `reference_images` | `[{ "url": "<signed photo>" }, …]` in slot order. No `video`, no pinned `image`, no keyframes. |
| `prompt` | Adapted pack text. `<Image 1>` becomes `<IMAGE_0>`, `<Image 2>` becomes `<IMAGE_1>`, and so on. Shot lines and timecodes are not rewritten. |

A segment that does not name every pet still sends the full photo list in slot order. `<IMAGE_n>` stays tied to photo n. Photos are not dropped to make the citations contiguous.

Bby Wow and Ceiling Fan send the one lead photo. Tiny Desk sends every stored photo, up to 5. Imagine allows 14 reference images. With references, 1080p is not available, so the body stays `720p`.

Photo URLs are the same signed `https://{PUBLIC_SITE_APEX}/api/media/jobs/{id}/photo…` links Agnes uses. `pages.dev`, `workers.dev`, and `r2.dev` hosts are rejected. `PUBLIC_SITE_APEX` must be the custom domain.

The same duration split as Agnes is kept. Bby Wow (~6s) is one job. Ceiling Fan is two segments (~8s and ~7s). Tiny Desk official editorial is 12s then 6s. Both pieces are under Imagine’s 15s cap. Results are downloaded from the temporary `video.url` into R2 and joined here. Credits stay one charge for the whole look.

Adapt still only replaces character, appearance, and interaction wording. A full-band Tiny Desk job must not keep pack-default animals (husky, tabby, and the rest). A one-photo job collapses to that pet and drops the other pack identities.

Provider-side wording does not add a human face or human hands. The pack lines that already say the performer is a pet, with no human faces and no human hands, are left in place.

## Credits

Unchanged. Generate still deducts `Math.round(durationSeconds)` credits, at least 1. That is the only price in code: Bby Wow 6, Ceiling Fan 15, Tiny Desk 18. A failed job, including a missing Imagine key, refunds that charge once.

Imagine’s list price is not a customer price and is not written into the ledger: 720p is $0.14 per second plus $0.01 per input image.

## Poll

The existing job worker stores `request_id` on `jobs.provider_task_id` (`xai_` for one clip, `xi2_` when two segments run together). It polls at least every 6 seconds. On `done` it downloads `video.url` immediately into R2. On `failed`, or when Imagine was selected without a key, it marks the job failed and refunds once. It does not start Agnes after that.

`workers/job-drain` is unchanged. It only POSTs `/api/jobs/process`. The Pages Function holds `XAI_API_KEY`.

## Secrets

Do not commit these.

| Name | Kind | Required | Value |
|---|---|---|---|
| `XAI_API_KEY` | Secret | Yes, for Imagine | Official xAI API key. Pages secret only. |
| `XAI_BASE_URL` | Text | No | Default `https://api.x.ai/v1`. |
| `VIDEO_PROVIDER` | Text | Yes, to leave Agnes | Set to `imagine` only after review. |
| `PUBLIC_SITE_APEX` | Text | Yes | Custom domain. Same rule as Agnes. |
| `AUTH_SECRET` | Secret | Yes | Signs the photo URLs Imagine fetches. |
| `JOB_PROCESS_SECRET` | Secret | Yes | Unchanged. Not the xAI key. |

```bash
npx wrangler pages secret put XAI_API_KEY --project-name=viral-templates
```

Paste the value when prompted. A new secret is picked up on the next request. Do not run that from this change.

Local `npx wrangler pages dev` reads gitignored `.dev.vars`:

```bash
XAI_API_KEY=your-xai-key
VIDEO_PROVIDER=imagine
PUBLIC_SITE_APEX=swaystill.com
```

`npm run test:imagine` does not call xAI. It checks the request body, the missing-key failure, identity adapt, and that `VIDEO_PROVIDER=agnes` still submits to Agnes.
