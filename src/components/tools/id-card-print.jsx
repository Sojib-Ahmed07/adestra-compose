// src/components/tools/id-card-print.jsx
"use client";

import { useMemo, useState } from "react";
import { useStoredState } from "@/lib/use-stored";
import { renderEdit } from "@/lib/photo/image";
import { ID_CARD } from "@/lib/photo/sizes";
import { CardSlot } from "@/components/photo/card-slot";
import { SheetPanel } from "@/components/photo/sheet-panel";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Stepper } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const scales = [
  { value: "100", label: "Real card size — 85.6 × 54 mm" },
  { value: "125", label: "125% — 107 × 68 mm" },
  { value: "150", label: "150% — 128 × 81 mm" },
  { value: "200", label: "200% — 171 × 108 mm" },
];

/** Card with rounded corners like the real thing (optional). */
function drawCard(side, w, h, rounded, grey, clear) {
  let edit = grey ? { ...side.edit, saturation: 0 } : side.edit;
  // "Clearer print": a little brighter and more contrast — phone photos of cards often come out dull.
  if (clear) edit = { ...edit, brightness: 106, contrast: 122 };
  const card = renderEdit(side.image.img, edit, w, h);
  if (!rounded) return card;
  const ctx = card.getContext("2d");
  const r = Math.round(Math.min(w, h) * 0.06);
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.roundRect(0, 0, card.width, card.height, r);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, card.width, card.height);
  return card;
}

export function IdCardPrintTool() {
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [copies, setCopies] = useState(1);
  const [opts, setOpts] = useStoredState(
    "id-card:settings",
    { scale: "100", arrange: "stack", rounded: true, grey: false, clear: false },
    (s) => s && scales.some((x) => x.value === s.scale) && ["side", "stack"].includes(s.arrange),
  );
  const { scale, arrange, rounded, grey, clear } = opts;
  const setScale = (v) => setOpts((o) => ({ ...o, scale: v }));
  const setArrange = (v) => setOpts((o) => ({ ...o, arrange: v }));
  const setRounded = (v) => setOpts((o) => ({ ...o, rounded: v }));
  const setGrey = (v) => setOpts((o) => ({ ...o, grey: v }));
  const setClear = (v) => setOpts((o) => ({ ...o, clear: v }));

  const w = (ID_CARD.w * Number(scale)) / 100;
  const h = (ID_CARD.h * Number(scale)) / 100;
  const aspect = ID_CARD.w / ID_CARD.h;

  const items = useMemo(() => {
    const sides = [
      ["front", "Front", front],
      ["back", "Back", back],
    ].filter(([, , v]) => v);
    const list = [];
    for (let i = 0; i < copies; i++) {
      sides.forEach(([id, label, side], j) => {
        list.push({
          // Same key for every copy of a side → drawn once, reused.
          key: `${id}|${w}|${rounded}|${grey}|${clear}|${side.image.url}|${JSON.stringify(side.edit)}`,
          label,
          wMm: w,
          hMm: h,
          copies: 1,
          newRow: j === 0 || arrange === "stack",
          draw: (pxPerMm) => drawCard(side, w * pxPerMm, h * pxPerMm, rounded, grey, clear),
        });
      });
    }
    return list;
  }, [front, back, copies, w, h, arrange, rounded, grey, clear]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <div className="min-w-0 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="min-w-0 p-5">
            <Step n={1} title="Front side">
              <CardSlot title="Front" value={front} onChange={setFront} aspect={aspect} />
            </Step>
          </Card>
          <Card className="min-w-0 p-5">
            <Step n={2} title="Back side">
              <CardSlot
                title="Back"
                value={back}
                onChange={setBack}
                aspect={aspect}
                hint="Optional — leave empty to print the front only"
              />
            </Step>
          </Card>
        </div>
        <p className="text-sm text-muted">
          Take the photo from above with the card on a plain, darker table — the card is found, flattened and cut to its
          exact size. This prints the customer's own card for photocopy or lamination; it does not change any details on it.
        </p>
      </div>

      <div className="min-w-0">
        <Card className="space-y-5 p-5 lg:sticky lg:top-6">
          <Step n={3} title="Layout and print">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Print size" htmlFor="id-scale" className="sm:col-span-2">
                <Select id="id-scale" value={scale} onChange={(e) => setScale(e.target.value)}>
                  {scales.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Front and back">
                <Segmented
                  size="sm"
                  options={[
                    { value: "side", label: "Side by side" },
                    { value: "stack", label: "One above other" },
                  ]}
                  value={arrange}
                  onChange={setArrange}
                />
              </Field>
              <Field label="Copies">
                <Stepper value={copies} onChange={setCopies} min={1} max={20} label="copies" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox label="Rounded corners" checked={rounded} onChange={(e) => setRounded(e.target.checked)} />
              <Checkbox label="Black & white" checked={grey} onChange={(e) => setGrey(e.target.checked)} />
              <Checkbox label="Clearer print" checked={clear} onChange={(e) => setClear(e.target.checked)} />
            </div>
            <SheetPanel
              items={items}
              fileName="id-card"
              showNewRow={false}
              defaultMargin={10}
              defaultGap={4}
              papers={["a4", "a5", "letter", "legal"]}
              defaultPosition="center"
              rememberKey="id-card"
              emptyText="Add the front of the card to see the page."
              unit="card side"
            />
          </Step>
        </Card>
      </div>
    </div>
  );
}
