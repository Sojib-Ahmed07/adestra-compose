// src/components/tools/pdf-watermark.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { renderPage } from "@/lib/pdf/engine";
import { pdfBlob, suffixName } from "@/lib/pdf/ops";
import { colours, drawPreview, fontsReady, numberFormats, stampPdf } from "@/lib/pdf/stamp";
import { loadImage } from "@/lib/photo/image";
import { PdfPicker, ResultFiles, useJob, usePdfjsDoc } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form";
import { Segmented, Slider, Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const initial = {
  watermark: {
    on: true,
    kind: "text",
    text: "COPY",
    size: 64,
    colour: "grey",
    opacity: 0.25,
    angle: 45,
    position: "center",
    image: null,
    imageWidth: 30,
  },
  numbers: {
    on: false,
    format: "plain",
    position: "bottom-center",
    size: 11,
    colour: "black",
    start: 1,
    skipFirst: false,
    margin: 22,
  },
};

export function PdfWatermarkTool() {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [s, setS] = useState(initial);
  const [previewPage, setPreviewPage] = useState(1);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();
  const { doc } = usePdfjsDoc(file?.bytes);
  const previewRef = useRef(null);
  const count = file?.pageCount ?? 0;

  const setW = (k) => (v) => setS((x) => ({ ...x, watermark: { ...x.watermark, [k]: v } }));
  const setN = (k) => (v) => setS((x) => ({ ...x, numbers: { ...x.numbers, [k]: v } }));

  useEffect(() => setResult(null), [s, file]);

  // Live preview of one page with the same drawing code used for the real file.
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    const t = setTimeout(async () => {
      await fontsReady();
      const page = await doc.getPage(previewPage);
      const vp = page.getViewport({ scale: 1 });
      const canvas = await renderPage(doc, previewPage, { maxWidth: 560 });
      drawPreview(canvas, s, { index: previewPage - 1, count: doc.numPages, width: vp.width, height: vp.height });
      if (!alive || !previewRef.current) return;
      const target = previewRef.current;
      target.width = canvas.width;
      target.height = canvas.height;
      target.getContext("2d").drawImage(canvas, 0, 0);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, s, previewPage]);

  const pickImage = async (files) => {
    try {
      const loaded = await loadImage(files[0]);
      setW("image")(loaded.img);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const nothing =
    !s.numbers.on && !(s.watermark.on && (s.watermark.kind === "image" ? s.watermark.image : s.watermark.text.trim()));

  const apply = () =>
    run("apply", async () => {
      const bytes = await stampPdf(file.bytes, s, (d, t) => setProgress(`Page ${d} of ${t}`));
      setProgress("");
      setResult([{ name: suffixName(file.name, s.watermark.on ? "watermarked" : "numbered"), blob: pdfBlob(bytes) }]);
    });

  const wm = s.watermark;
  const nm = s.numbers;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Choose PDF">
            {file ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-sm">
                  <strong>{file.name}</strong> · {count} page{count === 1 ? "" : "s"}
                </p>
                <Button size="sm" variant="outline" onClick={() => setFile(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <PdfPicker
                onFiles={(f) => {
                  setFile(f[0]);
                  setPreviewPage(1);
                }}
              />
            )}
          </Step>
        </Card>

        <Card className="space-y-4 p-5">
          <Checkbox label={<strong>Watermark</strong>} checked={wm.on} onChange={(e) => setW("on")(e.target.checked)} />
          {wm.on ? (
            <div className="space-y-4">
              <Segmented
                size="sm"
                options={[
                  { value: "text", label: "Text" },
                  { value: "image", label: "Logo / stamp image" },
                ]}
                value={wm.kind}
                onChange={setW("kind")}
              />
              {wm.kind === "text" ? (
                <>
                  <Field label="Text (Bangla or English)" htmlFor="wm-text" hint="New line = second line">
                    <Textarea
                      id="wm-text"
                      rows={2}
                      value={wm.text}
                      onChange={(e) => setW("text")(e.target.value)}
                      className="min-h-16"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Colour" htmlFor="wm-col">
                      <Select id="wm-col" value={wm.colour} onChange={(e) => setW("colour")(e.target.value)}>
                        {Object.keys(colours).map((c) => (
                          <option key={c} value={c}>
                            {c[0].toUpperCase() + c.slice(1)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Layout">
                      <Segmented
                        size="sm"
                        options={[
                          { value: "center", label: "Once" },
                          { value: "tile", label: "Repeat" },
                        ]}
                        value={wm.position === "tile" ? "tile" : "center"}
                        onChange={setW("position")}
                      />
                    </Field>
                  </div>
                  <Slider
                    label="Text size"
                    value={wm.size}
                    min={12}
                    max={160}
                    onChange={setW("size")}
                    defaultValue={64}
                    unit=" pt"
                  />
                  <Slider label="Angle" value={wm.angle} min={-90} max={90} onChange={setW("angle")} defaultValue={45} unit="°" />
                </>
              ) : (
                <>
                  {wm.image ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={wm.image.src} alt="" className="checker h-16 w-16 rounded border border-line object-contain" />
                      <Button size="sm" variant="outline" onClick={() => setW("image")(null)}>
                        Change image
                      </Button>
                    </div>
                  ) : (
                    <FileDrop
                      onFiles={pickImage}
                      compact
                      title="Choose logo or stamp"
                      hint="PNG with a transparent background looks best"
                      listenPaste={false}
                    />
                  )}
                  <Field label="Position" htmlFor="wm-pos">
                    <Select
                      id="wm-pos"
                      value={wm.position === "tile" ? "center" : wm.position}
                      onChange={(e) => setW("position")(e.target.value)}
                    >
                      <option value="center">Centre</option>
                      <option value="top-left">Top left</option>
                      <option value="top-right">Top right</option>
                      <option value="bottom-left">Bottom left</option>
                      <option value="bottom-right">Bottom right</option>
                    </Select>
                  </Field>
                  <Slider
                    label="Width"
                    value={wm.imageWidth}
                    min={5}
                    max={90}
                    onChange={setW("imageWidth")}
                    defaultValue={30}
                    unit="% of page"
                  />
                </>
              )}
              <Slider
                label="Strength"
                value={Math.round(wm.opacity * 100)}
                min={5}
                max={100}
                onChange={(v) => setW("opacity")(v / 100)}
                defaultValue={25}
                unit="%"
              />
            </div>
          ) : null}
        </Card>

        <Card className="space-y-4 p-5">
          <Checkbox label={<strong>Page numbers</strong>} checked={nm.on} onChange={(e) => setN("on")(e.target.checked)} />
          {nm.on ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Style" htmlFor="pn-fmt">
                  <Select id="pn-fmt" value={nm.format} onChange={(e) => setN("format")(e.target.value)}>
                    {Object.entries(numberFormats).map(([k, f]) => (
                      <option key={k} value={k}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Position" htmlFor="pn-pos">
                  <Select id="pn-pos" value={nm.position} onChange={(e) => setN("position")(e.target.value)}>
                    <option value="bottom-center">Bottom centre</option>
                    <option value="bottom-right">Bottom right</option>
                    <option value="bottom-left">Bottom left</option>
                    <option value="top-center">Top centre</option>
                    <option value="top-right">Top right</option>
                    <option value="top-left">Top left</option>
                  </Select>
                </Field>
                <Field label="Start from">
                  <Stepper value={nm.start} onChange={setN("start")} min={1} max={9999} label="start number" />
                </Field>
                <Field label="Size (pt)">
                  <Stepper value={nm.size} onChange={setN("size")} min={6} max={36} label="number size" />
                </Field>
              </div>
              <Checkbox
                label="No number on the first page (cover)"
                checked={nm.skipFirst}
                onChange={(e) => setN("skipFirst")(e.target.checked)}
              />
            </div>
          ) : null}
        </Card>
      </div>

      <div className="min-w-0">
        <Card className="space-y-4 p-5 lg:sticky lg:top-6">
          <Step n={2} title="Preview and save">
            {file ? (
              <>
                {count > 1 ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Preview page</span>
                    <Stepper
                      value={previewPage}
                      onChange={setPreviewPage}
                      min={1}
                      max={count}
                      label="preview page"
                      className="h-9"
                    />
                    <span className="text-muted">of {count}</span>
                  </div>
                ) : null}
                <div className="flex justify-center rounded-xl bg-paper p-3">
                  <canvas ref={previewRef} className="h-auto max-w-full bg-white shadow-[0_0_0_1px_var(--color-line-strong)]" />
                </div>
              </>
            ) : (
              <p className="text-sm text-subtle">Choose a PDF to see a preview.</p>
            )}
            <Button variant="accent" disabled={!file || nothing || Boolean(busy)} onClick={apply}>
              {busy ? progress || "Working…" : nothing ? "Turn on a watermark or page numbers" : "Save PDF"}
            </Button>
            <ResultFiles files={result} />
          </Step>
        </Card>
      </div>
    </div>
  );
}
