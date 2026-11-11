# Viral Templates

Customer-facing product: **AI viral video templates**. Apex is a **minimal brand hub** (name + value + legal). Each template is an **independent brand site** — no public keyword matrix, no “directory of slugs” in the UI.

- Live preview: https://viral-templates.pages.dev

**UI kit:** shared design system in `src/design/` — see [`docs/UI-KIT.md`](docs/UI-KIT.md). New brands must fill a full `theme` (hero/type/card/cover/ambience), not logo+accent alone.
- Repo: https://github.com/ylwl1997/viral-templates
- Stack: Astro static · Cloudflare Pages (+ Pages Function for Host rewrite) · EN + `/zh/` · Generate/Pay stubs

## Customer vs ops

| Surface | What customers see |
|---------|-------------------|
| Apex `/` · `/zh/` | Product gallery (Templates / Create / Trending looks) |
| `/t/{slug}/` · `/zh/t/{slug}/` | That brand’s product page (or Coming soon) |
| Nav / footer on brand pages | Product links + Privacy / Terms / FAQ — **never** other templates |
| README (this file) | Host / wildcard / path fallback / registry — **ops only** |

## Internal routing model (ops)

| Host / path | Renders |
|-------------|---------|
| `apex` / `www` | Product gallery + hub Create |
| `{slug}.apex` | That template’s single-site home |
| `{slug}.apex/create/` | Create studio (live only) |
| `/t/{slug}/` | **Path fallback** — same shell without DNS |
| `/zh/t/{slug}/` | Chinese shell |
| Unknown subdomain | Friendly `/unknown-site/` (404 via Function) |

**Live slugs:** `bby-wow`, `kiss-cam`, `ceiling-fan`  
**Soon slugs:** `bulin-47`, `zombie-love`, `smalltown-boy-cats`, `clapping-cat`, `knight-cat`, `car-jump`

Registry: `src/lib/templates.ts` (includes `logo` + `accent` per template)
Brand marks: `public/brand/templates/{slug}.svg`
**Customer UI never says** 关键词站点 / 一词一域 / subdomain / slug / Host / registry.  
Apex / env helpers: `src/lib/site.ts` (`PUBLIC_SITE_APEX`, default `viral-templates.pages.dev`)

## Path fallback (P0 — no DNS)

```text
https://viral-templates.pages.dev/t/bby-wow/
https://viral-templates.pages.dev/t/kiss-cam/
https://viral-templates.pages.dev/t/ceiling-fan/
https://viral-templates.pages.dev/t/clapping-cat/    # coming soon shell
https://viral-templates.pages.dev/zh/t/bby-wow/
https://viral-templates.pages.dev/                       # product gallery
https://viral-templates.pages.dev/create/                # hub create (pick live template)
```

## Production wildcard custom domain

1. In Cloudflare DNS for your apex (e.g. `example.com`):
   - `CNAME` / proxied record for apex → Pages project `viral-templates`
   - Wildcard: `*.example.com` → same Pages project (proxied)
2. Pages → Custom domains: add `example.com` and `*.example.com` (or add one subdomain and enable wildcard per CF UI).
3. Set Pages env **`PUBLIC_SITE_APEX=example.com`** (no protocol) so middleware + site config agree.
4. Host mapping is implemented in `functions/_middleware.js`:
   - `bby-wow.example.com/` → rewrite → `/t/bby-wow/`
   - `bby-wow.example.com/create/` → `/t/bby-wow/create/`
   - `bby-wow.example.com/zh/` → `/zh/t/bby-wow/`
   - unknown slug → `/unknown-site/` with 404

Until wildcard DNS exists, use `/t/{slug}/` for acceptance.

## Test Host header (Function)

After deploy (or locally with Pages dev):

```bash
# Local Pages + Functions
npm run build
npx wrangler pages dev dist

# In another shell — Host-based rewrite
curl -sI -H "Host: bby-wow.viral-templates.pages.dev" http://127.0.0.1:8788/
# Expect rewrite to template shell (200).

curl -sI -H "Host: not-a-template.viral-templates.pages.dev" http://127.0.0.1:8788/
# Expect 404 unknown-site

# Against production project hostname (Function runs on Pages; Host must match PUBLIC_SITE_APEX)
curl -sI -H "Host: bby-wow.example.com" https://viral-templates.pages.dev/
```

Note: Sending a custom `Host` to `*.pages.dev` from the public internet may not behave like local `wrangler pages dev`. Prefer `wrangler pages dev` or a real wildcard custom domain for Host tests.


## Account center

Routes (EN + ZH, hub and `/t/{slug}/account/…` brand shells):

- `/account/` Overview — balance, creation count, and recent jobs from D1
- `/account/creations/` Jobs for the signed-in user (optional `?status=queued|running|ready|failed`)
- `/account/credits/` Balance + ledger (top-up / deduction / refund). Buy starts checkout only when payment keys are set; otherwise it stays closed and does not charge
- `/account/settings/` Profile read-only from session
- `/account/sign-in/` **Google sign-in** for allowlisted emails. An owner test email and password appear only when that path is configured. Preview login is localhost-only

One D1 database (binding `DB`) is shared by the apex and every brand host. Rows are keyed by the session `user_id`, not by subdomain.

Auth + account APIs (Pages Functions):

- `GET /api/auth/session`
- `GET /api/auth/google/start` — Google sign-in (`next`, `from`, optional `popup=1`). Callback is `GET /api/auth/google/callback`
- `POST /api/auth/preview` — localhost preview login (HttpOnly `vt_session`). Public hosts, including `*.pages.dev`, refuse it
- `POST /api/auth/password` — owner test sign-in (`{ email, password, next? }`). Off unless a real `AUTH_SECRET`, `AUTH_TEST_EMAIL`, and `AUTH_TEST_PASSWORD` are all set. Not public registration
- `POST /api/auth/logout`
- `GET /api/account/creations`
- `GET /api/account/credits`
- `POST /api/jobs` — signed-in Generate queues a job, then `waitUntil` starts Bailian for that job. Photo bytes are stored in R2 when the `MEDIA` binding is present; otherwise the job still queues and `media.error` is `r2_unbound`. The browser does not send `JOB_PROCESS_SECRET`.
- `POST /api/jobs/continue` — signed-in. Submits or polls one of that user's queued or running jobs. No process secret.
- `POST /api/jobs/process` — ops-only drain for every user. Claims queued jobs, calls Bailian `wan2.2-animate-move`, stores the MP4 in R2, and marks the job `ready` or `failed`. Requires `JOB_PROCESS_SECRET` and `BAILIAN_API_KEY`. See [`docs/bailian-animate.md`](docs/bailian-animate.md).
- `POST /api/jobs/{id}/result` — ops-only manual ingest. Stores a finished MP4 and sets `result_url`. Requires `RESULT_INGEST_SECRET`. Does not call Bailian.
- `GET /api/media/jobs/{id}/{photo|photo-2|result}` — private download (owner session or signed `exp` + `sig`).

**How to sign in:** with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET` set, **Sign in** opens a dialog on the current page → **Continue with Google** (popup). `/account/sign-in/` still works as a bookmark. The first allowlisted sign-in creates the D1 user at **0** credits. Any other Google account is rejected with `email_not_allowed` and does not get a session. Preview sign-in is localhost-only (same allowlist) and does not run on `*.pages.dev`. When a real `AUTH_SECRET`, `AUTH_TEST_EMAIL`, and `AUTH_TEST_PASSWORD` are all set, the same dialog also shows an email and password form so the owner can test checkout without Google. That form is not a customer account system: the posted address must match `AUTH_TEST_EMAIL` and the allowlist, and a miss returns the same invalid-credentials error. If that address already has a `users` row, the session reuses it. Otherwise the first success creates a user at **0** credits. Leave the two test variables unset and the fields stay hidden. A popup sign-in stays on the page and refreshes the session; the sign-in route itself still lands on `next` (default `/account/`). Generate (photo + consent, while signed in) adds a queued row and starts Bailian in the background. A clip appears when that pass, the account page, or `POST /api/jobs/process` stores the MP4. Unsigned Generate opens the same dialog with `next=` set to the current page.

Google Cloud origins, the exact redirect URI for `viral-templates.pages.dev`, and where to put the secrets are in [`docs/google-oauth.md`](docs/google-oauth.md).

Brand shells use **relative** `/account/` and `/account/sign-in/?next=` (same host, same `vt_session` / `/api/auth/*`). Middleware keeps that brand’s chrome when context is known (`vt_brand` cookie after visiting `/t/{slug}/`, safe `next=/t/{slug}/…`, or brand host).

### D1

Schema: `migrations/0001_account.sql` (`users`, `credit_accounts`, `credit_ledger`, `jobs`). Pages Functions also apply it on first use (`CREATE TABLE IF NOT EXISTS`) so a bound database self-heals.

```bash
npm run test:account
npm run test:auth
npm run test:media
npm run test:bailian
npm run test:payments
npm run build
npx wrangler pages dev dist --port 8788
# Remote D1 `viral-templates` already exists; 0001_account.sql is applied.
# database_id is on the DB binding in wrangler.toml (same id for preview).
# Publish production (and the DB binding) with Cloudflare credentials:
# npm run deploy
```

`npm run deploy` runs `wrangler pages deploy` and attaches that D1 database as **`DB`** for production and preview. Until a deploy with this binding is live, account APIs return `503` `d1_unbound` and the UI shows a load error instead of demo numbers.

### Media (R2)

Private bucket **`viral-templates-media`**, Pages binding **`MEDIA`** (`env.MEDIA`). One bucket. Do not turn on the r2.dev public URL.

| Key | What | Default retention |
|-----|------|-------------------|
| `uploads/{userId}/{jobId}/0.jpg` (also `png` / `webp`; slot 2 is `/1.ext`) | Photo from Create | 7 days |
| `results/{userId}/{jobId}.mp4` | Finished clip, after Bailian or result ingest | 30 days |
| `templates/` | Reserved. The app does not write here | — |

Downloads are `/api/media/jobs/{jobId}/{photo|photo-2|result}`. The owner’s session cookie works. A signed `?exp=&sig=` query (HMAC with `AUTH_SECRET`) works without a cookie, which is what `upload_url` / `result_url` store. Object keys and those URLs are saved on the `jobs` row (`upload_key`, `upload_url`, `upload_key_2`, `upload_url_2`, `result_key`, `result_url`). `result_url` stays null until the job is `ready`.

Create accepts multipart fields `photo_0` / `photo_1` (or `photo`) and JSON `photos: ["data:image/jpeg;base64,..."]`. JPG, PNG, WebP, up to 8 MB each. A missing `MEDIA` binding does not fail the queue: the response is still `201` with `media.stored: false`, `media.r2_configured: false`, and `media.error: "r2_unbound"` when a photo was sent. `SITE.r2Configured` is the static build flag (`PUBLIC_R2_CONFIGURED=1`). Storage itself follows the binding, not that flag.

Bailian generation is separate from this manual ingest. Setup and the smoke command are in [`docs/bailian-animate.md`](docs/bailian-animate.md).

Result ingest (still available if you already have an MP4):

```bash
curl -X POST \
  -H "Authorization: Bearer $RESULT_INGEST_SECRET" \
  -H "content-type: video/mp4" \
  --data-binary @clip.mp4 \
  "https://viral-templates.pages.dev/api/jobs/JOB_ID/result"
```

That route returns `503` `r2_unbound` or `result_ingest_unconfigured` when the bucket or secret is missing. It does not generate a video.

The Workers binding cannot set lifecycle rules. Add them on the bucket (photos 7 days, clips 30 days). Steps, the API body, and the read-time `expires_at` hint are in [`docs/r2-media.md`](docs/r2-media.md). `npm run pages:dev` simulates `MEDIA` locally and does not write the remote bucket.

**Create the bucket before a deploy that expects it.** This repo cannot create it for you:

1. Dashboard → **R2** → **Create bucket** → name `viral-templates-media`. Leave public access off.
2. Dashboard → that bucket → **Settings** → **Object lifecycle rules** → **Add rule** (see the doc). Two rules: prefix `uploads/` delete after 7 days; prefix `results/` delete after 30 days.
3. The binding is declared in `wrangler.toml` as `MEDIA`. `npx wrangler pages deploy` treats that file as the project source of truth. After the bucket exists, redeploy.
4. Confirm **Workers & Pages → viral-templates → Settings → Bindings** shows **R2 bucket** / variable `MEDIA` / bucket `viral-templates-media` for **Production** and **Preview**. If a Git build did not attach it, add that binding in the dashboard for both environments and redeploy.
5. Optional plain-text vars: `PUBLIC_R2_CONFIGURED=1`, `PUBLIC_PHOTO_RETENTION_DAYS=7`, `PUBLIC_VIDEO_RETENTION_DAYS=30`. Optional function vars: `PHOTO_RETENTION_DAYS`, `VIDEO_RETENTION_DAYS`. Optional secret: `RESULT_INGEST_SECRET` (16+ characters). Do not commit values.

Same bucket from the CLI (needs Cloudflare credentials): `npx wrangler r2 bucket create viral-templates-media`.

### Credits, phone upload, and checkout

Details and env names: [`docs/credits-checkout.md`](docs/credits-checkout.md).

- One credit is about one second. Live looks cost 10 (Bby Wow), 12 (Kiss Cam), and 15 (Ceiling Fan). A signed-in Generate deducts that cost when the photo is stored and the job is queued. A failed job, including a generation failure, refunds that deduction once. The first allowlisted sign-in stays at **0** credits. There is no starter grant.
- Desktop Create can open a 15-minute link so a phone can upload into the same draft. The photo stays in the private `MEDIA` bucket (`handoff/`). Refresh keeps the draft in this browser.
- Photos are rejected when the shorter side is under 300 pixels or the long side is more than 2.5× the short side. The browser shrinks oversized phone photos before upload.
- Each live look’s reference clip has an audio bed. The job worker copies that audio onto a finished clip that has none. If that copy fails, the job fails and the credits return. Stored MP4s get an XMP label (`trainedAlgorithmicMedia`). That is not a C2PA manifest.
- Pack prices are $5.99 / $14.99 / $39.99 for 60 / 180 / 600 credits, and only when checkout can run. Missing payment keys leave Buy closed: no redirect, no ledger row, no fake charge.

### Known limits

- Google sign-in runs when the secrets in [`docs/google-oauth.md`](docs/google-oauth.md) are set. Bailian `wan2.2-animate-move` runs after `BAILIAN_API_KEY` is set. Create starts it with `waitUntil`. Pages has no cron trigger; `workers/job-drain` posts `POST /api/jobs/process` every two minutes once that Worker is deployed ([`docs/bailian-animate.md`](docs/bailian-animate.md)). Inputs are uploaded to DashScope temporary storage (`oss://`). Do not pass `*.pages.dev` media URLs to Bailian. Aliyun cannot fetch them (`InvalidURL.ConnectionRefused`).
- A pack refund or chargeback from the payment provider does not remove credits by itself. The credits page can store a short note for that case.
- Session cookie is **host-only** (not shared across brand hosts). The database is shared. The same Google account maps to the same `user_id` on every host after signing in there, so credits and jobs follow the person. `/t/{slug}/` on the apex is the same host and the same cookie.
- Brand Account link needs a prior brand-page visit (cookie) or open Sign in with `?next=/t/{slug}/…`
- No delete-account / export

## Env checklist

| Key | Purpose |
|-----|---------|
| `PUBLIC_SITE_APEX` | Apex hostname for Host / subdomain mapping (default `viral-templates.pages.dev`) |
| `FAL_KEY` / `FAL_API_KEY` | Optional unused hook. Not the default generator |
| `FAL_MODEL` | Optional unused model id. Default generation stays `wan2.2-animate-move` |
| `WAFFO_MERCHANT_ID` | Pancake Merchant ID (`MER_`…). With the store id and private key, Buy can start. Missing any of them keeps Buy closed |
| `WAFFO_PRIVATE_KEY` | Pancake API private key for the selected environment. Test key first. Do not commit it |
| `WAFFO_PANCAKE_STORE_ID` | Pancake Store ID (`STO_`…). Dashboard → Settings → Store Profile |
| `WAFFO_PANCAKE_ENVIRONMENT` | `test` (default) or `prod`. `live` means `prod`. Do not point this at live until a production key is set |
| `WAFFO_CURRENCY` | Optional ISO currency. Default `USD` |
| `WAFFO_WEBHOOK_TEST_PUBLIC_KEY` / `WAFFO_WEBHOOK_PROD_PUBLIC_KEY` / `WAFFO_WEBHOOK_PUBLIC_KEY` | Optional overrides. Unset uses the SDK’s built-in webhook keys |
| `PUBLIC_GA4_MEASUREMENT_ID` | GA4 |
| `PUBLIC_ADSTERRA_SOCIAL_BAR_ZONE` | Adsterra Social Bar |
| `DB` | Pages D1 binding (not an env string). One database for accounts, jobs, and credit ledger |
| `MEDIA` | Pages R2 binding (not an env string). Bucket `viral-templates-media`. Photos and finished MP4s |
| `PUBLIC_R2_CONFIGURED` | `1` flips `SITE.r2Configured` on the static build. Uploads still follow the `MEDIA` binding when this is unset |
| `PUBLIC_PHOTO_RETENTION_DAYS` | Customer copy for photo retention. Default 7. Must be present at build time to change the pages |
| `PUBLIC_VIDEO_RETENTION_DAYS` | Customer copy for finished clips. Default 30 |
| `PHOTO_RETENTION_DAYS` | Function env for object metadata. Default 7. Falls back to `PUBLIC_PHOTO_RETENTION_DAYS` |
| `VIDEO_RETENTION_DAYS` | Function env for object metadata. Default 30 |
| `RESULT_INGEST_SECRET` | Bearer token for `POST /api/jobs/{id}/result`. 16+ characters. Not a customer feature |
| `BAILIAN_API_KEY` | Pages secret for DashScope. Beijing workspace key. Do not commit. `DASHSCOPE_API_KEY` is used only when this is unset |
| `BAILIAN_DASHSCOPE_BASE_URL` | Optional text. Default `https://llm-g1ozpdi7y5eyp1mh.cn-beijing.maas.aliyuncs.com/api/v1`. Set `https://dashscope.aliyuncs.com/api/v1` to use the classic host |
| `BAILIAN_MODE` | Optional text. `wan-std` (default, cheaper) or `wan-pro` |
| `BAILIAN_MODEL` | Optional text. Default `wan2.2-animate-move` |
| `BAILIAN_PUBLIC_MEDIA_BASE` | Optional https origin Aliyun can fetch. Leave unset. `*.pages.dev` is rejected. The worker still uploads `oss://` |
| `JOB_PROCESS_SECRET` | Bearer token for `POST /api/jobs/process` and the `workers/job-drain` cron. 16+ characters. Not the Bailian key. Create does not require the browser to send it |
| `AUTH_SECRET` | HMAC for `vt_session`, the Google state cookie, and media download signatures (16+ chars). On `*.pages.dev` / localhost a public preview fallback is used if unset. Google sign-in refuses that fallback |
| `AUTH_ALLOWED_EMAILS` | Comma-separated sign-in allowlist (trim, case-insensitive). Production: `1316805445@qq.com`. Unset or empty denies every address except that same one, so a public Pages URL stays closed before the variable is set. See [`docs/google-oauth.md`](docs/google-oauth.md) |
| `AUTH_PREVIEW_LOGIN` | `0` off everywhere. `1` forces preview login on localhost only. Unset = localhost when Google OAuth is missing. Public hosts, including `*.pages.dev`, never accept preview login |
| `AUTH_TEST_EMAIL` | Owner test sign-in address. One email. Must also be on `AUTH_ALLOWED_EMAILS` (or the fallback allowlist). The password form stays hidden until this, `AUTH_TEST_PASSWORD`, and a real `AUTH_SECRET` are set. Not a customer account system. Do not commit the value |
| `AUTH_TEST_PASSWORD` | Owner test sign-in secret. Compared in constant time and never logged. Whitespace-only does not enable the form. Do not commit the value. Leave unset to keep the public site Google-only |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google web client. Both must be set. See [`docs/google-oauth.md`](docs/google-oauth.md). Do not commit them |

No real domain purchase is required for this skeleton. R2 needs the bucket created in Cloudflare before media can be stored (see Media above). Do not commit secrets.

## Scripts

```bash
npm run dev
npm run build
npm run test:account
npm run test:auth
npm run test:media
npm run test:bailian
npm run test:payments
npm run smoke:bailian
npm run pages:dev
npx wrangler pages deploy dist --project-name=viral-templates
# or: npm run deploy
```
