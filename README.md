# ShadowPaint

Browser-based studio (SPA / PWA) for designing physical multi-technique paintings combining:

- **Color Map** — traditional painted surface colors under standard illumination.
- **Height Map** — physical impasto / relief thickness in millimeters (`min_mm`–`max_mm`), displaced into real 3D geometry casting true shadows.
- **Opacity / Transmission Map** — light transmission through thin paint layers evaluated against physical paint thickness and optical material properties (Beer–Lambert attenuation) for backlit canvases.

All image processing, WebGL2 rendering, project archiving, and print documentation export run 100% client-side in the browser.

## Tech Stack

- React 19 + TypeScript + Vite
- Zustand + Immer
- Tailwind CSS v4 + shadcn/ui
- Three.js + custom WebGL2 / GLSL shaders
- Web Workers (Comlink) + OffscreenCanvas + TypedArrays
- UTIF.js (TIFF), fast-png (8-bit grayscale PNG), fflate (ZIP / `.relief`), jsPDF (PDF), Dexie.js (IndexedDB)

## Development

Requirements: Node.js >= 22 LTS and `pnpm`.

```bash
pnpm install
pnpm dev
```

### Scripts

- `pnpm dev` — start the Vite development server
- `pnpm build` — typecheck and build production bundle into `dist/`
- `pnpm preview` — preview the production build locally
- `pnpm typecheck` — run TypeScript compiler checks
- `pnpm lint` — run ESLint
- `pnpm test` — run unit tests with Vitest
- `pnpm test:e2e` — run Playwright end-to-end tests
- `pnpm check` — run `typecheck`, `lint`, and `test`

## Languages

The UI and exported PDF documentation support **English** (default) and **Polish**, switchable directly from the top toolbar.

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
