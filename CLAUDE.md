# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

No build step — pure static HTML/CSS/JS. Serve from the project root:

```bash
python3 -m http.server 8743
# then open http://localhost:8743/
```

To visually verify changes, use Playwright (installed at `/tmp/node_modules/playwright`):

```bash
node -e "
const { chromium } = require('/tmp/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:8743/');
  await p.screenshot({ path: '/tmp/screenshot.png' });
  await b.close();
})();
"
```

## Deploying

Push to `main` on `github.com/dtco-ai-workforce/website` — no CI/CD config in repo, deployment is triggered externally on push.

## Architecture

**Purely static site** — no framework, no bundler, no npm. Dependencies loaded via CDN:
- Bootstrap 5.3.3 (layout + offcanvas mobile nav)
- Google Fonts: Inter + Noto Sans TC (loaded in each page's `<head>`)

**File layout:**
- `index.html` — main landing page (9 sections, see below)
- `solutions.html`, `cases.html`, `assessment.html`, `contact.html` — placeholder pages
- `assets/css/style.css` — all styles, organized by section ID (`#hero`, `#concept`, `#problem`, etc.)
- `assets/js/main.js` — scroll-triggered `.fade-in` → `.visible` via IntersectionObserver
- `assets/js/hero-canvas.js` — interactive Canvas animation for S1 hero (see below)
- `assets/js/problem-canvas.js` — animated Canvas flowchart for S3 problem section
- `assets/img/` — raster images (e.g. `enterprise-brain.png`)
- `assets/svg/` — module icon SVGs (icon-knowledge, icon-customer, etc.)

## CSS conventions

- CSS variables defined in `:root`: `--black`, `--dark` (`#0b0b0b`), `--white`, `--gray-100/300/500/800`
- Section backgrounds alternate: `section-dark` (dark bg, white text) / `section-light` (white bg, dark text)
- Spacing: `.section-pad` = 110px vertical (80px on tablet)
- Button variants: `.btn-primary-w` / `.btn-outline-w` (white bg/border, for dark sections), `.btn-primary-d` / `.btn-outline-d` (dark bg/border, for light sections)
- `.section-label` — small all-caps eyebrow label above section headings
- Typography uses `clamp()` for fluid responsive sizing on all headings

## Canvas animations

### `hero-canvas.js` (S1 Hero — interactive)
Renders a network of 6 satellite tiles orbiting a central "Decision Hub". The **Customer** tile is draggable — when dropped near the center it triggers a morph animation transforming the layout into an "Enterprise Brain" hub-and-spoke view. States: `orbit` → `morph-in` → `hub` → `morph-out`.

Key internals:
- `DPR`-aware sizing: always set `canvas.width/height` in physical pixels, then `ctx.scale(DPR, DPR)` to draw in logical pixels
- `resize()` called on load and debounced on window resize (120ms)
- `t` is an integer tick counter (increments each frame), used for continuous animations
- `drawTile(x, y, label, opts)` — draws a rounded-rect node; `glow`, `border`, `text` props control intensity
- `rrect()` — reusable rounded-rect path helper

### `problem-canvas.js` (S3 Problem — auto-animated)
Renders a hexagonal closed-loop flowchart: Observe → Understand → Decide → Act → Learn → Evolve. A glowing pulse dot travels around the loop. Uses `IntersectionObserver` to pause `requestAnimationFrame` when off-screen.

Key internals:
- `DPR`-aware, same sizing pattern as hero canvas
- `activeIdx` tracks which arc segment the dot is on; `t` (0–1) is progress along that arc
- `easeInOut()` applied to dot position and node glow transitions
- Canvas is sized as a square equal to its container's width

### Adding new Canvas sections
Follow the IIFE pattern in either canvas file. Always:
1. Guard with `if (!canvas) return`
2. Use `DPR = Math.min(window.devicePixelRatio || 1, 2)`
3. Size canvas in `resize()`: `canvas.width = W * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR)`
4. Wrap in `IntersectionObserver` to pause off-screen
5. Load the script at the bottom of the HTML before `</body>`

## `index.html` section map

| ID | Label | Background | Notes |
|---|---|---|---|
| `#hero` | S1 Hero | dark | Canvas animation, interactive drag |
| `#concept` | S2 AI Workforce | light | Full-width `enterprise-brain.png` below centered text |
| `#problem` | S3 The Problem | dark | Pain list left, canvas closed-loop flowchart right |
| `#modules` | S4 AI Workforce Modules | light | 6 module cards with SVG icons |
| `#cases` | S5 Cases | dark | Case cards with flow-node chips |
| `#assessment-cta` | S6 Assessment CTA | light | Score ring SVG + level list |
| `#implementation` | S7 Implementation | dark | 5-stage horizontal timeline |
| `#about` | S8 About | dark | Capability tags + philosophy block |
| `#final-cta` | S9 Final CTA | dark | Centered CTA |
