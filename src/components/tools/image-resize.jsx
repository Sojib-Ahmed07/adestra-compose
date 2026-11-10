// src/components/tools/image-resize.jsx
"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Download, Trash2 } from "lucide-react";
import { canvasToBlob, downloadBlob, encodeUnder } from "@/lib/photo/export";
import { imageToCanvas, loadImage, makeCanvas, scaleCanvas } from "@/lib/photo/image";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Field, NumberInput, Select } from "@/components/ui/form";
import { Segmented, Slider, useToast } from "@/components/ui/interactive";
import { Badge, Card, Step } from "@/components/ui/misc";

let nextId = 1;

const formats = {
  "image/jpeg": { ext: "jpg", label: "JPG" },
  "image/png": { ext: "png", label: "PNG" },
  "image/webp": { ext: "webp", label: "WebP" },
};

/** Target pixel size for one image under the chosen mode. */
function targetSize(w, h, s) {
  switch (s.mode) {
    case "percent":
      return { w: Math.max(1, Math.round((w * s.percent) / 100)), h: Math.max(1, Math.round((h * s.percent) / 100)) };
    case "width":
      return { w: s.width, h: Math.max(1, Math.round((h * s.width) / w)) };
    case "height":
      return { w: Math.max(1, Math.round((w * s.height) / h)), h: s.height };
    case "longest": {
      const k = Math.min(1, s.longest / Math.max(w, h));
      return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
    }
    case "exact":
      return { w: s.width, h: s.height };
    default:
      return { w, h };
  }
}

/** Exact size: crop the middle so nothing is stretched. */
function coverCrop(src, w, h) {
  const k = Math.max(w / src.width, h / src.height);
  const sw = w / k;
  const sh = h / k;
  const tmp = makeCanvas(sw, sh);
  tmp.getContext("2d").drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, tmp.width, tmp.height);
  return scaleCanvas(tmp, w, h);
}

export function ImageResizeTool() {
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [s, setS] = useState({
    mode: "keep",
    percent: 50,
    width: 1200,
    height: 800,
    longest: 1600,
    format: "same",
    maxKb: 0,
    quality: 85,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));

  // Settings changed → old results no longer match.
  useEffect(() => {
    setFiles((list) => list.map((f) => (f.out ? (URL.revokeObjectURL(f.out.url), { ...f, out: null }) : f)));
  }, [s]);

  const add = async (list) => {
    const loaded = [];
    for (const file of list) {
      try {
        loaded.push({ id: String(nextId++), file, image: await loadImage(file), out: null });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    setFiles((f) => [...f, ...loaded]);
  };

  const remove = (id) =>
    setFiles((list) => {
      const f = list.find((x) => x.id === id);
      if (f) {
        URL.revokeObjectURL(f.image.url);
        if (f.out) URL.revokeObjectURL(f.out.url);
      }
      return list.filter((x) => x.id !== id);
    });

  const outType = (f) => {
    if (s.format !== "same") return s.format;
    return formats[f.file.type] ? f.file.type : "image/jpeg";
  };

  const process = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const done = [];
      for (const f of files) {
        const type = outType(f);
        const opaque = type === "image/jpeg";
        const src = imageToCanvas(f.image.img, opaque ? "#ffffff" : undefined);
        const t = targetSize(src.width, src.height, s);
        const canvas =
          s.mode === "exact"
            ? coverCrop(src, t.w, t.h)
            : t.w === src.width && t.h === src.height
              ? src
              : scaleCanvas(src, t.w, t.h, opaque ? "#ffffff" : undefined);
        let blob;
        let fits = true;
        if (s.maxKb > 0 && type !== "image/png") {
          const r = await encodeUnder(canvas, s.maxKb * 1024, type);
          blob = r.blob;
          fits = r.fits;
        } else {
          blob = await canvasToBlob(canvas, type, s.quality / 100);
        }
        const base = f.file.name.replace(/\.[^.]+$/, "");
        done.push({
          id: f.id,
          out: {
            blob,
            url: URL.createObjectURL(blob),
            w: canvas.width,
            h: canvas.height,
            fits,
            name: `${base}.${formats[type].ext}`,
          },
        });
      }
      setFiles((list) => list.map((f) => ({ ...f, out: done.find((d) => d.id === f.id)?.out ?? f.out })));
      toast(done.length === 1 ? "Image ready." : `${done.length} images ready.`);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't process the images.", "error");
    } finally {
      setBusy(false);
    }
  };

  const downloadAll = async () => {
    for (const f of files) {
      if (!f.out) continue;
      downloadBlob(f.out.blob, f.out.name);
      await new Promise((r) => setTimeout(r, 250)); // browsers block many downloads at once
    }
  };

  const ready = files.filter((f) => f.out).length;
  const pngNoLimit = s.format === "image/png" && s.maxKb > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card className="h-fit p-5 lg:sticky lg:top-6">
        <Step n={1} title="Settings">
          <Field label="Size">
            <Select value={s.mode} onChange={(e) => set("mode")(e.target.value)} aria-label="Size">
              <option value="keep">Keep the same size</option>
              <option value="percent">Percentage</option>
              <option value="longest">Longest side up to…</option>
              <option value="width">Width (keep shape)</option>
              <option value="height">Height (keep shape)</option>
              <option value="exact">Exact width × height (crops to fit)</option>
            </Select>
          </Field>
          {s.mode === "percent" ? (
            <Slider label="Percentage" value={s.percent} min={5} max={200} onChange={set("percent")} defaultValue={50} unit="%" />
          ) : null}
          {s.mode === "longest" ? (
            <Field label="Longest side (px)" htmlFor="ir-long">
              <NumberInput id="ir-long" integer min={16} max={10000} value={s.longest} onChange={set("longest")} />
            </Field>
          ) : null}
          {s.mode === "width" || s.mode === "exact" ? (
            <Field label="Width (px)" htmlFor="ir-w">
              <NumberInput id="ir-w" integer min={16} max={10000} value={s.width} onChange={set("width")} />
            </Field>
          ) : null}
          {s.mode === "height" || s.mode === "exact" ? (
            <Field label="Height (px)" htmlFor="ir-h">
              <NumberInput id="ir-h" integer min={16} max={10000} value={s.height} onChange={set("height")} />
            </Field>
          ) : null}

          <Field label="Save as">
            <Segmented
              size="sm"
              options={[
                { value: "same", label: "Same type" },
                { value: "image/jpeg", label: "JPG" },
                { value: "image/png", label: "PNG" },
                { value: "image/webp", label: "WebP" },
              ]}
              value={s.format}
              onChange={set("format")}
            />
          </Field>
          <Field label="Maximum file size (KB)" htmlFor="ir-kb" hint="0 = no limit. Quality is lowered only as much as needed.">
            <NumberInput id="ir-kb" min={0} max={50000} value={s.maxKb} onChange={set("maxKb")} />
          </Field>
          {pngNoLimit ? (
            <p className="text-xs text-warn">PNG can't be squeezed to a size limit. Choose JPG or WebP for that.</p>
          ) : null}
          {!(s.maxKb > 0) && s.format !== "image/png" ? (
            <Slider label="Quality" value={s.quality} min={10} max={100} onChange={set("quality")} defaultValue={85} unit="%" />
          ) : null}
        </Step>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={2} title="Images">
            <FileDrop
              multiple
              onFiles={add}
              title={files.length ? "Add more images" : "Choose images"}
              hint="JPG, PNG or WebP — as many as you like"
              compact={files.length > 0}
            />
            {files.length ? (
              <>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.out?.url ?? f.image.url}
                        alt=""
                        className="checker h-14 w-14 shrink-0 rounded-lg border border-line object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.out?.name ?? f.file.name}</p>
                        <p className="tabular flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {f.image.width} × {f.image.height} · {formatBytes(f.file.size)}
                          {f.out ? (
                            <>
                              <ArrowRight className="h-3 w-3" />
                              <span className="font-medium text-ink-900">
                                {f.out.w} × {f.out.h} · {formatBytes(f.out.blob.size)}
                              </span>
                              {!f.out.fits ? <Badge tone="danger">over limit</Badge> : null}
                            </>
                          ) : null}
                        </p>
                      </div>
                      {f.out ? (
                        <Button size="sm" variant="outline" onClick={() => downloadBlob(f.out.blob, f.out.name)}>
                          <Download className="h-3.5 w-3.5" /> Save
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${f.file.name}`}
                        onClick={() => remove(f.id)}
                        className="rounded-lg p-2 text-subtle hover:bg-danger-50 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button variant="accent" onClick={process} disabled={busy}>
                    {busy ? "Working…" : ready ? "Make again" : files.length === 1 ? "Make image" : `Make ${files.length} images`}
                  </Button>
                  {ready > 1 ? (
                    <Button variant="outline" onClick={downloadAll}>
                      <Download className="h-4 w-4" /> Save all {ready}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
          </Step>
        </Card>
      </div>
    </div>
  );
}
