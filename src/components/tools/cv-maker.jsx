// src/components/tools/cv-maker.jsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, FileDown, FilePlus2, FolderOpen, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { blank, educationLabels, emptyCv, fileName, isCv, newSection, sectionTypes, themes, uid } from "@/lib/cv/model";
import { cvToDocx } from "@/lib/cv/docx";
import { TEXT_SIZES } from "@/lib/cv/html";
import { defaultEdit, loadImage, renderEdit } from "@/lib/photo/image";
import { downloadBlob } from "@/lib/photo/export";
import { cn } from "@/lib/utils";
import { CvPages } from "@/components/cv/cv-pages";
import { PhotoSlot } from "@/components/photo/photo-slot";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/interactive";
import { Card } from "@/components/ui/misc";

const DRAFT = "cv:draft";
const SAVED = "cv:saved";
const PHOTO = { w: 540, h: 680 }; // px, 27 × 34 mm at 500 dpi — sharp in print, small enough to keep in the browser

const read = (key, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
    } catch {
        return fallback;
    }
};
const write = (key, v) => {
    try {
        localStorage.setItem(key, JSON.stringify(v));
        return true;
    } catch {
        return false; // storage full / blocked
    }
};

export function CvMakerTool() {
    const toast = useToast();
    // Made in the browser only (new rows get random ids, which must not differ from a server render).
    const [cv, setCv] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [photoKey, setPhotoKey] = useState(0); // a new / opened CV starts with a fresh photo box
    const [saved, setSaved] = useState([]);
    const [layout, setLayout] = useState({
        pages: 0,
        fit: { k1: 1, k2: 1, f: 1 },
        breakKey: null,
        choices: [],
        tooLong: false,
        breakIgnored: false,
    });

    // The CV being typed is kept in this browser, so a refresh or a closed tab loses nothing.
    useEffect(() => {
        const draft = read(DRAFT, null);
        setCv(isCv(draft) ? draft : emptyCv());
        const list = read(SAVED, []);
        setSaved(Array.isArray(list) ? list.filter((x) => isCv(x?.cv)) : []);
        setLoaded(true);
    }, []);
    useEffect(() => {
        if (loaded) write(DRAFT, cv);
    }, [cv, loaded]);

    if (!cv) return <Card className="p-5 text-sm text-muted">Loading…</Card>;

    const set = (patch) => setCv((c) => ({ ...c, ...patch }));
    const setLayoutChoice = (patch) => setCv((c) => ({ ...c, layout: { breakAt: "auto", size: "auto", ...c.layout, ...patch } }));
    const breakAt = cv.layout?.breakAt || "auto";
    const textSize = cv.layout?.size || "auto";
    const setSection = (id, patch) =>
        setCv((c) => ({ ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
    const moveSection = (i, d) =>
        setCv((c) => {
            const list = [...c.sections];
            const j = i + d;
            if (j < 0 || j >= list.length) return c;
            [list[i], list[j]] = [list[j], list[i]];
            return { ...c, sections: list };
        });
    const removeSection = (s) => {
        if (!window.confirm(`Delete the “${s.title}” section?`)) return;
        setCv((c) => ({ ...c, sections: c.sections.filter((x) => x.id !== s.id) }));
    };

    const saveCv = () => {
        const name = cv.name.trim() || "No name";
        const entry = { id: cv.savedId || uid(), name, savedAt: Date.now(), cv: { ...cv, savedId: undefined } };
        const list = [entry, ...saved.filter((x) => x.id !== entry.id)];
        if (!write(SAVED, list)) {
            toast("Browser storage is full — delete some old saved CVs first.", "error");
            return;
        }
        setSaved(list);
        set({ savedId: entry.id });
        toast(`Saved: ${name}`, "success");
    };
    const openCv = (entry) => {
        if (!window.confirm(`Open ${entry.name}'s CV? What is in the form now will be replaced (save it first if you need it).`))
            return;
        setCv({ ...entry.cv, savedId: entry.id });
        setPhotoKey((k) => k + 1);
    };
    const deleteSaved = (entry) => {
        if (!window.confirm(`Delete the saved CV of ${entry.name}?`)) return;
        const list = saved.filter((x) => x.id !== entry.id);
        write(SAVED, list);
        setSaved(list);
        if (cv.savedId === entry.id) set({ savedId: undefined });
    };
    const newCv = () => {
        if (!window.confirm("Start a new, empty CV? What is in the form now will be cleared (save it first if you need it).")) return;
        setCv(emptyCv());
        setPhotoKey((k) => k + 1);
    };

    const print = () => {
        if (!cv.name.trim()) toast("The name is empty.", "error");
        setTimeout(() => window.print(), 300);
    };
    const saveWord = () => {
        try {
            downloadBlob(cvToDocx(cv, { fit: layout.fit, breakKey: layout.breakKey }), `${fileName(cv)}.docx`);
        } catch (err) {
            toast(`Could not make the Word file: ${err.message}`, "error");
        }
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
            <div className="min-w-0 space-y-6">
                <Card className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-ink-900">Saved CVs</h2>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="ghost" onClick={newCv}>
                                <FilePlus2 className="h-4 w-4" /> New CV
                            </Button>
                            <Button size="sm" onClick={saveCv}>
                                <Save className="h-4 w-4" /> {cv.savedId ? "Save changes" : "Save CV"}
                            </Button>
                        </div>
                    </div>
                    {saved.length ? (
                        <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                            {saved.map((x) => (
                                <li key={x.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", x.id === cv.savedId && "bg-brand-50")}>
                                    <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{x.name}</span>
                                    <span className="shrink-0 text-xs text-muted">{new Date(x.savedAt).toLocaleDateString("en-GB")}</span>
                                    <Button size="sm" variant="ghost" onClick={() => openCv(x)}>
                                        <FolderOpen className="h-4 w-4" /> Open
                                    </Button>
                                    <IconButton label={`Delete ${x.name}`} onClick={() => deleteSaved(x)}>
                                        <Trash2 className="h-4 w-4" />
                                    </IconButton>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-muted">
                            Press <strong>Save CV</strong> to keep a customer&apos;s CV in this browser, so you can open and change it next
                            time. What you type is also kept by itself until you press New CV.
                        </p>
                    )}
                </Card>

                <Card className="space-y-4 p-5">
                    <h2 className="text-sm font-semibold text-ink-900">Name, contact and photo</h2>
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
                        <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Title" htmlFor="cv-title">
                                    <Input id="cv-title" value={cv.title} onChange={(e) => set({ title: e.target.value })} />
                                </Field>
                                <Field label="Full name" htmlFor="cv-name">
                                    <Input
                                        id="cv-name"
                                        value={cv.name}
                                        onChange={(e) => set({ name: e.target.value })}
                                        placeholder="Md. Abdul Karim"
                                    />
                                </Field>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-ink-900">Contact lines (under the name)</p>
                                <RowList
                                    items={cv.contact}
                                    onChange={(contact) => set({ contact })}
                                    make={() => ({ id: uid(), text: "" })}
                                    addLabel="Add line"
                                    render={(c, change) => (
                                        <Input
                                            aria-label="Contact line"
                                            value={c.text}
                                            onChange={(e) => change({ text: e.target.value })}
                                            placeholder="Address / Cell : 01… / Email : …"
                                        />
                                    )}
                                />
                                <p className="text-xs text-muted">A line with nothing after the colon (like “Email : ”) is left out.</p>
                            </div>
                        </div>
                        <PhotoBox key={photoKey} photo={cv.photo} onChange={(photo) => set({ photo })} />
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-ink-900">Colour</p>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(themes).map(([id, t]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => set({ theme: id })}
                                    aria-pressed={cv.theme === id}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                                        cv.theme === id
                                            ? "border-brand-500 bg-brand-50 font-semibold text-ink-900"
                                            : "border-line-strong text-ink-700 hover:bg-ink-50",
                                    )}
                                >
                                    <span className="h-3 w-8 rounded-sm" style={{ background: `linear-gradient(90deg, ${t.bar}33, ${t.bar})` }} />
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </Card>

                {cv.sections.map((s, i) => (
                    <SectionCard
                        key={s.id}
                        s={s}
                        first={i === 0}
                        last={i === cv.sections.length - 1}
                        name={cv.name}
                        onChange={(patch) => setSection(s.id, patch)}
                        onMove={(d) => moveSection(i, d)}
                        onRemove={() => removeSection(s)}
                    />
                ))}

                <AddSection onAdd={(s) => setCv((c) => ({ ...c, sections: [...c.sections, s] }))} />
            </div>

            <div className="min-w-0">
                <Card className="space-y-4 p-5 lg:sticky lg:top-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted">
                            <strong className="text-ink-900">{layout.pages}</strong> {layout.pages === 1 ? "page" : "pages"} · A4
                            {textSize === "auto" && layout.fit.f !== 1 ? ` · text ${(10 * layout.fit.f).toFixed(1)} pt to fit` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="ghost" onClick={saveWord}>
                                <FileDown className="h-4 w-4" /> Save Word
                            </Button>
                            <Button variant="accent" onClick={print}>
                                <Printer className="h-4 w-4" /> Print
                            </Button>
                        </div>
                    </div>
                    {layout.tooLong ? (
                        <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">
                            Too much for 2 pages even with tight spacing — shorten a long paragraph or switch off a section, or it prints on{" "}
                            {layout.pages} pages.
                        </p>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                        <Field label="Page 2 starts at" htmlFor="cv-break">
                            <Select id="cv-break" value={breakAt} onChange={(e) => setLayoutChoice({ breakAt: e.target.value })}>
                                <option value="auto">Auto — both pages filled evenly</option>
                                {breakAt !== "auto" && !layout.choices.some((c) => c.key === breakAt) ? (
                                    <option value={breakAt}>(your choice — does not fit now)</option>
                                ) : null}
                                {layout.choices.map((c) => (
                                    <option key={c.key} value={c.key}>
                                        {c.label}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Text size" htmlFor="cv-size">
                            <Select id="cv-size" value={String(textSize)} onChange={(e) => setLayoutChoice({ size: e.target.value })}>
                                <option value="auto">Auto</option>
                                {TEXT_SIZES.map((v) => (
                                    <option key={v} value={String(v)}>
                                        {v} pt
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                    {layout.breakIgnored ? (
                        <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">
                            Page 2 can&apos;t start where you chose — page 1 or 2 would overflow. Auto is used; pick another place or a smaller
                            text size.
                        </p>
                    ) : null}
                    <CvPages cv={cv} onLayout={setLayout} />
                    <p className="text-xs text-muted">
                        The CV is always set on 2 pages: each page&apos;s spacing grows or shrinks by itself so page 1 has no empty space at
                        the bottom. Move a section to the other page with <strong>Page 2 starts at</strong>. In the print dialog choose{" "}
                        <strong>A4</strong>, <strong>Margins: None</strong>, <strong>Scale 100%</strong> and tick{" "}
                        <strong>Background graphics</strong> for the coloured bars. To send a PDF, choose “Save as PDF”.{" "}
                        <strong>Save Word</strong> gives a .docx the customer can edit — every row is already lined up.
                    </p>
                </Card>
            </div>
        </div>
    );
}

// ——— photo ———

/** The photo as a small JPEG inside the CV (so it is saved with it). Crop / zoom with the editor after choosing. */
function PhotoBox({ photo, onChange }) {
    const toast = useToast();
    const [slot, setSlot] = useState(null);
    const fileRef = useRef(null);

    useEffect(() => {
        if (!slot) return;
        const t = setTimeout(() => {
            try {
                const canvas = renderEdit(slot.image.img, slot.edit, PHOTO.w, PHOTO.h);
                onChange(canvas.toDataURL("image/jpeg", 0.88));
            } catch {
                toast("Could not read that photo.", "error");
            }
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slot]);

    const choose = async (files) => {
        try {
            const image = await loadImage(files[0]);
            setSlot({ image, edit: { ...defaultEdit } });
        } catch (err) {
            toast(err.message, "error");
        }
    };

    if (slot || !photo) {
        return (
            <PhotoSlot
                title="Photo"
                value={slot}
                onChange={(v) => {
                    setSlot(v);
                    if (!v) onChange(null);
                }}
                aspect={PHOTO.w / PHOTO.h}
                guide="face"
                maxHeight={260}
                hint="Optional — passport-size photo"
            />
        );
    }
    // A saved CV: the photo is already in it.
    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-ink-900">Photo</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="CV photo" className="w-32 rounded border border-line" />
            <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                    Change
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Choose a new photo"
                onChange={(e) => {
                    if (e.target.files?.length) choose(e.target.files);
                    e.target.value = "";
                }}
            />
        </div>
    );
}

// ——— sections ———

const HINTS = {
    text: "A blank line starts a new paragraph.",
    experience: "No experience? Leave the rows empty — the whole section is left out of the CV.",
    education: "Empty rows are left out. Add more exams (Honours, Masters, Diploma…) with the button below.",
    keyvalue: "Rows with no value are left out.",
    references: "Lines: designation, organisation, phone — one per line.",
};

function SectionCard({ s, first, last, name, onChange, onMove, onRemove }) {
    return (
        <Card className={cn("space-y-4 p-5", !s.on && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    aria-label="Section heading"
                    value={s.title}
                    onChange={(e) => onChange({ title: e.target.value })}
                    className="h-9 min-w-0 flex-1 font-semibold uppercase"
                />
                <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onChange({ on: !s.on })} aria-pressed={s.on}>
                        {s.on ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {s.on ? "Shown" : "Hidden"}
                    </Button>
                    <IconButton label="Move up" onClick={() => onMove(-1)} disabled={first}>
                        <ArrowUp className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Move down" onClick={() => onMove(1)} disabled={last}>
                        <ArrowDown className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Delete section" onClick={onRemove}>
                        <Trash2 className="h-4 w-4" />
                    </IconButton>
                </div>
            </div>
            {s.on ? (
                <>
                    <SectionBody s={s} name={name} onChange={onChange} />
                    {HINTS[s.type] ? <p className="text-xs text-muted">{HINTS[s.type]}</p> : null}
                </>
            ) : (
                <p className="text-xs text-muted">Hidden — not on the CV. Press “Hidden” to show it again.</p>
            )}
        </Card>
    );
}

function SectionBody({ s, name, onChange }) {
    switch (s.type) {
        case "text":
            return (
                <Textarea aria-label={s.title} value={s.text} onChange={(e) => onChange({ text: e.target.value })} className="min-h-28" />
            );
        case "languages":
            return (
                <RowList
                    items={s.items}
                    onChange={(items) => onChange({ items })}
                    make={blank.language}
                    addLabel="Add language"
                    render={(l, change) => (
                        <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
                            <Input
                                aria-label="Language"
                                value={l.name}
                                onChange={(e) => change({ name: e.target.value })}
                                placeholder="English"
                            />
                            <Textarea
                                aria-label="Level"
                                rows={2}
                                value={l.detail}
                                onChange={(e) => change({ detail: e.target.value })}
                                placeholder={"Written - Average Level\nVerbal - Average Level"}
                            />
                        </div>
                    )}
                />
            );
        case "experience":
            return (
                <RowList
                    items={s.items}
                    onChange={(items) => onChange({ items })}
                    make={blank.job}
                    addLabel="Add job"
                    render={(j, change) => (
                        <div className="grid gap-2 sm:grid-cols-4">
                            <Input
                                aria-label="Name of company"
                                placeholder="Company"
                                value={j.company}
                                onChange={(e) => change({ company: e.target.value })}
                            />
                            <Input
                                aria-label="Designation"
                                placeholder="Designation"
                                value={j.designation}
                                onChange={(e) => change({ designation: e.target.value })}
                            />
                            <Input
                                aria-label="Location"
                                placeholder="Location"
                                value={j.location}
                                onChange={(e) => change({ location: e.target.value })}
                            />
                            <Input
                                aria-label="Duration"
                                placeholder="02 Years"
                                value={j.duration}
                                onChange={(e) => change({ duration: e.target.value })}
                            />
                        </div>
                    )}
                />
            );
        case "education":
            return (
                <RowList
                    items={s.items}
                    onChange={(items) => onChange({ items })}
                    make={() => blank.exam()}
                    addLabel="Add exam / degree"
                    boxed
                    render={(e, change) => (
                        <div className="space-y-2">
                            <Input
                                aria-label="Exam / degree"
                                value={e.exam}
                                onChange={(ev) => change({ exam: ev.target.value })}
                                placeholder="Bachelor of Arts (B.A)"
                                className="font-semibold"
                            />
                            <KeyValueRows rows={e.rows} onChange={(rows) => change({ rows })} suggestions={educationLabels} />
                        </div>
                    )}
                />
            );
        case "keyvalue":
            return <KeyValueRows rows={s.rows} onChange={(rows) => onChange({ rows })} />;
        case "list":
            return (
                <RowList
                    items={s.items}
                    onChange={(items) => onChange({ items })}
                    make={blank.item}
                    addLabel="Add line"
                    render={(it, change) => (
                        <Input
                            aria-label={s.title}
                            value={it.text}
                            onChange={(e) => change({ text: e.target.value })}
                            placeholder="MS Word, MS Excel…"
                        />
                    )}
                />
            );
        case "references":
            return (
                <RowList
                    items={s.items}
                    onChange={(items) => onChange({ items })}
                    make={blank.reference}
                    addLabel="Add reference"
                    render={(p, change) => (
                        <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                            <Input aria-label="Name" placeholder="Name" value={p.name} onChange={(e) => change({ name: e.target.value })} />
                            <Textarea
                                aria-label="Details"
                                rows={3}
                                value={p.lines}
                                onChange={(e) => change({ lines: e.target.value })}
                                placeholder={"Designation\nOrganisation\nCell : 01…"}
                            />
                        </div>
                    )}
                />
            );
        case "declaration":
            return (
                <div className="space-y-3">
                    <Textarea
                        aria-label="Declaration"
                        value={s.text}
                        onChange={(e) => onChange({ text: e.target.value })}
                        className="min-h-20"
                    />
                    <Field label="Name under the signature line" htmlFor={`${s.id}-sign`}>
                        <Input
                            id={`${s.id}-sign`}
                            value={s.sign}
                            onChange={(e) => onChange({ sign: e.target.value })}
                            placeholder={name || "Same as the name"}
                        />
                    </Field>
                </div>
            );
        default:
            return null;
    }
}

/** ❖ Label : Value rows (both editable). */
function KeyValueRows({ rows, onChange, suggestions }) {
    const listId = useId();
    return (
        <>
            {suggestions ? (
                <datalist id={listId}>
                    {suggestions.map((x) => (
                        <option key={x} value={x} />
                    ))}
                </datalist>
            ) : null}
            <RowList
                items={rows}
                onChange={onChange}
                make={() => blank.row()}
                addLabel="Add row"
                render={(r, change) => (
                    <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                        <Input
                            aria-label="Label"
                            value={r.label}
                            onChange={(e) => change({ label: e.target.value })}
                            placeholder="Label"
                            list={suggestions ? listId : undefined}
                        />
                        <Input
                            aria-label={r.label || "Value"}
                            value={r.value}
                            onChange={(e) => change({ value: e.target.value })}
                            placeholder="Value"
                        />
                    </div>
                )}
            />
        </>
    );
}

/** A list of rows that can be added, removed and moved. */
function RowList({ items, onChange, make, render, addLabel, boxed = false }) {
    const change = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const move = (i, d) => {
        const j = i + d;
        if (j < 0 || j >= items.length) return;
        const list = [...items];
        [list[i], list[j]] = [list[j], list[i]];
        onChange(list);
    };
    return (
        <div className="space-y-2">
            {items.map((it, i) => (
                <div key={it.id} className={cn("flex items-start gap-1.5", boxed && "rounded-lg border border-line p-3")}>
                    <div className="min-w-0 flex-1">{render(it, (patch) => change(i, patch))}</div>
                    <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
                        {items.length > 1 ? (
                            <>
                                <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}>
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </IconButton>
                            </>
                        ) : null}
                        <IconButton label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                            <X className="h-3.5 w-3.5" />
                        </IconButton>
                    </div>
                </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => onChange([...items, make()])}>
                <Plus className="h-4 w-4" /> {addLabel}
            </Button>
        </div>
    );
}

function AddSection({ onAdd }) {
    const [type, setType] = useState("list");
    const [title, setTitle] = useState("");
    return (
        <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-ink-900">Add a section</h2>
            <div className="grid gap-2 sm:grid-cols-[200px_minmax(0,1fr)_auto]">
                <Select aria-label="Kind of section" value={type} onChange={(e) => setType(e.target.value)}>
                    {Object.entries(sectionTypes).map(([id, t]) => (
                        <option key={id} value={id}>
                            {t.label}
                        </option>
                    ))}
                </Select>
                <Input
                    aria-label="New section heading"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Heading, e.g. HOBBIES"
                />
                <Button
                    onClick={() => {
                        onAdd(newSection(type, (title.trim() || sectionTypes[type].label).toUpperCase()));
                        setTitle("");
                    }}
                >
                    <Plus className="h-4 w-4" /> Add
                </Button>
            </div>
        </Card>
    );
}

function IconButton({ label, className, ...props }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-ink-50 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-30",
                className,
            )}
            {...props}
        />
    );
}