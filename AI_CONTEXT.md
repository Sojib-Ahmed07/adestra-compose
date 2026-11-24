# AI_CONTEXT.md — Shop tools (photo studio / computer shop toolkit)

> **For any AI assistant:** this file is the single source of truth for this project. Read all of it before writing code.
> The owner attaches it (with `START-HERE.md` and a zip of the project) at the start of every new chat.
>
> **Your first reply in a new chat:** confirm in one line that you've read it, restate the task, list every file you will
> create or change, list any `npm install` / `db:push` / env changes, and ask for the current contents of any file you need
> to edit that you haven't been shown. **Never guess what an existing file contains.**

Last updated: **24 Nov 2026 (3)** — Joint photo rebuilt simple (2 sizes, blend slider, no effects, no overlap). Earlier today: Best NID reader (Cloudflare Workers AI, free) + offline double-check. Earlier: NID reader: scan / PDF pages split by white space; label-line junk and খান fixed. 23 Nov: NID reader tested on the owner's real cards; scans / PDF pages with both sides; Tools trimmed (PDF, Bangla typing, calculators, image resize, page arranger, job photo and shop accounts removed); address back to 5 boxes; NID address checked against Bangladesh's places list; order presets in Passport photo sheet.

---

## 0. Quick facts

| Item | Value |
| --- | --- |
| Product | A private toolkit for the owner's **own photo studio / composing / computer shop** in Bangladesh. Not a public SaaS. |
| Users | **Owner** and **operators** (shop staff). Nobody can sign up; the owner adds people in Settings › Team. |
| Money | **No payments, no credits.** Every tool is free to use for the shop's staff. |
| Inspiration | Feature set of sohozkaj.com and alltoolsbd.netlify.app (see §10). Build our own versions — never copy their text, template artwork or branding. |
| Language | **JavaScript only** (`.js` / `.jsx`). No TypeScript files, no type annotations (JSDoc is fine). |
| Stack | Next.js **16.4.6 (pinned)** (App Router, Turbopack) · React **19.3** · Tailwind CSS **4.3.4 (pinned, via `@tailwindcss/postcss`)** · lucide-react · zod **v4** · Better Auth **1.7** · Drizzle ORM + `pg` · Neon Postgres · pdf-lib (sheet PDFs) · fflate (ZIP, also builds the CV .docx) · @fontsource/poppins **5.3.0** (CV font) · avro-phonetic · tesseract.js **7** (NID reader) · onnxruntime-web (WASM) + MODNet model · MediaPipe Face Mesh (legacy) |
| Privacy | Customer photos and documents are processed in the browser with `<canvas>`. **One exception (owner's decision, 18 Nov 2026):** the optional "Best" background removal sends the photo to the shop's own Cloudflare Worker (see §4 "Best cut-out"); "Offline" sends nothing. **Second exception (owner's decision, 24 Nov 2026):** the optional "Best (Cloudflare AI)" NID reader sends the card pictures to the same Worker (Workers AI: zero data retention, not used for training, also on the free plan); "Offline" sends nothing. Gemini's free tier was rejected for NIDs (Google may keep / human-review free-tier input; its terms forbid personal data there). The database holds logins and settings. (The shop-accounts tables are still in the schema but nothing uses them since 23 Nov — kept so no data is lost.) |
| UI language | English labels with Bangla tool names/subtitles. Bangla text uses Noto Sans Bengali. |
| Owner's machine | Windows, PowerShell. Node 20.9+. See §4 "Native files on Windows". |

---

## 1. How the owner wants to work (IMPORTANT)

1. **Batches.** One batch of related features at a time, fully working, then stop.
2. **No fake controls.** Every button works. A tool only appears in `src/lib/tools.js` (hub + sidebar) when its page works end to end. No "coming soon" cards.
3. **No hardcoded business text.** Shop name/phone/address live in Settings (DB). Numbers that can be computed are computed.
4. **Deliver separate files** (or write them straight into the project folder when the desktop app is connected). Every file's
   first line is a comment with its path (`// src/lib/tools.js`; for client files it goes above `"use client";`).
   Say where each file goes and whether it's NEW or replaces an existing one.
5. **Full files**, not snippets, unless asked.
6. **End every batch with numbered setup steps** (installs, `npm run db:push` if the schema changed, env vars, restart `npm run dev`).
7. **Short, plain explanations.**
8. **After each batch, add a row to the Progress log (§9).**

---

## 2. Golden rules (code)

1. JavaScript only.
2. Photos/documents are processed in the browser. Don't upload customer files to a server unless a batch explicitly needs it
   (and then say so to the owner first). The only upload today is the optional Best cut-out (§4); keep its Offline choice.
3. Don't redesign. Use the tokens (§5) and components in `src/components/ui`. No UI libraries (shadcn, MUI, Chakra…).
4. Server Components by default; `"use client"` only where needed. Never import `src/db/**` or `src/server/**` in a client file.
5. Every Server Action re-checks the user (`getCurrentUser()` / `getOwner()`), validates input with zod, returns
   `{ ok, error?, fieldErrors? }`, logs with `logError(tag, err)`, and calls `revalidatePath`.
6. Works at **390px** wide with no horizontal scroll.
7. Must not make fake/forged documents. The NID tool only prints the customer's own card scans; it never generates cards or edits
   details. Same rule for any future certificate/ID-style tool.
8. Keep `npm run build` green.

---

## 3. Run the project

```bash
npm install
copy .env.example .env.local      # fill in DATABASE_URL (Neon pooled), NEXT_PUBLIC_SITE_URL, AUTH_SECRET
npm run db:push                   # create/update tables from src/db/schema.js
npm run user:add -- --email you@shop.com --password "min 8 chars" --name "Your Name" --owner
npm run dev                       # http://localhost:3000   (GET /api/health checks the DB)
npm run build                     # production build check
npm run format                    # Prettier (printWidth 130)
```

- `user:add` again for the same email = change password (and `--owner` promotes). It also switches a removed person back on.
- Env vars: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (must match the browser URL), `AUTH_SECRET` (32+ chars). Optional:
  `CUTOUT_URL` + `CUTOUT_KEY` (Best cut-out on Cloudflare; empty = offline only).

---

## 4. Tech notes that trip up AI models

- **Native files on Windows (IMPORTANT).** Windows Smart App Control / Application Control blocks unsigned native `.node`
  files ("An Application Control policy has blocked this file" → "Turbopack is not supported… only WASM bindings"). The owner
  turned Smart App Control off on 10 Nov 2026. `next` 16.4.6 (owner upgraded from 16.4.4) and `tailwindcss` / `@tailwindcss/postcss` 4.3.4 are pinned to
  exact versions; keep them pinned and don't run `npm update`. When adding packages, prefer pure JavaScript / WebAssembly ones —
  tesseract.js and avro-phonetic are.
- **Next 16.4:** `params` / `searchParams` are Promises (`const { x } = await searchParams`). Read `node_modules/next/dist/docs/`
  when unsure — this version differs from older training data (see `AGENTS.md`).
- **`cacheComponents` is OFF** in `next.config.mjs` (logged-in app; every page is per-request). Don't turn it on without
  wrapping every session read in `<Suspense>`.
- **Middleware is `src/proxy.js`** (`export function proxy`). It only checks for a Better Auth session cookie. Real checks:
  `requireUser()` in `app/(app)/layout.jsx`, `getCurrentUser()` / `getOwner()` in actions.
- **Better Auth:** email + password, `disableSignUp: true`. Users are created by `addMember` (Settings) or `src/db/add-user.js`
  with `hashPassword` from `better-auth/crypto` + a `credential` row in `accounts`. `role` (owner|operator) and `active` are
  `input: false`. Switching someone off sets `active=false` and deletes their sessions; `signIn` refuses inactive people.
- **Tailwind v4:** tokens in `@theme { … }` in `src/app/globals.css`. No `tailwind.config.js`. CSS goes through PostCSS
  (`postcss.config.mjs` → `@tailwindcss/postcss`).
- **Form controls** (`components/ui/form.jsx`) are full-width unless you pass a width class (`w-40`, `min-w-…`, `flex-1`).
  Use `NumberInput` for typed numbers — it only clamps on blur/Enter.
- **Photo engine** (`src/lib/photo/`, browser only):
  - `image.js` — `loadImage(file)`, `renderEdit(img, edit, w, h, { fit })` draws a cropped/adjusted photo. `Edit` =
    `{ zoom, x, y, rotate, turn, flip, brightness, contrast, saturation }`; x/y are fractions of the frame, so the same edit
    renders identically at preview size and at 300 DPI. `previewSource` downsizes big photos for smooth previews.
  - `sizes.js` — `photoSizes`, `paperSizes`, `ID_CARD`, `PX_PER_MM` (300 DPI).
  - `sheet.js` — **`layoutGrid`** (default, "Grid — easy cutting"): same-size cells in rows × columns; spare paper shared out
    as cutting space to the page corners (`spread`); small sizes share a cell (`pair`: up to kx × ky copies when they fit the
    main photo's width and ≤ 15% more height → 2 stamps 20 × 25 = one 38 × 53 cell, so A4 = 5 × 5 and "4 passport + 2 stamp"
    or "3 passport + 4 stamp" is one row); `cols` / `rows` limits; `item.group` keeps one customer's sizes together;
    pages carry `page.guides` (lines across the page above/below each row + short lines between cells) that `renderPage`
    draws first when cutting lines are on. `layoutFor(opts)` picks grid or pack (`opts.mode`). SheetPanel settings are
    saved under `sheet3:<key>` (16 Nov defaults measured from the shop's studio PDF: top edge 3.8 mm, `gapX` 3 mm = least space
    left–right — with `spread` the spare width is shared equally between both edges and every gap — and `gapY` 4.23 mm fixed
    between rows; `spreadY` (off) would spread rows down the page). Packing tries upright, then **turned sideways (`rot`)**,
    then 15% taller; shared photos are centred with the spare room shared around them; `renderPage` draws `rot` placements a
    quarter turn left and a 0.17 mm #9d9d9d line just outside every photo; page-wide guides only with `opts.guides`. **Reusing a sheet:** `opts.used` = areas of page 1 already printed on (`{ x, y, w, h }` mm); any space touching one
    is skipped, so it still works when the next customer needs other sizes. SheetPanel's `ReuseSheet` map: tap spaces, or
    "Printed — mark as used" (adds `page.spaces` of page 1), "New sheet" clears; kept in localStorage, dropped when the paper
    or its direction changes. `grid.spaces` lists page 1's spaces with `used`; `renderPage(..., { preview: true })` shades used
    areas (never printed).
    `layoutSheet(items, paper, { margin, gap, newRowPerItem, position })` ("Pack tight": row packing, multi-page; `position`
    top-left | top | center shifts each page's block) and `renderPage`. `roomOnLastPage(items, paper, opts)` → how many more of
    the last item with `setCopies` fit without a new page (SheetPanel's "Fill the page"). SheetOutput: **Ctrl+P prints the
    sheet** (not the web page).
    A `SheetItem` is `{ key, label, wMm, hMm, copies, newRow?, draw(pxPerMm) }`; `key` must change whenever the picture changes
    (cache key).
  - `export.js` — `canvasToBlob`, `encodeUnder(canvas, maxBytes)` (quality binary search), `downloadBlob`,
    `canvasesToPdf` (pdf-lib, exact paper size), `printCanvases` (hidden iframe + `@page size`).
  - `signature.js` — `cleanSignature(canvas, { strength, ink })`.
  - `image.js` also has `drawEdit(ctx, img, edit, box, fit)` — same drawing into part of an existing canvas without clearing or
    clipping (joint photos let cut-outs overlap).
  - `adjust.js` — Photoshop-style adjustments (pure arrays): `look.adj` = `{ exposure, levels, curves, balance, hsl }`
    (see file header; missing parts = no change). Fixed order Exposure → Levels → Curves → Color Balance (GIMP-style tone
    weights, preserve luminosity) → Hue/Saturation (master + 6 colour ranges, ±15° full / ±45° fade). `compileAdjust` →
    `applyAdjust(rgb, n, c)`; `histogram(rgba)`; `autoTone` (per-channel 0.1% clip), `autoContrast` (one black/white point),
    `autoColor` (dark/light colours + neutral mid-tones gamma 0.8–1.25); `curveTable` (monotone cubic).
  - `card.js` — `findCardCorners(img)` (colour vs table → biggest region → biggest 4-sided shape; `found:false` = whole photo
    inset), `findTwoCards(img)` (front + back in one photo: two biggest regions, or one region split in two card-shaped halves;
    reading order) and `warpQuad(img, corners, w, h)` (perspective flatten; turns a standing card to landscape).
  - `enhance.js` — `enhanceScan(canvas, { level: off|clear|extra, grey, brightness, contrast })` for card / document prints:
    white balance from the card white, levels, a little colour, sharpening. Never changes content.
- **Photo AI** (`src/lib/photo/ai/`, browser only, fully offline, files in `public/vendor` via copy-vendor):
  - `faces.js` — MediaPipe Face Mesh (legacy `@mediapipe/face_mesh`, loaded with a `<script>` from `/vendor/facemesh/`).
    `findFaces(canvas)` → biggest first `{ eyeL, eyeR, top (forehead, lm 10), chin (152), nose, sideL, sideR, box, pts }` in pixels
    (`pts` = all 468 mesh points as a Float32Array x, y, …; portrait.js maps them into `face.pts` of the portrait).
    Calls are queued and `reset()` before each photo (no tracking between photos).
  - `matte.js` — `matte(canvas, { local })` → `Uint8ClampedArray` alpha, two engines:
    **Best** (default when set up): the canvas (≤ 1600 px, JPEG 0.92) is POSTed to `/api/cutout`, which checks the login and
    forwards to the shop's Cloudflare Worker (`cloudflare/cutout-worker.js`: Images binding `segment: "foreground"` = BiRefNet
    on Cloudflare, PNG with alpha). Any failure (offline, 60 s timeout, free monthly limit 429, wrong key) → the photo is done
    **offline** and `onCutoutNotice` listeners get a message. **Offline**: MODNet portrait matting (Apache-2.0 model from
    `@dloizides/background-removal`, run by `onnxruntime-web` WASM) in a module worker `public/workers/matte.js` (committed, not
    vendor); input short side 512, multiple of 32, RGB scaled to −1…1. `findViaPerson` always uses `{ local: true }`.
    `cloudCutoutReady()` (GET `/api/cutout` → `{ enabled }`, asked once), `getCutoutMode` / `setCutoutMode` (localStorage
    `cutout:mode`, best | offline). `components/photo/cutout-choice.jsx` = the "Background removal: Best (Cloudflare) /
    Offline" control in Auto passport and Remove background; renders nothing unless the server is set up.
  - **Best cut-out setup (free):** Cloudflare free account → Workers & Pages → Create Worker `shop-cutout` → paste
    `cloudflare/cutout-worker.js` → Deploy; Settings → Bindings → add **Images** named `IMAGES`; Settings → Variables and
    Secrets → Secret `SHOP_KEY` (long random text). Vercel → Settings → Environment Variables: `CUTOUT_URL` = the Worker's
    `https://shop-cutout.<account>.workers.dev`, `CUTOUT_KEY` = same text as `SHOP_KEY` → Redeploy. Images free plan =
    5,000 transformations / month; past that new ones fail (never billed) and the app falls back to offline. Vercel free
    accepts bodies ≤ 4.5 MB (route limit 4 MB). Tested on 18 Nov with a stand-in Worker (not the real Cloudflare account).
  - `portrait.js` — `preparePortrait(img)`: face → level the eyes (any angle) → crop 3.6 × 4.3 forehead-to-chin heights at a fixed
    face size → matte → `refineAlpha` (levels + drop blobs not touching the nose) (input first fitted by `guidedMatte`: a colour guided filter, r ≈ 0.55% of the long side, eps 0.0005, so the blurry low-res model mask snaps to the real colour edges — smooth hair/ear/shoulder lines, no bites or specks; replaced the old colour-voting `cleanEdges` on 17 Nov after tests on raw shop photos) → crown = top of hair from the mask (clamped;
    warns when the head is cut off) → `decontaminate` (removes old background colour from hair edges) → `analyseTone` (tone.js).
    Returns `{ width, height, face, warnings, variant({ keepBackground, fix }) }`
    (variants cached). `passportEdit(p, fw, fh, headSizes[x])` gives an Edit for `renderEdit(..., { fit: "contain", background })`.
    `headSizes` small/normal/large = head 55/63/73% of height. `cutoutWhole(img)` = whole-photo cut-out (remove-bg tool).
    Throws `NoFaceError` → UI offers "Crop by hand". Falls back to finding the person first when the face is too small.
    The returned portrait also has `data` = `{ W, H, src, fg, alpha, tone }` (raw pixels for the editor).
  - **Room-light casts (17 Nov):** `neutralGains` measures the light's colour on the greyest quarter of the photo (pixels
    max 60–250, lowest colour share) and is used (85%) only when it brings the face skin closer to natural skin
    (`skinOffNatural`: hue 118°–142°, strength 0.19–0.31 in Cb/Cr — measured on BD faces); a green tree or teal shirt can't
    fake a cast. Skin still clearly off (> 0.06) is moved 75% into the natural range by `skinToNatural` (strength only raised
    when the hue is also wrong, never for a pale face); else the gentle `skinBalance`. Whole photo dark (scene < 30% / 40%)
    → gamma may go to 0.58 / 0.65. Tone also returns `faceY`, `sceneY`, `faceClipped` → portrait warnings "over-exposed"
    (> 12% blown or red > 245 or face > 90%) and "very dark" (face < 22% and scene < 25%). Tested on 112 variations of 7 shop
    photos (bulb / tube / shade light, dark, over-exposed, darker / fairer skin, 5 walls, WhatsApp quality, tilt, far).
  - **Auto colour rule (12 Nov): "do no harm".** The skin white balance only moves the hue a little (≤ ±0.4 rad × 0.7) and
    **never increases colour strength** (only calms skin above 0.24); gains 0.86–1.16 and brightness kept; no auto vibrance;
    S-curve 0.035; gamma 0.72–1.3. The old version boosted pale / flash faces to yellow — don't loosen the colour limits.
    **Brightness (17 Nov, BD studio look):** a face below 62% is lifted 70% of the way to 62% (gamma cap limits it); bright
    faces stay, only above 74% is brought down. Plus the `glow` touch-up (retouch.js, skin mask only: soft lift up to ~20% at
    100, diffused glow, 12% less colour, hue kept). Presets: Natural glow 40 (default), Studio 55, Strong 70. Goal: fresh,
    bright, spot-free — never so white that the photo stops matching the person.
  - `tone.js` — automatic light & colour (pure arrays, also runs in Node). `analyseTone(src, alpha, W, H, face|null)` →
    `Tone { gain, lo, hi, curve, vibrance }`: white balance from the **face skin** (moves skin towards a natural skin hue,
    gains 0.7–1.5), levels on the person (stretches dull photos up to 80%), exposure only when the face is outside 48–66%
    brightness, done on **brightness only** (R, G, B scaled together → colours don't wash out) + soft S-curve + vibrance.
    `toneTables(t)` (per-channel prep) + `toneCurvePixel(t, r, g, b, out)`; `applyTone(rgba, n, t|null)` → RGB floats.
    No face → soft grey-world (remove-bg).
  - `retouch.js` — face touch-up on RGB float arrays using `face.pts`: skin mask = face oval − eyes/brows/lips/nostrils ×
    skin-colour likelihood (+ upper forehead: above the mesh top, full strength fading out over the top 0.15 face heights
    (0.3→0.45 fh above the mesh, narrowing to the temples), so no line across the forehead; the skin reference colour comes
    from the mesh face only; region starts 0.5 fh above the mesh) (+ neck: no shape — full strength just under the jaw, fading smoothly to the sides (0.28→0.5 face widths) and down to +0.5 face heights, so the throat never gets a lighter oval; region reaches +0.62 face heights). `retouchFace(rgb, W, H, face, look)` for blemish (dark / red / odd-coloured spots →
    filled from around), smooth (guided filter, keeps texture), even (low-frequency chroma), shine, darkCircles, eyes, teeth,
    faceLight. **Never warps or reshapes** (ID-photo safe). Also `heal` (spot-fix brush, normalised-convolution fill + grain),
    `denoise`, `clarity`, `blurBehind` (background blur without person bleed), `fillOutside` (fills the empty corners of a kept
    background), `beautyPresets` off/natural/studio/strong, `retouchKeys`.
  - `look.js` — `renderPortrait(p, { keepBackground, fix, look, strokes, strokesRev, preview })`: manual edits on top of the
    automatic result. `look` = `defaultLook` keys: brightness/contrast/shadows/highlights/saturation/vibrance/warmth/tint/clarity
    (−100…100), denoise, the retouch keys, sharpen, edge, bgBlur (0…100). `enhanceLook` = the "One-tap enhance" values.
    Order: mask (edge + erase/restore strokes) → tone → manual tables → (bgBlur: person from `fg` over blurred `src`) →
    `applyAdjust(look.adj)` → `fillOutside` (kept bg) / `bleedColours` (cut-out: hidden edge pixels take the person's colour so denoise / smooth / sharpen can't pull in the old wall = no light outline) → denoise → heal strokes → retouchFace → clone/dodge/burn (`applyBrushes`) →
    clarity → sharpen.
    `strokes` = `[{ mode: "erase"|"restore"|"heal", r, pts: [x,y,…] }]` in full-portrait pixels (erase/restore paint the mask,
    heal = spot fix; clone {dx, dy} = Clone Stamp offset; dodge / burn {s} = strength 0…1). Results cached on the portrait (last 6). `preview: true` works on an ~800 px copy; print uses full size.
- **Photo components** (`src/components/photo/`): `CropEditor` (drag/wheel/arrow keys, straighten, colour; `background` prop),
  `PhotoSlot` (upload → CropEditor), `SheetPanel` (paper settings + `SheetOutput`; `rememberKey` saves paper settings in
  localStorage, `printId` puts an id on the Print button), `SheetOutput` (preview + Print / PDF / JPG), `BgPicker` (colour
  swatches + any colour + "Keep original" = `KEEP`), `usePortraits()` (list of photos processed one at a time: statuses queued →
  face → background → colour → done | error | manual; per person `edits` keyed by size, `look`, `strokes`/`strokesRev`, own `bg`,
  own `fix`, own `copies` per order row), `PersonCard`, `PassportEditor` (tabs Position · Quick fix · Adjustments (`AdjustPanel`, adjust-panel.jsx: Auto Tone/Contrast/Color,
  Exposure, Levels with histogram + handles, Curves with draggable points + presets, Color Balance, Hue/Saturation) ·
  Retouch (auto touch-up + brushes Spot healing / Clone stamp (Alt+click or "Pick source") / Dodge / Burn, `[` `]` size) ·
  Background; undo/redo history of `{ look, strokes, edits, fix, bg }` with Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, quick repeats
  merged;
  props `baseLook` (tool-wide touch-up level; the photo's own `look` holds only what was changed on top), `allowOwnBg`,
  `showCopies`; sliders keep a local copy and commit after 250 ms; brush maps screen → portrait with the inverse of `drawEdit`;
  Face tab = opens zoomed on the face (`zoomToFace` → `BrushView focus`) with the spot-fix brush and hold-to-compare;
  **BrushView navigation (18 Nov, Retouch + Background):** wheel zooms at the pointer (50–1000% of the frame), Space+drag /
  right-drag / middle-drag or the Hand button moves, buttons Zoom − / + / Face / Whole photo; the view (`{ k, x, y}` on top of the
  print Edit) never changes the print; used by auto passport **and** joint
  photo), `CardSlot` (card photo → auto corners → flatten; corner editor with 4 draggable dots; value =
  `{ image, edit, src: { photo, corners, found } }`; `cardValue(photo, corners, aspect)` builds one from outside),
  `CardPageLayout` (card-page.jsx: paper, card size 40–260 % + Real size / Fill half page / Fill page width, front & back
  one above other / side by side / back on next page mirrored for two-sided printing, middle / top / top-left, sets per page +
  Fill the page, gap, cutting lines; live page with **drag to move (snaps to the page middle), corner handle to resize,
  arrow keys**; prints through `SheetOutput hidePreview`). `usePortraits` also has `lookToAll(part)`.
  Build `items` with `useMemo` so previews only redraw on real changes.
- **`useStoredState(key, initial, check)`** (`src/lib/use-stored.js`) — useState remembered in localStorage (tool settings).
- **Bangla typing engine** (`src/lib/bangla/avro.js`, browser only): `loadAvro()` loads the **unmodified** jsAvroPhonetic
  file (MPL-1.1) from `/vendor/avro/avro-lib.js` as a script (global `OmicronLab.Avro.Phonetic.parse`). Used by the deed
  writer's `BnInput`. (The Bijoy ↔ Unicode converter and the OCR tool were removed on 23 Nov; the NID reader has its own
  tesseract workers in `lib/deeds/nid.js`.)
- **Printing exact sizes:** the print dialog must be "Actual size / 100%", margins "None". The UI says this under the buttons.
- **Dates** are `"YYYY-MM-DD"` strings handled in UTC (deeds: `format.js`). Don't use `new Date("2026-11-09")` math in local
  time. Today's date is set after mount (avoids server/client time-zone mismatch).
- **Deeds** (Batch 5a, browser only, no DB):
  - `src/lib/deeds/format.js` — `bn` (Bangla digits), `money` ("৫০,০০০/-"), `moneyWords` ("পঞ্চাশ হাজার"), `takaText`,
    `two` ("০৫"), `countText` ("০৩ (তিন)"), `bnDate("YYYY-MM-DD")` → "০১/১০/২০২৬", `endOfTerm(start, years)` (start + years − 1
    day), `todayIso()` (Dhaka), `personFields`, `emptyPerson()` (বাংলাদেশী / ইসলাম), `personText(p, { sep, namePrefix })`
    writes one party like the owner's deeds and leaves out empty parts.
  - `src/lib/deeds/templates.js` — the owner's 4 templates as data: office-rent (অফিস/দোকান ভাড়া), money-lend (হাওলাদনামা,
    any number of জামিনদার — people entry `multiple: true` → `d.guarantors[]`), vehicle-sale (পুরাতন অটো-রিক্সা বিক্রয়, ৩ ফর্দ, "N (words) ফর্দে" counts the real sheets),
    vehicle-sale-1 (১ পাতা). Each = `{ id, title, hint, font, witnesses (default count), people[], fields[], texts(d),
    blocks(d, T, ctx) }`. people: `optional`, `multiple` (a list, form = `PersonList`). **Witnesses** on every template:
    `d.witnessList = [{ name, address }]` (count = length, 1–12; empty = blank dotted line; name/address printed under the
    line); `witnessesOf(d)`, `emptyWitness`. `normalizeDeed(tpl, saved, emptyPerson)` loads a draft and converts drafts from
    before 20 Nov (`guarantor` → `guarantors[]`, `witnesses` number → `witnessList`). The sign block draws
    max(witnesses, last party-signature row + 1) rows, so extra জামিনদার signatures get their own rows.
    `texts` = editable paragraphs (`clause: true` = numbered condition). The form keeps `d.edits[id]` (staff's own wording
    wins), `d.removed[]`, `d.extra[]` (added conditions). `resolveTexts`, `buildDeed(tpl, d, { pages })`, `emptyDeed`.
    Block types: p, box, party, clause, table, sign, break (see file header). Wording = owner's files, obvious typos fixed.
    **To add a template:** write one object like these and add it to `deedTemplates` — the form, preview and print follow.
  - `src/components/deeds/deed-pages.jsx` — page engine: blocks → HTML (`blockHtml`, same HTML for measuring and printing),
    measured in a hidden box, flowed onto sheets: stamp space at the top of every sheet (`topFirst` / `topOther`, default
    105 mm, shown hatched in the preview, never printed), "পাতা-০২" on top of sheets 2+, "চলমান পাতা-০৩" at the bottom;
    long paragraphs split between sheets (word binary search), headings kept with the next block, `break` blocks start a new
    sheet when "keepPages" is on, `fitPages` shrinks the font (to 9 pt) to fit N sheets. Printing: a real-size copy is
    portalled into `#deed-print-root` (a child of body); print CSS hides everything else and sets `@page` to the paper.
    Layout is skipped while the measure box is hidden (printing), so the print copy never collapses to one sheet.
    Papers: legal (stamp, 215.9 × 355.6) and A4. Fonts: Kalpurush / Nikosh / SolaimanLipi if installed on the PC, else Noto
    Sans Bengali (bundled).
  - **NID → person (20 Nov):** `src/lib/deeds/nid.js` (browser) `readNid(files, onProgress)` → `{ fields, found, texts }`:
    per photo `findCardCorners` (ratio 1.25–2 = one card → corners pushed out 5% → `warpQuad` 2000 px) else `contentCrop`
    (the printed part of a page: photocopy with front above back, scans) → which way up (quick English read, psm 11, at
    0°/180° for a found card, all 4 turns otherwise; score = card words + confidence; no card shape found → the photo is cut
    to the area of the confident English words + 25–35% room, so a small card in a big photo is enlarged) → Bangla+English
    read (grey, 1% levels, psm 3 with TSV line boxes; psm 11 again if almost nothing) → **every line read again on its own,
    enlarged to ~90 px tall (psm 7, worker ben-eng-line)** — the main fix for small Bangla letters on the card pattern →
    smart card back: the address block (30% of the card above the "Blood Group / Place of Birth" line, left 75%) read again
    from the colour photo, grey and red channel, enlarged + sharpened → a Sauvola black-and-white copy (psm 6) → if the
    text has `<<<`/BGD, the machine lines are read with an A-Z0-9< whitelist. Readings go to `mergeNid` best-first
    (lines, address block, page, black-and-white). Own tesseract workers (keys
    eng-fast, ben-eng, mrz) from `/vendor/tesseract`; `stopNidReader()` when the box closes. Nothing is uploaded.
    **(23 Nov)** the address block is now read on both card types (old card: from the ঠিকানা line down to the next
    printed line; smart card: above Blood Group) in 6 versions (2 sizes × grey / red, plus `flatten` = light evened out
    and its black-and-white copy) and every version goes to `mergeAddress` as a vote (`mergeNid(list, extraAddress)`).
    `parseNid` now returns `addressRaw` (the address lines as read); the old `fullAddress` / `parseAddress` /
    `addressScore` / district list in nid-parse.js were removed. Fields filled: name, father, mother, husband, house,
    village, post, upazila, district, nid; `addressLine` is shown in the box for checking.
    `src/lib/deeds/nid-parse.js` (pure, Node-testable): `parseNid(text, mrz)` — front: labels (নাম/পিতা/মাতা/স্বামী, misread
    forms too; smart card = label line then value line) plus position around the English name line; DOB; NID after
    "NID No"/"ID NO", else a 10/13/17-digit run (best on the line after the DOB; noise / leading-0 runs dropped). Back:
    ঠিকানা … up to Blood/রক্তের/জন্মস্থান → `addressRaw` (23 Nov; split and checked by nid-address.js, see below).
    **(20 Nov, later):** lines with Bangla (not the English label lines) are read again by a Bangla-only worker
    (`ben-line`, psm 7) and the address block by `ben-block` (psm 6; full width on old cards, 75% on smart cards) — the
    mixed reader turned small Bangla words into English letters. `jumbled(word)` drops consonant jumbles (≥ 4 consonants
    with almost no vowel signs, 3+ hasants, ৎ inside a word, a letter 3× in a row); stray bits at the end are dropped one
    after another; a label read without ":" gets it back; word-final ্ + ZWNJ removed (আবদুল্লাহ্‌ → আবদুল্লাহ).
    `fixName` drops a short stray word after the usual last word (… মিয়া সত); `mergeNid` completes a name read without its
    last word from another reading; the machine-line date of birth (`dobChecked`) wins over the printed date as read. `parseMrz`: I<BGD 9 digits + rest + ICAO check digit → NID (trusted), line 2 → DOB.
    **Spelling checks (20 Nov):** `wellFormed(word)` drops impossible Bangla words (sign first, ্ not between consonants,
    two vowel signs); `fixDistrict` matches the district to the 64 real ones (1–2 letters off → corrected, no match →
    left empty, never a wrong district); `fixName` drops impossible words and corrects common name words (মোঃ, বেগম,
    খাতুন, মিয়া, উদ্দিন… — only a swapped letter, or a last word up to 2 off one of the usual endings; never adds/removes a
    letter, so আবুল stays আবুল); address parts: digits only in বাসা and the post code; a post code found without its
    ডাকঘর label keeps only the code. Rule: an empty box is better than wrong information.
    `mergeNid` (several readings, best first): address = `mergeAddress` of all readings; names = the first believable value
    (`plausible`: Bangla only, 1–6 words), a later reading only replaces junk; NID by source (MRZ >
    labelled > run). `components/deeds/nid-reader.jsx` — `NidReaderButton` on every person (PersonForm header): up to 3
    photos → progress → card pictures as read + every field editable with a tick box (English name, DOB, blood shown for
    checking) → "Fill these into …" patches the person. Tested on 17 shop photos + 3 made-up photocopy pages: clear
    photos / photocopies read name, parents, NID and most of the address; washed-out pink / small blurry photos read little
    (UI says so).
  - `src/components/deeds/bn-input.jsx` — `BanglaTypingProvider`, `BnInput` (Avro Banglish on space / Enter / leaving the
    box; Bangla from a keyboard layout passes through; Ctrl+M on/off, remembered as `deed:banglish`; short forms md → মোঃ,
    mst → মোছাঃ, mosa → মোসাঃ, dr → ডাঃ), `BanglaSwitch`.
  - **Address = 5 boxes again (23 Nov)**: `addressFields` in `format.js` = house (বাসা/হোল্ডিং), village (গ্রাম/রাস্তা),
    post (ডাকঘর, written "name - ৩৫৩০"), upazila (থানা/উপজেলা, printed "থানা"), district (জেলা). `personText` prints them with
    labels (`joinAddress(p, sep)`); `shortAddress` for witness lines. People / drafts from 20–23 Nov with a one-line
    `address` are split back by `normalizePerson` → `splitAddress(line)` (labels, then the card's unlabelled
    "…, upazila, district" after the post office; leftovers go to গ্রাম/রাস্তা — nothing lost).
  - **NID address check (23 Nov)** — `src/lib/deeds/nid-address.js` (pure, Node-testable) + `bd-places.js` (GENERATED,
    ~155 KB, only loaded with the NID reader): 64 districts, 573 upazilas / city thanas (nuhil/bangladesh-geocode, MIT, +
    Dhaka / Chattogram / Khulna / Rajshahi city thanas by hand) with their unions, 1,349 post codes → district + thana.
    `splitReading(raw)`: text → tokens; labels found even when misread (`labelOf`: fuzzy, also glued to the value —
    "গ্রাম/রাস্তামধ্যপাড়া"); words before a ":" that are not a known label = misread label (dropped); the card's other
    printed lines (কার্ডটি … সম্পত্তি …) dropped; post office = ডাকঘর part or the first part with a 4-digit code.
    `readAddress(raw)`: district = text 1–2 letters off a real one (ties = unsure = empty), else the post code's district;
    a code from another district = misread → the one code of this district a digit away, else dropped; upazila matched
    inside that district (small list, more slack), else the code's thana; post office matched to that upazila's unions
    (1–2 letters) or the district's places (1 letter, 5+ letters); stray label words ("বাসা") removed.
    `mergeAddress(raws)`: votes district, then upazila / code among readings that agree; village / house / unknown post
    office = the reading closest to all others. Stress test (2,000 made-up addresses from real places, OCR-like damage,
    3 readings): district / upazila 100 %, code 99 % (rest empty, 0 wrong), post office 96 %. Rule kept: an empty box is
    better than a wrong place.
  - **NID reader on real cards (23 Nov, later):** test set = 7 of the owner's cards (smart / old laminated / digital
    print, faded pink, rotated, upside down, phone screenshot) + 3 made-up scan pages (A4 JPG front above back, side by side,
    PDF). Runner: the reader in the browser with `globalThis.__nidDebug = true` → `globalThis.__nidLast` = the result incl.
    every raw reading (nid-reader.jsx); readings saved and replayed through the parser offline. Result: 60 right, 14 empty,
    7 wrong (small spelling: ূ/ু, a misread first letter) of 81 boxes; clear photos, scans and the PDF read fully; the two
    very faded pink photos read almost nothing (UI asks for a clearer photo).
    Changes: **nid.js** — `cardsIn` → `{ pieces: [{ c, card }] }`: two cards on one page (`findTwoCards`, each 1.4–1.8 : 1,
    similar size, together < 70% of the picture, not one inside the other — half a close-up card is ~1.26 : 1 and a card
    in its sleeve overlaps); one card found on a page (< 40% of it) → the rest of the page is read too; **PDF** files
    (first 2 pages, pdfjs-dist again — worker copied to `/vendor/pdfjs/`) and `accept="image/*,application/pdf"`;
    orientation scores `<<<<` (+) / `>>>>` (−) and tries sideways turns when nothing reads; `prepareEven` (darkest colour
    channel, light evened out) used only when the normal copy reads badly; machine lines read again cut out and enlarged.
    **nid-address.js** — barcode / machine lines read as digits are dropped (`junkLine`); line breaks = spaces (the card
    breaks lines inside names); labels বাসা / বাড়ি, "নং:" / "নং/নাম:" rest-of-label words, a short word stuck before a
    label ("গম রাস্তা:") dropped; words before a ":" after a known label = misread next label; post codes never start
    with ০ (a holding number "০১৪৮ ০০" was taken as the code); a code from another district is dropped (no "nearest code"
    — the list misses real codes such as ২২০৭ মোমেনশাহী সেনানিবাস), code = most readings; upazila from the text, the code's
    thana only as a fallback; পৌরসভা / সিটি কর্পোরেশন not put in থানা; village = `agreed()` (words other readings share),
    empty when 3+ readings and none agree; post office name = `commonEnd()` (the ending half the readings share); readings
    with no label, code or district are ignored. Bangla-digit length check fixed (`\D` also matched Bangla digits).
  - **NID reader, 24 Nov (owner's scanned PDF `id-card.pdf`: A4, front above back, clean scan):** the page used to be read
    as one picture (the light cards have almost no edge on white paper, so `findTwoCards` missed them) and the front's
    label lines carried card-pattern specks ("পিতা পারা Bn"). Now: `scanPieces(img)` runs first in `cardsIn` — only for
    paper-shaped pictures (long / short 1.2–1.75; a phone screenshot is ~2.2) whose outer 3% is blank paper; rows / columns
    with print, split at white gaps → exactly 2 card-like blocks (1.3–1.95 : 1, similar size) → cropped pieces. Then a card
    shape covering > 25% of a photo is taken as the one card (before `findTwoCards`, which cut phone photos into fake
    cards). Parser: `value()` takes the line below when the label line's rest is junk (Latin / digits / one word) and the
    line below is a fuller Bangla line; `isFront` no longer requires the back's words to be absent (a page with both
    sides); NAME_WORDS + খান, খন্দকার, পাটোয়ারী, হাওলাদার, মজুমদার, বেপারী (খান was being "corrected" to খাতুন); village =
    `wordByWord()` (3+ readings with the same word count → each word voted on its own) before `agreed()`; house "ডি - ১" →
    "ডি-১". The PDF now reads every box right except গেন্ডা → গেডা (the OCR drops the ন্ in that conjunct). Test set 13
    cases: 69 right, 13 empty, 8 wrong (letter slips); faded pink photos still read almost nothing.
  - **Best NID reader (24 Nov, Cloudflare Workers AI, free):** `cloudflare/cutout-worker.js` now also has `POST /nid`
    (JSON `{ images: [data URLs, 1–4] }`, header `x-shop-key`) → `env.AI.run(model, { messages: [{ role: "user", content:
    [text prompt, …{ type: "image_url", image_url: { url } }] }], max_tokens: 1200, temperature: 0 })`, models tried in
    order `@cf/meta/llama-4-scout-17b-16e-instruct` → `@cf/google/gemma-3-12b-it` → `@cf/mistralai/mistral-small-3.1-24b-instruct`
    (Kimi K2.6 is not on the Workers Free plan); the answer's JSON is pulled out of `response` / `choices[0].message.content`
    (```json fences ok) → `{ model, data: { name, nameEn, father, mother, husband, dob, nid, address, blood, mrz } }`;
    quota errors (4006 / neurons) → 429 "used up (starts again at 6 am)". Needs the **Workers AI binding named `AI`**.
    Free = 10,000 Neurons/day (≈ 80–100 cards with Llama 4 Scout, estimated). `src/app/api/nid-read/route.js` (GET
    `{ enabled }`, POST forwards to `${CUTOUT_URL}/nid` with `CUTOUT_KEY`; same env as the cut-out; ≤ 4 MB). Client:
    `lib/deeds/nid-mode.js` (`nidCloudReady`, `getNidMode` / `setNidMode`, localStorage `nid:mode`, best by default) and
    `readNidCloud(files, onProgress)` in nid.js (cards found / PDF pages split exactly like the offline reader → ≤ 4 JPEGs
    1600 px q0.86 → `cloudFields`: names Bangla-only + `fixName`, NID 10/13/17 digits, MRZ check digits win (`nidChecked`),
    address → `mergeAddress` (5 boxes, places list)). NID box: "Best (Cloudflare AI) / Offline" switch (only when set up);
    a cloud failure → toast + offline reader; after a cloud reading the offline reader reads the same card in the background
    and each box shows `CheckNote`: "✓ Both readers read the same" / "Readers differ — offline read: … [Use this]" / "Only the
    AI read this". Tested end to end with the real Worker code and a stand-in for Workers AI (routing, key, JSON in a
    fence, PDF → 2 pictures, model fallback, daily-limit fallback); **not yet tested against real Workers AI or on how well
    the models read Bangla** — owner tests after setup.
    **Result view (24 Nov, later):** the box opens wide (`max-w-[1500px]!` — `cn` doesn't merge classes, so `!` beats the
    Modal's `max-w-md`); left = `CardViewer` (sticky on wide screens: picture tabs, zoom 100–500 % by buttons / Ctrl+wheel /
    double-click at the pointer, drag to pan, turn ¼), right = the boxes. Previews (`thumb`) are now 1800 px JPEG q0.85 so
    the small Bangla print is readable when zoomed. First real cloud test (Fahima): AI read ফাহিমা, card says ফাইমা — the
    offline check flagged it.
  - `components/tools/deed-writer.jsx` — template cards, people (each party; "NID থেকে পূরণ"; জামিনদার add / remove; "আগের মানুষ থেকে পূরণ" from `deed:people`, the
    last 80 people saved when printing), details, সাক্ষী card (count, optional name / address, fill from a saved person), wording/conditions editor, page settings (per template, `deed:page:<id>`),
    draft per template (`deed:draft:<id>`), Print (waits 350 ms so the last Banglish word converts).
- **CV maker** (20 Nov, browser only, no DB) — like the shop's Word CV (A4, margins 20.3 mm top/bottom · 25.4 mm sides,
  Poppins 10 pt, "Resume Of" + name, photo top right, gradient heading bars in Times New Roman, ❖ Label : Value rows,
  bordered experience table, declaration + signature line):
  - `src/lib/cv/model.js` — CV = `{ v, theme, title, name, contact[{id,text}], photo (JPEG data URL 540×680),
    layout: { breakAt: "auto" | block key, size: "auto" | pt }, sections[] }`.
    Section types text · languages · experience · education · keyvalue · list · references · declaration (see file header);
    every list is dynamic. `emptyCv()` (the shop's usual sections; Computer skills / Training / References start hidden),
    `newSection`, `blank.*`, `themes` (6 colours), `visibleSection` (null when empty or hidden → a fresher's empty experience
    disappears with its heading), `shownSections(cv)` (used by print and Word; signature name falls back to the name),
    `contactLines` (drops "Email : " with no value), `isCv`, `fileName`.
  - `src/lib/cv/html.js` — `cvBlocks(cv, fit)` → unbreakable blocks with `key` and `label` (`keep` = heading / table header /
    exam title stays with the next block, `head` = table header repeated on a new page). Education rows are separate blocks
    (key `${id}:${exam}.${row}`), so a page can end inside an exam. Rows sit on fixed grid columns, so nothing drifts.
    **Always 2 pages — `layoutCv(cv, measure, setFont, cv.layout)`:** every block's height is a straight line in the spacing
    k (gaps × k, line heights × 1 + (k−1)·0.35), so each block is measured at k 0.6 and 1.6 only. For every place page 2 can
    start (not after a `keep` block; no lonely row: ≥ 2 rows of a list / exam / table each side) each page gets its OWN
    spacing (largest that fills it, 1.5 mm kept free; k 0.55–2). Auto picks the place where both pages fill most evenly
    (|log k1 − log k2|, small penalty for breaking inside a section) → page 1 never ends with a big gap. Page 2 ≤ 20% looser
    than page 1. Auto text size: 10 pt; shrinks (9.6 → 8.8) when it doesn't fit; grows (10.4 → 11.2) when page 1 would
    still be loose at the widest spacing. Staff can pick the size (9–11 pt) and "Page 2 starts at" (`choices` = the valid
    places; a choice that doesn't fit → auto + `breakIgnored` warning). Result checked with real measurements.
    Returns `{ pages, fit: { k1, k2, f }, breakKey, choices, tooLong, breakIgnored }`. `paginate` = the fallback when even
    the tightest spacing and smallest text is 3+ pages (`tooLong`, UI warns).
    The first heading's gap is fixed 6 pt (a smaller one confuses LibreOffice's layout of the bar under the header table).
  - `src/components/cv/cv-pages.jsx` — `CvPages({ cv, onLayout })`: measures blocks in a hidden box (cached), lays out,
    shows scaled A4 sheets, portals a real-size copy into `#cv-print-root` (print CSS: `@page A4 margin 0`, colours exact).
    `onLayout({ pages, fit, breakKey, choices, tooLong, breakIgnored })`.
  - `src/lib/cv/docx.js` — `cvToDocx(cv, { fit, breakKey })` → Blob. Raw WordprocessingML zipped with fflate (no package).
    Heading bars = inline gradient text boxes, header = borderless table with an inline photo, ❖ rows = tab stops + hanging
    indent (long addresses wrap under the value), experience table repeats its header row and rows never split. Poppins'
    "single" line in Word is 1.5 em, so CSS line heights ÷ 1.5. Gaps between parts are exact-height empty paragraphs
    (`gap(pt)`, `lineRule="exact"`) matching the print's padding. Page 1 uses k1, page 2 k2 (both × 0.96 so Word never
    spills); the block that starts page 2 gets `w:pageBreakBefore` (a table is split into two tables there, header
    repeated). Checked by rendering with LibreOffice: sample, short, fresher, 12-job, manual break, 11 pt — all 2 pages,
    page 2 starting at the same block as the print.
  - `components/tools/cv-maker.jsx` — saved CVs (`cv:saved`, Save / Save changes / Open / Delete / New CV), draft autosave
    (`cv:draft`), name/title/contact lines, photo (PhotoSlot crop 27:34 → JPEG), colour, one card per section (rename,
    show/hide, move, delete, rows add/remove/move), Add a section, sticky preview with "Page 2 starts at" + "Text size"
    (saved in `cv.layout`), Print + Save Word. The CV state is
    made after mount (random row ids must not differ from the server render).
- **Joint photo (24 Nov, simplified):** `components/tools/joint-photo.jsx` is a plain joint maker, no effects. Sizes:
  **original** 63.5 × 48.26 mm (2.5 × 1.9 in, 3 in a row on A4) and **passport** — made 48.26 × 38.1 landscape and printed a
  quarter turn left (`turn: true`; sheet item 38.1 × 48.26, `draw` rotates) so it fills an upright passport space, 5 in a row.
  2–4 people, each owns an equal part of the width — never overlapping. Per person a `CropEditor` (move / zoom / straighten /
  brightness-contrast-saturation); edits keyed by size + people count + part width. **Blend in the middle** slider 0–60 %
  (0 = straight line): each part reaches into its neighbour by half the blend and fades in with a `destination-in` gradient.
  Removed: auto cut-out, background colour, face touch-up, closeness, seam blur. Settings `joint-photo:simple`.
- **Order presets** (`src/lib/photo/orders.js`, 23 Nov): `orderPresets` (4 passport, 5 passport, 4 passport + 2 stamp,
  3 + 4, 4 + 4, 8, 25, 8 stamp, e-passport, square visa), `sameOrder`, `validOrder` — used by Auto passport and Passport
  photo sheet. Photo sheet: tool-wide order (`photo-sheet:order` in localStorage) applied to every photo; each person
  keeps `order` rows (own copies, 0 allowed), `edit` (main crop) + `edits["WxH"]` for sizes of another shape ("Crop for …"
  chips; passport and stamp share one crop); items carry `group: person` so one customer's sizes stay on one row.
- **Bangla numbers:** `src/lib/number-words.js` has the full irregular 0–99 list, lakh/crore, `parseAmount` accepts Bangla digits.
  `toBanglaDigits` / `fromBanglaDigits` in `src/lib/utils.js`.

---

## 5. Design system

Clean, quiet, tool-first. Dark navy sidebar, white cards on a light grey page, one blue accent for the main action.
No gradients, no emoji, no ALL-CAPS labels. Sentence case. Buttons say what they do.

| Token | Hex | Use |
| --- | --- | --- |
| `ink-900` | `#151a30` | text, primary buttons |
| `ink-950` | `#0c1022` | sidebar, login background |
| `ink-50…800` | navy-grey scale | borders, tints, secondary text |
| `brand-500` | `#3b5cf0` | accent (Print / main action, active states) — max one accent button per panel |
| `paper` / `surface` | `#f5f6f9` / `#fff` | page / cards |
| `muted` / `subtle` | `#5b6382` / `#8a91aa` | secondary / tertiary text |
| `line` / `line-strong` | `#e3e6ee` / `#cdd2de` | borders |
| `success` `warn` `danger` (+`-50`) | | status |

Components: `Button`/`ButtonLink`/`buttonClass` (variants primary · accent · outline · ghost · subtle · danger; sizes sm · md · lg
· icon), `Input`, `NumberInput`, `Textarea`, `Select`, `Field`, `Label`, `Checkbox`, `Card`, `CardHeader`, `Badge`, `PageHeader`,
`Step`, `Segmented`, `Slider`, `Stepper`, `Modal`, `useToast`, `FileDrop` (click / drag / Ctrl+V paste).
Tool page layout: work area left, sticky output card right (`lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]`).

---

## 6. File map

```
next.config.mjs · postcss.config.mjs · drizzle.config.js · jsconfig.json · .prettierrc · .env.example · package.json · AGENTS.md (Next's AI notes)
AI_CONTEXT.md (this file) · START-HERE.md

src/
  proxy.js                         cookie check → /login?next=…
  app/
    layout.jsx  globals.css  not-found.jsx  favicon.ico
    login/page.jsx                 shop name + LoginForm
    api/cutout/route.js            GET { enabled } · POST photo → Cloudflare Worker → PNG (login required, CUTOUT_URL/KEY)
    api/nid-read/route.js          GET { enabled } · POST { images } → Cloudflare Worker /nid → { model, data } (same env)
    api/auth/[...all]/route.js     Better Auth      api/health/route.js → { ok, db }
    (app)/layout.jsx               requireUser + AppShell + ToastProvider
    (app)/page.jsx                 tool hub (search)
    (app)/settings/page.jsx        Shop details · Team · My password (operators see My password only)
    (app)/tools/<slug>/page.jsx    one per tool: auto-passport, photo-sheet, remove-bg, joint-photo, id-card-print,
                                   deed-writer, cv-maker
  components/
    ui/        button, form ("use client"), misc, interactive ("use client"), file-drop ("use client"), sortable.js
    shell/     app-shell (sidebar + mobile menu), tool-hub, tool-icon, login-form
    settings/  settings-view
    photo/     crop-editor, photo-slot, sheet-panel, sheet-output, bg-picker, use-portraits.js, person-card, card-slot,
               card-page, passport-editor, adjust-panel, cutout-choice
    deeds/     deed-pages (DeedPages, blockHtml, deedPapers, deedFonts, defaultPageSettings), bn-input, nid-reader
    cv/        cv-pages (CvPages: measure → 2-page layout → preview + print copy)
    tools/     one client component per tool (same names as the slugs)
  lib/         tools.js (registry: groups + tools), utils.js, number-words.js, zip.js, use-stored.js,
               photo/ (sizes, orders, image, sheet, export, signature, card, enhance, adjust, ai/ (faces, matte, portrait, tone, retouch, look)),
               bangla/ (avro), deeds/ (format, templates, nid, nid-mode, nid-parse, nid-address, bd-places), cv/ (model, html, docx)
  db/          schema.js, index.js, url.js, add-user.js (`npm run user:add`)
  server/      auth.js, session.js (getCurrentUser, requireUser, requireOwner, getOwner, safeNext), errors.js,
               queries/settings.js (getShop, getTeam), actions/auth.js (signIn, signOut),
               actions/settings.js (saveShop, addMember, setMemberActive, setMemberRole, resetMemberPassword, changeMyPassword),
               (accounts queries/actions and csv.js removed 23 Nov)

scripts/copy-vendor.mjs   copies tesseract (worker, 3 core files, ben/eng data), avro-lib.js,
                          onnxruntime-web (ort.wasm.min.mjs + simd-threaded .mjs/.wasm), models/modnet.onnx (+ NOTICE) and
                          @mediapipe/face_mesh into public/vendor (postinstall / predev / prebuild; `npm run vendor`). ~80 MB.
public/workers/matte.js   background-removal worker (committed)
cloudflare/cutout-worker.js  the Cloudflare Worker for the Best cut-out (POST /) and the Best NID reader (POST /nid) — pasted
                          into Cloudflare's dashboard, not run by Next; bindings IMAGES + AI, secret SHOP_KEY
```

To add a tool: build `components/tools/<slug>.jsx` + `app/(app)/tools/<slug>/page.jsx`, then add it to `lib/tools.js`
(and its icon to `components/shell/tool-icon.jsx`).

---

## 7. Database (`src/db/schema.js`)

- `role` enum: owner, operator.
- `users` (id, name, email, emailVerified, image, role, active, timestamps) · `sessions` · `accounts` (password hash,
  providerId "credential") · `verifications` — Better Auth tables.
- `settings` key → value jsonb. `shop` = { name, tagline, phone, email, address }. `accounts` = { expenseTypes[], receiptNote }.
- Enums: `party_kind` (customer, supplier) · `entry_kind` (income, expense) · `pay_method` (cash, bkash, nagad, rocket, bank, card)
  · `payment_direction` (in, out).
- `parties` id serial, kind, name, phone, address, note, archived.
- `price_items` id serial, name, price numeric, unit, sortOrder, active.
- `entries` id serial (**= receipt number**), date (date string, Dhaka), kind, partyId → parties, items jsonb
  `[{ name, qty, rate, amount }]` (sales; a copy, so price-list changes never alter old sales), category ("Sale" or the expense
  type), total, discount, paid, method, note, createdBy → users, createdAt, voidedAt, voidedBy, voidReason.
  Due = total − discount − paid.
- `payments` id serial (shown as `P{id}`), date, partyId (not null), direction (in = customer paid us, out = we paid a supplier),
  amount, method, note, createdBy, createdAt, voidedAt, voidedBy, voidReason.

Schema change → edit `schema.js`, tell the owner to run `npm run db:push`, update this section.

---

## 8. Business rules already built

- Owners: everything incl. Settings › Shop details and Team. Operators: all tools + their own password.
- Always at least one active owner. You can't switch yourself off or remove your own owner role.
- Owner can set a new password for anyone (signs them out). Changing your own password signs out your other devices.
- Photo sizes: passport 38×48, 40×50, e-passport 45×55, stamp 20×25, square visa 51×51, custom. Papers: A4, 4R, 3R, 5R, A5,
  Letter, Legal. Output 300 DPI.
- Banglish typing (deed writer `BnInput`): word converts on space / Enter (works with phone keyboards because it watches the
  inserted character, not keydown). Ctrl+M switches Bangla/English.
- Removed on 23 Nov (owner's choice; the code is in the 20 Nov zip if ever wanted back): job photo, age calculator, PDF tools,
  Bangla typing / Bijoy / OCR pages, image resize, page arranger, shop accounts.

---

## 9. Progress log (newest first)

| Date | Change | Next |
| --- | --- | --- |
| 2026-11-24 | **Joint photo rebuilt simple.** Two sizes: **Original 2.5 × 1.9 in** (3 in a row on A4) and **Passport size** (turned, 5 in a row). Each person sits in their own part — no overlap. Size/position per person with the crop editor. One **Blend in the middle** slider (0 = straight line). All extra effects removed (auto cut-out, background, touch-up, closeness, blur). No new packages, no DB change. | Owner tries on real couple photos |
| 2026-11-24 | **NID box: big card viewer.** After reading, the box fills the screen: the card picture on the left (switch front / back, zoom in up to 5× with buttons, Ctrl+scroll or double-click, drag to move, turn), the boxes on the right, so staff compare each box with the card. Card pictures are kept sharp enough to zoom. Works for photos, scans and PDFs; on phones the picture sits above the boxes. No new packages, no DB change. | — |
| 2026-11-24 | **Best NID reader (Cloudflare AI, free).** The NID box has "Best (Cloudflare AI) / Offline": Best sends the card pictures to the shop's own Cloudflare Worker, where a vision AI (Llama 4 Scout, then Gemma 3 12B / Mistral Small if needed) reads them; nothing is kept and it isn't used for training. Its answer goes through the same checks (places list, machine-line check digits), then the offline reader reads the same card and each box says whether both readers agree (or shows the other reading with "Use this"). Free ≈ 80–100 cards a day; past that, or if anything fails, the card is read offline. **Setup: Workers AI binding `AI` on the Worker + paste the new Worker code** (no new Vercel env). No new packages, no DB change. | Owner sets up and tests Bangla accuracy on real cards |
| 2026-11-24 | **NID reader: scanned PDFs fixed.** A scan / PDF page with both sides is now split by the white space between the cards (the old edge finder missed light cards on white paper, so front and back were read as one mixed picture and the name came out empty). Junk specks next to a label ("পিতা পারা") no longer replace the real name; খান is no longer "corrected" to খাতুন; village voted word by word over all readings. The owner's PDF: name, father, mother, NID, house, post, thana, district right; village one letter off (গেডা for গেন্ডা). Phone photos unchanged or better. No new packages, no DB change. | Online reader (owner decides) if village letters must be perfect |
| 2026-11-23 | **NID reader tuned on the owner's real cards + scans / PDF.** গ্রাম no longer filled with barcode digits; label bits (নং, হো পয, গম) no longer end up in the boxes; holding numbers no longer taken as the post code; a wrong code can no longer change the thana. One scan / photocopy / **PDF page with both sides** is now read (each side found and read). Faded, tinted or sideways photos get a second try with the light evened out. Tested on 7 real cards + 3 scan pages: names, parents, NID right on all readable cards; full address right on clear photos, scans and the PDF; very faded pink photos still need a clearer photo. **Package back: pdfjs-dist** (for PDFs). No DB change. | More real cards if some still read badly |
| 2026-11-23 | **Trimmed + deed address + NID address + photo sheet orders.** Removed (owner's choice): Page arranger, Job photo & signature, all 8 PDF tools, Banglish typing / Bijoy ↔ Unicode / Image to text pages, Resize & compress, Age calculator, Amount in words, and the whole Shop accounts section (pages, receipts, print pages, actions, queries). The deed writer's Banglish typing, the NID reader and Bangla numbers still work (their engines stay). DB tables for accounts are left in the schema (no data dropped, no `db:push` needed). Deed writer: address is **5 boxes again** (বাসা/হোল্ডিং, গ্রাম/রাস্তা, ডাকঘর, থানা/উপজেলা, জেলা); 20–23 Nov drafts / saved people split back automatically. NID থেকে পূরণ fills the 5 boxes; the address is checked against Bangladesh's districts, upazilas / city thanas, unions and post codes, read in 6 image versions and voted — tested on made-up cards incl. a heavily blurred one (all parts right). Passport photo sheet: one-tap orders (5 passport, 4 passport + 2 stamp, …), several sizes per person, per-person copies. Packages removed: pdfjs-dist, @neslinesli93/qpdf-wasm, bijoy-unicode-converter, bijoy2unicode. No DB change. | Real NID photos from the shop to fine-tune |
| 2026-11-20 | **NID reader: fewer English-letter mix-ups.** Bangla lines and the address are now read by a Bangla-only reader; jumbled misread words, stray bits at the end and quote marks are removed; missing ":" after labels put back; names keep their last word (… নাগর মিয়া) and lose stray bits; date of birth from the smart card's machine lines is trusted (fixed 1983 → 1988). Tested on 3 cards: names, parents, NID right on all; smart-card address mostly right; old laminated card's 2nd address line and faded addresses still read poorly. No new packages, no DB change. | Online reader (Gemini) for addresses if the owner wants them near-perfect |
| 2026-11-20 | **Address in one box.** Deed writer people (parties, জামিনদার, saved people) now have one **ঠিকানা** box instead of 5 (বাসা, গ্রাম, ডাকঘর, উপজেলা, জেলা) — written the way it is on the NID and on stamp paper. NID থেকে পূরণ fills the whole address as printed on the card (no more parts lost by splitting); junk from bad readings is removed and the best reading is chosen. Old drafts and saved people are joined into the one box automatically. Can be undone. No new packages, no DB change. | Online reader (Gemini) if the owner wants faded cards read |
| 2026-11-20 | **NID reader: fewer wrong letters, no wrong information.** District checked against the 64 districts (misread → corrected, unknown → left empty), common name words corrected (বেগন → বেগম, last word মিছ → মিয়া), impossible Bangla words and barcode digits dropped from names and addresses, a post office whose label was misread keeps only its code. Missing address parts are filled from the other readings. No new packages, no DB change. | Online reader (Gemini) if the owner wants faded cards read |
| 2026-11-20 | **NID reader reads more.** A card that is small in the photo is now cut out and enlarged; every line is read again on its own, enlarged (father / mother now come through on smart cards); the smart card's address is read again in colour. Takes ~10–35 s per person. Tiny / faded address print still needs a close photo. No new packages, no DB change. | Owner decides on an online reader (Gemini) for hard photos |
| 2026-11-20 | **Deed writer: NID থেকে পূরণ.** On every person (১ম পক্ষ, ২য় পক্ষ, জামিনদার…) a button reads the NID — photos of the front and back (smart card or old card, any way up) or one photocopy page with both sides — on this computer, nothing uploaded. Shows what it read in editable boxes with tick boxes (plus English name, date of birth, blood group to check against the person); "Fill" puts name, father, mother, address parts and NID number into the form. The smart card's machine lines confirm the NID number. Clear photos work well; washed-out / tiny photos read little — staff types the rest. No new packages (uses the tesseract.js already used by Image to text), no DB change. | Real photocopies from the shop to fine-tune |
| 2026-11-20 | **CV: no more gap on page 1 + deeds: many জামিনদার / সাক্ষী.** CV pages now each get their own spacing, and page 2 starts where both pages fill evenly, so page 1 is always full; short CVs get slightly bigger text instead of big gaps; an exam can now continue on page 2 (never one lonely row). New **Page 2 starts at** (move a section to the other page) and **Text size** (Auto, 9–11 pt), saved with the CV; Word follows both. Deed writer: **add as many জামিনদার as needed** (হাওলাদনামা — each gets a party block, a signature line and is named in the condition), **সাক্ষী on every deed**: any number (1–12), optional name and address printed under each line, fill from a saved person. Old drafts are converted. No new packages, no DB change. | NID → deed auto-fill (owner to send sample photos) |
| 2026-11-20 | **CV maker** (সিভি / রিজিউম তৈরি, Job application group). Same look as the shop's Word CV, but every row is on fixed columns, so labels, colons and values always line up and long addresses wrap under the value. Dynamic: no experience → the section disappears; add as many jobs / exams / lines / sections as needed; rename, hide, reorder sections; 6 colours. **Always exactly 2 pages** — spacing stretches or tightens by itself (font a little smaller only if needed). Print in colour (or Save as PDF), **Save Word** (.docx, same spacing, page 2 starts at the same heading), saved CVs + autosaved draft in the browser. **New package: `@fontsource/poppins` 5.3.0.** No DB change. | More document templates, visiting cards |
| 2026-11-18 | **Best background removal (free, Cloudflare) + editor zoom + forehead fix.** New "Background removal: Best (Cloudflare) / Offline" in Auto passport, Remove background and Joint photo: Best sends the photo to the shop's own Cloudflare Worker (BiRefNet, free 5,000 photos/month, never billed) through the new `/api/cutout` route; anything goes wrong → done offline with a notice. Owner chose this over Gemini (Gemini image editing has no free API tier). Retouch / Background brushes: scroll to zoom, Space / right-drag / Hand to move, Face / Whole photo buttons. Face touch-up no longer leaves a light line across the forehead. **Setup: Cloudflare Worker + 2 Vercel env vars (see §4).** No new packages, no DB change. | Owner sets up Cloudflare; test Best on real photos |
| 2026-11-17 | **Tested on 112 photo variations + colour fix.** 7 real shop photos × 16 conditions (bulb / tube light / shade, dark, over-exposed, darker / fairer skin, white / clothes-coloured / busy / dark wall, bright sky, WhatsApp quality, tilted, far away), plus the real tools in the browser (Auto passport with 6 photos, presets, touch-up levels, keep background, editor tabs, PDF; Remove background; Joint photo; NID; Photo sheet) — no errors. Cut-out was steady on every background. Fixed: room-light colour casts are now removed (orange bulb, green tube light, blue shade), dark photos are lifted more, and new warnings for over-exposed or very dark photos. No new packages, no DB change. | Real shop photos under bulb light |
| 2026-11-17 | **Fix: light oval on the throat.** The face touch-up (glow, smoothing, even colour) used a hard oval on the neck, so the throat showed a lighter round patch. The neck part now fades out smoothly to the sides and downwards. Checked on 4 new shop photos (man, boy, school girl, hijab). No new packages, no DB change. | — |
| 2026-11-17 | **Background remover rebuilt on real photos.** The old edge cleaner (`cleanEdges`) was the cause of the bites, specks and jagged edges — removed. New `guidedMatte` fits the model's mask to the real edges of the photo (guided filter), then the usual blob removal and colour clean-up. Tested on 3 raw shop photos (office background, curly hair on sky, grey beard on green). Also used by Remove background. No new packages, no DB change. | Check more shop photos |
| 2026-11-17 | **Fix: jagged cut-out edges.** The firmer edge judged single pixels, so hair shine and dress prints were cut out (bites). Now edges are decided by area: smooth hair and shoulders, no bites, halos still removed. | Tune on the owner's original photos |
| 2026-11-17 | **Firmer hair edge.** Half-hair / half-wall haze is no longer strengthened, edge curve tighter, faintest 11% of the model mask dropped (`refineAlpha` 28…238). | Tune on the owner's original photos |
| 2026-11-17 | **Cleaner hair and outline.** Tighter hair edge (wall-mixed hair tips no longer leave a grey haze) and no light outline around hair, ears and shoulders (filters no longer see the hidden wall colour). No new packages, no DB change. | Tune with real shop photos |
| 2026-11-17 | **Hair edges solid.** `cleanEdges` now also raises the mask where the colour is the person's, so dark / curly hair against a light wall no longer prints as a faded grey cloud. No new packages, no DB change. | Tune with real shop photos |
| 2026-11-17 | **Background leftovers removed.** New `cleanEdges` step after the cut-out: grey / green bits of the old background at the shoulders, ears and hair (half see-through or solid at the edge) are compared with the real background and person colours nearby and removed; no holes in light clothes. Also used by Remove background. No new packages, no DB change. | Tune with real shop photos |
| 2026-11-17 | **Brighter faces (BD beauty look).** Auto colour no longer darkens faces: dim faces lifted towards a bright, fresh level, softer contrast curve. New **Glow** touch-up (bright, clear skin on the face and neck only; hair/eyes/lips keep depth) — on in Natural (40), Studio (55), Strong (70); slider in Edit › Retouch. Stronger spot / patch removal in the presets. Capped so the photo still matches the person. No new packages, no DB change. | Tune with real shop photos |
| 2026-11-16 | **Sheets match the shop's studio PDF (6666_1.pdf) to within 0.1 mm.** Passport = 1.5 × 1.9 in (38.1 × 48.26), stamp = 0.75 × 0.95 in (19.05 × 24.13). Grid: same space at the left/right edges and between photos (5 across on A4 ≈ 3.25 mm), top edge 3.8 mm, rows 4.23 mm apart; 2 stamps lie **turned sideways, one above the other, centred** in one passport space; each photo gets a thin grey line (0.17 mm, #9d9d9d) just outside it. Page-wide guide lines are off. Settings saved as `sheet3:` (new defaults for everyone). No new packages, no DB change. | — |
| 2026-11-15 | **Batch 5a: Deed writer** (দলিল / চুক্তিপত্র লেখা, new group "Deeds & documents"). The owner's 4 Word templates as fill-in deeds: office/shop rent, হাওলাদনামা (money lending, optional guarantor), old auto-rickshaw sale (3 sheets), auto-rickshaw buy-sell (1 sheet). Bangla form with Banglish typing (Avro, Ctrl+M, md → মোঃ), saved people to refill parties, amounts → Bangla digits + words, dates → Bangla, end of term worked out; every paragraph and condition editable (back to automatic, leave out, add). Prints on Legal stamp paper below the stamp (stamp space adjustable per sheet), পাতা / চলমান পাতা marks, paragraphs flow over sheets, fit into N sheets, font choice. Drafts and page settings kept in the browser. No new packages, no DB change. | More templates (sale deed, kot-bondhok, affidavit, applications), CV maker, cards |
| 2026-11-12 | **Reuse a sheet + separate spacing.** Grid sheets: space left–right and up–down set separately. "Reuse this sheet": mark the spaces already printed (tap the map, or "Printed — mark as used" after printing), the next print fills only the free spaces; works across different sizes; "New sheet" clears. No new packages, no DB change. | Batch 5 when the owner sends his templates |
| 2026-11-12 | **Photoshop-style editing + cutting grid.** Auto colour made safe (never adds colour — fixes "skin turns yellow"). Editor tabs: Quick fix · **Adjustments** (Auto Tone / Auto Contrast / Auto Color, Exposure, Levels, Curves, Color Balance, Hue/Saturation with colour ranges) · **Retouch** (Spot healing, Clone stamp, Dodge, Burn, `[` `]`) · **Undo / Redo** (Ctrl+Z, Ctrl+Shift+Z). Sheets: new **Grid — easy cutting** layout (default): A4 = 5 × 5 passport, cutting space spread to the corners, cutting guides across the page, **2 stamps share one passport space**, photos per row / rows per page; old layout = "Pack tight". Auto passport: presets 5 passport, 4 passport + 2 stamp, 3 passport + 4 stamp, 25 passport; each customer's sizes stay on their row; default paper A4. No new packages, no DB change. | Batch 5 when the owner sends his templates |
| 2026-11-11 | **Photo quality update.** New automatic colour (white balance from the face skin, dull photos stretched, exposure on brightness only so colours stay rich). **Face touch-up** (Off / Natural / Studio / Strong for all photos + per-photo sliders: remove spots, smooth skin, even colour, shine, under-eye, eyes, teeth, face light) and a **spot-fix brush** (zoomed on the face); never reshapes the face. Light tab: One-tap enhance, highlights, clarity, vibrance, tint, reduce grain. Background: blur the kept background, empty corners filled. **Joint photo**: full editor per person (position, light, touch-up, brush), keep own backgrounds with **soft join + blur in the middle** (people stay sharp), blur backgrounds, closeness 55–115 %, 4R size. **NID**: page layout with drag / resize / snap to middle, any size 40–260 %, fill half page / width, sets per page + Fill the page, back on next page (two-sided), both sides from one photo (+ swap), Clearer / Extra clear print, brightness/contrast. No new packages, no DB change. | Batch 5 when the owner sends his templates; photo-sheet (manual crop) could get the same auto colour |
| 2026-11-10 | **Photo editor update.** Auto passport: full **Edit** panel per photo — Position (drag/zoom/straighten, head smaller/bigger, back to automatic, copies of this photo), Light & colour (auto fix on/off, brightness, contrast, lighten shadows, colour, warm/cool, hold to compare, use on all photos), Touch-up (smooth skin on the face only, sharpen), Background (own colour per photo, tighter edges, erase / bring-back brush with undo). One-tap order chips (4 passport, 4 passport + 4 stamp…), "Next customer" button, click a thumbnail to edit. All sheets: **Place on the page** (top left / top centre / middle), **Fill the page** (adds the copies that still fit), **Ctrl+P** prints the photos. NID: front and back in the middle of the page by default, one above the other, "Clearer print", settings remembered. No new packages, no DB change. | Batch 5 when the owner sends his templates |
| 2026-11-10 | **Photo batch (AI photo, offline).** New **Auto passport photo**: drop photos → face found, eyes levelled, head sized and centred, background removed (any colour or keep), light/colour fixed → print sheet ready, Print focused; order several sizes per photo (e.g. 4 passport + 4 stamp); per-photo Adjust / Back to automatic / Crop by hand; settings and paper remembered. **Joint photo** rebuilt: 2–4 people, auto cut-out, same head size, one background, closeness slider, reorder. **NID / ID card print**: phone photo → card corners found → flattened to exact card size (corner editor, turn 180°). New **Remove background** (PNG or colour, ZIP). New packages: onnxruntime-web, @mediapipe/face_mesh, @dloizides/background-removal (MODNet model). No DB change. | Batch 5 when the owner sends his deed/CV templates |
| 2026-11-10 | **Batch 4: shop accounts.** New sale (one-tap price list, lines, discount, paid/baki, method) with receipts (58/80 mm, A5, A4); expenses with editable types and supplier dues; sales & expenses list (dates, type, method, staff, status, search, paging); customers & suppliers with balances, history, collect/pay, money receipt, printable statement; overview (today + dues); owner reports (sales, expenses, profit, cash, baki, by service/type/method/staff/day) + CSV; price list + printable rate chart; cancel with reason instead of delete. **Schema change: run `npm run db:push`.** | Batch 5: documents & print |
| 2026-11-10 | **Batch 3: Bangla typing.** Banglish (Avro phonetic) typing pad with live hint, Ctrl+M, copy as Unicode or for SutonnyMJ, saved draft. Bijoy ↔ Unicode text converter (auto-detect, swap) + Word/ODT/RTF/TXT file converter (Bijoy → Unicode, fonts switched). Image to text (OCR) for Bangla + English from photos, screenshots and PDFs, fully offline. New packages: bijoy-unicode-converter, bijoy2unicode, avro-phonetic, tesseract.js, @tesseract.js-data/ben + eng (all pure JS/WASM). | Batch 4: shop accounts |
| 2026-11-09 | **Fix: Windows blocked the native Next.js compiler** (Smart App Control). Pinned next/@next/env 16.4.4 and tailwindcss/@tailwindcss/postcss 4.3.4; Tailwind moved from `@tailwindcss/turbopack` to PostCSS (`postcss.config.mjs`). Owner then turned Smart App Control off. | Batch 3 |
| 2026-11-09 | **Batch 2: PDF tools.** Merge (PDFs + photos, drag order), Split (ranges / every page / pick), Organize pages (reorder, rotate, remove, add another PDF), Photos → PDF (A4/Letter/Legal/A5/photo size, quality, B&W), PDF → images (JPG/PNG 100–300 DPI, ZIP), Compress (levels or max KB), Lock/unlock (qpdf AES-256), Watermark & page numbers (Bangla text, logo, 6 number styles). New packages: pdfjs-dist, @neslinesli93/qpdf-wasm, fflate; `scripts/copy-vendor.mjs`. Signed-in pages marked `force-dynamic`. | Batch 3: Bangla typing |
| 2026-11-09 | **Batch 1: foundation + photo studio.** Next 16 + Drizzle + Better Auth (owner/operator, no sign-up, `user:add`), shop settings, team management, tool hub with search. Tools: passport/stamp photo sheet (many people, many sizes, A4/4R/…), joint photo, NID/ID card print, page arranger (Legal 2–16 copies), job photo & signature (px + KB limit, signature cleaning), resize/compress/convert (batch), age calculator (circular date, limits), amount in words (Bangla/English, lakh/crore). Print at exact size, PDF, JPG. | Batch 2: PDF tools |

### Batch plan (agreed 9 Nov 2026)

1. ✅ Foundation + photo studio
2. ✅ PDF tools (merge, split, organize, photos ↔ PDF, compress, lock/unlock, watermark, page numbers). Later: sign/stamp a PDF.
3. ✅ Bangla typing (Banglish typing, Bijoy ↔ Unicode text + Word files, image/PDF → text).
4. ✅ Shop accounts (sales, expenses, baki, receipts, customers/suppliers, reports, price list).
(23 Nov: batches 2, 3 and 4 were removed from the app by the owner — see the progress log.)

5. **Documents & print** — 5a ✅ Deed writer with the owner's 4 templates (15 Nov). 5b ✅ CV maker (20 Nov). Still to come (send templates): deeds and applications (sale deed, mortgage/kot-bondhok, affidavit, applications), visiting cards,
   Halkhata cards, notices, certificates — fill-in templates with print/PDF.
6. ✅ (mostly) **AI photo:** auto passport, background removal/colour, joint photo, card straightening — done offline in the photo
   batch. Still open: outfit/suit change, upscale (would need an AI service — owner decides).
7. **Info:** job circular list, useful government links, service rate chart, form auto-fill extension.

---

## 10. Reference: what the inspiration sites offer (analysed 9 Nov 2026)

**sohozkaj.com** — AI photo editor (passport/visa/birth-reg sizes, background, 19 outfits, 26 touch-ups, QR mobile upload);
manual editor; 4R studio editor; bulk edit; ~2,700 AI style templates; AI documents (from text/image, restore old, handwritten
questions); 78 legal/official fill-in templates; question paper maker; 100 print templates (posters, notices, CV, visiting/ID
cards, envelopes, receipts, letterheads, certificates, Halkhata); form auto fill-up + browser extension; 77 free tools (16 PDF,
22 image, 6 text, 10 video, 17 general incl. many government forms, education results, CV maker, typing practice); shop
accounts (income/expense, dues, invoices, customers), multi-shop with operators, photo booth QR, job circulars, 91 useful
links, service rate chart.

**alltoolsbd** — joint photo, single photo sheet, photo organiser, NID print layout, converter, job photo/signature,
age calculator, Legal-page arranger, Halkhata card, kot-bondhok (mortgage) deed on 3 stamp papers.