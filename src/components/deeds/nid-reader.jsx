// src/components/deeds/nid-reader.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BnInput } from "@/components/deeds/bn-input";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Modal, useToast } from "@/components/ui/interactive";

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

/**
 * "NID থেকে পূরণ": photos of the NID (front, back, or a photocopy page with both) → the person's details, read in this
 * browser (nothing is uploaded). The staff checks / corrects every box, then fills the person.
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
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            import("@/lib/deeds/nid").then((m) => m.stopNidReader());
        };
    }, []);

    const add = (list) => setFiles((f) => [...f, ...list].slice(0, 3));

    const read = async () => {
        if (!files.length) return;
        setBusy({ label: "Starting the reader", done: 0 });
        setResult(null);
        try {
            const { readNid } = await import("@/lib/deeds/nid");
            const r = await readNid(files, (label, done) => alive.current && setBusy({ label, done }));
            if (!alive.current) return;
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
            if (!r.found.some((k) => nidPersonKeys.includes(k)))
                toast("Nothing could be read. Take the photo again: flat, in good light, card filling most of the photo.", "error");
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
            className="max-w-3xl"
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
                        <strong>one scan / photocopy / PDF page with both sides</strong>. Smart card or old card, any way up. The card is read
                        on this computer — nothing is sent anywhere or kept.
                    </p>
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
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {result.texts.map((t, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={t.preview} alt={`Card picture ${i + 1} as read`} className="h-24 rounded border border-line" />
                        ))}
                    </div>
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
                                </label>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
}