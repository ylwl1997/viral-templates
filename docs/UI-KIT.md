# Multi-site UI Kit

Shared design system for **Viral Templates** hub + every keyword brand site.

**Path:** `src/design/` (CSS) + `src/design/components/` (Astro sections)  
**Entry:** `src/styles/global.css` → `@import '../design/index.css'`

Goal: **同构异貌** — same structure & quality bar, distinctly different brand look.  
Do **not** ship a new site by swapping only the logo (or only `--accent`).

Visual bar: warm or brand-tinted paper, real display tracking, thin rings, one ink primary per view, 9:16 media on live cards. Color belongs in the poster, not in neon chrome, gradient buttons, or gradient headlines.

---

## 30-minute checklist for a new brand site

1. **Add a template** in `src/lib/templates.ts` with a full `theme` object (required fields below).
2. **Drop a logo** under `public/brand/templates/{slug}.svg` (or png).
3. **Copy EN+ZH copy** (displayName, tagline, hero, how, SEO, disclaimer) — customer-safe, no ops jargon.
4. **Reuse kit only** — `KeywordLayout` + `BrandHero` / `StepsHow` / `PricingGrid` / `CreateStudio` / account shells. Do not invent a new CSS file.
5. **Smoke:** open `/t/{slug}/`, `/t/{slug}/create/`, `/t/{slug}/account/sign-in/` — brand chrome, relative account paths, EN+ZH.
6. **Visual check:** side-by-side with an existing live brand; if they look like recolors of each other, change `heroPreset` / `typeVoice` / `cardStyle` / `coverStyle` / `ambience`, not just accent.

---

## Required `theme` fields (BrandTheme)

```ts
theme: {
  accent: 'magenta' | 'amber' | 'cyan' | 'violet' | 'rose' | 'lime' | 'orange' | 'sky' | 'slate',
  heroPreset: 'centered' | 'split' | 'editorial',
  typeVoice: 'playful' | 'bold' | 'cool',
  cardStyle: 'glow' | 'ribbon' | 'mesh' | 'soft',
  coverStyle: 'orb' | 'stripes' | 'radial' | 'grid',
  ambience: 'none' | 'noise' | 'grid',
}
```

| Field | What it changes |
|-------|-----------------|
| `accent` | Link, eyebrow, and small rules. Buttons stay ink. |
| `heroPreset` | Hero composition (`BrandHero`) |
| `typeVoice` | Display family, weight, tracking, hero size |
| `cardStyle` | Quiet card edge: soft shadow, left ribbon, paper hatch, or flat |
| `coverStyle` | Fallback fill when a live poster is missing; soon cards |
| `ambience` | Paper grain (`noise`) or typesetting baseline (`grid`) |

Also required (outside `theme`): `logo`, EN+ZH names/taglines/hero/how/SEO/disclaimer, `photoCount`, `status`.

`KeywordLayout` stamps these onto `<body>` as `data-theme`, `data-hero`, `data-voice`, `data-card`, `data-cover`, `data-ambience`. CSS in `src/design/themes.css` + `sections.css` consumes them.

---

## Live reference presets (must stay visually distinct)

| Slug | heroPreset | typeVoice | cardStyle | coverStyle | ambience |
|------|------------|-----------|-----------|------------|----------|
| `bby-wow` | split | playful | glow | orb | noise |
| `kiss-cam` | editorial | bold | ribbon | stripes | grid |
| `ceiling-fan` | centered | cool | mesh | radial | none |

Acceptance: three brand homes side-by-side are obviously different sites, not logo swaps.

---

## Hub vs brand

| Surface | Shell | Look |
|---------|-------|------|
| Apex `/` | `Layout` (`data-shell="hub"`) | Cream paper hub — serif headlines, ink CTA, 9:16 reel |
| `/t/{slug}/*` | `KeywordLayout` (`data-shell="brand"`) | Independent brand site via full theme |
| Account | Same shell as current surface | Relative `/account/*` — **never** jump brand → apex absolute |

---

## Kit inventory

### CSS
- `tokens.css` — shared token structure
- `base.css` — reset, wrap, section rhythm, ambience layers
- `primitives.css` — Button, Badge, Card, Callout, Input/upload, Empty, Accordion, Avatar
- `sections.css` — Header, Footer, Hero presets, Gallery, Steps, Pricing, Create studio, Account, Sign-in, Final CTA
- `themes.css` — per-brand accent skins + voice/card drivers

### Astro sections (`src/design/components/`)
- `SiteHeader`, `SiteFooter`
- `BrandHero`, `TemplateGallery`, `StepsHow`, `PricingGrid`, `FinalCta`
- `EmptyState`, `Accordion`

### App shells (product IA — keep shared)
- `components/CreateStudio.astro`, `HubCreate.astro`
- `components/account/AccountShell.astro`, `AccountFrame.astro`, `SignInPanel.astro`
- `components/HeaderAuth.astro`

---

## Hard rules

1. Brand account UI stays in brand chrome with **relative** paths (no apex absolute jump).
2. No ops jargon in customer UI (no keyword matrix / subdomain registry copy).
3. **Zero customer-facing engineering jargon:** ban stub / fal / Waffo / Wire / env / Cloudflare (only `?debug=1` may show eng hints). Use **Coming soon** / **Demo** (ZH: **即将开放** / **演示**).
4. **Live templates require a 9:16 media slot** (still or loop poster). Gradient+icon alone is not enough for Live.
5. **One ink primary CTA per viewport.** Secondary actions are text. Disabled controls stay quiet — never a filled primary.
6. Generate without a video provider still requires consent and a photo. Signed-in Generate queues a saved job (queued, no file). Unsigned Generate goes to sign-in with `next=`. Do not mark that job ready or attach a download. Pay stays **Coming soon** until checkout exists.
7. Unsigned account: centered Sign-in card only — do not expose Creations/Credits/Settings shell. Sign-in: no fake Google button if OAuth unwired; Preview only when available.
8. EN + ZH for all chrome strings.
9. Do not fork ShrimpReel / switch frameworks; visual bar only (RicoFast / PowerAI density).
10. **Forbidden:** new site with only `logo` + `accent` changed. Fill every `BrandTheme` field and pick a distinct preset combo.

---

## Copying the kit into another repo

1. Copy `src/design/` entirely.
2. Point that site’s global CSS at `design/index.css`.
3. Import section components (or re-export from a tiny `packages/ui` later).
4. Provide a brand config object with the same `BrandTheme` shape.
5. Keep Account / Create IA identical; swap logo + theme + copy only.
