// src/components/tools/job-photo.jsx
"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, TriangleAlert } from "lucide-react";
import { downloadBlob, encodeUnder } from "@/lib/photo/export";
import { renderEdit } from "@/lib/photo/image";
import { cleanSignature } from "@/lib/photo/signature";
import { formatBytes } from "@/lib/utils";
import { PhotoSlot } from "@/components/photo/photo-slot";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select } from "@/components/ui/form";
import { Segmented, Slider, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

// Typical online-application limits. Always check the circular — they can change.
const presets = {
  photo: [
    { id: "teletalk", label: "Teletalk govt. jobs / BPSC — 300 × 300 px, max 100 KB", w: 300, h: 300, kb: 100 },
    { id: "custom", label: "Custom", w: 300, h: 300, kb: 100 },
  ],
  signature: [
    { id: "teletalk", label: "Teletalk govt. jobs / BPSC — 300 × 80 px, max 60 KB", w: 300, h: 80, kb: 60 },
    { id: "custom", label: "Custom", w: 300, h: 80, kb: 60 },
  ],
};

export function JobPhotoTool() {
  const [kind, setKind] = useState("photo");
  return (
    <div className="space-y-5">
      <Segmented
        options={[
          { value: "photo", label: "Photo" },
          { value: "signature", label: "Signature" },
        ]}
        value={kind}
        onChange={setKind}
      />
      {/* Both stay mounted so switching keeps each one's work. */}
      <div hidden={kind !== "photo"}>
        <Maker kind="photo" />
      </div>
      <div hidden={kind !== "signature"}>
        <Maker kind="signature" />
      </div>
    </div>
  );
}

function Maker({ kind }) {
  const toast = useToast();
  const isSig = kind === "signature";
  const [value, setValue] = useState(null);
  const [presetId, setPresetId] = useState("teletalk");
  const [custom, setCustom] = useState({ w: presets[kind][0].w, h: presets[kind][0].h, kb: presets[kind][0].kb });
  const [clean, setClean] = useState(true);
  const [strength, setStrength] = useState(0.7);
  const [ink, setInk] = useState("original");
  const [name, setName] = useState("");
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);

  const preset = presets[kind].find((p) => p.id === presetId);
  const spec = presetId === "custom" ? custom : preset;

  // Re-make the output whenever something changes (short delay so sliders stay smooth).
  useEffect(() => {
    if (!value) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setWorking(true);
    const t = setTimeout(async () => {
      try {
        const canvas = renderEdit(value.image.img, value.edit, spec.w, spec.h);
        if (isSig && clean) cleanSignature(canvas, { strength, ink });
        const enc = await encodeUnder(canvas, spec.kb * 1024, "image/jpeg");
        if (cancelled) return;
        setResult((old) => {
          if (old?.url) URL.revokeObjectURL(old.url);
          return { ...enc, url: URL.createObjectURL(enc.blob) };
        });
      } catch (err) {
        if (!cancelled) toast(err.message || "Couldn't make the image.", "error");
      } finally {
        if (!cancelled) setWorking(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, spec.w, spec.h, spec.kb, clean, strength, ink, isSig]);

  const fileName = `${(name.trim() || kind).replace(/[^\wঀ-৿-]+/g, "-")}-${spec.w}x${spec.h}.jpg`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-6">
        <Card className="p-5">
          <Step n={1} title="Requirement">
            <Field label="Size and limit" htmlFor={`${kind}-preset`}>
              <Select id={`${kind}-preset`} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {presets[kind].map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            {presetId === "custom" ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Width (px)" htmlFor={`${kind}-w`}>
                  <NumberInput
                    id={`${kind}-w`}
                    integer
                    min={20}
                    max={4000}
                    value={custom.w}
                    onChange={(w) => setCustom((c) => ({ ...c, w }))}
                  />
                </Field>
                <Field label="Height (px)" htmlFor={`${kind}-h`}>
                  <NumberInput
                    id={`${kind}-h`}
                    integer
                    min={20}
                    max={4000}
                    value={custom.h}
                    onChange={(h) => setCustom((c) => ({ ...c, h }))}
                  />
                </Field>
                <Field label="Max size (KB)" htmlFor={`${kind}-kb`}>
                  <NumberInput
                    id={`${kind}-kb`}
                    min={5}
                    max={10000}
                    value={custom.kb}
                    onChange={(kb) => setCustom((c) => ({ ...c, kb }))}
                  />
                </Field>
              </div>
            ) : (
              <p className="text-xs text-subtle">Check the job circular — if its numbers are different, choose Custom.</p>
            )}
          </Step>
        </Card>

        <Card className="p-5">
          <Step n={2} title={isSig ? "Signature photo" : "Photo"}>
            <PhotoSlot
              title={isSig ? "Signature on white paper" : "Applicant's photo"}
              value={value}
              onChange={setValue}
              aspect={spec.w / spec.h}
              guide={isSig ? "none" : "face"}
              maxHeight={isSig ? 200 : 360}
              hint={isSig ? "Sign with a dark pen on white paper, then photograph or scan it" : undefined}
            />
            {isSig ? (
              <div className="space-y-3 rounded-xl bg-paper p-4">
                <Checkbox
                  label="Clean the background (white paper, dark ink)"
                  checked={clean}
                  onChange={(e) => setClean(e.target.checked)}
                />
                {clean ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Slider
                      label="Cleaning strength"
                      value={strength}
                      min={0.3}
                      max={0.95}
                      step={0.05}
                      onChange={setStrength}
                      defaultValue={0.7}
                    />
                    <Field label="Ink colour">
                      <Segmented
                        size="sm"
                        options={[
                          { value: "original", label: "As written" },
                          { value: "black", label: "Black" },
                          { value: "blue", label: "Blue" },
                        ]}
                        value={ink}
                        onChange={setInk}
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Step>
        </Card>
      </div>

      <div className="min-w-0">
        <Card className="space-y-4 p-5 lg:sticky lg:top-6">
          <Step n={3} title="Result">
            {result ? (
              <>
                <div className="checker flex items-center justify-center rounded-xl border border-line p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result.url}
                    alt={`${kind} result`}
                    width={spec.w}
                    height={spec.h}
                    className="h-auto max-w-full shadow-sm"
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-paper px-3 py-2">
                    <dt className="text-xs text-muted">Size</dt>
                    <dd className="tabular font-medium">
                      {spec.w} × {spec.h} px
                    </dd>
                  </div>
                  <div className="rounded-lg bg-paper px-3 py-2">
                    <dt className="text-xs text-muted">File</dt>
                    <dd className="tabular font-medium">
                      {formatBytes(result.blob.size)} <span className="text-xs font-normal text-muted">/ max {spec.kb} KB</span>
                    </dd>
                  </div>
                </dl>
                {result.fits ? (
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" /> Ready to upload — within the limit.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                    <TriangleAlert className="h-4 w-4" /> Still over {spec.kb} KB even at the lowest quality. Use a smaller size.
                  </p>
                )}
                <Field label="Applicant's name (for the file name)" htmlFor={`${kind}-name`} hint={fileName}>
                  <Input id={`${kind}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
                </Field>
                <Button
                  variant="accent"
                  className="w-full"
                  disabled={working || !result.fits}
                  onClick={() => {
                    downloadBlob(result.blob, fileName);
                    toast(`${fileName} saved to Downloads.`);
                  }}
                >
                  <Download className="h-4 w-4" /> {working ? "Updating…" : `Download ${isSig ? "signature" : "photo"}`}
                </Button>
              </>
            ) : (
              <p className="text-sm text-subtle">Add a {isSig ? "signature" : "photo"} to see the result here.</p>
            )}
          </Step>
        </Card>
      </div>
    </div>
  );
}
