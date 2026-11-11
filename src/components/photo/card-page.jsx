// src/components/photo/card-page.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlignCenter, Move } from "lucide-react";
import { renderPage } from "@/lib/photo/sheet";
import { getPaper, paperSizes } from "@/lib/photo/sizes";
import { useStoredState } from "@/lib/use-stored";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Segmented, Slider, Stepper } from "@/components/ui/interactive";
import { SheetOutput } from "./sheet-output";

/**
 * Page layout for card prints (NID / ID cards): front and back placed on the page, sized and moved by hand.
 * Drag a card to move it (it snaps to the middle of the page), drag the corner handle to resize all cards,
 * arrow keys nudge the selected card. Print / PDF / JPG at 300 DPI.
 *
 * @param {{ cards: { side: "front" | "back", label: string, key: string, draw: (pxPerMm: number) => HTMLCanvasElement }[],
 *   cardW: number, cardH: number, rememberKey: string, fileName: string, papers?: string[] }} props
 *   cardW / cardH: real card size in mm (scale 100%).
 */
export function CardPageLayout({ cards, cardW, cardH, rememberKey, fileName, papers = ["a4", "a5", "letter", "legal"] }) {
    const [opts, setOpts] = useStoredState(`${rememberKey}:page`, DEFAULTS, validOpts);
    const o = { ...DEFAULTS, ...opts };
    const set = (patch) => setOpts((s) => ({ ...DEFAULTS, ...s, ...patch }));
    const [copies, setCopies] = useState(1);
    const [moved, setMoved] = useState({}); // slot key → { x, y } in mm (dragged by hand)
    const [selected, setSelected] = useState(null);

    const base = getPaper(o.paperId);
    const paper = useMemo(() => (o.landscape ? { w: base.h, h: base.w } : { w: base.w, h: base.h }), [base, o.landscape]);
    const front = cards.find((c) => c.side === "front");
    const back = cards.find((c) => c.side === "back");
    const hasBack = Boolean(back);
    const arrange = hasBack ? o.arrange : "single";
    const scale = o.scale / 100;
    const w = cardW * scale;
    const h = cardH * scale;

    // Any change to the layout settings puts the cards back in their automatic places.
    const layoutSig = JSON.stringify([o.paperId, o.landscape, o.scale, arrange, o.position, o.perPage, o.gap, o.margin, hasBack]);
    const lastSig = useRef(layoutSig);
    useEffect(() => {
        if (lastSig.current !== layoutSig) {
            lastSig.current = layoutSig;
            setMoved({});
        }
    }, [layoutSig]);

    const tpl = useMemo(
        () => template({ paper, w, h, arrange, position: o.position, perPage: o.perPage, gap: o.gap, margin: o.margin }),
        [paper, w, h, arrange, o.position, o.perPage, o.gap, o.margin],
    );
    const slots = tpl.slots.map((s) => ({ ...s, ...(moved[s.key] ?? {}) }));
    const perPage = tpl.sets;

    // Pages for printing.
    const pages = useMemo(() => {
        if (!front) return [];
        const itemFor = (side) => (side === "back" ? back : front);
        const out = [];
        let left = copies;
        while (left > 0) {
            const k = Math.min(perPage, left);
            left -= k;
            if (arrange === "duplex") {
                const fp = [];
                const bp = [];
                for (const s of slots.filter((s) => s.set < k)) {
                    fp.push({ item: front, x: s.x, y: s.y, w: s.w, h: s.h });
                    // Mirror left↔right so the back lands behind the front when printed on both sides (flip on long edge).
                    bp.push({ item: back, x: paper.w - s.x - s.w, y: s.y, w: s.w, h: s.h });
                }
                out.push(fp, bp);
            } else {
                out.push(slots.filter((s) => s.set < k).map((s) => ({ item: itemFor(s.side), x: s.x, y: s.y, w: s.w, h: s.h })));
            }
        }
        return out;
    }, [front, back, copies, perPage, slots, arrange, paper.w]);
    const count = pages.reduce((n, p) => n + p.length, 0);

    const outside = slots.some((s) => s.x < -0.5 || s.y < -0.5 || s.x + s.w > paper.w + 0.5 || s.y + s.h > paper.h + 0.5);
    const paperOptions = paperSizes.filter((p) => papers.includes(p.id));
    const availW = paper.w - 2 * o.margin;
    const fitWidth = Math.floor((arrange === "side" ? (availW - o.gap) / (2 * cardW) : availW / cardW) * 100);
    const halfH = paper.h / 2 - o.margin;
    const fitHalf = Math.min(fitWidth, Math.floor((arrange === "stack" ? (halfH - o.gap) / (2 * cardH) : halfH / cardH) * 100));

    return (
        <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Paper" htmlFor="card-paper">
                    <Select id="card-paper" value={o.paperId} onChange={(e) => set({ paperId: e.target.value })}>
                        {paperOptions.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.label} — {p.detail}
                            </option>
                        ))}
                    </Select>
                </Field>
                <Field label="Direction">
                    <Segmented
                        options={[
                            { value: "portrait", label: "Portrait" },
                            { value: "landscape", label: "Landscape" },
                        ]}
                        value={o.landscape ? "landscape" : "portrait"}
                        onChange={(v) => set({ landscape: v === "landscape" })}
                    />
                </Field>
                {hasBack ? (
                    <Field label="Front and back" className="sm:col-span-2">
                        <Segmented
                            size="sm"
                            options={[
                                { value: "stack", label: "One above other" },
                                { value: "side", label: "Side by side" },
                                { value: "duplex", label: "Back on next page (two-sided)" },
                            ]}
                            value={o.arrange}
                            onChange={(arrange) => set({ arrange })}
                        />
                    </Field>
                ) : null}
                <Field label="Place on the page" className="sm:col-span-2">
                    <Segmented
                        size="sm"
                        options={[
                            { value: "middle", label: "Middle of page" },
                            { value: "top", label: "Top centre" },
                            { value: "top-left", label: "Top left" },
                        ]}
                        value={o.position}
                        onChange={(position) => set({ position })}
                    />
                </Field>
            </div>

            <div className="space-y-2">
                <Slider
                    label="Card size"
                    value={o.scale}
                    min={40}
                    max={260}
                    defaultValue={100}
                    unit="%"
                    onChange={(v) => set({ scale: v })}
                />
                <div className="flex flex-wrap gap-1.5">
                    {[
                        [100, "Real size"],
                        [125, "125%"],
                        [150, "150%"],
                        [200, "200%"],
                        [fitHalf, "Fill half page"],
                        [fitWidth, "Fill page width"],
                    ].map(([v, label]) => (
                        <button
                            key={label}
                            type="button"
                            onClick={() => set({ scale: Math.max(40, Math.min(260, v)) })}
                            className={cn(
                                "h-7 rounded-full border px-2.5 text-xs font-medium",
                                o.scale === v ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line-strong text-ink-700 hover:bg-ink-50",
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted">
                    {w.toFixed(1)} × {h.toFixed(1)} mm per side.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Sets on each page">
                    <Stepper
                        value={Math.min(o.perPage, tpl.maxSets)}
                        onChange={(perPage) => {
                            set({ perPage });
                            if (copies < perPage) setCopies(perPage); // more sets on the page = print that many
                        }}
                        min={1}
                        max={Math.max(1, tpl.maxSets)}
                        label="sets on each page"
                    />
                </Field>
                <Field label="Copies (sets)">
                    <Stepper value={copies} onChange={setCopies} min={1} max={60} label="copies" />
                </Field>
                <Field label="Gap (mm)">
                    <Stepper value={o.gap} onChange={(gap) => set({ gap })} min={0} max={40} label="gap" />
                </Field>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Checkbox label="Cutting lines" checked={o.cutLines} onChange={(e) => set({ cutLines: e.target.checked })} />
                {tpl.maxSets > 1 && perPage < tpl.maxSets ? (
                    <button
                        type="button"
                        onClick={() => {
                            set({ perPage: tpl.maxSets });
                            setCopies(Math.max(copies, tpl.maxSets));
                        }}
                        className="h-8 rounded-lg bg-brand-50 px-3 text-[13px] font-medium text-brand-700 hover:bg-brand-100"
                    >
                        Fill the page ({tpl.maxSets} sets fit)
                    </button>
                ) : null}
            </div>

            {front ? (
                <PagePreview
                    paper={paper}
                    slots={slots.filter((x) => x.set < Math.min(copies, perPage))}
                    cards={{ front, back }}
                    arrange={arrange}
                    cutLines={o.cutLines}
                    selected={selected}
                    onSelect={setSelected}
                    onMove={(key, pos) => setMoved((m) => ({ ...m, [key]: pos }))}
                    onScale={(v) => set({ scale: Math.round(Math.max(40, Math.min(260, v))) })}
                    cardW={cardW}
                />
            ) : (
                <div
                    className="flex w-full items-center justify-center rounded-md border border-dashed border-line-strong bg-white px-6 text-center text-sm text-subtle"
                    style={{ aspectRatio: `${paper.w} / ${paper.h}` }}
                >
                    Add the front of the card to see the page.
                </div>
            )}

            {front ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setMoved({})} disabled={!Object.keys(moved).length}>
                        <AlignCenter className="h-4 w-4" /> Put back in place
                    </Button>
                    {selected ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                const s = slots.find((x) => x.key === selected);
                                if (s) setMoved((m) => ({ ...m, [s.key]: { x: (paper.w - s.w) / 2, y: s.y } }));
                            }}
                        >
                            Centre this card left–right
                        </Button>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Move className="h-3.5 w-3.5" /> Drag a card to move it · drag its corner to resize · arrow keys nudge
                    </span>
                </div>
            ) : null}
            {outside ? (
                <p role="alert" className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">
                    A card is partly off the page. Make the cards smaller, use fewer sets on a page, or turn the paper.
                </p>
            ) : null}

            <SheetOutput
                pages={pages}
                paper={paper}
                paperLabel={base.label}
                cutLines={o.cutLines}
                fileName={fileName}
                count={count}
                unit="card side"
                emptyText="Add the front of the card to see the page."
                hidePreview
            />
        </div>
    );
}

const DEFAULTS = {
    paperId: "a4",
    landscape: false,
    scale: 100,
    arrange: "stack",
    position: "middle",
    perPage: 1,
    gap: 6,
    margin: 8,
    cutLines: true,
};
const validOpts = (s) =>
    s &&
    typeof s.paperId === "string" &&
    Number.isFinite(s.scale) &&
    ["stack", "side", "duplex"].includes(s.arrange ?? "stack") &&
    ["middle", "top", "top-left"].includes(s.position ?? "middle");

/**
 * Automatic places for `perPage` sets (front + back) on the page.
 * @returns {{ slots: { key: string, set: number, side: "front" | "back", x: number, y: number, w: number, h: number }[],
 *   sets: number, maxSets: number }}
 */
function template({ paper, w, h, arrange, position, perPage, gap, margin }) {
    const two = arrange === "stack" || arrange === "side";
    const setW = arrange === "side" ? 2 * w + gap : w;
    const setH = arrange === "stack" ? 2 * h + gap : h;
    const between = Math.max(gap, 8); // space between sets (room to cut)
    const availW = paper.w - 2 * margin;
    const availH = paper.h - 2 * margin;
    const cols = Math.max(1, Math.floor((availW + between) / (setW + between)));
    const rowsMax = Math.max(1, Math.floor((availH + between) / (setH + between)));
    const maxSets = cols * rowsMax;
    const sets = Math.max(1, Math.min(perPage, maxSets));
    const usedCols = Math.min(cols, sets);
    const rows = Math.ceil(sets / usedCols);
    const blockW = usedCols * setW + (usedCols - 1) * between;
    const blockH = rows * setH + (rows - 1) * between;

    const slots = [];
    for (let k = 0; k < sets; k++) {
        const r = Math.floor(k / usedCols);
        const c = k % usedCols;
        let x0;
        let y0;
        if (position === "top-left") {
            x0 = margin + c * (setW + between);
            y0 = margin + r * (setH + between);
        } else if (position === "top") {
            x0 = (paper.w - blockW) / 2 + c * (setW + between);
            y0 = margin + r * (setH + between);
        } else {
            // Middle: each row of sets sits in the middle of its own band of the page (easy to cut apart).
            x0 = (paper.w - blockW) / 2 + c * (setW + between);
            const band = rows > 1 ? availH / rows : paper.h;
            y0 = rows > 1 ? margin + band * r + (band - setH) / 2 : (paper.h - blockH) / 2;
        }
        slots.push({ key: `${k}-front`, set: k, side: "front", x: x0, y: y0, w, h });
        if (two) {
            if (arrange === "stack") slots.push({ key: `${k}-back`, set: k, side: "back", x: x0, y: y0 + h + gap, w, h });
            else slots.push({ key: `${k}-back`, set: k, side: "back", x: x0 + w + gap, y: y0, w, h });
        }
    }
    return { slots, sets, maxSets };
}

const SNAP = 2; // mm

/** Page 1 drawn live, with draggable / resizable cards on top. */
function PagePreview({ paper, slots, cards, arrange, cutLines, selected, onSelect, onMove, onScale, cardW }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const [boxW, setBoxW] = useState(320);
    const [guides, setGuides] = useState({ v: false, h: false });
    const cache = useRef({ px: 0, map: new Map() });
    const drag = useRef(null);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setBoxW(Math.max(200, Math.floor(e.contentRect.width))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const k = boxW / paper.w; // CSS px per mm
    const boxH = paper.h * k;

    useEffect(() => {
        const c = canvasRef.current;
        if (!c) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const px = Math.min(8, k * dpr);
        if (cache.current.px !== px) cache.current = { px, map: new Map() };
        const placements = slots.map((s) => ({
            item: s.side === "back" && arrange !== "duplex" ? cards.back : cards.front,
            x: s.x,
            y: s.y,
            w: s.w,
            h: s.h,
        }));
        const page = renderPage(placements, paper, px, { cutLines, cache: cache.current.map });
        c.width = page.width;
        c.height = page.height;
        c.getContext("2d").drawImage(page, 0, 0);
    }, [slots, cards, paper, k, cutLines, arrange]);

    const toMm = (ev) => {
        const r = wrapRef.current.getBoundingClientRect();
        return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k };
    };

    const startMove = (s) => (ev) => {
        ev.preventDefault();
        ev.currentTarget.setPointerCapture(ev.pointerId);
        onSelect(s.key);
        const p = toMm(ev);
        drag.current = { kind: "move", key: s.key, dx: p.x - s.x, dy: p.y - s.y, w: s.w, h: s.h };
    };
    const startResize = (s) => (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.currentTarget.setPointerCapture(ev.pointerId);
        onSelect(s.key);
        drag.current = { kind: "resize", key: s.key, x: s.x, y: s.y };
    };
    const onPointerMove = (ev) => {
        const d = drag.current;
        if (!d) return;
        const p = toMm(ev);
        if (d.kind === "move") {
            let x = p.x - d.dx;
            let y = p.y - d.dy;
            // Snap the card's centre to the middle of the page.
            const snapV = Math.abs(x + d.w / 2 - paper.w / 2) < SNAP;
            const snapH = Math.abs(y + d.h / 2 - paper.h / 2) < SNAP;
            if (snapV) x = paper.w / 2 - d.w / 2;
            if (snapH) y = paper.h / 2 - d.h / 2;
            setGuides({ v: snapV, h: snapH });
            onMove(d.key, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
        } else {
            const newW = Math.max(10, p.x - d.x);
            onScale((newW / cardW) * 100);
        }
    };
    const onPointerUp = () => {
        drag.current = null;
        setGuides({ v: false, h: false });
    };
    const onKeyDown = (s) => (ev) => {
        const step = ev.shiftKey ? 5 : 1;
        const m = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
        if (!m) return;
        ev.preventDefault();
        onMove(s.key, { x: s.x + m[0], y: s.y + m[1] });
    };

    return (
        <div
            ref={wrapRef}
            className="relative w-full touch-none select-none"
            style={{ height: boxH }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={(ev) => {
                if (ev.target === wrapRef.current || ev.target === canvasRef.current) onSelect(null);
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ width: boxW, height: boxH }}
                className="absolute inset-0 rounded-sm bg-white shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-lift)]"
                aria-label="Page preview"
            />
            {guides.v ? (
                <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-brand-500" style={{ left: boxW / 2 }} />
            ) : null}
            {guides.h ? (
                <div className="pointer-events-none absolute right-0 left-0 h-px bg-brand-500" style={{ top: boxH / 2 }} />
            ) : null}
            {slots.map((s) => {
                const active = selected === s.key;
                const label = arrange === "duplex" ? "Front" : s.side === "back" ? "Back" : "Front";
                return (
                    <div
                        key={s.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`${label} — drag to move`}
                        onPointerDown={startMove(s)}
                        onKeyDown={onKeyDown(s)}
                        onFocus={() => onSelect(s.key)}
                        className={cn(
                            "absolute cursor-move rounded-[3px] outline-none",
                            active ? "ring-2 ring-brand-500" : "hover:ring-2 hover:ring-brand-300",
                        )}
                        style={{ left: s.x * k, top: s.y * k, width: s.w * k, height: s.h * k }}
                    >
                        {active ? (
                            <>
                                <span className="pointer-events-none absolute -top-6 left-0 rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white">
                                    {label} · {s.x.toFixed(0)}, {s.y.toFixed(0)} mm
                                </span>
                                <span
                                    role="presentation"
                                    onPointerDown={startResize(s)}
                                    className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-brand-500 bg-white"
                                    title="Drag to resize"
                                />
                            </>
                        ) : null}
                    </div>
                );
            })}
            {arrange === "duplex" ? (
                <p className="absolute right-2 bottom-2 rounded bg-white/90 px-2 py-1 text-[11px] text-muted shadow-xs">
                    Page 1 (fronts) · backs print on page 2, mirrored
                </p>
            ) : null}
        </div>
    );
}