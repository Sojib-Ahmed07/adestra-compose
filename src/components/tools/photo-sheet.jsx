// src/components/tools/photo-sheet.jsx
"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { defaultEdit, loadImage, renderEdit } from "@/lib/photo/image";
import { orderPresets, sameOrder, validOrder } from "@/lib/photo/orders";
import { getPhotoSize, photoSizes } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { cn } from "@/lib/utils";
import { CropEditor } from "@/components/photo/crop-editor";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, Input, NumberInput, Select } from "@/components/ui/form";
import { Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;

const DEFAULT_ORDER = [{ sizeId: "passport", copies: 4 }];
const copyOrder = (o) => o.map((r) => ({ ...r }));

/** Size of one order row in mm (custom sizes use the person's own numbers). */
function sizeOf(p, row) {
  if (row.sizeId === "custom") return { w: p.customW, h: p.customH, label: "Custom" };
  const s = getPhotoSize(row.sizeId);
  return { w: s.w, h: s.h, label: s.label };
}
const sizeKey = (s) => `${s.w}x${s.h}`;

/** The crop for one size: its own, else the person's main crop (passport and stamp have the same shape). */
const editFor = (p, s) => p.edits[sizeKey(s)] ?? p.edit;

/** The sizes of an order with a clearly different shape (each gets its own crop). */
function cropSizes(p) {
  const seen = [];
  for (const row of p.order) {
    const s = sizeOf(p, row);
    if (!seen.some((x) => Math.abs(x.w / x.h - s.w / s.h) < 0.03)) seen.push(s);
  }
  return seen;
}

export function PhotoSheetTool() {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [cropAt, setCropAt] = useState(0); // which size of the selected person is being cropped
  const [order, setOrder] = useStoredState("photo-sheet:order", DEFAULT_ORDER, validOrder);

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) {
      try {
        const loaded = await loadImage(f);
        added.push({
          id: String(nextId++),
          name: f.name.replace(/\.[^.]+$/, ""),
          image: loaded,
          order: copyOrder(order),
          customW: 38,
          customH: 48,
          edit: { ...defaultEdit },
          edits: {},
        });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    if (added.length) {
      setPeople((p) => [...p, ...added]);
      setSelectedId(added[0].id);
      setCropAt(0);
    }
  };

  const update = (id, patch) => setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id) => {
    const p = people.find((x) => x.id === id);
    const rest = people.filter((x) => x.id !== id);
    setPeople(rest);
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null);
    if (p) setTimeout(() => URL.revokeObjectURL(p.image.url), 1000);
  };

  /** A quick choice / change of the order: for every photo (and the next ones). */
  const setOrderAll = (next) => {
    setOrder(next);
    setPeople((list) => list.map((p) => ({ ...p, order: copyOrder(next) })));
    setCropAt(0);
  };
  const setRow = (i, patch) => setOrderAll(order.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setPersonRow = (p, i, patch) => update(p.id, { order: p.order.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const selected = people.find((p) => p.id === selectedId);
  const crops = selected ? cropSizes(selected) : [];
  const cropSize = crops[Math.min(cropAt, crops.length - 1)];

  const items = useMemo(
    () =>
      people.flatMap((p) =>
        p.order.map((row, i) => {
          const s = sizeOf(p, row);
          const edit = editFor(p, s);
          return {
            key: `${p.id}|${i}|${sizeKey(s)}|${JSON.stringify(edit)}`,
            label: p.order.length > 1 ? `${p.name} (${s.label})` : p.name,
            group: p.id, // one customer's sizes follow each other on the same row
            wMm: s.w,
            hMm: s.h,
            copies: row.copies,
            setCopies: (n) => setPersonRow(p, i, { copies: Math.min(200, n) }),
            draw: (pxPerMm) => renderEdit(p.image.img, edit, s.w * pxPerMm, s.h * pxPerMm),
          };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="What to print">
            <div className="flex flex-wrap gap-1.5" aria-label="Quick choices">
              {orderPresets.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => setOrderAll(copyOrder(pr.order))}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium",
                    sameOrder(pr.order, order)
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-line-strong text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {pr.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {order.map((row, i) => (
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
                  {order.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Remove size ${i + 1}`}
                      title="Remove this size"
                      onClick={() => setOrderAll(order.filter((_, j) => j !== i))}
                      className="rounded-lg p-2 text-subtle hover:bg-danger-50 hover:text-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              {order.length < 4 ? (
                <button
                  type="button"
                  onClick={() => setOrderAll([...order, { sizeId: "stamp", copies: 2 }])}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Plus className="h-4 w-4" /> Add another size (e.g. 4 passport + 2 stamp)
                </button>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              This is used for every photo. To give one person a different number, change it in their row below.
            </p>
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title="Add photos">
            <FileDrop
              multiple
              onFiles={addFiles}
              title={people.length ? "Add more photos" : "Choose photos"}
              hint="One photo per person. Drag files here, click to browse, or paste with Ctrl+V."
              compact={people.length > 0}
            />
            {people.length ? (
              <ul className="space-y-2">
                {people.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-xl border p-2.5",
                        active ? "border-brand-300 bg-brand-50/50" : "border-line bg-white",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(p.id);
                          setCropAt(0);
                        }}
                        className="flex min-w-0 flex-1 basis-40 items-center gap-3 text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image.url} alt="" className="h-12 w-10 shrink-0 rounded object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-900">{p.name}</span>
                          <span className="block text-xs text-muted">{active ? "Editing" : "Click to edit"}</span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.order.map((row, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5">
                            <span className="text-xs text-muted">{sizeOf(p, row).label}</span>
                            <Stepper
                              value={row.copies}
                              onChange={(v) => setPersonRow(p, i, { copies: v })}
                              min={0}
                              max={200}
                              label={`${sizeOf(p, row).label} copies of ${p.name}`}
                              className="h-9"
                            />
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        title="Remove"
                        onClick={() => remove(p.id)}
                        className="rounded-lg p-2 text-subtle hover:bg-danger-50 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Step>
        </Card>

        {selected && cropSize ? (
          <Card className="p-5">
            <Step n={3} title={`Crop and adjust — ${selected.name}`}>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Name on file" htmlFor="ps-name" className="min-w-40 flex-1">
                  <Input id="ps-name" value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} />
                </Field>
                {selected.order.some((r) => r.sizeId === "custom") ? (
                  <>
                    <Field label="Custom width (mm)" htmlFor="ps-w" className="w-32">
                      <NumberInput
                        id="ps-w"
                        min={5}
                        max={250}
                        value={selected.customW}
                        onChange={(customW) => update(selected.id, { customW })}
                      />
                    </Field>
                    <Field label="Custom height (mm)" htmlFor="ps-h" className="w-32">
                      <NumberInput
                        id="ps-h"
                        min={5}
                        max={300}
                        value={selected.customH}
                        onChange={(customH) => update(selected.id, { customH })}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
              {crops.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" aria-label="Crop for size">
                  {crops.map((s, i) => (
                    <button
                      key={sizeKey(s)}
                      type="button"
                      onClick={() => setCropAt(i)}
                      className={cn(
                        "h-8 rounded-full border px-3 text-xs font-medium",
                        s === cropSize
                          ? "border-brand-300 bg-brand-50 text-brand-700"
                          : "border-line-strong text-ink-700 hover:bg-ink-50",
                      )}
                    >
                      Crop for {s.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  {selected.order.length > 1 ? "Passport and stamp have the same shape — one crop is used for both." : null}
                </p>
              )}
              <CropEditor
                key={`${selected.id}|${sizeKey(cropSize)}`}
                img={selected.image.img}
                edit={editFor(selected, cropSize)}
                onChange={(edit) =>
                  cropAt === 0 || crops.length === 1
                    ? update(selected.id, { edit })
                    : update(selected.id, { edits: { ...selected.edits, [sizeKey(cropSize)]: edit } })
                }
                aspect={cropSize.w / cropSize.h}
                guide="face"
              />
            </Step>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0">
        <Card className="p-5 lg:sticky lg:top-6">
          <Step n={selected ? 4 : 3} title="Paper and print">
            <SheetPanel items={items} fileName="photos" emptyText="Add a photo to see the page." />
          </Step>
        </Card>
      </div>
    </div>
  );
}