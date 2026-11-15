// src/components/tools/deed-writer.jsx
"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { ChevronDown, FilePlus2, Plus, Printer, RotateCcw, Trash2, Undo2, UserRound } from "lucide-react";
import { bn, emptyPerson, money, moneyWords } from "@/lib/deeds/format";
import { buildDeed, deedTemplates, emptyDeed, getTemplate, resolveTexts } from "@/lib/deeds/templates";
import { cn } from "@/lib/utils";
import { BanglaSwitch, BanglaTypingProvider, BnInput } from "@/components/deeds/bn-input";
import { DeedPages, deedFonts, deedPapers, defaultPageSettings } from "@/components/deeds/deed-pages";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Stepper, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

const DRAFT = (id) => `deed:draft:${id}`;
const PAGE = (id) => `deed:page:${id}`;
const PEOPLE = "deed:people";

const read = (key, fallback) => {
    try {
        const v = JSON.parse(localStorage.getItem(key) || "null");
        return v ?? fallback;
    } catch {
        return fallback;
    }
};
const write = (key, v) => {
    try {
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
        // storage full / blocked
    }
};

export function DeedWriterTool() {
    return (
        <BanglaTypingProvider>
            <DeedWriter />
        </BanglaTypingProvider>
    );
}

function DeedWriter() {
    const toast = useToast();
    const [tplId, setTplId] = useState(deedTemplates[0].id);
    const tpl = getTemplate(tplId);
    const [data, setData] = useState(() => emptyDeed(tpl, emptyPerson));
    const [page, setPage] = useState({ ...defaultPageSettings, size: tpl.font });
    const [loadedFor, setLoadedFor] = useState(null);
    const [people, setPeople] = useState([]);
    const [info, setInfo] = useState({ pages: 0, size: page.size });

    // Load the draft and page settings of the chosen template (kept in this browser).
    useEffect(() => {
        const base = emptyDeed(tpl, emptyPerson);
        const saved = read(DRAFT(tpl.id), null);
        setData(
            saved ? { ...base, ...saved, edits: saved.edits ?? {}, extra: saved.extra ?? [], removed: saved.removed ?? [] } : base,
        );
        setPage({ ...defaultPageSettings, size: tpl.font, ...read(PAGE(tpl.id), {}) });
        setPeople(read(PEOPLE, []));
        setLoadedFor(tpl.id);
    }, [tpl]);
    useEffect(() => {
        if (loadedFor === tpl.id) write(DRAFT(tpl.id), data);
    }, [data, loadedFor, tpl.id]);
    useEffect(() => {
        if (loadedFor === tpl.id) write(PAGE(tpl.id), page);
    }, [page, loadedFor, tpl.id]);

    const set = (patch) => setData((d) => ({ ...d, ...patch }));
    const setPerson = (key, patch) => setData((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

    // The preview follows the form a moment later, so typing stays smooth.
    const shown = useDeferredValue(data);
    const build = useCallback((ctx) => buildDeed(tpl, shown, ctx), [tpl, shown]);

    const missing = tpl.people.filter((p) => !p.optional && !data[p.key]?.name?.trim()).map((p) => p.label);

    const rememberPeople = () => {
        const list = read(PEOPLE, []);
        for (const p of tpl.people) {
            const person = data[p.key];
            if (!person?.name?.trim()) continue;
            const id = `${person.name.trim()}|${(person.nid || "").trim()}`;
            const at = list.findIndex((x) => x.id === id);
            if (at >= 0) list.splice(at, 1);
            list.unshift({ id, person });
        }
        const trimmed = list.slice(0, 80);
        write(PEOPLE, trimmed);
        setPeople(trimmed);
    };

    const print = () => {
        if (missing.length) toast(`নাম লেখা হয়নি: ${missing.join(", ")}`, "error");
        rememberPeople();
        // Let the last typed word turn into Bangla and the pages settle, then open the print dialog.
        setTimeout(() => window.print(), 350);
    };

    const newDeed = () => {
        if (!window.confirm("এই ফর্মের সব লেখা মুছে নতুন দলিল শুরু করবেন?")) return;
        setData(emptyDeed(tpl, emptyPerson));
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
            <div className="min-w-0 space-y-6">
                <Card className="p-5">
                    <Step n={1} title="Choose the deed">
                        <div className="grid gap-2 sm:grid-cols-2">
                            {deedTemplates.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTplId(t.id)}
                                    className={cn(
                                        "rounded-lg border p-3 text-left transition-colors",
                                        t.id === tplId ? "border-brand-500 bg-brand-50" : "border-line-strong hover:bg-ink-50",
                                    )}
                                >
                                    <span className="block font-bangla text-sm font-semibold text-ink-900">{t.title}</span>
                                    <span className="mt-0.5 block font-bangla text-xs text-muted">{t.hint}</span>
                                </button>
                            ))}
                        </div>
                    </Step>
                </Card>

                <Card className="space-y-5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-ink-900">2 · People</h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <BanglaSwitch />
                            <Button size="sm" variant="ghost" onClick={newDeed}>
                                <FilePlus2 className="h-4 w-4" /> New deed
                            </Button>
                        </div>
                    </div>
                    <p className="text-xs text-muted">
                        Type Bangla with your keyboard (Avro / Bijoy), or type Banglish — “amar nam” becomes “আমার নাম” when you press space.{" "}
                        <strong>Ctrl+M</strong> switches Bangla ⇄ English. Empty boxes are left out of the deed.
                    </p>
                    {tpl.people.map((p) => (
                        <PersonForm
                            key={`${tpl.id}-${p.key}`}
                            role={p}
                            value={data[p.key] ?? emptyPerson()}
                            onChange={(patch) => setPerson(p.key, patch)}
                            onReplace={(person) => setData((d) => ({ ...d, [p.key]: { ...emptyPerson(), ...person } }))}
                            people={people}
                        />
                    ))}
                </Card>

                <Card className="p-5">
                    <Step n={3} title="Details">
                        <div className="grid gap-4 sm:grid-cols-2">
                            {tpl.fields.map((f) => (
                                <DetailField key={`${tpl.id}-${f.key}`} f={f} value={data[f.key]} onChange={(v) => set({ [f.key]: v })} />
                            ))}
                        </div>
                    </Step>
                </Card>

                <Card className="p-5">
                    <Step n={4} title="Wording and conditions (optional)">
                        <TextsEditor tpl={tpl} data={data} setData={setData} />
                    </Step>
                </Card>
            </div>

            <div className="min-w-0">
                <Card className="space-y-4 p-5 lg:sticky lg:top-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted">
                            <strong className="text-ink-900">{info.pages}</strong> stamp {info.pages === 1 ? "sheet" : "sheets"} · {info.size}{" "}
                            pt
                        </p>
                        <Button variant="accent" onClick={print} id="deed-print">
                            <Printer className="h-4 w-4" /> Print
                        </Button>
                    </div>
                    {missing.length ? (
                        <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">Not filled yet: {missing.join(", ")}</p>
                    ) : null}
                    <PageSettings page={page} setPage={setPage} tpl={tpl} />
                    <DeedPages build={build} settings={page} onLayout={setInfo} />
                    <p className="text-xs text-muted">
                        Put the stamp paper in the printer with the stamp at the top. In the print dialog choose <strong>Legal</strong> paper,{" "}
                        <strong>Margins: None</strong> and <strong>Scale 100%</strong>. To keep a copy, choose “Save as PDF”. The grey stamp
                        area is not printed.
                    </p>
                </Card>
            </div>
        </div>
    );
}

// ——— people ———

function PersonForm({ role, value, onChange, onReplace, people }) {
    const [open, setOpen] = useState(!role.optional || Boolean(value.name));
    const id = (k) => `${role.label}-${k}`;
    const field = (k, label, opts = {}) => (
        <Field key={k} label={label} htmlFor={id(k)} className={opts.wide ? "sm:col-span-2" : ""}>
            <BnInput
                id={id(k)}
                value={value[k] ?? ""}
                onChange={(v) => onChange({ [k]: v })}
                english={opts.english}
                inputMode={opts.english ? "numeric" : undefined}
            />
        </Field>
    );
    return (
        <div className="rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
                    <UserRound className="h-4 w-4 text-muted" />
                    <span className="font-bangla text-sm font-semibold text-ink-900">{role.label}</span>
                    {value.name ? <span className="font-bangla text-sm text-muted">— {value.name}</span> : null}
                    {role.optional ? <span className="text-xs text-subtle">(optional)</span> : null}
                    <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
                </button>
                {people.length ? (
                    <Select
                        aria-label={`Fill ${role.label} from a saved person`}
                        className="h-8 w-56 text-xs"
                        value=""
                        onChange={(e) => {
                            const found = people.find((x) => x.id === e.target.value);
                            if (found) {
                                onReplace(found.person);
                                setOpen(true);
                            }
                        }}
                    >
                        <option value="">আগের মানুষ থেকে পূরণ…</option>
                        {people.map((x) => (
                            <option key={x.id} value={x.id}>
                                {x.person.name}
                                {x.person.nid ? ` — ${x.person.nid}` : ""}
                            </option>
                        ))}
                    </Select>
                ) : null}
            </div>
            {open ? (
                <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
                    {field("name", "নাম", { wide: true })}
                    {field("father", "পিতা")}
                    {field("mother", "মাতা")}
                    {field("husband", "স্বামী (থাকলে)")}
                    {field("house", "বাসা/হোল্ডিং")}
                    {field("village", "গ্রাম/রাস্তা")}
                    {field("post", "ডাকঘর (পোস্ট কোডসহ)")}
                    {field("upazila", "উপজেলা/থানা")}
                    {field("district", "জেলা")}
                    {field("profession", "পেশা")}
                    {field("nationality", "জাতীয়তা")}
                    {field("religion", "ধর্ম")}
                    {field("nid", "জাতীয় পরিচয় পত্র নং", { english: true })}
                    {field("mobile", "মোবাইল নং", { english: true })}
                </div>
            ) : null}
        </div>
    );
}

// ——— details ———

function DetailField({ f, value, onChange }) {
    const id = `deed-${f.key}`;
    if (f.type === "select") {
        return (
            <Field label={f.label} htmlFor={id}>
                <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
                    {f.options.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </Select>
            </Field>
        );
    }
    if (f.type === "date") {
        return (
            <Field label={f.label} htmlFor={id}>
                <Input id={id} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
            </Field>
        );
    }
    if (f.type === "money" || f.type === "number") {
        const words = f.type === "money" && money(value) ? `${money(value)} — ${moneyWords(value)} টাকা` : "";
        return (
            <Field label={f.label} htmlFor={id} hint={words || undefined}>
                <Input
                    id={id}
                    inputMode="numeric"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={f.type === "money" ? "যেমনঃ 50000" : ""}
                />
            </Field>
        );
    }
    return (
        <Field label={f.label} htmlFor={id} hint={f.hint} className={f.type === "textarea" ? "sm:col-span-2" : ""}>
            <BnInput id={id} value={value ?? ""} onChange={onChange} multiline={f.type === "textarea"} />
        </Field>
    );
}

// ——— wording / conditions ———

function TextsEditor({ tpl, data, setData }) {
    const { list } = resolveTexts(tpl, data);
    const removed = new Set(data.removed || []);
    let n = 0;
    const setEdit = (id, v) => setData((d) => ({ ...d, edits: { ...d.edits, [id]: v } }));
    const reset = (id) =>
        setData((d) => {
            const edits = { ...d.edits };
            delete edits[id];
            return { ...d, edits };
        });
    const toggleRemove = (id) =>
        setData((d) => {
            const r = new Set(d.removed || []);
            if (r.has(id)) r.delete(id);
            else r.add(id);
            return { ...d, removed: [...r] };
        });
    return (
        <div className="space-y-4">
            <p className="text-xs text-muted">
                These are written from the details above and change by themselves. Change any of them by typing — then it stays as you
                typed (press <strong>Back to automatic</strong> to undo).
            </p>
            {list.map((x) => {
                const isRemoved = x.clause && removed.has(x.id);
                const label = x.clause ? (isRemoved ? "শর্ত (বাদ দেওয়া)" : `শর্ত ${bn(++n)}`) : x.label;
                return (
                    <div key={x.id} className={cn("space-y-1.5", isRemoved && "opacity-50")}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bangla text-sm font-medium text-ink-900">
                                {label}
                                {x.edited ? <span className="ml-2 text-xs font-normal text-brand-700">(নিজে বদলানো)</span> : null}
                            </span>
                            <span className="flex gap-1">
                                {x.edited ? (
                                    <button
                                        type="button"
                                        onClick={() => reset(x.id)}
                                        className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                                    >
                                        <Undo2 className="h-3.5 w-3.5" /> Back to automatic
                                    </button>
                                ) : null}
                                {x.clause ? (
                                    <button
                                        type="button"
                                        onClick={() => toggleRemove(x.id)}
                                        className="inline-flex items-center gap-1 rounded px-1.5 text-xs text-muted hover:bg-ink-50"
                                    >
                                        {isRemoved ? (
                                            <>
                                                <RotateCcw className="h-3.5 w-3.5" /> Put back
                                            </>
                                        ) : (
                                            <>
                                                <Trash2 className="h-3.5 w-3.5" /> Leave out
                                            </>
                                        )}
                                    </button>
                                ) : null}
                            </span>
                        </div>
                        {!isRemoved ? (
                            <BnInput
                                multiline
                                value={x.text}
                                onChange={(v) => setEdit(x.id, v)}
                                aria-label={label}
                                className="min-h-20 text-sm"
                            />
                        ) : null}
                    </div>
                );
            })}
            {(data.extra || []).map((t, i) => (
                <div key={`extra-${i}`} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="font-bangla text-sm font-medium text-ink-900">নতুন শর্ত {bn(i + 1)}</span>
                        <button
                            type="button"
                            onClick={() => setData((d) => ({ ...d, extra: d.extra.filter((_, k) => k !== i) }))}
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger"
                        >
                            <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                    </div>
                    <BnInput
                        multiline
                        value={t}
                        onChange={(v) => setData((d) => ({ ...d, extra: d.extra.map((x, k) => (k === i ? v : x)) }))}
                        aria-label={`নতুন শর্ত ${bn(i + 1)}`}
                        className="min-h-20 text-sm"
                    />
                </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setData((d) => ({ ...d, extra: [...(d.extra || []), ""] }))}>
                <Plus className="h-4 w-4" /> Add a condition
            </Button>
        </div>
    );
}

// ——— page settings ———

function PageSettings({ page, setPage, tpl }) {
    const [open, setOpen] = useState(false);
    const set = (patch) => setPage((p) => ({ ...p, ...patch }));
    const mm = (key, label, max = 200) => (
        <Field label={label}>
            <Stepper value={page[key]} onChange={(v) => set({ [key]: v })} min={0} max={max} step={1} label={label} />
        </Field>
    );
    return (
        <div className="rounded-lg border border-line">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-ink-900"
                aria-expanded={open}
            >
                Page, stamp space and font
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} />
            </button>
            {open ? (
                <div className="space-y-4 border-t border-line p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Paper" htmlFor="deed-paper">
                            <Select id="deed-paper" value={page.paper} onChange={(e) => set({ paper: e.target.value })}>
                                {Object.entries(deedPapers).map(([v, p]) => (
                                    <option key={v} value={v}>
                                        {p.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Font" htmlFor="deed-font">
                            <Select id="deed-font" value={page.font} onChange={(e) => set({ font: e.target.value })}>
                                {deedFonts.map((f) => (
                                    <option key={f.value} value={f.value}>
                                        {f.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Font size (pt)">
                            <Stepper value={page.size} onChange={(v) => set({ size: v })} min={9} max={22} step={0.5} label="font size" />
                        </Field>
                        <Field label="Line spacing">
                            <Select value={String(page.lineHeight)} onChange={(e) => set({ lineHeight: Number(e.target.value) })}>
                                {[1.3, 1.45, 1.6, 1.8, 2].map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        {mm("topFirst", "Stamp space — sheet 1 (mm)")}
                        {mm("topOther", "Stamp space — other sheets (mm)")}
                        {mm("left", "Left margin (mm)", 60)}
                        {mm("right", "Right margin (mm)", 60)}
                        {mm("bottom", "Bottom margin (mm)", 60)}
                        <Field label="Fit into sheets (0 = as needed)">
                            <Stepper value={page.fitPages} onChange={(v) => set({ fitPages: v })} min={0} max={10} label="sheets" />
                        </Field>
                    </div>
                    <Checkbox
                        label="Start a new sheet where the template does (e.g. conditions on sheet 2)"
                        checked={page.keepPages}
                        onChange={(e) => set({ keepPages: e.target.checked })}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setPage({ ...defaultPageSettings, size: tpl.font })}>
                            <RotateCcw className="h-4 w-4" /> Reset page settings
                        </Button>
                    </div>
                    <p className="text-xs text-muted">
                        Measure your stamp paper once: from the top edge to just below the printed stamp — that is the stamp space. It is
                        remembered for this deed.
                    </p>
                </div>
            ) : null}
        </div>
    );
}