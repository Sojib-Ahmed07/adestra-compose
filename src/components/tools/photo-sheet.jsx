// src/components/tools/photo-sheet.jsx
"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { defaultEdit, loadImage, renderEdit } from "@/lib/photo/image";
import { getPhotoSize, photoSizes } from "@/lib/photo/sizes";
import { cn } from "@/lib/utils";
import { CropEditor } from "@/components/photo/crop-editor";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, Input, NumberInput, Select } from "@/components/ui/form";
import { Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

let nextId = 1;

/** Size of a person's photo in mm (custom sizes use their own numbers). */
function sizeOf(p) {
  if (p.sizeId === "custom") return { w: p.customW, h: p.customH };
  const s = getPhotoSize(p.sizeId);
  return { w: s.w, h: s.h };
}

export function PhotoSheetTool() {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lastSize, setLastSize] = useState("passport");

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) {
      try {
        const loaded = await loadImage(f);
        added.push({
          id: String(nextId++),
          name: f.name.replace(/\.[^.]+$/, ""),
          image: loaded,
          sizeId: lastSize,
          customW: 38,
          customH: 48,
          copies: 4,
          edit: { ...defaultEdit },
        });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    if (added.length) {
      setPeople((p) => [...p, ...added]);
      setSelectedId(added[0].id);
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

  const selected = people.find((p) => p.id === selectedId);

  const items = useMemo(
    () =>
      people.map((p) => {
        const { w, h } = sizeOf(p);
        return {
          key: `${p.id}|${w}x${h}|${JSON.stringify(p.edit)}`,
          label: p.name,
          wMm: w,
          hMm: h,
          copies: p.copies,
          setCopies: (n) => update(p.id, { copies: Math.min(200, n) }),
          draw: (pxPerMm) => renderEdit(p.image.img, p.edit, w * pxPerMm, h * pxPerMm),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Add photos">
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
                        onClick={() => setSelectedId(p.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image.url} alt="" className="h-12 w-10 shrink-0 rounded object-cover" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-900">{p.name}</span>
                          <span className="block text-xs text-muted">{active ? "Editing" : "Click to edit"}</span>
                        </span>
                      </button>
                      <Select
                        aria-label={`Size for ${p.name}`}
                        className="h-9 w-40"
                        value={p.sizeId}
                        onChange={(e) => {
                          update(p.id, { sizeId: e.target.value, edit: { ...p.edit, x: 0, y: 0 } });
                          setLastSize(e.target.value);
                        }}
                      >
                        {photoSizes.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                      <Stepper
                        value={p.copies}
                        onChange={(v) => update(p.id, { copies: v })}
                        min={1}
                        max={200}
                        label={`copies of ${p.name}`}
                        className="h-9"
                      />
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

        {selected ? (
          <Card className="p-5">
            <Step n={2} title={`Crop and adjust — ${selected.name}`}>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Name on file" htmlFor="ps-name" className="min-w-40 flex-1">
                  <Input id="ps-name" value={selected.name} onChange={(e) => update(selected.id, { name: e.target.value })} />
                </Field>
                {selected.sizeId === "custom" ? (
                  <>
                    <Field label="Width (mm)" htmlFor="ps-w" className="w-28">
                      <NumberInput
                        id="ps-w"
                        min={5}
                        max={250}
                        value={selected.customW}
                        onChange={(customW) => update(selected.id, { customW })}
                      />
                    </Field>
                    <Field label="Height (mm)" htmlFor="ps-h" className="w-28">
                      <NumberInput
                        id="ps-h"
                        min={5}
                        max={300}
                        value={selected.customH}
                        onChange={(customH) => update(selected.id, { customH })}
                      />
                    </Field>
                  </>
                ) : (
                  <p className="pb-2 text-sm text-muted">{getPhotoSize(selected.sizeId).detail}</p>
                )}
              </div>
              <CropEditor
                key={selected.id}
                img={selected.image.img}
                edit={selected.edit}
                onChange={(edit) => update(selected.id, { edit })}
                aspect={sizeOf(selected).w / sizeOf(selected).h}
                guide="face"
              />
            </Step>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0">
        <Card className="p-5 lg:sticky lg:top-6">
          <Step n={people.length ? 3 : 2} title="Paper and print">
            <SheetPanel items={items} fileName="photos" emptyText="Add a photo to see the page." />
          </Step>
        </Card>
      </div>
    </div>
  );
}
