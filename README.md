# ShadowPaint

**Client-side Relief & Backlit Painting Studio** (`SPA` / `PWA`, 100% browser-based, no backend required).

Live deployment (GitHub Pages): **[https://bcieloch.github.io/shadowpaint/](https://bcieloch.github.io/shadowpaint/)**

ShadowPaint transforms reference images and manual brushwork into calibrated physical painting instructions combining three independent techniques on a single canvas:

1. **Color Map** — surface paint colors under standard front illumination (`sRGB`, 8-bit `RGBA`).
2. **Height Map** — physical impasto / relief thickness in millimeters (`min_mm`–`max_mm`, default `0–5 mm`), stored as `Float32` during editing and displaced into true 3D vertex geometry casting real shadow maps.
3. **Opacity / Transmission Map** — linear light transmission (`0%` opaque to `100%` clear) evaluated together with physical thickness from the Height Map and optical paint medium parameters according to the **Beer–Lambert law** for backlit canvases.

---

## Key Features

### Synchronized Three-Map System & Import Wizard

- **Formats**: `PNG`, `JPEG`, and `TIFF` (8-bit and 16-bit grayscale/RGB/RGBA decoded in Web Workers via `UTIF.js`, preserving 16-bit precision for Height and Opacity maps).
- **Import Wizard**: Drag-and-drop onto the window or individual slots (`Color`, `Height`, `Opacity`), automatic aspect-ratio and resolution mismatch detection, `Fit` / `Fill` / `Stretch` modes, interactive crop/scale/offset `TransformEditor`, `Flip H/V`, `Rotate 90°`, slot swapping, and side-by-side or difference overlay comparison.
- **Non-Destructive Adjustments**: Per-map live adjustments (Brightness, Contrast, Saturation for Color; Contrast, Gamma, Invert for Height; Max Transmission %, Max Opacity %, Contrast, Invert for Opacity) plus destructive Gaussian `Smooth Map` in `px` or `cm`.

### Physical Canvas Calibration & Measurement Tools

- **Physical Units Everywhere**: Canvas dimensions in `cm`, working resolution in `px`, calibration density in `px/cm` and `DPI`, and relief thickness range in `mm`. `1 unit = 1 cm` in 3D world space.
- **2D / 3D Measurement Grid & Edge Rulers**: Configurable `cm` grid with subdivisions (`OverlayRenderer` in 2D and anti-aliased `fwidth` shader grid in 3D) plus calibrated `cm` edge rulers (`Ctrl+R`, `Ctrl+'`).
- **Ruler Tool (`U`)**: Point-to-point distance measurement in `cm`, `mm`, and `px` with `Δx`, `Δy`, and angle (`Shift` snaps to `15°`).
- **Cross-Section Profile (`X`)**: Interactive surface cut displaying an SVG profile chart of paint thickness (`mm`) and transmission (`%`) over distance (`cm`), with **True scale** (`1 mm Y = 0.1 cm X`) and **Fit** modes, synchronized 2D/3D hover markers, and `CSV` export.
- **Live Cursor Readout**: Real-time status bar readout in both 2D and 3D (via raycasting) showing `px`, `cm`, `RGB #HEX`, exact thickness in `mm` + 8-bit level `L (0–255)`, opacity `T %`, and Beer–Lambert backlit luminance `back T %`.

### WebGL2 Lighting & Optical Simulation Engine

- **Single-Renderer Multi-Pane Architecture**: Imperative Three.js `WebGLRenderer` with on-demand rendering, `setViewport`/`setScissor` split view (`2D | 3D` side-by-side with live 3D cursor projection), and zero-allocation dirty-tile GPU texture uploads (`RGBA8 sRGB` for Color, `R16F HalfFloat` for Height and Opacity).
- **Front Light (`SpotLight`)**: Real-time Cartesian (`X`, `Height above top edge`, `Distance`, `Target X/Y` in `cm`) and Polar (`Incidence θ`, `Elevation`, `Azimuth φ`) positioning, Kelvin (`1800–12000 K`) or RGB color, source diameter, cone angle, penumbra, true shadow maps from displaced relief geometry (`customDepthMaterial`), optional 16-tap Vogel-disk **PCSS** soft shadows, and 3D lamp gizmo.
- **Back Light & Beer–Lambert Paint Optics**: Point or uniform panel emitter behind the canvas, material presets (_Acrylic Opaque_, _Acrylic Glaze_, _Oil Impasto_, _Clear Acrylic Gel_, _Modeling Paste_), absorption $\mu_a$ `[1/mm]`, scattering $\mu_s$ `[1/mm]`, pigment tint strength $k_{\text{tint}}$, canvas transmittance $\tau_{\text{canvas}}$, 12-sample Poisson-disk lateral scatter blur (`mm`), and live SVG transmission curve $T(d)$:
  $$T_{\text{rgb}}(d) = G \cdot \tau_{\text{canvas}} \cdot \exp\bigl(-(\mu_a + \mu_s) \cdot d\bigr) \cdot \text{mix}(1, C_{\text{rgb}}, k_{\text{tint}})$$
- **Combined Mode**: Simultaneous Front + Back lighting with continuous Front $\leftrightarrow$ Back balance, exposure, and front/room ambient controls.

### Painting, Filtering & Masking Tools

- **Tools**: `Brush` (`B`, with `Set` / `Raise` / `Lower` modes in `mm` or `%`), `Eraser` (`E`, lerps `working → base`), `Smooth` (`S`, Laplacian relaxation), `Blur` (`R`, real-time Gaussian dab or parallel worker region blur for large radii), `Gradient` (`G`, linear/radial), `Flood Fill` (`F`, contiguous scanline or global tolerance + fill selection), `Eyedropper` (`I`), and `Pan` (`H` / `Space`).
- **Selection & Protection Mask**: `Rectangle` (`M`), `Ellipse` (`Shift+M`), `Lasso` (`L`), `Magic Wand` (`W`), and `Mask Brush` (`Q`) with `Replace` / `Add` / `Subtract` / `Intersect` modes, Gaussian feathering, marching ants + red mask overlay, and **Protect selected** vs **Edit only inside** modes.
- **Tile-Based Undo / Redo**: `256×256` tile snapshot history (`512 MB` / `200` steps limit) with both **Global Undo/Redo** (`Ctrl+Z` / `Ctrl+Shift+Z`) and **Per-Map Undo** (`Ctrl+Alt+Z`).

### Persistence, Guide, Custom Shortcuts & Production Export

- **Interactive Tutorial & Complete Feature Guide (`F4`)**: Built-in 6-step interactive tutorial with one-click studio actions plus a comprehensive 6-category feature reference showing live effective keyboard shortcuts.
- **Customizable Keyboard Shortcuts (`?`)**: Rebind any tool, brush adjustment, map selector, file operation, or layout shortcut directly in the Keyboard Shortcuts dialog with automatic conflict detection, IndexedDB persistence (`meta.customShortcuts`), and per-item or full reset.
- **IndexedDB Autosave**: Debounced background compression (`fflate` in `io.worker`) into Dexie (`shadowpaint` database), session restore dialog on startup, and Recent Projects manager with storage quota estimation.
- **Lossless `.relief` / `.zip` Project Archives**: Full `Float32` and `RGBA8` `base`/`working` buffers with `CRC32` verification, PNG preview fallback, and File System Access API integration (`Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+O`).
- **Offline PWA**: Service Worker precaching (`vite-plugin-pwa` + `workbox-window`) with installable standalone manifest and localized update prompt.
- **Bilingual UI & PDF (`EN` / `PL`)**: Complete English and Polish localization across all panels, dialogs, tutorial guide, shortcuts, error messages, and exported PDF documentation.

---

## Studio Layout & Preview Modes

```text
┌──────────────────────────────────────────────────── TopBar ─────────────────────────────────────────────────────┐
│ ◆ ShadowPaint │ New │ Open │ Save ▾ │ Export Package │ ↶ ↷ │ [2D | 3D | Split] │ ● Saved │ Guide │ Shortcuts │ EN/PL │
├─ LeftPanel (Import · Maps · Tools · Options) ─┬─────── Viewport (2D / 3D / Split) ───────┬─ RightPanel (Tabs) ──┤
│ • Import slots (Color / Height / Opacity)     │ Mode Bar: COLOR · HEIGHT (Gray/Heat/Topo)│ • Map                │
│ • Map layers (active, lock 🔒, per-map undo)  │           OPACITY · FRONT · BACK         │ • Canvas             │
│ • Tool palette (15 tools)                     │           COMBINED · 3D VIEW             │ • Light              │
│ • Context-sensitive tool options              │ Interactive 2D canvas + 3D WebGL scene   │ • Material           │
│                                               │ Measurement grid, edge rulers & legends  │ • Section            │
│                                               │                                          │ • Export             │
├───────────────────────────────────────────────┴─────────────── StatusBar ────────────────┴──────────────────────┤
│ x 1234 px (20.57 cm), y 2100 px (35.00 cm) │ RGB #A3B1C2 │ H 2.500 mm (L=128 → 2.510 mm) │ T 64.2% │ back T 31% │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Keyboard Shortcuts

Press `?` anywhere in the studio to open the Keyboard Shortcuts dialog and customize keybindings, or press `F4` to open the Interactive Tutorial & Feature Guide (on macOS, `Cmd` replaces `Ctrl`).

| Default Shortcut                     | Action                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `B` / `E` / `S` / `R`                | Brush / Eraser / Smooth brush / Blur brush                                            |
| `G` / `F` / `I` / `H`                | Gradient / Flood fill / Eyedropper / Pan tool                                         |
| `M` / `Shift+M` / `L` / `W` / `Q`    | Rectangle / Ellipse / Lasso / Magic wand / Protection mask brush                      |
| `U` / `X`                            | Measurement ruler / Cross-section profile cut                                         |
| `Space` (hold)                       | Temporary pan                                                                         |
| `[` / `]`                            | Decrease / increase brush size                                                        |
| `Shift+[` / `Shift+]`                | Decrease / increase brush hardness                                                    |
| `4`–`9`, `0` / `Alt+1`–`3`           | Brush flow `40%`–`90%`, `100%` / `10%`–`30%`                                          |
| `1` / `2` / `3`                      | Select active map (`Color` / `Height` / `Opacity`)                                    |
| `Ctrl+A` / `Ctrl+D` / `Ctrl+Shift+I` | Select all / Clear selection / Invert selection                                       |
| `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y`) | Global Undo / Redo                                                                    |
| `Ctrl+Alt+Z`                         | Undo active map edit                                                                  |
| `Ctrl+Alt+N` / `Ctrl+O` / `Ctrl+I`   | New project / Open `.relief` or `.zip` / Open Import Wizard                           |
| `Ctrl+S` / `Ctrl+Shift+S` / `Ctrl+E` | Save project / Save project as… / Export production package (ZIP)                     |
| `F1` / `F2` / `F3` / `F4`            | `2D` layout / `3D` layout / `Split 2D \| 3D` layout / Tutorial & Feature Guide        |
| `Shift+1`…`Shift+7`                  | Switch view mode (`Color`, `Height`, `Opacity`, `Front`, `Back`, `Combined`, `3D`)    |
| `Ctrl+0` / `Ctrl+1` / `+` / `-`      | Fit canvas to viewport / Zoom `100% (1:1)` / Zoom in & out                            |
| `Home`                               | Reset 3D camera                                                                       |
| `Ctrl+R` / `Ctrl+'` / `Tab` / `?`    | Toggle 2D edge rulers / Toggle measurement grid / Hide side panels / Shortcuts dialog |
| `Esc`                                | Clear active ruler or cross-section line / Close dialog                               |

---

## File Formats & Production Export

### Production Export Package (`shadowpaint_<slug>_<YYYYMMDD-HHmm>.zip`)

Generated 100% client-side in `io.worker` (each file can also be downloaded individually from the **Export** tab):

| File                     | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color_map.png`          | Full-resolution 8-bit `sRGB` PNG (`Color Type 2` RGB, or `Color Type 6` RGBA when alpha export is enabled) encoded via `fast-png`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `height_map.png`         | True 8-bit grayscale PNG (**`Color Type 0`**, `bitDepth: 8`, 1 channel) via `fast-png`, where pixel level $L = \text{round}(h_{\text{eff}} \cdot 255)$ maps linearly to $[d_{\min}, d_{\max}]\text{ mm}$.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `opacity_map.png`        | True 8-bit grayscale PNG (**`Color Type 0`**, `bitDepth: 8`, 1 channel) via `fast-png`, where $0$ = full opacity and $255$ = maximum transmission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `project_settings.json`  | Complete `ProjectSettings` schema (`format: "shadowpaint-settings"`, `schemaVersion: 1`) plus `derived` physical calibration metrics (`pxPerCm`, `dpi`, `mmPerLevel8`, world light coordinates), PNG metadata, and map statistics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `documentation.pdf`      | Multi-page Unicode PDF (`jsPDF` with embedded `DejaVuSans` / `DejaVuSans-Bold` fonts for English, Polish, and mathematical symbols):<br>1. **Project Summary & 3D Lighting Previews** (`Front`, `Back`, `Combined`)<br>2. **Color Map** with physical `cm` scale bar<br>3. **Height Map** (8-bit Grayscale + Turbo Heatmap, `mm` legend, and percentage/8-bit level $\rightarrow \text{mm}$ conversion table)<br>4. **Opacity Map** with transmission legend and statistics<br>5. **Lighting & Material Optics** specification tables + Beer–Lambert formula<br>6. **Reference Grid — Color Map** (`A, B, C…` / `1, 2, 3…` grid at configurable `cm` spacing with `1 cm` edge ticks)<br>7. **Reference Grid — Height & Contours** (`1 mm` isolines)<br>8. **Optional 1:1 Printable Tiles** (`Tile A1…` at true `1 cm = 10 mm` scale with `1 cm` overlap seams, registration marks, and a `10 cm = 283.46 pt` printer calibration ruler). |
| `previews/preview_*.png` | High-resolution orthographic 3D renders for `front`, `back`, and `combined` lighting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Project Archive (`.relief` / `.zip`)

Lossless project container packed and unpacked by `io.worker`:

- `manifest.json` (`format: "shadowpaint-project"`, `formatVersion: 1`)
- `project_settings.json`
- `maps/color.{base,working}.rgba` (`Uint8` RGBA), `maps/height.{base,working}.f32` (`Float32` little-endian), `maps/opacity.{base,working}.f32` (`Float32` little-endian), optional `maps/selection.u8`
- `maps/index.json` (dimensions, data types, endianness, and `CRC32` checksums)
- `previews/{color_map,height_map,opacity_map,thumbnail}.png` (human-readable previews and automatic fallback source if raw buffers are omitted)

---

## Tech Stack

- **Framework & UI**: React 19, TypeScript (`strict`, `noUncheckedIndexedAccess`), Vite 8, Tailwind CSS v4, shadcn/ui (Radix UI), Lucide icons, Sonner toasts
- **State & History**: Zustand + Immer + custom `MapRegistry` (typed arrays outside React state) & `TileHistory` (`256×256` tiles)
- **3D & Shaders**: Three.js (`r187`, WebGL2) + custom GLSL ES 3.00 shaders (`displace.vert.glsl`, `heightNormal.frag.glsl`, `backlight.frag.glsl`, `flatView.frag.glsl`, `colormaps.glsl`, `grid.frag.glsl`)
- **Imaging & Workers**: Web Workers + Comlink + row-stripe worker pool (`src/workers/pool.ts`), `UTIF.js`, `fast-png`, `fflate`, `jsPDF`
- **Persistence & PWA**: Dexie.js (IndexedDB), File System Access API, `vite-plugin-pwa` + `workbox-window`
- **Testing & Quality**: Vitest + Testing Library + `fake-indexeddb`, Playwright (Chromium WebGL2 E2E), ESLint 10 (with strict architectural layer boundary rules), Prettier

---

## Development

Requirements: **Node.js >= 22 LTS** and **`pnpm`**.

```bash
pnpm install
pnpm dev
```

### Scripts

- `pnpm dev` — start the Vite development server
- `pnpm build` — typecheck and build the production bundle + Service Worker into `dist/`
- `pnpm preview` — preview the production build locally
- `pnpm typecheck` — run TypeScript compiler checks (`tsc -b --noEmit`)
- `pnpm lint` — run ESLint across the repository
- `pnpm test` — run unit and component tests with Vitest
- `pnpm test:e2e` — build and run the Playwright Chromium E2E test suite
- `pnpm check` — run `pnpm typecheck && pnpm lint && pnpm test`

### GitHub Pages Deployment

The project is configured with `base: './'` in `vite.config.ts` and a relative PWA manifest (`start_url: './'`, `scope: './'`) so it runs from any subpath without `SharedArrayBuffer` or custom COOP/COEP headers. Pushes to `main` automatically run `pnpm check`, build `dist/`, and deploy to GitHub Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

---

## Credits

- **Created by:** Brajan Cieloch
- **Original idea:** Mateusz Prawecki

## License

GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).

Source repository: [https://github.com/bcieloch/shadowpaint](https://github.com/bcieloch/shadowpaint).
