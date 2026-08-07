# IEEE IES Student Branch Chapter of SLTC

A responsive multi-page website for the IEEE Industrial Electronics Society Student Branch Chapter of SLTC. The homepage introduces the chapter, while the standalone `/masterminds/` page presents its Advisory Panel, Executive Committee, and Sub-Committee.

## Run locally

```bash
npm install
npm run dev
```

The development server uses port `8086`.

## Production build

```bash
npm run build
npm run preview
```

The generated production files are written to `dist/`.

## Project structure

- `src/IESWebsite.jsx` — homepage composition and global back-to-top control
- `src/MastermindsWebsite.jsx` — standalone Masterminds page composition
- `masterminds/index.html` — Vite HTML entry for `/masterminds/`
- `src/components/layout/` — header and footer
- `src/components/sections/` — homepage and Masterminds page sections
- `src/components/ui/` — shared presentational components
- `src/data/siteContent.js` — navigation and editable section content
- `src/hooks/` — page scroll, active-section, and reveal behavior
- `src/index.css` — responsive visual system and motion
- `src/assets/` — original and web-optimized IES logo files
- `scripts/prepare-logos.ps1` — recreates the trimmed web logo derivatives
- `scripts/verify-production.ps1` — performs a bounded production preview and desktop/mobile browser check

## Content notes

Only confirmed chapter identity, broad IES subject areas, and the supplied committee roles and names are shown. Statistics, awards, named events, committee member photos, contact details, social links, and partner logos should be added after the official content is supplied.

The “What’s ahead” panel in `src/components/sections/Activities.jsx` is the intended first replacement point for confirmed event data and media.
