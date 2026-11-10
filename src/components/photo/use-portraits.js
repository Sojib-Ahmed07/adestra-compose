// src/components/photo/use-portraits.js
"use client";

import { useEffect, useRef, useState } from "react";
import { warmFaces } from "@/lib/photo/ai/faces";
import { warmMatte } from "@/lib/photo/ai/matte";
import { preparePortrait } from "@/lib/photo/ai/portrait";
import { loadImage } from "@/lib/photo/image";
import { useToast } from "@/components/ui/interactive";

let nextId = 1;

export const stepText = {
  queued: "Waiting…",
  face: "Finding the face…",
  background: "Removing the background…",
  colour: "Fixing light and colour…",
};

/**
 * A list of photos that are prepared automatically (face, background, colour), one at a time.
 * Each person: { id, name, image, status, portrait, manual, edits, look, strokes, strokesRev, bg, fix, copies, warnings, error }.
 * status: queued | face | background | colour (working) · done · error · manual (cropped by hand)
 */
export function usePortraits({ max = Infinity } = {}) {
  const toast = useToast();
  const [people, setPeople] = useState([]);
  const busy = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    warmFaces();
    warmMatte();
  }, []);

  const update = (id, patch) => setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  useEffect(() => {
    if (busy.current) return;
    const next = people.find((p) => p.status === "queued");
    if (!next) return;
    busy.current = true;
    (async () => {
      try {
        const portrait = await preparePortrait(next.image.img, { onStep: (status) => update(next.id, { status }) });
        update(next.id, { status: "done", portrait, warnings: portrait.warnings, error: "" });
      } catch (err) {
        console.error(err);
        update(next.id, { status: "error", error: err?.message || "Something went wrong with this photo." });
      } finally {
        busy.current = false;
        setTick((t) => t + 1);
      }
    })();
  }, [people, tick]);

  const addFiles = async (files) => {
    const room = max - people.length;
    if (room <= 0) {
      toast(`Up to ${max} photos here. Remove one first.`, "error");
      return;
    }
    const added = [];
    for (const f of files.slice(0, room)) {
      try {
        const image = await loadImage(f);
        added.push({
          id: String(nextId++),
          name: f.name.replace(/\.[^.]+$/, ""),
          image,
          status: "queued",
          portrait: null,
          manual: false,
          edits: {}, // position per photo size ("38x48" → Edit)
          look: {}, // manual light / touch-up (lib/photo/ai/look.js)
          strokes: [], // erase / bring-back brush marks
          strokesRev: 0,
          bg: null, // own background (null = the tool's setting)
          fix: null, // own auto-fix switch (null = the tool's setting)
          copies: {}, // own copies per size row (row index → n)
          warnings: [],
          error: "",
        });
      } catch (err) {
        toast(err.message, "error");
      }
    }
    if (files.length > room) toast(`Only ${max} photos fit here — the rest were skipped.`, "error");
    if (added.length) setPeople((p) => [...p, ...added]);
  };

  const remove = (id) => {
    const p = people.find((x) => x.id === id);
    setPeople((list) => list.filter((x) => x.id !== id));
    if (p) setTimeout(() => URL.revokeObjectURL(p.image.url), 1000);
  };

  const clear = () => {
    people.forEach((p) => setTimeout(() => URL.revokeObjectURL(p.image.url), 1000));
    setPeople([]);
  };

  const move = (id, dir) =>
    setPeople((list) => {
      const i = list.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const updateAll = (patch) => setPeople((list) => list.map((p) => ({ ...p, ...patch })));
  const working = people.some((p) => p.status in stepText);
  return { people, addFiles, update, updateAll, remove, clear, move, working };
}
