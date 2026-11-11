// src/components/tools/id-card-print.jsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Images } from "lucide-react";
import { findTwoCards } from "@/lib/photo/card";
import { enhanceLevels, enhanceScan } from "@/lib/photo/enhance";
import { loadImage, renderEdit } from "@/lib/photo/image";
import { ID_CARD } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { CardPageLayout } from "@/components/photo/card-page";
import { CardSlot, cardValue } from "@/components/photo/card-slot";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Field } from "@/components/ui/form";
import { Segmented, Slider, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const LOOK_DEFAULTS = { rounded: true, grey: false, level: "clear", brightness: 0, contrast: 0 };
const validLook = (s) => s && typeof s.rounded === "boolean" && enhanceLevels.some((l) => l.value === (s.level ?? "clear"));

/** One side, ready to print: straightened card, clearer, optional rounded corners. */
function drawCard(src, w, h, rounded) {
  const card = renderEdit(src, { zoom: 1, x: 0, y: 0, rotate: 0, turn: 0, flip: false }, w, h);
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
  const toast = useToast();
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [mode, setMode] = useState("two"); // two photos | one photo with both sides
  const [stored, setLook] = useStoredState("id-card:look", LOOK_DEFAULTS, validLook);
  const look = { ...LOOK_DEFAULTS, ...stored };
  const setL = (patch) => setLook((s) => ({ ...LOOK_DEFAULTS, ...s, ...patch }));
  const aspect = ID_CARD.w / ID_CARD.h;

  // Clearer print is worked out once per card side (not for every copy).
  const sig = `${look.level}|${look.grey}|${look.brightness}|${look.contrast}`;
  const frontClear = useMemo(
    () => (front ? enhanceScan(front.image.img, look) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [front, sig],
  );
  const backClear = useMemo(
    () => (back ? enhanceScan(back.image.img, look) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [back, sig],
  );

  const cards = useMemo(() => {
    const list = [];
    const add = (side, label, value, clear) => {
      if (!value) return;
      list.push({
        side,
        label,
        key: `${side}|${value.image.url}|${sig}|${look.rounded}`,
        // Drawn at the photo's own resolution (1600 px wide ≈ 475 DPI at real size); the page scales it to the card size.
        draw: () => drawCard(clear, clear.width, clear.height, look.rounded),
      });
    };
    add("front", "Front", front, frontClear);
    add("back", "Back", back, backClear);
    return list;
  }, [front, back, frontClear, backClear, sig, look.rounded]);

  const fromOnePhoto = async (files) => {
    try {
      const photo = await loadImage(files[0]);
      const { cards: found, found: ok } = findTwoCards(photo.img);
      if (ok && found.length === 2) {
        setFront(cardValue(photo, found[0], aspect, 1600, true));
        setBack(cardValue(photo, found[1], aspect, 1600, true));
        toast("Both sides found. Check them below — use Swap if front and back are the wrong way round.");
      } else {
        setFront(cardValue(photo, found[0], aspect, 1600, false));
        setBack(null);
        toast("Only one card was found. Add the back as its own photo, or fix the corners.", "error");
      }
      setMode("two");
    } catch (err) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
      <div className="min-w-0 space-y-6">
        <Card className="space-y-4 p-5">
          <Segmented
            size="sm"
            options={[
              { value: "two", label: "Front and back — separate photos" },
              { value: "one", label: "Both sides in one photo" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === "one" ? (
            <FileDrop
              onFiles={fromOnePhoto}
              title="Drop one photo with both sides of the card"
              hint="Put the front and the back on a plain, darker table (side by side or one above the other) and take one photo from above."
              listenPaste={false}
            />
          ) : null}
        </Card>

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
        {front && back ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFront(back);
              setBack(front);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" /> Swap front and back
          </Button>
        ) : null}

        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold text-ink-900">Print quality</p>
          <Field label="Make the card clearer">
            <Segmented size="sm" options={enhanceLevels} value={look.level} onChange={(level) => setL({ level })} />
          </Field>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Slider
              label="Brightness"
              value={look.brightness}
              min={-50}
              max={50}
              defaultValue={0}
              onChange={(brightness) => setL({ brightness })}
            />
            <Slider
              label="Contrast"
              value={look.contrast}
              min={-50}
              max={50}
              defaultValue={0}
              onChange={(contrast) => setL({ contrast })}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Checkbox label="Rounded corners" checked={look.rounded} onChange={(e) => setL({ rounded: e.target.checked })} />
            <Checkbox label="Black & white" checked={look.grey} onChange={(e) => setL({ grey: e.target.checked })} />
          </div>
          <p className="flex gap-2 text-xs text-muted">
            <Images className="h-4 w-4 shrink-0" />
            Take the photo from above with the card on a plain, darker table — the card is found, flattened and cut to its exact
            size. This prints the customer's own card for photocopy or lamination; it does not change any details on it.
          </p>
        </Card>
      </div>

      <div className="min-w-0">
        <Card className="space-y-5 p-5 lg:sticky lg:top-6">
          <Step n={3} title="Page and print">
            <CardPageLayout cards={cards} cardW={ID_CARD.w} cardH={ID_CARD.h} rememberKey="id-card" fileName="id-card" />
          </Step>
        </Card>
      </div>
    </div>
  );
}