// src/components/tools/joint-photo.jsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Download, Trash2 } from "lucide-react";
import { canvasToBlob, downloadBlob } from "@/lib/photo/export";
import { defaultEdit, drawEdit, loadImage, makeCanvas } from "@/lib/photo/image";
import { PX_PER_MM } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { cn } from "@/lib/utils";
import { CropEditor } from "@/components/photo/crop-editor";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Field } from "@/components/ui/form";
import { Segmented, Slider, Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

// Joint photo = the people side by side, each in their own equal part (never on top of each other).
// w × h = the joint photo as made. `turn`: printed a quarter turn so the landscape joint photo fills an upright
// passport space — 5 in a row on A4 like ordinary passport photos.
const SIZES = {
  original: { label: "Original — 2.5 × 1.9 in", hint: "3 in a row on A4", w: 63.5, h: 48.26 },
  passport: { label: "Passport size — 1.5 × 1.9 in", hint: "turned, 5 in a row on A4", w: 48.26, h: 38.1, turn: true },
};

const DEFAULTS = { size: "original", blend: 0 };
const valid = (s) => s && s.size in SIZES && Number.isFinite(s.blend);
const MAX = 4;
let nextId = 1;

/**
 * The frame each person is placed in (mm, in joint-photo coordinates). Person i owns the part [i·part, (i+1)·part];
 * with blending, the frame reaches `blend / 2` into each neighbour so the two photos can fade into each other there.
 */
function frames(n, w, blend) {
  const part = w / n;
  const half = Math.min(blend, part * 0.6) / 2;
  return Array.from({ length: n }, (_, i) => {
    const left = i > 0 ? half : 0;
    const right = i < n - 1 ? half : 0;
    return { x: i * part - left, w: part + left + right, fadeIn: left * 2 };
  });
}

export function JointPhotoTool() {
  const toast = useToast();
  const [stored, setSettings] = useStoredState("joint-photo:simple", DEFAULTS, valid);
  const settings = { ...DEFAULTS, ...stored };
  const set = (patch) => setSettings((s) => ({ ...DEFAULTS, ...s, ...patch }));
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(0);
  const [copies, setCopies] = useState(4);

  const size = SIZES[settings.size];
  const n = Math.max(2, people.length);
  const blendMm = (settings.blend / 100) * (size.w / n); // blend % of one person's part
  const fr = frames(n, size.w, blendMm);
  // each person's edit is kept per frame shape, so changing size / blend never stretches a photo
  const shapeKey = (i) => `${settings.size}:${n}:${fr[i].w.toFixed(2)}`;
  const editOf = (p, i) => p.edits[shapeKey(i)] ?? p.edits.last ?? defaultEdit;

  const addFiles = async (files) => {
    const room = MAX - people.length;
    const added = [];
    for (const f of [...files].slice(0, room)) {
      try {
        const image = await loadImage(f);
        added.push({ id: String(nextId++), name: f.name.replace(/\.[^.]+$/, ""), image, edits: {} });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    if (files.length > room) toast(`Up to ${MAX} people.`, "error");
    if (added.length) {
      setPeople((l) => [...l, ...added]);
      setSelected(people.length);
    }
  };
  const setEdit = (i, edit) =>
    setPeople((l) => l.map((p, j) => (j === i ? { ...p, edits: { ...p.edits, [shapeKey(i)]: edit, last: edit } } : p)));
  const remove = (i) => {
    setPeople((l) => l.filter((_, j) => j !== i));
    setSelected(0);
  };
  const swap = () => setPeople((l) => (l.length === 2 ? [l[1], l[0]] : [...l.slice(1), l[0]]));

  /** The joint photo at `k` px per mm. */
  const draw = (k) => {
    const c = makeCanvas(size.w * k, size.h * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    people.forEach((p, i) => {
      const f = fr[i];
      const layer = makeCanvas(f.w * k, c.height);
      const lctx = layer.getContext("2d");
      lctx.imageSmoothingQuality = "high";
      drawEdit(lctx, p.image.img, editOf(p, i), { x: 0, y: 0, w: layer.width, h: layer.height }, "cover");
      if (f.fadeIn > 0) {
        // fade in over the person on the left across the blend area
        lctx.globalCompositeOperation = "destination-in";
        const g = lctx.createLinearGradient(0, 0, f.fadeIn * k, 0);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,1)");
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, layer.width, layer.height);
      }
      ctx.drawImage(layer, Math.round(f.x * k), 0);
    });
    return c;
  };

  const editsKey = people.map((p, i) => p.id + JSON.stringify(editOf(p, i))).join("|");
  const items = useMemo(
    () =>
      people.length >= 2
        ? [
          {
            key: `joint|${settings.size}|${settings.blend}|${editsKey}`,
            label: "Joint photo",
            wMm: size.turn ? size.h : size.w,
            hMm: size.turn ? size.w : size.h,
            copies,
            setCopies: (k) => setCopies(Math.min(100, k)),
            draw: (k) => {
              const photo = draw(k);
              if (!size.turn) return photo;
              // a quarter turn to the left so it stands in an upright passport space
              const c = makeCanvas(photo.height, photo.width);
              const ctx = c.getContext("2d");
              ctx.translate(0, c.height);
              ctx.rotate(-Math.PI / 2);
              ctx.drawImage(photo, 0, 0);
              return c;
            },
          },
        ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editsKey, settings.size, settings.blend, copies, people.length],
  );

  const preview = useMemo(
    () => (people.length ? draw(8).toDataURL("image/jpeg", 0.9) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editsKey, settings.size, settings.blend, people.length],
  );

  const sel = Math.min(selected, people.length - 1);
  const current = people[sel];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Size">
            <Segmented
              options={Object.entries(SIZES).map(([value, s]) => ({ value, label: s.label }))}
              value={settings.size}
              onChange={(v) => set({ size: v })}
            />
            <p className="text-xs text-muted">{size.hint}</p>
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title={`Photos — left to right (2 to ${MAX} people)`}>
            {people.length < MAX ? (
              <FileDrop
                multiple
                onFiles={addFiles}
                title={people.length ? "Add another person" : "Choose the photos"}
                hint="One photo per person. Drag files here, click to browse, or paste with Ctrl+V."
                compact={people.length > 0}
              />
            ) : null}
            {people.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {people.map((p, i) => (
                  <div
                    key={p.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-1.5 pr-2",
                      i === sel ? "border-brand-300 bg-brand-50/60" : "border-line bg-white",
                    )}
                  >
                    <button type="button" onClick={() => setSelected(i)} className="flex items-center gap-2 text-left">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image.url} alt="" className="h-10 w-8 rounded object-cover" />
                      <span className="text-xs font-medium text-ink-900">
                        {people.length === 2 ? (i === 0 ? "Left" : "Right") : `Person ${i + 1}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => remove(i)}
                      className="rounded p-1 text-subtle hover:bg-danger-50 hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {people.length >= 2 ? (
                  <Button size="sm" variant="ghost" onClick={swap}>
                    <ArrowLeftRight className="h-4 w-4" /> Swap
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Step>
        </Card>

        {current ? (
          <Card className="p-5">
            <Step
              n={3}
              title={`Size and position — ${people.length === 2 ? (sel === 0 ? "left" : "right") : `person ${sel + 1}`}`}
            >
              <p className="text-xs text-muted">
                Drag to move, scroll or use the zoom slider to make the person bigger or smaller, straighten if needed. Do the
                same for each person so the faces are the same size.
              </p>
              <CropEditor
                key={`${current.id}|${shapeKey(sel)}`}
                img={current.image.img}
                edit={editOf(current, sel)}
                onChange={(e) => setEdit(sel, e)}
                aspect={fr[sel].w / size.h}
                guide="face"
                maxHeight={380}
              />
            </Step>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0">
        <Card className="space-y-5 p-5 lg:sticky lg:top-6">
          <Step n={4} title="Joint photo and print">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Joint photo" className="w-full rounded border border-line" />
            ) : null}
            <Slider
              label="Blend in the middle"
              value={settings.blend}
              min={0}
              max={60}
              defaultValue={0}
              unit="%"
              onChange={(blend) => set({ blend })}
            />
            <p className="-mt-2 text-xs text-subtle">
              0 = a straight line between the photos. Higher = the photos fade into each other in the middle.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Copies">
                <Stepper value={copies} onChange={setCopies} min={1} max={100} label="copies" />
              </Field>
              <Button
                variant="outline"
                disabled={people.length < 2}
                onClick={async () => downloadBlob(await canvasToBlob(draw(PX_PER_MM), "image/jpeg", 0.95), "joint-photo.jpg")}
              >
                <Download className="h-4 w-4" /> Save one photo (JPG)
              </Button>
            </div>
            <SheetPanel
              items={items}
              fileName="joint-photos"
              showNewRow={false}
              rememberKey={`joint-${settings.size}`}
              emptyText="Add two photos to see the page."
            />
          </Step>
        </Card>
      </div>
    </div>
  );
}