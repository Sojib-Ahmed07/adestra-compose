// src/components/photo/adjust-panel.jsx
"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, RotateCcw, Wand2 } from "lucide-react";
import {
    autoColor,
    autoContrast,
    autoTone,
    changedParts,
    CURVE_ID,
    curveTable,
    defaultAdjust,
    fullAdjust,
    LEVELS_ID,
    RANGES,
    TONES,
} from "@/lib/photo/adjust";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Segmented, Slider } from "@/components/ui/interactive";

const channelOptions = [
    { value: "rgb", label: "RGB" },
    { value: "r", label: "Red" },
    { value: "g", label: "Green" },
    { value: "b", label: "Blue" },
];
const channelColour = { rgb: "#151a30", r: "#dc2626", g: "#16a34a", b: "#2563eb" };
const rangeLabels = {
    master: "Master",
    reds: "Reds",
    yellows: "Yellows",
    greens: "Greens",
    cyans: "Cyans",
    blues: "Blues",
    magentas: "Magentas",
};

/** Photoshop-style curve presets. */
const curvePresets = [
    {
        label: "Lighter",
        pts: [
            [0, 0],
            [113, 141],
            [255, 255],
        ],
    },
    {
        label: "Darker",
        pts: [
            [0, 0],
            [141, 113],
            [255, 255],
        ],
    },
    {
        label: "Medium contrast",
        pts: [
            [0, 0],
            [64, 58],
            [192, 198],
            [255, 255],
        ],
    },
    {
        label: "Strong contrast",
        pts: [
            [0, 0],
            [64, 48],
            [192, 210],
            [255, 255],
        ],
    },
];

/**
 * Exposure · Levels · Curves · Color Balance · Hue/Saturation, plus Auto Tone / Auto Contrast / Auto Color.
 * @param {{ value: object | null, onChange: (adj: object, now?: boolean) => void,
 *   base: { hist: object, px: Uint8ClampedArray } | null }} props
 *   base: histogram + pixels of the photo before these adjustments (for the histograms and Auto buttons).
 */
export function AdjustPanel({ value, onChange, base }) {
    const adj = fullAdjust(value);
    const changed = changedParts(value);
    const [open, setOpen] = useState("levels");
    const set = (part, v, now = false) => onChange({ ...adj, [part]: v }, now);
    const reset = (part) => set(part, defaultAdjust[part], true);
    const applyAuto = (patch) => onChange({ ...adj, ...patch, levels: { ...defaultAdjust.levels, ...patch.levels } }, true);

    const section = (id, title, body) => (
        <div className="rounded-lg border border-line">
            <button
                type="button"
                onClick={() => setOpen(open === id ? null : id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-ink-900"
                aria-expanded={open === id}
            >
                <span className="flex items-center gap-2">
                    {title}
                    {changed[id] ? <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-label="changed" /> : null}
                </span>
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open === id && "rotate-180")} />
            </button>
            {open === id ? (
                <div className="space-y-3 border-t border-line px-3 py-3">
                    {body}
                    {changed[id] ? (
                        <button
                            type="button"
                            onClick={() => reset(id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset {title}
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!base} onClick={() => applyAuto(autoTone(base.hist))}>
                    <Wand2 className="h-4 w-4" /> Auto Tone
                </Button>
                <Button size="sm" variant="outline" disabled={!base} onClick={() => applyAuto(autoContrast(base.hist))}>
                    Auto Contrast
                </Button>
                <Button size="sm" variant="outline" disabled={!base} onClick={() => applyAuto(autoColor(base.px))}>
                    Auto Color
                </Button>
                {Object.values(changed).some(Boolean) ? (
                    <Button size="sm" variant="ghost" onClick={() => onChange(null, true)}>
                        Reset all
                    </Button>
                ) : null}
            </div>

            {section(
                "exposure",
                "Exposure",
                <>
                    <Slider
                        label="Exposure"
                        value={adj.exposure.exposure}
                        min={-3}
                        max={3}
                        step={0.05}
                        digits={2}
                        defaultValue={0}
                        onChange={(v) => set("exposure", { ...adj.exposure, exposure: v })}
                    />
                    <Slider
                        label="Offset"
                        value={adj.exposure.offset}
                        min={-0.25}
                        max={0.25}
                        step={0.005}
                        digits={3}
                        defaultValue={0}
                        onChange={(v) => set("exposure", { ...adj.exposure, offset: v })}
                    />
                    <Slider
                        label="Gamma correction"
                        value={adj.exposure.gamma}
                        min={0.3}
                        max={3}
                        step={0.01}
                        digits={2}
                        defaultValue={1}
                        onChange={(v) => set("exposure", { ...adj.exposure, gamma: v })}
                    />
                </>,
            )}

            {section(
                "levels",
                "Levels",
                <LevelsEditor levels={adj.levels} hist={base?.hist} onChange={(v, now) => set("levels", v, now)} />,
            )}

            {section(
                "curves",
                "Curves",
                <CurvesEditor curves={adj.curves} hist={base?.hist} onChange={(v, now) => set("curves", v, now)} />,
            )}

            {section("balance", "Color Balance", <BalanceEditor balance={adj.balance} onChange={(v, now) => set("balance", v, now)} />)}

            {section("hsl", "Hue/Saturation", <HueSatEditor hsl={adj.hsl} onChange={(v, now) => set("hsl", v, now)} />)}

            <p className="text-xs text-muted">
                Works like the same adjustments in Photoshop, in this order: Exposure → Levels → Curves → Color Balance → Hue/Saturation.{" "}
                <strong>Ctrl+Z</strong> undoes, <strong>Ctrl+Shift+Z</strong> redoes.
            </p>
        </div>
    );
}

// ——— histogram ———

/** SVG path of a histogram, 0…255 wide and `height` tall (square-root scale, like a soft Photoshop histogram). */
function histPath(hist, channel, height) {
    const data = channel === "rgb" ? hist.l : hist[channel];
    let max = 1;
    for (let v = 2; v < 254; v++) max = Math.max(max, data[v]);
    let d = `M0 ${height}`;
    for (let v = 0; v < 256; v++) d += ` L${v} ${height - Math.min(1, Math.sqrt(data[v] / max)) * (height - 2)}`;
    return d + ` L255 ${height} Z`;
}

function Histogram({ hist, channel, height = 90 }) {
    if (!hist?.n) return <div className="rounded bg-ink-50" style={{ height }} />;
    const d = histPath(hist, channel, height);
    return (
        <svg viewBox={`0 0 255 ${height}`} preserveAspectRatio="none" className="block w-full rounded bg-ink-50" style={{ height }}>
            <path d={d} fill={channelColour[channel]} fillOpacity="0.35" />
        </svg>
    );
}

// ——— Levels ———

function LevelsEditor({ levels, hist, onChange }) {
    const [ch, setCh] = useState("rgb");
    const [inB, gamma, inW, outB, outW] = levels[ch] ?? LEVELS_ID;
    const put = (arr, now) => onChange({ ...levels, [ch]: arr }, now);
    const midPos = inB + (inW - inB) * Math.pow(0.5, gamma);
    const setMid = (x) => {
        const t = Math.min(0.99, Math.max(0.01, (x - inB) / Math.max(1, inW - inB)));
        put([inB, Math.round(Math.min(9.99, Math.max(0.1, Math.log(t) / Math.log(0.5))) * 100) / 100, inW, outB, outW]);
    };
    return (
        <div className="space-y-3">
            <Segmented size="sm" options={channelOptions} value={ch} onChange={setCh} />
            <div>
                <Histogram hist={hist} channel={ch} />
                <HandleTrack
                    handles={[
                        { v: inB, fill: "#000", set: (x) => put([Math.min(Math.round(x), inW - 2), gamma, inW, outB, outW]) },
                        { v: midPos, fill: "#8a91aa", set: setMid },
                        { v: inW, fill: "#fff", set: (x) => put([inB, gamma, Math.max(Math.round(x), inB + 2), outB, outW]) },
                    ]}
                />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <NumBox label="Black" value={inB} min={0} max={inW - 2} onChange={(v) => put([v, gamma, inW, outB, outW], true)} />
                <NumBox
                    label="Gamma"
                    value={gamma}
                    min={0.1}
                    max={9.99}
                    step={0.01}
                    onChange={(v) => put([inB, v, inW, outB, outW], true)}
                />
                <NumBox label="White" value={inW} min={inB + 2} max={255} onChange={(v) => put([inB, gamma, v, outB, outW], true)} />
            </div>
            <div>
                <p className="mb-1 text-xs font-medium text-ink-700">Output levels</p>
                <div className="h-3 rounded bg-gradient-to-r from-black to-white" />
                <HandleTrack
                    handles={[
                        { v: outB, fill: "#000", set: (x) => put([inB, gamma, inW, Math.min(Math.round(x), outW - 1), outW]) },
                        { v: outW, fill: "#fff", set: (x) => put([inB, gamma, inW, outB, Math.max(Math.round(x), outB + 1)]) },
                    ]}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <NumBox
                        label="Output black"
                        value={outB}
                        min={0}
                        max={outW - 1}
                        onChange={(v) => put([inB, gamma, inW, v, outW], true)}
                    />
                    <NumBox
                        label="Output white"
                        value={outW}
                        min={outB + 1}
                        max={255}
                        onChange={(v) => put([inB, gamma, inW, outB, v], true)}
                    />
                </div>
            </div>
        </div>
    );
}

/** Row of triangle handles under a 0…255 strip. */
function HandleTrack({ handles }) {
    const ref = useRef(null);
    const drag = useRef(null);
    const toV = (ev) => {
        const r = ref.current.getBoundingClientRect();
        return Math.min(255, Math.max(0, ((ev.clientX - r.left) / r.width) * 255));
    };
    return (
        <div
            ref={ref}
            className="relative h-4 touch-none select-none"
            onPointerMove={(ev) => drag.current != null && handles[drag.current].set(toV(ev))}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
        >
            {handles.map((h, i) => (
                <span
                    key={i}
                    role="slider"
                    aria-valuenow={Math.round(h.v)}
                    aria-valuemin={0}
                    aria-valuemax={255}
                    tabIndex={0}
                    onPointerDown={(ev) => {
                        ev.preventDefault();
                        ref.current.setPointerCapture(ev.pointerId);
                        drag.current = i;
                    }}
                    onKeyDown={(ev) => {
                        const d = ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowRight" ? 1 : 0;
                        if (d) {
                            ev.preventDefault();
                            h.set(h.v + d * (ev.shiftKey ? 10 : 1));
                        }
                    }}
                    className="absolute top-0 -ml-[6px] cursor-ew-resize outline-none focus-visible:drop-shadow-[0_0_2px_#3b5cf0]"
                    style={{ left: `${(h.v / 255) * 100}%` }}
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <path d="M6 1 L11 11 L1 11 Z" fill={h.fill} stroke="#151a30" strokeWidth="1" />
                    </svg>
                </span>
            ))}
        </div>
    );
}

function NumBox({ label, value, min, max, step = 1, onChange }) {
    return (
        <label className="block text-[11px] text-muted">
            {label}
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
                }}
                className="mt-0.5 h-8 w-full rounded-md border border-line-strong px-2 text-sm text-ink-900 tabular"
            />
        </label>
    );
}

// ——— Curves ———

function CurvesEditor({ curves, hist, onChange }) {
    const [ch, setCh] = useState("rgb");
    const [sel, setSel] = useState(null);
    const ref = useRef(null);
    const drag = useRef(null);
    const pts = curves[ch] ?? CURVE_ID;
    const put = (next, now) => onChange({ ...curves, [ch]: next }, now);

    const toXY = (ev) => {
        const r = ref.current.getBoundingClientRect();
        return {
            x: Math.min(255, Math.max(0, ((ev.clientX - r.left) / r.width) * 255)),
            y: Math.min(255, Math.max(0, 255 - ((ev.clientY - r.top) / r.height) * 255)),
            outside: ev.clientX < r.left - 20 || ev.clientX > r.right + 20 || ev.clientY < r.top - 20 || ev.clientY > r.bottom + 20,
        };
    };
    const onDown = (ev) => {
        ev.preventDefault();
        ref.current.setPointerCapture(ev.pointerId);
        const { x, y } = toXY(ev);
        let i = pts.findIndex((p) => Math.hypot(p[0] - x, p[1] - y) < 12);
        let next = pts;
        if (i < 0) {
            next = [...pts, [Math.round(x), Math.round(y)]].sort((a, b) => a[0] - b[0]);
            i = next.findIndex((p) => p[0] === Math.round(x) && p[1] === Math.round(y));
            put(next);
        }
        drag.current = { i, pts: next };
        setSel(i);
    };
    const onMove = (ev) => {
        const d = drag.current;
        if (!d) return;
        const { x, y, outside } = toXY(ev);
        const list = d.pts.map((p) => [...p]);
        const i = d.i;
        if (outside && i > 0 && i < list.length - 1) {
            // Drag a point off the graph to remove it (as in Photoshop).
            put(list.filter((_, k) => k !== i));
            drag.current = null;
            setSel(null);
            return;
        }
        const lo = i > 0 ? list[i - 1][0] + 2 : 0;
        const hi = i < list.length - 1 ? list[i + 1][0] - 2 : 255;
        list[i] = [Math.round(Math.min(hi, Math.max(lo, x))), Math.round(y)];
        drag.current = { i, pts: list };
        put(list);
    };
    const onUp = () => {
        if (drag.current) put(drag.current.pts, true);
        drag.current = null;
    };

    // Curve line for display.
    const ptsKey = JSON.stringify(pts);
    const table = useMemo(() => curveTable(JSON.parse(ptsKey)), [ptsKey]);
    let path = "";
    for (let x = 0; x < 256; x += 2) path += `${x ? "L" : "M"}${x} ${255 - table[x]} `;
    path += `L255 ${255 - table[255]}`;
    const cur = sel != null && pts[sel] ? pts[sel] : null;

    return (
        <div className="space-y-3">
            <Segmented
                size="sm"
                options={channelOptions}
                value={ch}
                onChange={(v) => {
                    setCh(v);
                    setSel(null);
                }}
            />
            <div>
                <svg
                    ref={ref}
                    viewBox="-4 -4 263 263"
                    className="relative block aspect-square w-full touch-none select-none"
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onDoubleClick={() => {
                        if (sel != null && sel > 0 && sel < pts.length - 1) {
                            put(
                                pts.filter((_, k) => k !== sel),
                                true,
                            );
                            setSel(null);
                        }
                    }}
                    role="img"
                    aria-label="Curve — click to add a point, drag to change, drag off or double-click to remove"
                >
                    <rect x="0" y="0" width="255" height="255" fill="#f5f6f9" stroke="#cdd2de" />
                    {hist?.n ? <path d={histPath(hist, ch, 255)} fill={channelColour[ch]} fillOpacity="0.18" /> : null}
                    {[64, 128, 192].map((g) => (
                        <g key={g} stroke="#e3e6ee">
                            <line x1={g} y1="0" x2={g} y2="255" />
                            <line x1="0" y1={g} x2="255" y2={g} />
                        </g>
                    ))}
                    <line x1="0" y1="255" x2="255" y2="0" stroke="#cdd2de" strokeDasharray="3 3" />
                    <path d={path} fill="none" stroke={channelColour[ch]} strokeWidth="2" />
                    {pts.map((p, i) => (
                        <rect
                            key={i}
                            x={p[0] - 4}
                            y={255 - p[1] - 4}
                            width="8"
                            height="8"
                            fill={sel === i ? channelColour[ch] : "#fff"}
                            stroke={channelColour[ch]}
                            strokeWidth="1.5"
                        />
                    ))}
                </svg>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                {cur ? (
                    <span className="tabular">
                        Input <strong className="text-ink-900">{cur[0]}</strong> · Output <strong className="text-ink-900">{cur[1]}</strong>
                    </span>
                ) : (
                    <span>Click the line to add a point. Drag a point off the box to remove it.</span>
                )}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {curvePresets.map((pr) => (
                    <button
                        key={pr.label}
                        type="button"
                        onClick={() =>
                            put(
                                pr.pts.map((p) => [...p]),
                                true,
                            )
                        }
                        className="h-7 rounded-full border border-line-strong px-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                        {pr.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ——— Color Balance ———

function BalanceEditor({ balance, onChange }) {
    const [tone, setTone] = useState("midtones");
    const v = balance[tone];
    const put = (k, x) => onChange({ ...balance, [tone]: v.map((y, i) => (i === k ? x : y)) });
    return (
        <div className="space-y-3">
            <Segmented
                size="sm"
                options={TONES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
                value={tone}
                onChange={setTone}
            />
            <Slider label="Cyan ⟷ Red" value={v[0]} min={-100} max={100} defaultValue={0} onChange={(x) => put(0, x)} />
            <Slider label="Magenta ⟷ Green" value={v[1]} min={-100} max={100} defaultValue={0} onChange={(x) => put(1, x)} />
            <Slider label="Yellow ⟷ Blue" value={v[2]} min={-100} max={100} defaultValue={0} onChange={(x) => put(2, x)} />
            <Checkbox
                label="Preserve luminosity"
                checked={balance.preserve}
                onChange={(e) => onChange({ ...balance, preserve: e.target.checked }, true)}
            />
            <p className="text-xs text-muted">
                Skin too yellow? Midtones → move <strong>Yellow ⟷ Blue</strong> a little towards Blue.
            </p>
        </div>
    );
}

// ——— Hue/Saturation ———

function HueSatEditor({ hsl, onChange }) {
    const [range, setRange] = useState("master");
    const v = hsl[range];
    const put = (k, x) => onChange({ ...hsl, [range]: v.map((y, i) => (i === k ? x : y)) });
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {RANGES.map((r) => (
                    <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        className={cn(
                            "h-7 rounded-full border px-2.5 text-xs font-medium",
                            range === r ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line-strong text-ink-700 hover:bg-ink-50",
                            hsl[r].some((x) => x !== 0) && range !== r && "font-semibold",
                        )}
                    >
                        {rangeLabels[r]}
                    </button>
                ))}
            </div>
            <Slider label="Hue" value={v[0]} min={-180} max={180} defaultValue={0} onChange={(x) => put(0, x)} />
            <Slider label="Saturation" value={v[1]} min={-100} max={100} defaultValue={0} onChange={(x) => put(1, x)} />
            <Slider label="Lightness" value={v[2]} min={-100} max={100} defaultValue={0} onChange={(x) => put(2, x)} />
            <p className="text-xs text-muted">
                Skin too yellow? Choose <strong>Yellows</strong> and lower Saturation. Too red? <strong>Reds</strong> → lower Saturation.
            </p>
        </div>
    );
}