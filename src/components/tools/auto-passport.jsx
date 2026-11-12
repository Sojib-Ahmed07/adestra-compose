// src/components/tools/auto-passport.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, UserPlus, X } from "lucide-react";
import { renderPortrait } from "@/lib/photo/ai/look";
import { headSizes, passportEdit } from "@/lib/photo/ai/portrait";
import { beautyPresets } from "@/lib/photo/ai/retouch";
import { defaultEdit, renderEdit } from "@/lib/photo/image";
import { getPhotoSize, photoSizes } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { cn } from "@/lib/utils";
import { BgPicker, KEEP } from "@/components/photo/bg-picker";
import { PassportEditor } from "@/components/photo/passport-editor";
import { PersonCard } from "@/components/photo/person-card";
import { usePortraits } from "@/components/photo/use-portraits";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, NumberInput, Select } from "@/components/ui/form";
import { Segmented, Stepper } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const DEFAULTS = {
  order: [{ sizeId: "passport", copies: 4 }],
  custom: { w: 38, h: 48 },
  bg: "#ffffff",
  head: "normal",
  fix: true,
  beauty: "natural",
};

/** One-tap orders that studios print most often. */
const mix = (pp, st) => [
  { sizeId: "passport", copies: pp },
  { sizeId: "stamp", copies: st },
];
const presets = [
  { label: "4 passport", order: [{ sizeId: "passport", copies: 4 }] },
  { label: "5 passport (1 row)", order: [{ sizeId: "passport", copies: 5 }] },
  { label: "4 passport + 2 stamp", order: mix(4, 2) },
  { label: "3 passport + 4 stamp", order: mix(3, 4) },
  { label: "4 passport + 4 stamp", order: mix(4, 4) },
  { label: "8 passport", order: [{ sizeId: "passport", copies: 8 }] },
  { label: "25 passport (full A4)", order: [{ sizeId: "passport", copies: 25 }] },
  { label: "8 stamp", order: [{ sizeId: "stamp", copies: 8 }] },
  { label: "4 e-passport / visa", order: [{ sizeId: "e-passport", copies: 4 }] },
  { label: "2 square visa", order: [{ sizeId: "us-visa", copies: 2 }] },
];

const validSettings = (s) =>
  s &&
  Array.isArray(s.order) &&
  s.order.length > 0 &&
  s.order.every((r) => typeof r.sizeId === "string" && Number.isFinite(r.copies)) &&
  typeof s.bg === "string" &&
  s.head in headSizes &&
  typeof s.fix === "boolean" &&
  (s.beauty === undefined || s.beauty in beautyPresets) &&
  Number.isFinite(s.custom?.w) &&
  Number.isFinite(s.custom?.h);

export function AutoPassportTool() {
  const [settings, setSettings] = useStoredState("auto-passport:settings", DEFAULTS, validSettings);
  const { people, addFiles, update, lookToAll, remove: removePerson, clear, working } = usePortraits();
  const [adjust, setAdjust] = useState(null); // { id } — the photo open in the editor
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const remove = (id) => {
    removePerson(id);
    if (adjust?.id === id) setAdjust(null);
  };

  // Opening the editor brings it into view.
  useEffect(() => {
    if (adjust) document.getElementById("photo-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [adjust]);

  // When everything is ready, bring the Print button into view.
  const wasWorking = useRef(false);
  useEffect(() => {
    if (wasWorking.current && !working && people.some((p) => p.status === "done")) {
      const btn = document.getElementById("auto-print");
      if (btn) {
        btn.focus({ preventScroll: true });
        if (window.innerWidth < 1024) btn.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    wasWorking.current = working;
  }, [working, people]);

  const sizeOfRow = (row) => {
    if (row.sizeId === "custom") return { w: settings.custom.w, h: settings.custom.h, label: "Custom" };
    const s = getPhotoSize(row.sizeId);
    return { w: s.w, h: s.h, label: s.label };
  };
  const head = headSizes[settings.head];
  const baseLook = beautyPresets[settings.beauty ?? "natural"].look;
  const bgOf = (p) => p.bg ?? settings.bg;
  const fillOf = (p) => (bgOf(p) === KEEP ? "#ffffff" : bgOf(p));

  /** What gets drawn for one person (their own edits on top of the automatic result). */
  const sourceOf = (p, preview = false) =>
    p.portrait
      ? renderPortrait(p.portrait, {
        keepBackground: bgOf(p) === KEEP,
        fix: p.fix ?? settings.fix,
        look: { ...baseLook, ...p.look },
        strokes: p.strokes,
        strokesRev: p.strokesRev,
        preview,
      })
      : p.image.img;
  const editOf = (p, w, h) => p.edits[`${w}x${h}`] ?? (p.portrait ? passportEdit(p.portrait, w, h, head) : defaultEdit);
  const fitOf = (p) => (p.portrait ? "contain" : "cover");
  const looksKey = (p) =>
    JSON.stringify([p.look, p.bg, p.fix, p.strokesRev, p.manual, settings.bg, settings.fix, settings.head, settings.beauty]);

  const ready = people.filter((p) => p.status === "done" || p.manual);

  const items = useMemo(
    () =>
      ready.flatMap((p) =>
        settings.order.map((row, i) => {
          const { w, h, label } = sizeOfRow(row);
          const edit = editOf(p, w, h);
          return {
            key: `${p.id}|${i}|${w}x${h}|${looksKey(p)}|${JSON.stringify(edit)}`,
            label: `${p.name} (${label})`,
            group: p.id, // one customer's sizes follow each other on the same row
            wMm: w,
            hMm: h,
            copies: p.copies[i] ?? row.copies,
            setCopies: (n) => update(p.id, { copies: { ...p.copies, [i]: n } }),
            draw: (px) => renderEdit(sourceOf(p), edit, w * px, h * px, { fit: fitOf(p), background: fillOf(p) }),
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, settings],
  );

  const setRow = (i, patch) => set({ order: settings.order.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const usesCustom = settings.order.some((r) => r.sizeId === "custom");

  const adjusting = adjust ? people.find((p) => p.id === adjust.id && (p.status === "done" || p.manual)) : null;
  const rows = settings.order.map((r) => ({ ...sizeOfRow(r), copies: r.copies }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="What to print">
            <div className="flex flex-wrap gap-1.5" aria-label="Quick choices">
              {presets.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => set({ order: pr.order.map((r) => ({ ...r })) })}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium",
                    JSON.stringify(pr.order) === JSON.stringify(settings.order)
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line-strong text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {pr.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {settings.order.map((row, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={`Photo size ${i + 1}`}
                    className="h-9 min-w-0 flex-1 basis-48"
                    value={row.sizeId}
                    onChange={(e) => setRow(i, { sizeId: e.target.value })}
                  >
                    {photoSizes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} — {s.detail}
                      </option>
                    ))}
                  </Select>
                  <Stepper
                    value={row.copies}
                    onChange={(copies) => setRow(i, { copies })}
                    min={1}
                    max={200}
                    label={`copies of size ${i + 1}`}
                    className="h-9"
                  />
                  {settings.order.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove size ${i + 1}`}
                      title="Remove this size"
                      onClick={() => set({ order: settings.order.filter((_, j) => j !== i) })}
                      className="rounded-lg p-2 text-subtle hover:bg-danger-50 hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              {settings.order.length < 4 ? (
                <button
                  type="button"
                  onClick={() => set({ order: [...settings.order, { sizeId: "stamp", copies: 4 }] })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Plus className="h-4 w-4" /> Add another size (e.g. 4 passport + 4 stamp)
                </button>
              ) : null}
              {usesCustom ? (
                <div className="flex flex-wrap gap-3 pt-1">
                  <Field label="Custom width (mm)" htmlFor="ap-cw" className="w-36">
                    <NumberInput
                      id="ap-cw"
                      min={10}
                      max={200}
                      value={settings.custom.w}
                      onChange={(w) => set({ custom: { ...settings.custom, w } })}
                    />
                  </Field>
                  <Field label="Custom height (mm)" htmlFor="ap-ch" className="w-36">
                    <NumberInput
                      id="ap-ch"
                      min={10}
                      max={250}
                      value={settings.custom.h}
                      onChange={(h) => set({ custom: { ...settings.custom, h } })}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            <Field label="Background">
              <BgPicker value={settings.bg} onChange={(bg) => set({ bg })} id="ap-bg" />
            </Field>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <Field label="Head size">
                <Segmented
                  size="sm"
                  options={Object.entries(headSizes).map(([value, h]) => ({ value, label: h.label }))}
                  value={settings.head}
                  onChange={(v) => set({ head: v })}
                />
              </Field>
              <Field label="Face touch-up (all photos)">
                <Segmented
                  size="sm"
                  options={Object.entries(beautyPresets).map(([value, pr]) => ({ value, label: pr.label }))}
                  value={settings.beauty ?? "natural"}
                  onChange={(v) => set({ beauty: v })}
                />
              </Field>
              <Checkbox
                className="pb-1.5"
                label="Auto brightness and colour"
                checked={settings.fix}
                onChange={(e) => set({ fix: e.target.checked })}
              />
            </div>
            <p className="text-xs text-subtle">These settings are remembered on this computer.</p>
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title="Drop the photos">
            <FileDropBig onFiles={addFiles} compact={people.length > 0} />
            {people.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {people.map((p) => (
                  <PersonCard
                    key={p.id}
                    p={p}
                    preview={
                      p.status === "done" || p.manual
                        ? () => {
                          const { w, h } = sizeOfRow(settings.order[0]);
                          return renderEdit(sourceOf(p, true), editOf(p, w, h), 150, (150 * h) / w, {
                            fit: fitOf(p),
                            background: fillOf(p),
                          });
                        }
                        : null
                    }
                    previewKey={`${looksKey(p)}|${JSON.stringify(settings.order[0])}|${JSON.stringify(p.edits)}|${p.status}`}
                    active={adjust?.id === p.id}
                    onAdjust={() => setAdjust({ id: p.id })}
                    onRemove={() => remove(p.id)}
                    onRetry={() => update(p.id, { status: "queued", error: "" })}
                    onManual={() => {
                      update(p.id, { manual: true, status: "manual", error: "" });
                      setAdjust({ id: p.id });
                    }}
                  />
                ))}
              </ul>
            ) : null}
            {people.length ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clear();
                  setAdjust(null);
                }}
              >
                <UserPlus className="h-4 w-4" /> Next customer (clear all)
              </Button>
            ) : null}
          </Step>
        </Card>

        {adjusting ? (
          <Card className="p-5" id="photo-editor">
            <PassportEditor
              key={adjusting.id}
              p={adjusting}
              rows={rows}
              head={head}
              globalBg={settings.bg}
              globalFix={settings.fix}
              baseLook={baseLook}
              onChange={(patch) => update(adjusting.id, patch)}
              onLookToAll={lookToAll}
              onClose={() => setAdjust(null)}
            />
          </Card>
        ) : null}
      </div>

      <div className="min-w-0">
        <Card className="p-5 lg:sticky lg:top-6">
          <Step n={3} title="Print">
            {working ? (
              <p className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Getting the photos ready…
              </p>
            ) : null}
            <SheetPanel
              items={items}
              fileName="passport-photos"
              defaultPaper="a4"
              rememberKey="auto-passport"
              printId="auto-print"
              emptyText="Drop a photo — it will appear here ready to print."
            />
          </Step>
        </Card>
      </div>
    </div>
  );
}

/** Big drop area that also takes Ctrl+V. */
function FileDropBig({ onFiles, compact }) {
  return (
    <FileDrop
      multiple
      onFiles={onFiles}
      title={compact ? "Add more photos" : "Drop the customer's photo here"}
      hint="Straight from the camera or phone is fine — the face is found, the background removed and the light fixed automatically. Several photos at once is fine too."
      compact={compact}
    />
  );
}