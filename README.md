# Viral Templates

Customer-facing product: **AI viral video templates**. Apex is a **minimal brand hub** (name + value + legal). Each template is an **independent brand site** — no public keyword matrix, no “directory of slugs” in the UI.

- Live preview: https://viral-templates.pages.dev
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


## Account center (P0)

Routes (EN + ZH):

- `/account/` Overview (demo balance + recent creations)
- `/account/creations/` Demo jobs: queued / running / ready / failed (no fake downloadable video)
- `/account/credits/` Demo balance + ledger + top-up stub
- `/account/settings/` Profile read-only from session
- `/account/sign-in/` Google button placeholder + **preview fake login**

Auth APIs (Pages Functions):

- `GET /api/auth/session`
- `POST /api/auth/preview` — preview/fake login (HttpOnly `vt_session` cookie)
- `POST /api/auth/logout`

**How to fake-login (acceptance):** open `/account/sign-in/` → **Preview sign-in** (shown on `*.pages.dev` / localhost when Google OAuth is not configured) → lands on `/account/` with avatar in the header.

Brand shells use **relative** `/account/` and `/account/sign-in/?next=` (same host, same `vt_session` / `/api/auth/*`). Middleware keeps that brand’s chrome when context is known (`vt_brand` cookie after visiting `/t/{slug}/`, safe `next=/t/{slug}/…`, or brand host). Static brand account pages also exist at `/t/{slug}/account/…` under the brand layout.

### Known limits (P0)

- No real Google OAuth / Waffo / fal
- Session cookie is **host-only** (not shared across brand hosts). Future parent-domain cookie is P2.
- Brand Account link needs a prior brand-page visit (cookie) or open Sign in with `?next=/t/{slug}/…`
- Ready creations are demo rows only — no generated video files
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
| `AUTH_SECRET` | HMAC for `vt_session` (16+ chars). On `*.pages.dev` / localhost a public preview fallback is used if unset |
| `AUTH_PREVIEW_LOGIN` | `1` force preview login on; `0` off; unset = on for preview hosts when Google OAuth missing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Reserved for real Google OAuth (not wired in P0) |

No R2 / no real domain purchase required for this skeleton.

## Scripts

```bash
npm run dev
npm run build
npx wrangler pages deploy dist --project-name=viral-templates
# or: npm run deploy
```
