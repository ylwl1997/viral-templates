# Viral Templates（一词一子域）

One Astro repo → **one keyword per subdomain** skeleton. Apex is a **light directory** only (not a template-wall product).

- Live preview: https://viral-templates.pages.dev
- Repo: https://github.com/ylwl1997/viral-templates
- Stack: Astro static · Cloudflare Pages (+ optional Pages Function for Host rewrite) · EN + `/zh/` · Generate/Pay stubs

## Model

| Host / path | Renders |
|-------------|---------|
| `apex` / `www` | Light directory (live + soon) |
| `{slug}.apex` | That keyword’s single-site home |
| `{slug}.apex/create/` | Create studio (live only) |
| `/t/{slug}/` | **Path fallback** — same shell without DNS |
| `/zh/t/{slug}/` | Chinese shell |
| Unknown subdomain | Friendly `/unknown-site/` (404 via Function) |

**Live:** `bby-wow`, `kiss-cam`, `ceiling-fan`  
**Soon:** `bulin-47`, `zombie-love`, `smalltown-boy-cats`, `clapping-cat`, `knight-cat`, `car-jump`

Registry: `src/lib/templates.ts`  
Apex / env helpers: `src/lib/site.ts` (`PUBLIC_SITE_APEX`, default `viral-templates.pages.dev`)

## Path fallback (P0 — no DNS)

```text
https://viral-templates.pages.dev/t/bby-wow/
https://viral-templates.pages.dev/t/kiss-cam/
https://viral-templates.pages.dev/t/ceiling-fan/
https://viral-templates.pages.dev/t/clapping-cat/    # coming soon shell
https://viral-templates.pages.dev/zh/t/bby-wow/
https://viral-templates.pages.dev/                       # directory
```

## Production wildcard custom domain

1. In Cloudflare DNS for your apex (e.g. `example.com`):
   - `CNAME` / proxied record for apex → Pages project `viral-templates`
   - Wildcard: `*.example.com` → same Pages project (proxied)
2. Pages → Custom domains: add `example.com` and `*.example.com` (or add one subdomain and enable wildcard per CF UI).
3. Set Pages env **`PUBLIC_SITE_APEX=example.com`** (no protocol) so middleware + site copy agree.
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
# Expect rewrite to keyword shell (200). Path in browser bar stays on subdomain when using real DNS.

curl -sI -H "Host: not-a-template.viral-templates.pages.dev" http://127.0.0.1:8788/
# Expect 404 unknown-site

# Against production project hostname (Function runs on Pages; Host must match PUBLIC_SITE_APEX)
curl -sI -H "Host: bby-wow.example.com" https://viral-templates.pages.dev/
```

Note: Sending a custom `Host` to `*.pages.dev` from the public internet may not behave like local `wrangler pages dev`. Prefer `wrangler pages dev` or a real wildcard custom domain for Host tests.

## Env checklist

| Key | Purpose |
|-----|---------|
| `PUBLIC_SITE_APEX` | Apex hostname for directory + subdomain mapping (default `viral-templates.pages.dev`) |
| `FAL_KEY` / `FAL_API_KEY` | Real image→video (not wired in P0 UI) |
| `FAL_MODEL` | fal model id |
| `WAFFO_*` | Payments (stub only) |
| `PUBLIC_GA4_MEASUREMENT_ID` | GA4 |
| `PUBLIC_ADSTERRA_SOCIAL_BAR_ZONE` | Adsterra Social Bar |

No R2 / no real domain purchase required for this skeleton.

## Scripts

```bash
npm run dev
npm run build
npx wrangler pages deploy dist --project-name=viral-templates
# or: npm run deploy
```
