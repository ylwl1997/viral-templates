# Bailian animate-mix (ops)

Customer pages do not mention DashScope. This is the fallback when Agnes is unset, switched off, or the clip cannot be split into 4–12s pieces. A long template is not sent here just because it is over 12s. A two-photo look is not sent here either: mix cannot take the second photo, so that job fails and the charge is returned. See [`agnes-video.md`](agnes-video.md). `VIDEO_PROVIDER=bailian` forces this path for one-photo looks.

Model: `wan2.2-animate-mix`. It replaces the person in the template video and keeps that video’s scene, motion, lighting, and outfits. Mode: `wan-std` (cheaper). Override the mode with `BAILIAN_MODE=wan-pro`. Override the model with `BAILIAN_MODEL`.

The worker is HTTP only. Do not install or call the Bailian CLI from Pages.

## Mainland reachability

Aliyun cannot fetch `https://viral-templates.pages.dev/...`. A smoke that passed those URLs as `image_url` / `video_url` failed with `InvalidURL.ConnectionRefused`. The same block applies to other `*.pages.dev` hosts, `*.workers.dev`, and the public `*.r2.dev` URL. Do not use the signed `upload_url` on the job row as a Bailian input. That link is only for the account page.

The worker reads the subject photo from the private R2 binding and the template demo from the Pages asset bundle. It uploads both bytes to DashScope temporary storage and submits `oss://` URLs with `X-DashScope-OssResourceResolve: enable`. DashScope resolves those inside Aliyun. A submit with a `pages.dev` URL is rejected in the worker before the request is sent (`bailian_unreachable_input`).

Leave `BAILIAN_PUBLIC_MEDIA_BASE` unset. It is an allowlist for an https origin that mainland Aliyun can already fetch (not Cloudflare Pages). Setting it to `*.pages.dev` is rejected. This worker still uploads `oss://` and does not rewrite inputs onto that host.

Subject image for a one-photo look is the Create photo in R2 (`upload_key`, slot 0). The template video is that look’s demo MP4 (`/brand/templates/{slug}-demo.mp4` for `bby-wow`, `kiss-cam`, and `ceiling-fan`), read from `env.ASSETS` on the same deployment. The photo replaces the character in that video. The scene, motion, lighting, and outfits stay with the template. The result URL from Bailian expires in about 24 hours. The worker downloads it and writes `results/{userId}/{jobId}.mp4`. The playable URL stored on the job is still this app’s signed `/api/media/...` link. That link is for the browser, not for Bailian.

`wan2.2-animate-mix` takes one `image_url`. The official request has no second image field. A template with `photoCount` greater than 1 does not run on this path, including when `VIDEO_PROVIDER=bailian` forces mix for every other look. The job fails as `reference_photos`. The account note says the clip was not generated and the charge was returned. The single credit charge is refunded once. The worker does not upload only the first photo and continue. If Kiss Cam was queued with no saved photo, the job fails as `no_photo` and the account page shows that both photos are required. Create still asks for two photos because the primary reference path sends both. See [`agnes-video.md`](agnes-video.md).

## Secrets

Set these in **Workers & Pages → viral-templates → Settings → Variables and Secrets**, for **Production** and **Preview**. Do not commit them. Do not put them in `wrangler.toml`.

| Name | Kind | Required | Value |
|------|------|----------|--------|
| `BAILIAN_API_KEY` | Secret | Yes | Beijing Bailian / DashScope API key for this workspace. If this is unset and `DASHSCOPE_API_KEY` is already set, the worker uses that. Prefer `BAILIAN_API_KEY` only. |
| `JOB_PROCESS_SECRET` | Secret | Yes | Random string, 16+ characters. Bearer token for `POST /api/jobs/process`. This is not the Bailian key. |
| `BAILIAN_DASHSCOPE_BASE_URL` | Text | No | Default `https://llm-g1ozpdi7y5eyp1mh.cn-beijing.maas.aliyuncs.com/api/v1`. Set `https://dashscope.aliyuncs.com/api/v1` only if you want the classic host for submit and poll. |
| `BAILIAN_MODE` | Text | No | `wan-std` (default) or `wan-pro`. |
| `BAILIAN_MODEL` | Text | No | Default `wan2.2-animate-mix`. |
| `BAILIAN_PUBLIC_MEDIA_BASE` | Text | No | Leave unset. An https origin mainland Aliyun can already fetch. `*.pages.dev`, `*.workers.dev`, and `*.r2.dev` are rejected. The worker does not send those hosts, and it still uploads `oss://`. |

API host for the default base: `llm-g1ozpdi7y5eyp1mh.cn-beijing.maas.aliyuncs.com`.

The temporary-file credential API is documented on the classic host. If `GET {workspace}/api/v1/uploads` returns 404, the worker retries `https://dashscope.aliyuncs.com/api/v1/uploads`. Submit and poll stay on the workspace base.

CLI (production; the dashboard is what covers Preview too):

```bash
npx wrangler pages secret put BAILIAN_API_KEY --project-name=viral-templates
npx wrangler pages secret put JOB_PROCESS_SECRET --project-name=viral-templates
```

Paste the value when prompted. Do not pass the key as an argument that lands in shell history if you can avoid it. A new secret is picked up on the next request; redeploy if the binding does not show up.

Local `npx wrangler pages dev` reads gitignored `.dev.vars`:

```bash
BAILIAN_API_KEY=your-beijing-key
JOB_PROCESS_SECRET=at-least-16-characters
```

## Database

`jobs.provider_task_id` stores the DashScope task id. One id belongs to one job. `migrations/0003_bailian_task.sql` adds the column. `migrations/0005_provider_task_unique.sql` adds a unique index. SQLite allows many NULL ids, so queued jobs stay valid. The migration does not rewrite existing rows. The Pages Function adds the column on first use (`ensureMediaColumns`) and creates the index on first use (`ensureSchema`), so a deploy works before the remote migration runs. A later job that tries to store an id already kept on a different job fails as `provider_task_taken` and does not poll that task.

```bash
npx wrangler d1 migrations apply viral-templates --remote
```

If the column already exists, that `ALTER` reports a duplicate column. The status index in `0003` and the unique task index in `0005` are also created on first Function use. If a duplicate task id is still stored, `0005` fails and the Function logs `provider_task_unique` without rewriting rows. `saveProviderTask` still refuses the duplicate.

## What one process call does

`POST /api/jobs/process` with `Authorization: Bearer $JOB_PROCESS_SECRET`.

1. Claim the oldest `queued` job that has a stored photo (or the `job_id` you pass). Status becomes `running`.
2. Upload the photo and the template demo to DashScope temporary storage.
3. `POST /services/aigc/image2video/video-synthesis` with `X-DashScope-Async: enable`, model `wan2.2-animate-mix`, `parameters.mode` `wan-std` or `wan-pro`.
4. Save `provider_task_id`. A later call `GET /tasks/{task_id}`.
5. On `SUCCEEDED`, download the MP4 and store it in R2. The job becomes `ready`. `result_url` is `/api/media/jobs/{id}/result?exp=&sig=`. The account page plays that URL.
6. On `FAILED`, `CANCELED`, or `UNKNOWN`, the job becomes `failed`.

Create (`POST /api/jobs`) queues the row, returns `201`, then `waitUntil` runs the same `processRemakeJobs` helper. That pass submits the Bailian task and polls it once. The browser does not send `JOB_PROCESS_SECRET`. The Pages env (`BAILIAN_API_KEY`, `MEDIA`, `DB`) is enough. The `201` body is still the queued job; generation keeps going after the response.

Pages Functions still have no cron trigger. `[triggers]` in the Pages `wrangler.toml` does not run. Two other passes pick up a job if `waitUntil` dies:

1. While Creations or the account overview is open, the page `POST`s `/api/jobs/continue` about every 15 seconds. That route is the signed-in user's own queued or running job (one per call). It does not accept `JOB_PROCESS_SECRET`.
2. `workers/job-drain` is a separate Worker on `*/2 * * * *`. It `POST`s `/api/jobs/process` with the bearer secret and `{"limit":3}`. Deploy it once:

```bash
npx wrangler deploy --config workers/job-drain/wrangler.toml
npx wrangler secret put JOB_PROCESS_SECRET --config workers/job-drain/wrangler.toml
```

Use the same `JOB_PROCESS_SECRET` as Pages. Optional text var `PAGES_ORIGIN` (default `https://viral-templates.pages.dev`).

Ops can still call `POST /api/jobs/process` by hand. That remains the way to drain every user, not only the person who has the account page open.

Generation usually takes several minutes. One process call submits or polls once. Repeat the call, or let the drain Worker do it. `wait_ms` (max 90000) polls again inside that request. `limit` is 1–5 (default 1).

A running job with no `provider_task_id` is still in submit. That clock starts when the job is claimed. Each temporary upload times out at 60 seconds and synthesis at 30 seconds. The reference download, before claim, times out at 60 seconds. That work can run past three minutes. `SUBMIT_STALE_MS` is 8 minutes. Until then, continue and the drain leave the row `running`. After that, if the task id is still empty, the worker moves the job back to `queued` (`action` `retry`, `error` `submit_stale`) so a later pass can submit again. That wait does not mark the job `failed` and does not refund it. A Bailian task might already exist even though the row has no id. Do not assume that task is gone.

Body:

```json
{ "limit": 1, "job_id": "job_...", "wait_ms": 0, "poll_interval_ms": 15000 }
```

`job_id` is optional.

## Smoke

You need a real `BAILIAN_API_KEY` on the Pages project. This VM does not have it. `scripts/smoke-bailian.mjs` never sends that key. It only sends `JOB_PROCESS_SECRET`.

1. Set the secrets above and deploy.
2. Sign in on https://viral-templates.pages.dev and open Create for a live pet look (`bby-wow`, `tiny-desk`, or `ceiling-fan`). Live looks do not send a template video.
3. Upload a JPG, PNG, or WebP of one adult. Bailian rejects images over 5 MB (Create still accepts up to 8 MB; those jobs fail with `photo_too_large`).
4. Generate. Copy `job.id` from the JSON or the account page.
5. From a checkout of this repo:

```bash
JOB_PROCESS_SECRET='your-process-secret' \
SMOKE_JOB_ID='job_...' \
SMOKE_BASE_URL='https://viral-templates.pages.dev' \
npm run smoke:bailian
```

The script POSTs every 15 seconds, up to 40 times. Exit 0 prints `result_url`. Open that URL, or **Account → Creations**, and play the clip.

One tick, without the loop:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $JOB_PROCESS_SECRET" \
  -H "content-type: application/json" \
  -d '{"limit":1,"job_id":"JOB_ID"}' \
  "https://viral-templates.pages.dev/api/jobs/process"
```

Call it again until `status` is `ready` or `failed`. Do not put `BAILIAN_API_KEY` in the curl command.

Local:

```bash
npm run build
npx wrangler pages dev dist --port 8788
SMOKE_BASE_URL='http://127.0.0.1:8788' \
JOB_PROCESS_SECRET='your-process-secret' \
SMOKE_JOB_ID='job_...' \
npm run smoke:bailian
```

`pages dev` uses `.dev.vars` and a local R2 disk. It still calls the real Bailian API if the key is set.

`npm run test:bailian` does not call Bailian. It checks the request shape, the workspace host, the classic upload fallback, R2 storage, and that the API key is not returned.

## Failures

| `error` | Meaning |
|---------|---------|
| `job_process_unconfigured` | `JOB_PROCESS_SECRET` missing or shorter than 16 characters |
| `bailian_unconfigured` | `BAILIAN_API_KEY` (and `DASHSCOPE_API_KEY`) missing |
| `no_photo` | Job has no R2 photo (`r2_unbound` at create time, or Create sent no photo). Kiss Cam's note says two photos are required. The account page shows `note_zh` / `note_en`. |
| `no_reference_video` | Template has no demo MP4 (soon looks) |
| `photo_too_large` | Photo is over 5 MB |
| `bailian_*` | Provider code, such as `InvalidApiKey` or `InternalError` |
| `submit_stale` | Running for 8 minutes with no saved task id. The job is `queued` again, not `failed`. A Bailian task might already exist. The unique `provider_task_id` index stops another job from taking that id. |
| `provider_task_taken` | This job tried to store a task id that already belongs to a different job. The id stays on the first job. This job is `failed` and is not polled. |

Customer notes do not include the API key. The process JSON `detail` is redacted.

## Credits

Generate deducts the look’s source-duration credits when the photo is stored. A failed job refunds that charge once. The amount is `Math.round(durationSeconds)`, at least 1. See [`credits-checkout.md`](credits-checkout.md).

## Manual ingest

`POST /api/jobs/{id}/result` with `RESULT_INGEST_SECRET` still stores an MP4 you already have. The Bailian worker does not use that route. See [`r2-media.md`](r2-media.md).
