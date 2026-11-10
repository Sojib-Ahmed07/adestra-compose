// src/components/tools/joint-photo.jsx
"use client";

import { useMemo, useState } from "react";
import { Download, Wand2 } from "lucide-react";
import { headSizes, passportEdit } from "@/lib/photo/ai/portrait";
import { canvasToBlob, downloadBlob } from "@/lib/photo/export";
import { defaultEdit, drawEdit, makeCanvas } from "@/lib/photo/image";
import { PX_PER_MM } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { BgPicker, KEEP } from "@/components/photo/bg-picker";
import { CropEditor } from "@/components/photo/crop-editor";
import { PersonCard } from "@/components/photo/person-card";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { usePortraits } from "@/components/photo/use-portraits";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, NumberInput, Select } from "@/components/ui/form";
import { Segmented, Slider, Stepper } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const jointSizes = [
  { id: "double", label: "Double passport — 76 × 48 mm", w: 76, h: 48 },
  { id: "landscape", label: "Landscape 2.5 × 2 in — 64 × 51 mm", w: 64, h: 51 },
  { id: "passport", label: "Passport size — 38 × 48 mm (all in one)", w: 38, h: 48 },
  { id: "double-e", label: "Double e-passport — 90 × 55 mm", w: 90, h: 55 },
  { id: "3r", label: "3R landscape — 127 × 89 mm", w: 127, h: 89 },
  { id: "custom", label: "Custom size", w: 76, h: 48 },
];

const DEFAULTS = { sizeId: "double", custom: { w: 76, h: 48 }, bg: "#ffffff", head: "normal", close: 90 };
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
  const [settings, setSettings] = useStoredState("joint-photo:settings", DEFAULTS, valid);
  const { people, addFiles, update, remove, move, working } = usePortraits({ max: MAX });
  const [adjustId, setAdjustId] = useState(null);
  const [copies, setCopies] = useState(4);
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const size = settings.sizeId === "custom" ? settings.custom : jointSizes.find((s) => s.id === settings.sizeId);
  const keep = settings.bg === KEEP;
  const fill = keep ? "#ffffff" : settings.bg;
  const head = headSizes[settings.head];
  const ready = people.filter((p) => p.status === "done" || p.manual);
  const n = Math.max(1, ready.length);
  // Each person gets a frame this wide; "closeness" squeezes the frames together (cut-outs may overlap).
  const slotW = size.w / n;
  const editKey = `${size.w}x${size.h}|${n}|${settings.head}`;

  const sourceOf = (p) => (p.portrait ? p.portrait.variant({ keepBackground: keep, fix: true }) : p.image.img);
  const editOf = (p) => p.edits[editKey] ?? (p.portrait ? passportEdit(p.portrait, slotW, size.h, head) : defaultEdit);

  /** The whole joint photo at w × h pixels. */
  const draw = (w, h) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, c.width, c.height);
    const sw = c.width / n;
    const close = keep ? 1 : settings.close / 100;
    ready.forEach((p, i) => {
      const cx = c.width / 2 + (i - (n - 1) / 2) * sw * close;
      const box = { x: cx - sw / 2, y: 0, w: sw, h: c.height };
      ctx.save();
      // Photos with their own background (or cropped by hand) stay inside their own part.
      if (keep || !p.portrait) {
        ctx.beginPath();
        ctx.rect(Math.round(box.x), 0, Math.round(sw), c.height);
        ctx.clip();
      }
      drawEdit(ctx, sourceOf(p), editOf(p), box, p.portrait ? "contain" : "cover");
      ctx.restore();
    });
    return c;
  };

  const items = useMemo(
    () =>
      ready.length
        ? [
            {
              key: `joint|${editKey}|${JSON.stringify(settings)}|${ready.map((p) => p.id + JSON.stringify(p.edits)).join(",")}`,
              label: "Joint photo",
              wMm: size.w,
              hMm: size.h,
              copies,
              setCopies: (n) => setCopies(Math.min(100, n)),
              draw: (px) => draw(size.w * px, size.h * px),
            },
          ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, settings, copies, size.w, size.h],
  );

  const saveSingle = async () => {
    downloadBlob(await canvasToBlob(draw(size.w * PX_PER_MM, size.h * PX_PER_MM), "image/jpeg", 0.95), "joint-photo.jpg");
  };

  const adjusting = people.find((p) => p.id === adjustId && (p.status === "done" || p.manual));

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
            <Field label="Background (one colour for everyone, so the join can't be seen)">
              <BgPicker value={settings.bg} onChange={(bg) => set({ bg })} id="jp-bg" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Head size">
                <Segmented
                  size="sm"
                  options={Object.entries(headSizes).map(([value, h]) => ({ value, label: h.label }))}
                  value={settings.head}
                  onChange={(v) => set({ head: v })}
                />
              </Field>
              {!keep ? (
                <Slider
                  label="How close together"
                  value={settings.close}
                  min={60}
                  max={110}
                  onChange={(close) => set({ close })}
                  defaultValue={90}
                  unit="%"
                />
              ) : null}
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
            {ready.length === 1 && !working ? (
              <p className="text-sm text-warn">Add the other person's photo too.</p>
            ) : null}
          </Step>
        </Card>

        {adjusting ? (
          <Card className="p-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900">Adjust — {adjusting.name}</h3>
                <div className="flex gap-2">
                  {adjusting.edits[editKey] && adjusting.portrait ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const edits = { ...adjusting.edits };
                        delete edits[editKey];
                        update(adjusting.id, { edits });
                      }}
                    >
                      <Wand2 className="h-4 w-4" /> Back to automatic
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setAdjustId(null)}>
                    Done
                  </Button>
                </div>
              </div>
              <CropEditor
                key={`${adjusting.id}|${editKey}`}
                img={sourceOf(adjusting)}
                edit={editOf(adjusting)}
                onChange={(edit) => update(adjusting.id, { edits: { ...adjusting.edits, [editKey]: edit } })}
                aspect={slotW / size.h}
                fit={adjusting.portrait ? "contain" : "cover"}
                background={fill}
                guide={adjusting.portrait ? "none" : "face"}
                maxHeight={340}
              />
            </div>
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
