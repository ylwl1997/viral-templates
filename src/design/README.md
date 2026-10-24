# Design kit (`src/design`)

Shared UI kit for Viral Templates hub + every keyword brand site.

- **CSS**: `tokens.css` → `base.css` → `primitives.css` → `sections.css` → `themes.css`
- **Components**: `components/*.astro` (Header/Footer/Hero/Gallery/Steps/Pricing/…)
- **Brand theming**: set `theme` on each template in `src/lib/templates.ts` — see `docs/UI-KIT.md`

Import CSS via `src/styles/global.css` (re-exports this folder). Do not invent per-site CSS.
