// src/components/deeds/nid-reader.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Maximize2, RotateCw, ScanLine, X, ZoomIn, ZoomOut } from "lucide-react";
import { getNidMode, nidCloudReady, setNidMode } from "@/lib/deeds/nid-mode";
import { cn } from "@/lib/utils";
import { BnInput } from "@/components/deeds/bn-input";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Modal, Segmented, useToast } from "@/components/ui/interactive";

// the same keys as nidPersonKeys in lib/deeds/nid-parse.js (kept here so the reader and its places list load only
// when the box is used)
const LABELS = {
    name: "নাম",
    father: "পিতা",
    mother: "মাতা",
    husband: "স্বামী",
    house: "বাসা/হোল্ডিং",
    village: "গ্রাম/রাস্তা",
    post: "ডাকঘর",
    upazila: "থানা/উপজেলা",
    district: "জেলা",
    nid: "জাতীয় পরিচয় পত্র নং",
};
const nidPersonKeys = Object.keys(LABELS);
const WIDE = new Set(["name", "village"]);

/** Same text? (spaces, invisible joiners and the two ways of writing য় / ড় don't count) */
const same = (a, b) => {
    const n = (v) =>
        String(v || "")
            .normalize("NFC")
            .replace(/\u09AF\u09BC/g, "\u09DF")
            .replace(/\u09A1\u09BC/g, "\u09DC")
            .replace(/[\s\u200C\u200D.,:]/g, "");
    return n(a) === n(b);
};

/**
 * "NID থেকে পূরণ": photos of the NID (front, back, or a photocopy page with both) → the person's details. Two readers:
 * Best = Cloudflare Workers AI (the card pictures go to the shop's own Worker, nothing is kept) — then the offline
 * reader reads the same card in the background and each box shows whether both readers agree; Offline = read in this
 * browser only. The staff checks / corrects every box, then fills the person.
 * @param {{ role: string, onFill: (patch: object) => void }} props
 */
export function NidReaderButton({ role, onFill }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-8 text-xs">
                <ScanLine className="h-4 w-4" /> NID থেকে পূরণ
            </Button>
            {open ? <NidReader role={role} onClose={() => setOpen(false)} onFill={onFill} /> : null}
        </>
    );
}

function NidReader({ role, onClose, onFill }) {
    const toast = useToast();
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(null); // { label, done }
    const [result, setResult] = useState(null); // { fields, texts }
    const [values, setValues] = useState({});
    const [use, setUse] = useState({});
    const [mode, setMode] = useState("offline");
    const [cloudOk, setCloudOk] = useState(false);
    const [check, setCheck] = useState(null); // offline double-check of a cloud reading: { label } while running, { fields } when done
    const alive = useRef(true);

    useEffect(() => {
        setMode(getNidMode());
        nidCloudReady().then((ok) => alive.current && setCloudOk(ok));
    }, []);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            import("@/lib/deeds/nid").then((m) => m.stopNidReader());
        };
    }, []);

    const add = (list) => setFiles((f) => [...f, ...list].slice(0, 3));

    const show = (r) => {
        if (globalThis.__nidDebug) globalThis.__nidLast = r; // for testing from the browser console
        setResult(r);
        const v = {};
        const u = {};
        for (const k of nidPersonKeys) {
            v[k] = r.fields[k] || "";
            u[k] = Boolean(r.fields[k]);
        }
        setValues(v);
        setUse(u);
    };

    const readOffline = async (mod) => {
        const r = await mod.readNid(files, (label, done) => alive.current && setBusy({ label, done }));
        if (!alive.current) return;
        show(r);
        if (!r.found.some((k) => nidPersonKeys.includes(k)))
            toast("Nothing could be read. Take the photo again: flat, in good light, card filling most of the photo.", "error");
    };

    const read = async () => {
        if (!files.length) return;
        setBusy({ label: "Starting the reader", done: 0 });
        setResult(null);
        setCheck(null);
        try {
            const mod = await import("@/lib/deeds/nid");
            if (mode === "best" && cloudOk) {
                let r = null;
                try {
                    r = await mod.readNidCloud(files, (label, done) => alive.current && setBusy({ label, done }));
                } catch (err) {
                    const why = (err?.name === "TimeoutError" ? "it took too long" : err?.message || "unknown error").replace(/\.+$/, "");
                    toast(`Cloudflare AI didn't work — ${why}. Reading offline instead.`, "error");
                }
                if (!alive.current) return;
                if (r) {
                    show(r);
                    setBusy(null);
                    // the offline reader reads the same card in the background: each box then shows whether both agree
                    setCheck({ label: "Starting" });
                    mod
                        .readNid(files, (label) => alive.current && setCheck((c) => (c?.fields ? c : { label })))
                        .then((o) => alive.current && setCheck({ fields: o.fields }))
                        .catch(() => alive.current && setCheck({ failed: true }));
                    return;
                }
            }
            await readOffline(mod);
        } catch (err) {
            toast(`Could not read the card: ${err.message}`, "error");
        } finally {
            if (alive.current) setBusy(null);
        }
    };

    const fill = () => {
        const patch = {};
        for (const k of nidPersonKeys) if (use[k] && values[k]?.trim()) patch[k] = values[k].trim();
        if (!Object.keys(patch).length) {
            toast("Nothing ticked to fill.", "error");
            return;
        }
        onFill(patch);
        toast(`${role}: ${Object.keys(patch).length} boxes filled from the NID`);
        onClose();
    };

    const f = result?.fields || {};
    return (
        <Modal
            open
            onClose={onClose}
            title={`NID থেকে পূরণ — ${role}`}
            className={result ? "max-w-[1500px]!" : "max-w-3xl"}
            footer={
                result ? (
                    <>
                        <Button variant="ghost" onClick={() => setResult(null)}>
                            Read other photos
                        </Button>
                        <Button variant="accent" onClick={fill}>
                            <CheckCircle2 className="h-4 w-4" /> Fill these into {role}
                        </Button>
                    </>
                ) : (
                    <Button variant="accent" onClick={read} disabled={!files.length || !!busy}>
                        <ScanLine className="h-4 w-4" /> Read the card
                    </Button>
                )
            }
        >
            {!result ? (
                <div className="space-y-3">
                    <p className="text-sm text-muted">
                        Add the <strong>front</strong> and the <strong>back</strong> of the NID (two photos), or{" "}
                        <strong>one scan / photocopy / PDF page with both sides</strong>. Smart card or old card, any way up.
                    </p>
                    {cloudOk ? (
                        <div className="space-y-1">
                            <Segmented
                                size="sm"
                                options={[
                                    { value: "best", label: "Best (Cloudflare AI)" },
                                    { value: "offline", label: "Offline" },
                                ]}
                                value={mode}
                                onChange={(m) => {
                                    setNidMode(m);
                                    setMode(m);
                                }}
                            />
                            <p className="text-xs text-subtle">
                                {mode === "best"
                                    ? "Best: the card pictures are sent to the shop's Cloudflare account and read by an AI (nothing is kept there); then this computer double-checks it. Free for about 80–100 cards a day; if it fails, the card is read offline."
                                    : "Offline: read on this computer, nothing is sent anywhere."}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-subtle">The card is read on this computer — nothing is sent anywhere or kept.</p>
                    )}
                    {files.length < 3 ? (
                        <FileDrop
                            onFiles={add}
                            multiple
                            accept="image/*,application/pdf"
                            title="Add NID photos, scans or a PDF"
                            hint="Click, drag, or paste (Ctrl+V) — up to 3 photos or PDF files"
                            compact
                        />
                    ) : null}
                    {files.length ? (
                        <ul className="flex flex-wrap gap-2">
                            {files.map((file, i) => (
                                <li key={i} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1 text-xs">
                                    <span className="max-w-48 truncate">{file.name}</span>
                                    <button
                                        type="button"
                                        aria-label={`Remove ${file.name}`}
                                        onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}
                                        className="text-muted hover:text-danger"
                                        disabled={!!busy}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    {busy ? (
                        <div className="space-y-1.5" aria-live="polite">
                            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                                <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.max(5, busy.done * 100)}%` }} />
                            </div>
                            <p className="text-xs text-muted">{busy.label}… The first time takes longer (the Bangla reader is loading).</p>
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                    <CardViewer pictures={result.texts.map((t) => t.preview).filter(Boolean)} />
                    <div className="min-w-0 space-y-4">
                        {result.engine === "cloud" ? (
                            <p className="text-xs text-muted">
                                Read by Cloudflare AI{result.model ? ` (${result.model})` : ""}.{" "}
                                {check?.fields
                                    ? "The offline reader has checked it — see the note under each box."
                                    : check?.failed
                                        ? "The offline double-check didn't work — check the boxes yourself."
                                        : `Double-checking on this computer… (${check?.label || "starting"})`}
                            </p>
                        ) : null}
                        <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">
                            Check every box against the card — the reader can mistake a letter. Untick what you don&apos;t want filled. Empty
                            boxes were not found; type them yourself.
                        </p>
                        {f.nameEn || f.dob || f.blood ? (
                            <p className="text-xs text-muted">
                                Also on the card:{" "}
                                {[
                                    f.nameEn && `Name: ${f.nameEn}`,
                                    f.dob && `Date of birth: ${f.dob.split("-").reverse().join("/")}`,
                                    f.blood && `Blood: ${f.blood}`,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                {f.nidChecked ? " · NID number confirmed by the machine lines" : ""}
                            </p>
                        ) : null}
                        {f.addressLine ? (
                            <p className="font-bangla text-xs text-muted">
                                ঠিকানা (যেমন পড়া গেছে): <span className="text-ink-900">{f.addressLine}</span>
                                <span className="block font-sans">
                                    District, upazila and post code are checked against Bangladesh&apos;s list of places — a part that could not be
                                    checked is left empty rather than guessed.
                                </span>
                            </p>
                        ) : null}
                        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                            {nidPersonKeys.map((k) => (
                                <div key={k} className={cn("flex items-start gap-2", WIDE.has(k) && "sm:col-span-2")}>
                                    <input
                                        type="checkbox"
                                        className="mt-2.5 h-4 w-4 accent-brand-500"
                                        checked={!!use[k]}
                                        onChange={(e) => setUse((u) => ({ ...u, [k]: e.target.checked }))}
                                        aria-label={`Fill ${LABELS[k]}`}
                                    />
                                    <label className="min-w-0 flex-1 space-y-1">
                                        <span className="block font-bangla text-xs text-muted">{LABELS[k]}</span>
                                        <BnInput
                                            value={values[k] ?? ""}
                                            english={k === "nid"}
                                            inputMode={k === "nid" ? "numeric" : undefined}
                                            onChange={(v) => {
                                                setValues((x) => ({ ...x, [k]: v }));
                                                setUse((u) => ({ ...u, [k]: Boolean(v.trim()) }));
                                            }}
                                            className={cn(!values[k] && "border-dashed")}
                                        />
                                        <CheckNote
                                            cloud={result.engine === "cloud" ? result.fields[k] : undefined}
                                            other={check?.fields?.[k]}
                                            done={!!check?.fields}
                                            onUse={(v) => {
                                                setValues((x) => ({ ...x, [k]: v }));
                                                setUse((u) => ({ ...u, [k]: true }));
                                            }}
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/**
 * Under a box filled by the cloud reader: does the offline reader agree? Agree → green tick (both read the same);
 * differ → what the offline reader read, with a button to use it instead. Nothing when there is nothing to compare.
 */
function CheckNote({ cloud, other, done, onUse }) {
    if (cloud === undefined || !done) return null;
    if (cloud && other && same(cloud, other))
        return <span className="block text-[11px] text-success">✓ Both readers read the same</span>;
    if (!other) return cloud ? <span className="block text-[11px] text-subtle">Only the AI read this — check it</span> : null;
    return (
        <span className="flex flex-wrap items-center gap-1 text-[11px] text-warn">
            {cloud ? "Readers differ — offline read:" : "Offline read:"} <span className="font-bangla text-ink-900">{other}</span>
            <button type="button" onClick={() => onUse(other)} className="rounded px-1 font-medium text-brand-700 hover:bg-brand-50">
                Use this
            </button>
        </span>
    );
}

/**
 * The card pictures, big, next to the boxes: pick a side, zoom in (buttons, Ctrl + wheel, double-click), drag to move,
 * turn a quarter. Stays on screen while the boxes scroll (wide screens).
 */
function CardViewer({ pictures }) {
    const [at, setAt] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [turn, setTurn] = useState(0);
    const box = useRef(null);
    const drag = useRef(null);
    const src = pictures[Math.min(at, pictures.length - 1)];
    if (!src) return null;

    const zoomTo = (z, cx = 0.5, cy = 0.5) => {
        const el = box.current;
        const next = Math.min(5, Math.max(1, Math.round(z * 4) / 4));
        if (!el || next === zoom) return setZoom(next);
        // keep the point under the pointer (or the middle) in place
        const px = (el.scrollLeft + el.clientWidth * cx) / el.scrollWidth;
        const py = (el.scrollTop + el.clientHeight * cy) / el.scrollHeight;
        setZoom(next);
        requestAnimationFrame(() => {
            el.scrollLeft = px * el.scrollWidth - el.clientWidth * cx;
            el.scrollTop = py * el.scrollHeight - el.clientHeight * cy;
        });
    };
    const side = turn % 2 === 1;

    return (
        <div className="min-w-0 space-y-2 lg:sticky lg:top-0 lg:self-start">
            <div className="flex flex-wrap items-center gap-1.5">
                {pictures.length > 1
                    ? pictures.map((p, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => {
                                setAt(i);
                                setZoom(1);
                                setTurn(0);
                            }}
                            className={cn(
                                "overflow-hidden rounded-md border-2",
                                i === at ? "border-brand-500" : "border-transparent opacity-70 hover:opacity-100",
                            )}
                            aria-label={`Show card picture ${i + 1}`}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p} alt="" className="h-12 w-auto" />
                        </button>
                    ))
                    : null}
                <span className="ml-auto flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => zoomTo(zoom - 0.5)} disabled={zoom <= 1} aria-label="Zoom out">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="w-11 text-center text-xs tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
                    <Button size="icon" variant="ghost" onClick={() => zoomTo(zoom + 0.5)} disabled={zoom >= 5} aria-label="Zoom in">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setZoom(1)} aria-label="Whole card" title="Whole card">
                        <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setTurn((t) => (t + 1) % 4)} aria-label="Turn" title="Turn">
                        <RotateCw className="h-4 w-4" />
                    </Button>
                </span>
            </div>
            <div
                ref={box}
                className={cn(
                    "relative h-[52vh] overflow-auto rounded-xl border border-line bg-ink-50 lg:h-[calc(100vh-18rem)]",
                    zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
                )}
                onWheel={(e) => {
                    if (!e.ctrlKey) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    zoomTo(zoom * (e.deltaY < 0 ? 1.25 : 0.8), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                onDoubleClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    zoomTo(zoom > 1 ? 1 : 2.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }}
                onPointerDown={(e) => {
                    if (zoom <= 1 || e.button !== 0) return;
                    drag.current = { x: e.clientX, y: e.clientY, l: box.current.scrollLeft, t: box.current.scrollTop };
                    e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    box.current.scrollLeft = d.l - (e.clientX - d.x);
                    box.current.scrollTop = d.t - (e.clientY - d.y);
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
            >
                <div
                    className="flex min-h-full items-center justify-center p-2"
                    style={{ width: `${zoom * 100}%`, height: zoom > 1 ? `${zoom * 100}%` : undefined }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={`Card picture ${at + 1} as read`}
                        draggable={false}
                        className="select-none rounded shadow-sm"
                        style={{
                            transform: `rotate(${turn * 90}deg)`,
                            maxWidth: side ? `${zoom * 100}%` : "100%",
                            maxHeight: side ? "100%" : "100%",
                            width: side ? "auto" : "100%",
                            height: side ? "100%" : "auto",
                            objectFit: "contain",
                        }}
                    />
                </div>
            </div>
            <p className="text-[11px] text-subtle">
                Double-click or Ctrl + scroll to zoom in on a spot · drag to move · compare each box with the card.
            </p>
        </div>
    );
}