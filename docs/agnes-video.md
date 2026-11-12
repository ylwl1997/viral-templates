# Agnes Video 2.5 (ops)

Customer pages do not mention Agnes, Bailian, DashScope, or Waffo. This is the server path that turns a queued remake into an MP4.

Primary model: `agnes-video-2.5`, `mode=reference`. Live looks are pet remakes. Create runs `adaptPack`, then sends the adapted prompts and the customer’s pet photo URLs. There is no input video. Output is `720P` and `9:16`. A longer look is still split into even 4–12s pieces and joined here. Credits stay one charge.

Live pet looks do not fall through to `wan2.2-animate-mix`. If Agnes cannot run one of those looks, the job fails and the credits return. Mix remains only for the internal fixture path that still has a reference clip. See [`bailian-animate.md`](bailian-animate.md).

## Switch

| `VIDEO_PROVIDER` | Behavior |
|---|---|
| unset or `agnes` | Agnes for templates that fit one reference job. Mix for everything else. |
| `bailian` | Mix only. Agnes is not called. |

Set it in **Workers & Pages → viral-templates → Settings → Variables and Secrets**, for **Production** and **Preview**. Do not commit it.

## One job or a split

Agnes reference limits are one video, duration 2–12 seconds, under 50 MB, and 24–60 fps. Output `seconds` is only `"4"`–`"12"`.

| Template | Source | Path |
|---|---|---|
| Bby Wow | about 6.04s | One images-only job, `seconds` `"6"`. |
| Ceiling Fan | about 15.28s | Two even pieces, each `seconds` `"8"`, then joined. |
| Tiny Desk | 17.76s, editorial cuts at 5.375 / 11.625 / 15.0 | Two authored pieces, 0–12s (`"12"`) and 12–17.76s (`"6"`), then joined. Not an even 8.88s split. |

A clip of 2–12s is one job. The reference file is the public template URL. A source inside that range that rounds below 4 requests `"4"`. The file is still sent whole.

A longer clip is cut into the fewest pieces that each stay inside 4–12s. Pieces are as even as the keyframes allow, so each piece still starts on a sync sample and decodes. More than two pieces only when one pair cannot cover the clip (over 24s). Each piece is stored at `https://{PUBLIC_SITE_APEX}/api/media/jobs/{id}/seg{n}` and sent with `start_seconds` 0. The pieces are submitted together. The worker downloads each result and joins them into one MP4 when every piece is stored. The customer still sees one clip. Credits are still charged once, from the full source duration.

Two generated pieces are remuxed when they share a codec family, frame size, and timescale. Their stsd or avcC bytes do not have to match. If the join still fails, the job fails with internal `error_code` `segment_join`, site credits are refunded once, and generation is not started again.

Mix runs only when a split cannot fix the problem:

- fps outside 24–60, a piece still over 50 MB, or the file cannot be cut
- no keyframe (or other cut) keeps every piece inside 4–12s
- `AGNES_API_KEY` is unset, or `VIDEO_PROVIDER=bailian`
- `PUBLIC_SITE_APEX` is unset or is a `pages.dev`, `workers.dev`, or `r2.dev` host
- the photo is outside 256–5760 px or over 15 MB, or the photos in one request are 50 MB or more together
- Agnes refuses or cannot be reached on the first piece, before a `video_id` exists, and the look only needs one photo

A 429 waits and retries that piece. It does not also start mix. After any piece has a `video_id`, a failed piece fails the job and refunds once. It does not start a second full generation, and it does not fall through to mix for a poll or join failure. Joining stays in this worker. Hypit is not part of this change.

## Two photos

Official reference mode takes `images` as a list of up to 8 public image URLs. Placeholders are 1-based inside that list, so the second photo is `<Image 2>`. The first five images are included in the video price. Checked against https://wiki.agnes-ai.cn/zh-Hans/docs/agnes-video-25 on 2026-11-11.

Kiss Cam (`photoCount` 2) stores `upload_key` (`photo`, Photo A, the person on the left) and `upload_key_2` (`photo-2`, Photo B, the person on the right). The create body `images` array is those two signed custom-domain URLs, in that order. The prompt tells the model to replace both people and not keep either face from the template video. The template video is still one `<Video 1>`.

`wan2.2-animate-mix` has a single `image_url`. If the selected path cannot send every stored photo, the job fails with `error_code` `reference_photos`, the account note says the clip was not generated, and the one credit charge is refunded once. The worker does not submit a shorter image list. That includes an explicit `VIDEO_PROVIDER=bailian` switch, a missing Agnes key, a `pages.dev` apex, and an Agnes refusal before a `video_id` exists.

## Template intake

A new template cannot ship if `photoCount` and the images actually sent on the primary reference path disagree. `npm run test:agnes` walks `TEMPLATE_CATALOG`. For each row it fails unless the Agnes path would sign one image per photo, the prompt names `<Image 1>` through `<Image N>`, and a two-photo row is not the one-person prompt. Create asks for two photos only when the catalog slot list has length 2. A path that cannot use N photos must not be given a template that collects N photos.

The model can still keep a template face on a tight kissing close-up even when both URLs and the prompt are present. That is a generation-quality risk, not a dropped upload. Do not confirm it with a paid provider job from this repo's tests.

## Credits

Unchanged. Generate deducts `Math.round(durationSeconds)` credits, at least 1, when the photo is stored. One deduction per job. A failed job refunds that charge once. Falling back to mix does not deduct again. A billed Agnes failure does not start a second Agnes create, and it does not start mix after a `video_id` exists. HTTP 429 on create waits and retries Agnes later. It does not also start mix. Provider polls wait at least 6 seconds and at most 60. HTTP 429 backs off from 6s, doubling up to 60s. The browser reads `/api/account/creations` and does not POST `/api/jobs/continue` to pull the provider. Create follows the job for about 45 seconds. `workers/job-drain` runs every minute and keeps polling while a job is still in flight. Pages Functions still have no cron.

Provider list prices are not shown to customers.

## URLs Agnes can fetch

Agnes cannot be given a private R2 object or a `*.pages.dev` / `*.workers.dev` / `*.r2.dev` URL.

The photo URLs are `https://{PUBLIC_SITE_APEX}/api/media/jobs/{id}/photo?exp=&sig=` and, when the look takes a second photo, `.../photo-2?exp=&sig=`. Each is signed for 24 hours with `AUTH_SECRET`. The signature is the same media HMAC the account page uses. Agnes fetches them without a session cookie. The template URL is `https://{PUBLIC_SITE_APEX}/brand/templates/{slug}-demo.mp4`. Keyword hosts such as `bby-wow.swaystill.com` serve the same paths. The worker builds the apex URL so a drain call that hits `pages.dev` does not leak that host into the Agnes body.

`PUBLIC_SITE_APEX` itself is unchanged. For Agnes to run, it must already be the custom domain (`swaystill.com`). If it is still `viral-templates.pages.dev`, a live pet look fails and refunds. It does not use mix.

## API

Create: `POST {AGNES_BASE_URL}/videos` with `Authorization: Bearer $AGNES_API_KEY`.

Default base: `https://api.agnes-ai.cn/v1`. Optional `AGNES_BASE_URL` overrides it.

Poll: `GET https://api.agnes-ai.cn/agnesapi?video_id=VIDEO_ID&model_name=agnes-video-2.5` until `status` is `completed` or `failed`. Store `video_id` (the trial returned a `task_…` id). Do not use `internal_status`. On `completed`, download the top-level `url`, then store `results/{userId}/{jobId}.mp4` the same way mix does. If the file has no audio, the worker copies the template audio bed.

Docs: https://wiki.agnes-ai.cn/zh-Hans/docs/agnes-video-25

The task id is stored in `jobs.provider_task_id`. One job uses an `agn_` prefix. A split that is still in flight one piece at a time uses `ag0_`, `ag1_`, and so on. A parallel split stores every piece in one `m2_` (or `m3_`, …) value, with an empty slot until that piece has a `video_id`. Mix task ids are unchanged.

## Secrets

Do not commit these. Do not put them in `wrangler.toml` or `.env`.

| Name | Kind | Required | Value |
|---|---|---|---|
| `AGNES_API_KEY` | Secret | Yes, for Agnes | China Agnes API key. |
| `AGNES_BASE_URL` | Text | No | Default `https://api.agnes-ai.cn/v1`. |
| `VIDEO_PROVIDER` | Text | No | `agnes` (default) or `bailian`. |
| `BAILIAN_API_KEY` | Secret | Yes, for mix fallback | Still required for Ceiling Fan and for any Agnes refusal. |
| `JOB_PROCESS_SECRET` | Secret | Yes | Unchanged. Not the Agnes key. |
| `AUTH_SECRET` | Secret | Yes | Signs the photo URL Agnes fetches. |
| `PUBLIC_SITE_APEX` | Text | Yes, for Agnes | Custom domain only. Do not set this to a `pages.dev` host if Agnes should run. |

```bash
npx wrangler pages secret put AGNES_API_KEY --project-name=viral-templates
```

Paste the value when prompted. A new secret is picked up on the next request.

Local `npx wrangler pages dev` reads gitignored `.dev.vars`:

```bash
AGNES_API_KEY=your-agnes-key
VIDEO_PROVIDER=agnes
PUBLIC_SITE_APEX=swaystill.com
BAILIAN_API_KEY=your-beijing-key
JOB_PROCESS_SECRET=at-least-16-characters
AUTH_SECRET=at-least-16-characters
```

`npm run test:agnes` does not call Agnes. It checks provider selection, the duration fallback, the request body, and that every catalog `photoCount` matches the images the primary path would send.

Do not deploy or set production secrets from a patch. Set them in the dashboard after review.
