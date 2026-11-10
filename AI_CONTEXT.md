# AI_CONTEXT.md — Shop tools (photo studio / computer shop toolkit)

> **For any AI assistant:** this file is the single source of truth for this project. Read all of it before writing code.
> The owner attaches it (with `START-HERE.md` and a zip of the project) at the start of every new chat.
>
> **Your first reply in a new chat:** confirm in one line that you've read it, restate the task, list every file you will
> create or change, list any `npm install` / `db:push` / env changes, and ask for the current contents of any file you need
> to edit that you haven't been shown. **Never guess what an existing file contains.**

Last updated: **10 Nov 2026**, after the photo editor update (passport editor, centred cards, Fill the page, Ctrl+P).

---

## 0. Quick facts

| Item | Value |
| --- | --- |
| Product | A private toolkit for the owner's **own photo studio / composing / computer shop** in Bangladesh. Not a public SaaS. |
| Users | **Owner** and **operators** (shop staff). Nobody can sign up; the owner adds people in Settings › Team. |
| Money | **No payments, no credits.** Every tool is free to use for the shop's staff. |
| Inspiration | Feature set of sohozkaj.com and alltoolsbd.netlify.app (see §10). Build our own versions — never copy their text, template artwork or branding. |
| Language | **JavaScript only** (`.js` / `.jsx`). No TypeScript files, no type annotations (JSDoc is fine). |
| Stack | Next.js **16.4.4 (pinned)** (App Router, Turbopack) · React **19.3** · Tailwind CSS **4.3.4 (pinned, via `@tailwindcss/postcss`)** · lucide-react · zod **v4** · Better Auth **1.7** · Drizzle ORM + `pg` · Neon Postgres · pdf-lib · pdfjs-dist **6** · qpdf (WASM, `@neslinesli93/qpdf-wasm`) · fflate (ZIP) · bijoy-unicode-converter + bijoy2unicode · avro-phonetic · tesseract.js **7** · onnxruntime-web (WASM) + MODNet model · MediaPipe Face Mesh (legacy) |
| Privacy | **Customer photos and documents never leave the browser.** All photo/image work is done with `<canvas>` in the browser. The database holds logins, settings and the shop accounts (sales, expenses, customers, payments). |
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
   (and then say so to the owner first).
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
- Env vars: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL` (must match the browser URL), `AUTH_SECRET` (32+ chars).

---

## 4. Tech notes that trip up AI models

- **Native files on Windows (IMPORTANT).** Windows Smart App Control / Application Control blocks unsigned native `.node`
  files ("An Application Control policy has blocked this file" → "Turbopack is not supported… only WASM bindings"). The owner
  turned Smart App Control off on 10 Nov 2026. `next` 16.4.4 and `tailwindcss` / `@tailwindcss/postcss` 4.3.4 are pinned to
  exact versions; keep them pinned and don't run `npm update`. When adding packages, prefer pure JavaScript / WebAssembly ones —
  every Batch 2–3 package is (pdf.js, qpdf, tesseract.js, converters).
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
  - `sheet.js` — `layoutSheet(items, paper, { margin, gap, newRowPerItem, position })` (row packing, multi-page; `position`
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
  - `card.js` — `findCardCorners(img)` (colour vs table → biggest region → biggest 4-sided shape; `found:false` = whole photo
    inset) and `warpQuad(img, corners, w, h)` (perspective flatten; turns a standing card to landscape).
- **Photo AI** (`src/lib/photo/ai/`, browser only, fully offline, files in `public/vendor` via copy-vendor):
  - `faces.js` — MediaPipe Face Mesh (legacy `@mediapipe/face_mesh`, loaded with a `<script>` from `/vendor/facemesh/`).
    `findFaces(canvas)` → biggest first `{ eyeL, eyeR, top (forehead, lm 10), chin (152), nose, sideL, sideR, box }` in pixels.
    Calls are queued and `reset()` before each photo (no tracking between photos).
  - `matte.js` — MODNet portrait matting (Apache-2.0 model from `@dloizides/background-removal`, run by `onnxruntime-web`
    WASM) in a module worker `public/workers/matte.js` (committed, not vendor). `matte(canvas)` → `Uint8ClampedArray` alpha.
    Input short side 512, multiple of 32, RGB scaled to −1…1.
  - `portrait.js` — `preparePortrait(img)`: face → level the eyes (any angle) → crop 3.6 × 4.3 forehead-to-chin heights at a fixed
    face size → matte → `refineAlpha` (levels + drop blobs not touching the nose) → crown = top of hair from the mask (clamped;
    warns when the head is cut off) → `decontaminate` (removes old background colour from hair edges) → `colourFix` (mild grey-world
    cast, small levels stretch, gamma so the face is ~55%). Returns `{ width, height, face, warnings, variant({ keepBackground, fix }) }`
    (variants cached). `passportEdit(p, fw, fh, headSizes[x])` gives an Edit for `renderEdit(..., { fit: "contain", background })`.
    `headSizes` small/normal/large = head 55/63/73% of height. `cutoutWhole(img)` = whole-photo cut-out (remove-bg tool).
    Throws `NoFaceError` → UI offers "Crop by hand". Falls back to finding the person first when the face is too small.
    The returned portrait also has `data` = `{ W, H, src, fg, alpha, lut }` (raw pixels for the editor).
  - `look.js` — `renderPortrait(p, { keepBackground, fix, look, strokes, strokesRev, preview })`: manual edits on top of the
    automatic result. `look` = `defaultLook` keys brightness/contrast/shadows/saturation/warmth (−100…100), smooth/sharpen/edge
    (0…100). `strokes` = `[{ mode: "erase"|"restore", r, pts: [x,y,…] }]` in full-portrait pixels (painted onto the mask).
    Results cached on the portrait (last 6). `preview: true` works on an ~800 px copy (fast sliders); print uses full size.
- **Photo components** (`src/components/photo/`): `CropEditor` (drag/wheel/arrow keys, straighten, colour; `background` prop),
  `PhotoSlot` (upload → CropEditor), `SheetPanel` (paper settings + `SheetOutput`; `rememberKey` saves paper settings in
  localStorage, `printId` puts an id on the Print button), `SheetOutput` (preview + Print / PDF / JPG), `BgPicker` (colour
  swatches + any colour + "Keep original" = `KEEP`), `usePortraits()` (list of photos processed one at a time: statuses queued →
  face → background → colour → done | error | manual; per person `edits` keyed by size, `look`, `strokes`/`strokesRev`, own `bg`,
  own `fix`, own `copies` per order row), `PersonCard`, `PassportEditor` (tabs Position · Light & colour · Touch-up · Background;
  sliders keep a local copy and commit after 250 ms; brush maps screen → portrait with the inverse of `drawEdit`), `CardSlot` (card photo → auto
  corners → flatten; corner editor with 4 draggable dots; value has the same shape as PhotoSlot's).
  Build `items` with `useMemo` so previews only redraw on real changes.
- **`useStoredState(key, initial, check)`** (`src/lib/use-stored.js`) — useState remembered in localStorage (tool settings).
- **PDF engine** (`src/lib/pdf/`, browser only):
  - Files served from `public/vendor/` are **copied from node_modules by `scripts/copy-vendor.mjs`** (runs on `postinstall`,
    `predev`, `prebuild`; `npm run vendor` by hand). `public/vendor/` is git-ignored. If PDF pages don't show or lock/unlock
    fails to load, run `npm run vendor`.
  - `engine.js` — `getPdfjs()` (lazy `import("pdfjs-dist")`, worker at `/vendor/pdfjs/pdf.worker.min.mjs`), `openForRender(bytes)`,
    `renderPage(doc, n, { scale | maxWidth, rotation })` (pdf.js v6: `page.render({ canvas, viewport })`), `closeDoc(doc)`
    (**v6 has no `doc.destroy()` — use `doc.loadingTask.destroy()` via `closeDoc`**), `runQpdf(bytes, (in, out) => args)`.
    qpdf loads `/vendor/qpdf/qpdf.js` as a script (global `Module` → `window.__qpdfCreate`), a fresh instance per run. This build
    prints to `console.log/error` directly, so `runQpdf` captures the console while it runs; messages are in `err.qpdf`.
  - `ops.js` (pdf-lib) — `readPdfFile(file)` → `{ name, size, bytes, pageCount, encrypted }`, `assemblePages([{ bytes, pageIndex, rotate }])`
    (merge/split/organize all use this), `resave`, `parseRanges("1-3, 5, 8-", count)` (Bangla digits ok), `imagesToPdf`,
    `overlayPages(bytes, layersFor)` (draws PNG layers; handles page rotation and crop-box offsets), `pdfBlob`, `suffixName`.
  - `images.js` — `prepareImage(file, "high"|"normal"|"small", { grey })` (EXIF-correct, size-capped). `raster.js` —
    `rasterizePdf(bytes, { dpi, quality, grey })` (compress = pages become JPEGs). `stamp.js` — watermark / page-number layers
    drawn on canvas so **Bangla text shapes correctly** (pdf-lib can't shape Bangla), `stampPdf`, `drawPreview`.
  - pdf-lib refuses encrypted PDFs; `PdfPicker` rejects them with "Unlock it first" unless `allowEncrypted`.
- **Bangla engine** (`src/lib/bangla/`, browser only):
  - `convert.js` — `bijoyToUnicode` / `unicodeToBijoy` use **bijoy-unicode-converter** (`ConvertToUnicode("bijoy", line)`,
    `ConvertToASCII("bijoy", line)`; tested round-trip on 42 hard conjunct words). `bijoy2unicode` is used **only** for files
    (`convertBijoyFile` → `bijoy2unicode/docx` `convertFile`: .docx/.odt/.rtf/.txt/.html; swaps SutonnyMJ → a Unicode font,
    keeps English runs). Its text engine gets ব্র্যাক / ঊর্ধ্ব wrong, so don't use it for typed text. `detectEncoding`, `textStats`.
    Bijoy digits become Bangla digits (correct — SutonnyMJ draws 0–9 as Bangla digits).
  - `avro.js` — `loadAvro()` loads the **unmodified** jsAvroPhonetic file (MPL-1.1) from `/vendor/avro/avro-lib.js` as a script
    (global `OmicronLab.Avro.Phonetic.parse`). `avroGuide` / `avroKeys` examples were each checked against the engine — re-check
    any new example (e.g. `kormo` → করম, `korrmo` → কর্ম).
  - `ocr.js` — tesseract.js 7, one cached worker per language set (`ben+eng`, `ben`, `eng`), LSTM only, files from
    `/vendor/tesseract` (`workerBlobURL: false`, absolute URLs, language data `4.0.0_best_int`, cached in IndexedDB after first
    use). `enhanceForOcr` = grey + contrast + upscale small images. Tesseract prints two harmless "Parameter not found" warnings.
  - `src/lib/clipboard.js` — `copyText(text)` → true/false (with a fallback for old browsers).
- **PDF components** (`src/components/pdf/pdf-bits.jsx`): `PdfPicker`, `usePdfjsDoc(bytes)`, `useRenderDocs()` (several docs),
  `PageThumb` (lazy, cached, CSS rotation), `ResultFiles` (download each + "Download all (ZIP)"), `useJob()` (busy + error toast).
  `components/ui/sortable.js`: `useDragSort(list, setList)` + `moveItem` — always pair drag with arrow buttons (touch screens).
- **Printing exact sizes:** the print dialog must be "Actual size / 100%", margins "None". The UI says this under the buttons.
- **Dates** in the age calculator are `"YYYY-MM-DD"` strings handled in UTC (`src/lib/age.js`). Don't use `new Date("2026-11-09")`
  math in local time. Today's date is set after mount (avoids server/client time-zone mismatch).
- **Accounts** (Batch 4):
  - `src/lib/accounts.js` (client + server): `taka(n)` (৳ with lakh grouping), `parseMoney` (Bangla digits, commas, ৳; NaN when
    invalid or negative), `round2`, `todayDhaka()` / `dhakaDateOf()` / `addDays` / `formatDay` / `formatTime` (all **Asia/Dhaka**),
    `rangeFor(preset)`, `resolveRange(searchParams, fallback)` (URL `?range=today|yesterday|week|month|lastMonth|year|custom&from&to`),
    `payMethods`, `defaultExpenseTypes`, `entryDue(e)`.
  - Money columns are `numeric(12,2)` → strings from pg; queries convert with `Number()` + `round2`.
  - **Balances are never stored** — always computed in SQL (`receivableSql` / `payableSql` in `server/queries/accounts.js`).
  - **Nothing is deleted or edited**: entries and payments are cancelled (`voidedAt`, `voidedBy`, `voidReason`) and every total
    filters `voided_at is null`. Owner can cancel anything; operators only their own, on the same Dhaka day (`canVoid`).
  - Filters live in the URL (`useQueryState`, `RangePicker`, `Pager` in `components/accounts/bits.jsx`).
  - "Save & print" opens the tab **during the click** (`window.open("about:blank")`) and sets its URL after saving — browsers
    block pop-ups opened after an `await`.
  - Print pages are in `src/app/print/**` (outside the app shell, `requireUser` in `print/layout.jsx`), sized with `<Paper size>`
    (`58` / `80` mm rolls, `a5`, `a4`; `@page` set per page) and a `PrintBar` (`?size=`, `?auto=1` opens the print dialog).
  - CSV: `csvResponse()` in `src/server/csv.js` (UTF-8 BOM for Excel + Bangla, formula-injection safe).
  - Tests: the sidebar has a **Sign out `<form>`** — in browser tests target `main form button[type=submit]`, not `form button`.
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
    api/auth/[...all]/route.js     Better Auth      api/health/route.js → { ok, db }
    (app)/layout.jsx               requireUser + AppShell + ToastProvider
    (app)/page.jsx                 tool hub (search)
    (app)/settings/page.jsx        Shop details · Team · My password (operators see My password only)
    (app)/accounts/                page (overview) · sale · expense · entries (+ [id]) · people (+ [id]) · prices ·
                                   reports (owner) + reports/export/route.js (CSV, owner)
    print/                         layout (requireUser, no shell) · receipt/[id] · payment/[id] · statement/[id] · rates
    (app)/tools/<slug>/page.jsx    one per tool: auto-passport, photo-sheet, remove-bg, joint-photo, id-card-print, page-arranger, job-photo,
                                   pdf-merge, pdf-split, pdf-organize, images-to-pdf, pdf-to-images, pdf-compress,
                                   pdf-protect, pdf-watermark, bangla-typing, bijoy-unicode, image-to-text,
                                   image-resize, age-calculator, amount-in-words
  components/
    ui/        button, form ("use client"), misc, interactive ("use client"), file-drop ("use client"), sortable.js
    shell/     app-shell (sidebar + mobile menu), tool-hub, tool-icon, login-form
    settings/  settings-view
    photo/     crop-editor, photo-slot, sheet-panel, sheet-output, bg-picker, use-portraits.js, person-card, card-slot
    pdf/       pdf-bits (PdfPicker, usePdfjsDoc, useRenderDocs, PageThumb, ResultFiles, useJob)
    accounts/  bits (MoneyInput, PartyPicker, useQueryState, RangePicker, Pager, Stat), sale-form (+ partyPayload),
               expense-form, entry-table, entry-filters, void-button, party-forms (PartyFormButton, PaymentForm,
               ArchivePartyButton, PeopleFilters), price-editor (PriceEditor, AccountSettingsForm)
    print/     paper (Paper, ShopHeading, receiptSizes), print-bar, print-button
    tools/     one client component per tool (same names as the slugs)
  lib/         tools.js (registry: groups + tools), utils.js, age.js, number-words.js, zip.js, clipboard.js, accounts.js,
               use-stored.js, photo/ (sizes, image, sheet, export, signature, card, ai/ (faces, matte, portrait)), pdf/ (engine, ops, images, raster, stamp),
               bangla/ (convert, avro, ocr)
  db/          schema.js, index.js, url.js, add-user.js (`npm run user:add`)
  server/      auth.js, session.js (getCurrentUser, requireUser, requireOwner, getOwner, safeNext), errors.js,
               queries/settings.js (getShop, getTeam), actions/auth.js (signIn, signOut),
               actions/settings.js (saveShop, addMember, setMemberActive, setMemberRole, resetMemberPassword, changeMyPassword),
               queries/accounts.js (getAccountSettings, listPriceItems, listParties, searchParties, getParty, getPartyLedger,
               listEntries, getEntry, getPayment, getOverview, getReport, listStaff, PAGE_SIZE 50),
               actions/accounts.js (saveSale, saveExpense, voidEntry, savePayment, voidPayment, saveParty, archiveParty,
               findParties, savePriceItem, deletePriceItem, movePriceItem, saveAccountSettings), csv.js

scripts/copy-vendor.mjs   copies pdf.js worker/fonts/wasm, qpdf, tesseract (worker, 3 core files, ben/eng data), avro-lib.js,
                          onnxruntime-web (ort.wasm.min.mjs + simd-threaded .mjs/.wasm), models/modnet.onnx (+ NOTICE) and
                          @mediapipe/face_mesh into public/vendor (postinstall / predev / prebuild; `npm run vendor`). ~80 MB.
public/workers/matte.js   background-removal worker (committed)
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
- Job photo presets: Teletalk/BPSC photo 300×300 ≤100 KB, signature 300×80 ≤60 KB (UI tells operators to check the circular).
- Age limit check: within the max if years < max, or exactly max years 0 months 0 days.
- PDF: merge accepts PDFs and photos (photo → A4 page, 10 mm margin). Split: by ranges (one file each), every page, or picked
  pages (one file). Compress: Light = lossless re-save; Medium 150 DPI q0.7; Strong 110 DPI q0.55; "Under a size" walks a
  DPI/quality ladder down to 72 DPI and says so if it still doesn't fit; result says when the file didn't get smaller.
  Lock = AES-256, random owner password, print/copy/edit switches. Unlock needs the password (empty works for
  restriction-only PDFs). Watermark text/logo + page numbers (6 styles incl. Bangla digits), preview uses the same drawing code.
- Bangla typing: word converts on space / Enter (works with phone keyboards because it watches the inserted character, not
  keydown). Ctrl+M switches Bangla/English. Draft kept in localStorage (`shop-tools:bangla-typing`). "Copy for SutonnyMJ" =
  Unicode → Bijoy. Bijoy ↔ Unicode text tool warns when the pasted text looks like the other encoding. OCR accepts images and
  PDFs (pages rendered at scale 3 ≈ 216 DPI), output is editable, shows the reader's confidence.
- Accounts: a sale needs ≥1 item; discount ≤ total; paid ≤ total − discount ("give the change back"); leaving baki needs a
  customer (picked or typed — a typed phone that already exists reuses that person). Expense: paid ≤ amount; owing part needs a
  supplier. Payments can't exceed what's owed. Dates can't be in the future. Profit = sales (after discount) − expenses, counted
  on the entry date; "cash in hand" = money that actually moved (paid parts + baki payments). Operators: no Reports, no CSV,
  no price/expense-type editing, see "New baki today" instead of profit. People can be removed from lists (owner, zero balance
  only); history stays.

---

## 9. Progress log (newest first)

| Date | Change | Next |
| --- | --- | --- |
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
5. **Documents & print** (waiting for the owner's own deed, CV and other templates): deeds and applications (sale deed, mortgage/kot-bondhok, affidavit, applications), CV maker, visiting cards,
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
