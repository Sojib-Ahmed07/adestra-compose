// src/components/tools/remove-bg.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileArchive, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { warmMatte } from "@/lib/photo/ai/matte";
import { cutoutWhole } from "@/lib/photo/ai/portrait";
import { canvasToBlob, downloadBlob } from "@/lib/photo/export";
import { loadImage, makeCanvas } from "@/lib/photo/image";
import { useStoredState } from "@/lib/use-stored";
import { zipFiles } from "@/lib/zip";
import { BgPicker } from "@/components/photo/bg-picker";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";
import { FileDrop } from "@/components/ui/file-drop";

let nextId = 1;
const DEFAULTS = { mode: "clear", bg: "#ffffff", fix: false };
const valid = (s) => s && (s.mode === "clear" || s.mode === "colour") && typeof s.bg === "string" && typeof s.fix === "boolean";

/** Final picture: transparent PNG, or the cut-out on a colour (JPG). */
function finalCanvas(cut, settings) {
  const src = cut.variant({ fix: settings.fix });
  if (settings.mode === "clear") return src;
  const c = makeCanvas(src.width, src.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = settings.bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

export function RemoveBgTool() {
  const toast = useToast();
  const [settings, setSettings] = useStoredState("remove-bg:settings", DEFAULTS, valid);
  const [list, setList] = useState([]);
  const [zipping, setZipping] = useState(false);
  const busy = useRef(false);
  const [tick, setTick] = useState(0);
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const update = (id, patch) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  useEffect(() => {
    warmMatte();
  }, []);

  useEffect(() => {
    if (busy.current) return;
    const next = list.find((x) => x.status === "queued");
    if (!next) return;
    busy.current = true;
    (async () => {
      try {
        update(next.id, { status: "working" });
        const cut = await cutoutWhole(next.image.img);
        update(next.id, { status: "done", cut });
      } catch (err) {
        console.error(err);
        update(next.id, { status: "error", error: err?.message || "Couldn't remove the background." });
      } finally {
        busy.current = false;
        setTick((t) => t + 1);
      }
    })();
  }, [list, tick]);

  const addFiles = async (files) => {
    const added = [];
    for (const f of files) {
      try {
        added.push({ id: String(nextId++), name: f.name.replace(/\.[^.]+$/, ""), image: await loadImage(f), status: "queued" });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    if (added.length) setList((l) => [...l, ...added]);
  };

  const ext = settings.mode === "clear" ? "png" : "jpg";
  const blobOf = (x) =>
    canvasToBlob(finalCanvas(x.cut, settings), settings.mode === "clear" ? "image/png" : "image/jpeg", 0.95);

  const saveOne = async (x) => downloadBlob(await blobOf(x), `${x.name}-no-background.${ext}`);
  const done = list.filter((x) => x.status === "done");
  const saveAll = async () => {
    setZipping(true);
    try {
      const files = [];
      for (const x of done) files.push({ name: `${x.name}-no-background.${ext}`, blob: await blobOf(x) });
      downloadBlob(await zipFiles(files), "no-background.zip");
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <Step n={1} title="Settings">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <Field label="Result">
              <Segmented
                size="sm"
                options={[
                  { value: "clear", label: "Transparent (PNG)" },
                  { value: "colour", label: "On a colour (JPG)" },
                ]}
                value={settings.mode}
                onChange={(mode) => set({ mode })}
              />
            </Field>
            {settings.mode === "colour" ? (
              <Field label="Colour">
                <BgPicker value={settings.bg} onChange={(bg) => set({ bg })} allowKeep={false} id="rb-bg" />
              </Field>
            ) : null}
            <Checkbox
              className="pb-1.5"
              label="Also fix light and colour"
              checked={settings.fix}
              onChange={(e) => set({ fix: e.target.checked })}
            />
          </div>
          <p className="text-xs text-subtle">Made for photos of people. Everything runs on this computer — nothing is uploaded.</p>
        </Step>
      </Card>

      <Card className="p-5">
        <Step n={2} title="Photos">
          <FileDrop
            multiple
            onFiles={addFiles}
            title={list.length ? "Add more photos" : "Drop photos of people"}
            compact={list.length > 0}
          />
          {list.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((x) => (
                <li key={x.id} className="space-y-2 rounded-xl border border-line bg-white p-3">
                  <Result x={x} settings={settings} />
                  <p className="truncate text-sm font-medium text-ink-900">{x.name}</p>
                  {x.status === "error" ? <p className="text-xs text-danger">{x.error}</p> : null}
                  <div className="flex flex-wrap gap-1.5">
                    {x.status === "done" ? (
                      <Button size="sm" variant="outline" onClick={() => saveOne(x)}>
                        <Download className="h-4 w-4" /> Save {ext.toUpperCase()}
                      </Button>
                    ) : null}
                    {x.status === "error" ? (
                      <Button size="sm" variant="outline" onClick={() => update(x.id, { status: "queued" })}>
                        <RefreshCw className="h-4 w-4" /> Try again
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setList((l) => l.filter((y) => y.id !== x.id));
                        setTimeout(() => URL.revokeObjectURL(x.image.url), 1000);
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {done.length > 1 ? (
            <Button variant="accent" onClick={saveAll} disabled={zipping}>
              <FileArchive className="h-4 w-4" /> {zipping ? "Making ZIP…" : `Save all ${done.length} (ZIP)`}
            </Button>
          ) : null}
        </Step>
      </Card>
    </div>
  );
}

function Result({ x, settings }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || x.status !== "done") return;
    const src = finalCanvas(x.cut, settings);
    const s = Math.min(1, 600 / Math.max(src.width, src.height));
    c.width = Math.round(src.width * s);
    c.height = Math.round(src.height * s);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
  }, [x, settings]);

  const box = "flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg";
  if (x.status !== "done") {
    return (
      <div className={`${box} relative bg-ink-50`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={x.image.url} alt="" className="max-h-full max-w-full object-contain opacity-60" />
        {x.status === "queued" || x.status === "working" ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-ink-800">
            <Loader2 className="h-6 w-6 animate-spin" />
            {x.status === "queued" ? "Waiting…" : "Removing the background…"}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className={box}
      style={{
        backgroundColor: "#fff",
        backgroundImage:
          "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
      }}
    >
      <canvas ref={ref} className="max-h-full max-w-full" aria-label={`${x.name} without background`} />
    </div>
  );
}
