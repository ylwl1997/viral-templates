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
- `POST /api/jobs` — signed-in Generate queues a job. Status stays `queued`. No media URL is stored.

**How to preview-login:** open `/account/sign-in/` → **Preview sign-in** (shown on `*.pages.dev` / localhost when Google OAuth is not configured) → lands on `/account/` with avatar in the header. A new account starts at **0** credits and an empty creations list. Generate (photo + consent, while signed in) adds a queued row and does not produce a video file. Unsigned Generate goes to sign-in with `next=`.

Brand shells use **relative** `/account/` and `/account/sign-in/?next=` (same host, same `vt_session` / `/api/auth/*`). Middleware keeps that brand’s chrome when context is known (`vt_brand` cookie after visiting `/t/{slug}/`, safe `next=/t/{slug}/…`, or brand host).

### D1

Schema: `migrations/0001_account.sql` (`users`, `credit_accounts`, `credit_ledger`, `jobs`). Pages Functions also apply it on first use (`CREATE TABLE IF NOT EXISTS`) so a bound database self-heals.

```bash
npm run test:account
npm run build
npx wrangler pages dev dist --port 8788
# remote, after wrangler auth:
# npx wrangler d1 create viral-templates
# set database_id in wrangler.toml, then:
# npm run d1:migrate:local   # or: npx wrangler d1 migrations apply viral-templates --remote
```

Pages → Settings → Bindings → D1 database → variable name **`DB`** (production and preview). Until that binding exists, account APIs return `503` `d1_unbound` and the UI shows a load error instead of demo numbers.

### Known limits

- No real Google OAuth / Waffo / fal. Generate does not mark a job ready and does not attach a file.
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
| `AUTH_SECRET` | HMAC for `vt_session` (16+ chars). On `*.pages.dev` / localhost a public preview fallback is used if unset |
| `AUTH_PREVIEW_LOGIN` | `1` force preview login on; `0` off; unset = on for preview hosts when Google OAuth missing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Reserved for real Google OAuth (not wired in P0) |

No R2 / no real domain purchase required for this skeleton.

## Scripts

```bash
npm run dev
npm run build
npm run test:account
npm run pages:dev
npx wrangler pages deploy dist --project-name=viral-templates
# or: npm run deploy
```
