// src/components/tools/joint-photo.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { renderPortrait } from "@/lib/photo/ai/look";
import { headSizes, passportEdit } from "@/lib/photo/ai/portrait";
import { beautyPresets } from "@/lib/photo/ai/retouch";
import { canvasToBlob, downloadBlob } from "@/lib/photo/export";
import { defaultEdit, drawEdit, makeCanvas } from "@/lib/photo/image";
import { PX_PER_MM } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { BgPicker, KEEP } from "@/components/photo/bg-picker";
import { PassportEditor } from "@/components/photo/passport-editor";
import { PersonCard } from "@/components/photo/person-card";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { usePortraits } from "@/components/photo/use-portraits";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, NumberInput, Select } from "@/components/ui/form";
import { Segmented, Slider, Stepper } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const jointSizes = [
  { id: "double", label: "Double passport — 76 × 48 mm", w: 76, h: 48 },
  { id: "landscape", label: "Landscape 2.5 × 2 in — 64 × 51 mm", w: 64, h: 51 },
  { id: "passport", label: "Passport size — 38 × 48 mm (all in one)", w: 38, h: 48 },
  { id: "double-e", label: "Double e-passport — 90 × 55 mm", w: 90, h: 55 },
  { id: "3r", label: "3R landscape — 127 × 89 mm", w: 127, h: 89 },
  { id: "4r", label: "4R landscape — 152 × 102 mm", w: 152.4, h: 101.6 },
  { id: "custom", label: "Custom size", w: 76, h: 48 },
];

const DEFAULTS = {
  sizeId: "double",
  custom: { w: 76, h: 48 },
  bg: "#ffffff",
  head: "normal",
  close: 90,
  beauty: "natural",
  fix: true,
  blend: 30, // soft join width (% of one person's part) when the original backgrounds are kept
  seamBlur: 40, // extra blur over the join
  blur: 0, // blur the kept backgrounds
};
const valid = (s) =>
  s &&
  jointSizes.some((j) => j.id === s.sizeId) &&
  typeof s.bg === "string" &&
  s.head in headSizes &&
  Number.isFinite(s.close) &&
  Number.isFinite(s.custom?.w) &&
  Number.isFinite(s.custom?.h);

const MAX = 4;

export function JointPhotoTool() {
  const [stored, setSettings] = useStoredState("joint-photo:settings", DEFAULTS, valid);
  const settings = { ...DEFAULTS, ...stored }; // older saved settings miss the new keys
  const { people, addFiles, update, lookToAll, remove, move, working } = usePortraits({ max: MAX });
  const [adjustId, setAdjustId] = useState(null);
  const [copies, setCopies] = useState(4);
  const set = (patch) => setSettings((s) => ({ ...DEFAULTS, ...s, ...patch }));

  const size = settings.sizeId === "custom" ? settings.custom : jointSizes.find((s) => s.id === settings.sizeId);
  const keep = settings.bg === KEEP;
  const fill = keep ? "#ffffff" : settings.bg;
  const head = headSizes[settings.head];
  const ready = people.filter((p) => p.status === "done" || p.manual);
  const n = Math.max(1, ready.length);
  // Each person gets a frame this wide; "closeness" squeezes the frames together (they overlap).
  const slotW = size.w / n;
  const editKey = `${slotW}x${size.h}`;
  const baseLook = useMemo(
    () => ({ ...beautyPresets[settings.beauty]?.look, bgBlur: settings.blur }),
    [settings.beauty, settings.blur],
  );

  const lookOf = (p) => ({ ...baseLook, ...p.look });
  const sourceOf = (p, preview = false) =>
    p.portrait
      ? renderPortrait(p.portrait, {
        keepBackground: keep,
        fix: p.fix ?? settings.fix,
        look: lookOf(p),
        strokes: p.strokes,
        strokesRev: p.strokesRev,
        preview,
      })
      : p.image.img;
  const editOf = (p) => p.edits[editKey] ?? (p.portrait ? passportEdit(p.portrait, slotW, size.h, head) : defaultEdit);

  /** The whole joint photo at w × h pixels. */
  const draw = (w, h, preview = false) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, c.width, c.height);
    const sw = c.width / n;
    const close = settings.close / 100;
    const centres = ready.map((_, i) => c.width / 2 + (i - (n - 1) / 2) * sw * close);
    const boxOf = (i) => ({ x: centres[i] - sw / 2, y: 0, w: sw, h: c.height });
    const cutOut = !keep;

    if (cutOut) {
      // Cut-outs on one colour: they may overlap; hand-cropped photos stay inside their own part.
      ready.forEach((p, i) => {
        const box = boxOf(i);
        ctx.save();
        if (!p.portrait) {
          ctx.beginPath();
          ctx.rect(Math.round(box.x), 0, Math.round(sw), c.height);
          ctx.clip();
        }
        drawEdit(ctx, sourceOf(p, preview), editOf(p), box, p.portrait ? "contain" : "cover");
        ctx.restore();
      });
      return c;
    }

    // Own backgrounds: each photo fades into the next over a soft join.
    const fade = Math.max(1, (settings.blend / 100) * sw);
    const joins = centres.slice(1).map((x, i) => (centres[i] + x) / 2);
    ready.forEach((p, i) => {
      const layer = makeCanvas(c.width, c.height);
      const lctx = layer.getContext("2d");
      lctx.fillStyle = "#ffffff";
      lctx.fillRect(0, 0, c.width, c.height);
      drawEdit(lctx, sourceOf(p, preview), editOf(p), boxOf(i), p.portrait ? "contain" : "cover");
      // Left side fades in over the previous photo; the right side is covered by the next photo's fade.
      const left = i > 0 ? joins[i - 1] - fade / 2 : -Infinity;
      const right = i < ready.length - 1 ? joins[i] + fade / 2 : Infinity;
      lctx.globalCompositeOperation = "destination-in";
      const g = lctx.createLinearGradient(0, 0, c.width, 0);
      const at = (x) => Math.min(1, Math.max(0, x / c.width));
      if (Number.isFinite(left)) {
        g.addColorStop(at(left), "rgba(0,0,0,0)");
        g.addColorStop(at(left + fade), "rgba(0,0,0,1)");
      } else g.addColorStop(0, "rgba(0,0,0,1)");
      if (Number.isFinite(right)) {
        g.addColorStop(at(right), "rgba(0,0,0,1)");
        g.addColorStop(Math.min(1, at(right) + 0.0001), "rgba(0,0,0,0)");
      } else g.addColorStop(1, "rgba(0,0,0,1)");
      lctx.fillStyle = g;
      lctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(layer, 0, 0);
    });

    // Extra blur over each join (hides different backgrounds / lighting).
    if (settings.seamBlur > 0 && joins.length) {
      const blurred = softBlur(c, (settings.seamBlur / 100) * sw * 0.08);
      const band = makeCanvas(c.width, c.height);
      const bctx = band.getContext("2d");
      bctx.drawImage(blurred, 0, 0);
      bctx.globalCompositeOperation = "destination-in";
      const g = bctx.createLinearGradient(0, 0, c.width, 0);
      const half = Math.max(2, fade * 0.75);
      const stops = [];
      for (const x of joins) stops.push([x - half, 0], [x, 1], [x + half, 0]);
      stops
        .map(([x, a]) => [Math.min(1, Math.max(0, x / c.width)), a])
        .sort((a, b) => a[0] - b[0])
        .forEach(([x, a]) => g.addColorStop(x, `rgba(0,0,0,${a})`));
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, c.width, c.height);
      // Only the background part of the join (the people stay sharp) — keep their faces out of the blur.
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(band, 0, 0);
      ctx.restore();
      // Put the people back on top, sharp.
      ready.forEach((p, i) => {
        if (!p.portrait) return;
        const person = renderPortrait(p.portrait, {
          keepBackground: false,
          fix: p.fix ?? settings.fix,
          look: lookOf(p),
          strokes: p.strokes,
          strokesRev: p.strokesRev,
          preview,
        });
        const layer = makeCanvas(c.width, c.height);
        const lctx = layer.getContext("2d");
        drawEdit(lctx, person, editOf(p), boxOf(i), "contain");
        lctx.globalCompositeOperation = "destination-in";
        const g2 = lctx.createLinearGradient(0, 0, c.width, 0);
        const at = (x) => Math.min(1, Math.max(0, x / c.width));
        const l = i > 0 ? joins[i - 1] : -Infinity;
        const r = i < ready.length - 1 ? joins[i] : Infinity;
        g2.addColorStop(Number.isFinite(l) ? at(l - fade / 2) : 0, "rgba(0,0,0,0)");
        g2.addColorStop(Number.isFinite(l) ? at(l + fade / 2) : 0, "rgba(0,0,0,1)");
        g2.addColorStop(Number.isFinite(r) ? at(r - fade / 2) : 1, "rgba(0,0,0,1)");
        g2.addColorStop(Number.isFinite(r) ? at(r + fade / 2) : 1, Number.isFinite(r) ? "rgba(0,0,0,0)" : "rgba(0,0,0,1)");
        lctx.fillStyle = g2;
        lctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(layer, 0, 0);
      });
    }
    return c;
  };

  const lookKey = ready.map((p) => p.id + JSON.stringify([p.edits[editKey], p.look, p.fix, p.strokesRev, p.manual])).join(",");
  const items = useMemo(
    () =>
      ready.length
        ? [
          {
            key: `joint|${editKey}|${JSON.stringify(settings)}|${lookKey}`,
            label: "Joint photo",
            wMm: size.w,
            hMm: size.h,
            copies,
            setCopies: (k) => setCopies(Math.min(100, k)),
            draw: (px) => draw(size.w * px, size.h * px),
          },
        ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey, JSON.stringify(settings), copies, size.w, size.h, ready.length],
  );

  const saveSingle = async () => {
    downloadBlob(await canvasToBlob(draw(size.w * PX_PER_MM, size.h * PX_PER_MM), "image/jpeg", 0.95), "joint-photo.jpg");
  };

  const adjusting = people.find((p) => p.id === adjustId && (p.status === "done" || p.manual));
  useEffect(() => {
    if (adjustId) document.getElementById("joint-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [adjustId]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Size and background">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Size" htmlFor="jp-size" className="min-w-60 flex-1">
                <Select id="jp-size" value={settings.sizeId} onChange={(e) => set({ sizeId: e.target.value })}>
                  {jointSizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {settings.sizeId === "custom" ? (
                <>
                  <Field label="Width (mm)" htmlFor="jp-w" className="w-28">
                    <NumberInput
                      id="jp-w"
                      min={10}
                      max={300}
                      value={settings.custom.w}
                      onChange={(w) => set({ custom: { ...settings.custom, w } })}
                    />
                  </Field>
                  <Field label="Height (mm)" htmlFor="jp-h" className="w-28">
                    <NumberInput
                      id="jp-h"
                      min={10}
                      max={300}
                      value={settings.custom.h}
                      onChange={(h) => set({ custom: { ...settings.custom, h } })}
                    />
                  </Field>
                </>
              ) : null}
            </div>
            <Field label="Background (one colour for everyone, or keep each photo's own and blend them)">
              <BgPicker value={settings.bg} onChange={(bg) => set({ bg })} id="jp-bg" />
            </Field>
            {keep ? (
              <div className="grid gap-x-5 gap-y-3 rounded-lg bg-ink-50/60 p-3 sm:grid-cols-3">
                <Slider
                  label="Soft join"
                  value={settings.blend}
                  min={0}
                  max={80}
                  defaultValue={30}
                  unit="%"
                  onChange={(blend) => set({ blend })}
                />
                <Slider
                  label="Blur in the middle"
                  value={settings.seamBlur}
                  min={0}
                  max={100}
                  defaultValue={40}
                  onChange={(seamBlur) => set({ seamBlur })}
                />
                <Slider
                  label="Blur backgrounds"
                  value={settings.blur}
                  min={0}
                  max={100}
                  defaultValue={0}
                  onChange={(blur) => set({ blur })}
                />
                <p className="text-xs text-muted sm:col-span-3">
                  The photos fade into each other in the middle, and the join is blurred so it can't be seen. The people stay
                  sharp.
                </p>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Head size">
                <Segmented
                  size="sm"
                  options={Object.entries(headSizes).map(([value, h]) => ({ value, label: h.label }))}
                  value={settings.head}
                  onChange={(v) => set({ head: v })}
                />
              </Field>
              <Slider
                label="How close together"
                value={settings.close}
                min={55}
                max={115}
                onChange={(close) => set({ close })}
                defaultValue={90}
                unit="%"
              />
              <Field label="Face touch-up (everyone)">
                <Segmented
                  size="sm"
                  options={Object.entries(beautyPresets).map(([value, pr]) => ({ value, label: pr.label }))}
                  value={settings.beauty}
                  onChange={(beauty) => set({ beauty })}
                />
              </Field>
              <Checkbox
                className="self-end pb-1.5"
                label="Auto brightness and colour"
                checked={settings.fix}
                onChange={(e) => set({ fix: e.target.checked })}
              />
            </div>
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title={`Photos — 2 to ${MAX} people, left to right`}>
            {people.length < MAX ? (
              <FileDrop
                multiple
                onFiles={addFiles}
                title={people.length ? "Add another person" : "Drop each person's photo"}
                hint="One photo per person (separate photos are fine). The faces are lined up to the same size automatically."
                compact={people.length > 0}
              />
            ) : null}
            {people.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {people.map((p) => (
                  <PersonCard
                    key={p.id}
                    p={p}
                    active={adjustId === p.id}
                    onAdjust={() => setAdjustId(p.id)}
                    onRemove={() => {
                      remove(p.id);
                      if (adjustId === p.id) setAdjustId(null);
                    }}
                    onRetry={() => update(p.id, { status: "queued", error: "" })}
                    onManual={() => {
                      update(p.id, { manual: true, status: "manual", error: "" });
                      setAdjustId(p.id);
                    }}
                    onMove={people.length > 1 ? (dir) => move(p.id, dir) : null}
                  />
                ))}
              </ul>
            ) : null}
            {ready.length === 1 && !working ? <p className="text-sm text-warn">Add the other person's photo too.</p> : null}
            {ready.length ? (
              <p className="text-xs text-muted">
                Press <strong>Edit</strong> on a photo for its position and head size, light, face touch-up and background.
              </p>
            ) : null}
          </Step>
        </Card>

        {adjusting ? (
          <Card className="p-5" id="joint-editor">
            <PassportEditor
              key={adjusting.id}
              p={adjusting}
              rows={[{ label: "Joint photo", w: slotW, h: size.h, copies: 1 }]}
              head={head}
              globalBg={settings.bg}
              globalFix={settings.fix}
              baseLook={baseLook}
              allowOwnBg={false}
              showCopies={false}
              onChange={(patch) => update(adjusting.id, patch)}
              onLookToAll={lookToAll}
              onClose={() => setAdjustId(null)}
            />
          </Card>
        ) : null}
      </div>

      <div className="min-w-0">
        <Card className="space-y-5 p-5 lg:sticky lg:top-6">
          <Step n={3} title="Copies and print">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Copies">
                <Stepper value={copies} onChange={setCopies} min={1} max={100} label="copies" />
              </Field>
              <Button variant="outline" onClick={saveSingle} disabled={ready.length < 1}>
                <Download className="h-4 w-4" /> Save one photo (JPG)
              </Button>
            </div>
            <SheetPanel
              items={items}
              fileName="joint-photos"
              showNewRow={false}
              rememberKey="joint-photo"
              emptyText="Add the photos to see the page."
            />
          </Step>
        </Card>
      </div>
    </div>
  );
}

/** Blur a canvas by shrinking and enlarging it (works in every browser, no ctx.filter needed). */
function softBlur(src, radius) {
  const k = Math.max(1, radius / 2);
  const small = makeCanvas(src.width / k, src.height / k);
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(src, 0, 0, small.width, small.height);
  // A second, smaller step makes the blur smoother.
  const tiny = makeCanvas(small.width / 2, small.height / 2);
  const tctx = tiny.getContext("2d");
  tctx.imageSmoothingQuality = "high";
  tctx.drawImage(small, 0, 0, tiny.width, tiny.height);
  sctx.clearRect(0, 0, small.width, small.height);
  sctx.drawImage(tiny, 0, 0, small.width, small.height);
  const out = makeCanvas(src.width, src.height);
  const octx = out.getContext("2d");
  octx.imageSmoothingQuality = "high";
  octx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}