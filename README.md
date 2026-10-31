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
- `/account/credits/` Balance + ledger (top-up / deduction / refund). Buy button stays a checkout stub
- `/account/settings/` Profile read-only from session
- `/account/sign-in/` Google button placeholder + **preview login**

One D1 database (binding `DB`) is shared by the apex and every brand host. Rows are keyed by the session `user_id`, not by subdomain.

Auth + account APIs (Pages Functions):

- `GET /api/auth/session`
- `POST /api/auth/preview` — preview login (HttpOnly `vt_session` cookie)
- `POST /api/auth/logout`
- `GET /api/account/creations`
- `GET /api/account/credits`
- `POST /api/jobs` — signed-in Generate queues a job. Status stays `queued`. Photo bytes are stored in R2 when the `MEDIA` binding is present; otherwise the job still queues and `media.error` is `r2_unbound`.
- `POST /api/jobs/{id}/result` — ops-only. Stores a finished MP4 and sets `result_url`. Requires `RESULT_INGEST_SECRET`. Does not call a video provider.
- `GET /api/media/jobs/{id}/{photo|photo-2|result}` — private download (owner session or signed `exp` + `sig`).

**How to preview-login:** open `/account/sign-in/` → **Preview sign-in** (shown on `*.pages.dev` / localhost when Google OAuth is not configured) → lands on `/account/` with avatar in the header. A new account starts at **0** credits and an empty creations list. Generate (photo + consent, while signed in) adds a queued row and does not produce a video file. Unsigned Generate goes to sign-in with `next=`.

Brand shells use **relative** `/account/` and `/account/sign-in/?next=` (same host, same `vt_session` / `/api/auth/*`). Middleware keeps that brand’s chrome when context is known (`vt_brand` cookie after visiting `/t/{slug}/`, safe `next=/t/{slug}/…`, or brand host).

### D1

Schema: `migrations/0001_account.sql` (`users`, `credit_accounts`, `credit_ledger`, `jobs`). Pages Functions also apply it on first use (`CREATE TABLE IF NOT EXISTS`) so a bound database self-heals.

```bash
npm run test:account
npm run test:media
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
| `results/{userId}/{jobId}.mp4` | Finished clip, only after result ingest | 30 days |
| `templates/` | Reserved. The app does not write here | — |

Downloads are `/api/media/jobs/{jobId}/{photo|photo-2|result}`. The owner’s session cookie works. A signed `?exp=&sig=` query (HMAC with `AUTH_SECRET`) works without a cookie, which is what `upload_url` / `result_url` store. Object keys and those URLs are saved on the `jobs` row (`upload_key`, `upload_url`, `upload_key_2`, `upload_url_2`, `result_key`, `result_url`). `result_url` stays null until the job is `ready`.

Create accepts multipart fields `photo_0` / `photo_1` (or `photo`) and JSON `photos: ["data:image/jpeg;base64,..."]`. JPG, PNG, WebP, up to 8 MB each. A missing `MEDIA` binding does not fail the queue: the response is still `201` with `media.stored: false`, `media.r2_configured: false`, and `media.error: "r2_unbound"` when a photo was sent. `SITE.r2Configured` is the static build flag (`PUBLIC_R2_CONFIGURED=1`). Storage itself follows the binding, not that flag.

Result ingest (not wired to fal or Kling):

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

### Known limits

- No real Google OAuth / Waffo / fal / Kling. Generate does not mark a job ready and does not produce a clip. A finished file exists only after something calls the result ingest route with an MP4.
- Top-up buttons do not start checkout. Ledger rows are written only when a top-up, deduction, or refund is posted (no starter grant).
- Session cookie is **host-only** (not shared across brand hosts). The database is shared: the same account email maps to the same `user_id` on each host after signing in there.
- Brand Account link needs a prior brand-page visit (cookie) or open Sign in with `?next=/t/{slug}/…`
- No delete-account / export

## Env checklist

| Key | Purpose |
|-----|---------|
| `PUBLIC_SITE_APEX` | Apex hostname for Host / subdomain mapping (default `viral-templates.pages.dev`) |
| `FAL_KEY` / `FAL_API_KEY` | Real image→video (not wired in P0 UI) |
| `FAL_MODEL` | fal model id |
| `WAFFO_*` | Payments (stub only) |
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
| `AUTH_SECRET` | HMAC for `vt_session` and for media download signatures (16+ chars). On `*.pages.dev` / localhost a public preview fallback is used if unset |
| `AUTH_PREVIEW_LOGIN` | `1` force preview login on; `0` off; unset = on for preview hosts when Google OAuth missing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Reserved for real Google OAuth (not wired in P0) |

No real domain purchase is required for this skeleton. R2 needs the bucket created in Cloudflare before media can be stored (see Media above). Do not commit secrets.

## Scripts

```bash
npm run dev
npm run build
npm run test:account
npm run test:media
npm run pages:dev
npx wrangler pages deploy dist --project-name=viral-templates
# or: npm run deploy
```
