// src/lib/cv/model.js
// CV maker data (pure, no React). One CV = header (title, name, contact lines, photo) + an ordered list of sections.
// Every list is dynamic: a fresher simply has no experience rows (the section is hidden), others add as many as needed.
//
// Section types:
//   text         { text }                                   Career objective, Profile, any paragraph
//   languages    { items: [{ name, detail }] }               detail = lines ("Written - Average Level")
//   experience   { items: [{ company, designation, location, duration }] }   bordered table
//   education    { items: [{ exam, rows: [{ label, value }] }] }             ❖ Label : Value under each exam
//   keyvalue     { rows: [{ label, value }] }                Personal information
//   list         { items: [text] }                           Computer skills, Training, Hobbies…
//   references   { items: [{ name, lines }] }                lines = designation / organisation / phone
//   declaration  { text, sign }                              paragraph + signature line + name

export const themes = {
    blue: { label: "Blue", bar: "#4472C4", heading: "#003366", title: "#2F5496" },
    green: { label: "Green", bar: "#2E8B57", heading: "#14452B", title: "#1E6B43" },
    maroon: { label: "Maroon", bar: "#A33B3B", heading: "#5A1414", title: "#8B2525" },
    teal: { label: "Teal", bar: "#138A8A", heading: "#0B4747", title: "#0F6E6E" },
    purple: { label: "Purple", bar: "#6A4BA8", heading: "#33225C", title: "#523A8C" },
    black: { label: "Black & white", bar: "#7F7F7F", heading: "#111111", title: "#222222" },
};

export const sectionTypes = {
    text: { label: "Paragraph" },
    languages: { label: "Languages" },
    experience: { label: "Work experience (table)" },
    education: { label: "Education" },
    keyvalue: { label: "Label : value list" },
    list: { label: "Bullet list" },
    references: { label: "References" },
    declaration: { label: "Declaration + signature" },
};

let seq = 0;
/** A short unique id for list rows (React keys). */
export const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const kv = (label, value = "") => ({ id: uid(), label, value });

export const educationLabels = ["Group", "Passing Year", "Board", "Institute", "Result"];
export const personalLabels = [
    "Father's Name",
    "Mother's Name",
    "Present Address",
    "Permanent Address",
    "Date of Birth",
    "Religion",
    "Nationality",
    "Marital Status",
    "Sex",
    "Blood Group",
    "Height",
    "NID",
];

/** Empty rows for each kind of list item. */
export const blank = {
    language: () => ({ id: uid(), name: "", detail: "" }),
    job: () => ({ id: uid(), company: "", designation: "", location: "", duration: "" }),
    exam: (exam = "") => ({ id: uid(), exam, rows: educationLabels.map((l) => kv(l)) }),
    row: (label = "") => kv(label),
    item: () => ({ id: uid(), text: "" }),
    reference: () => ({ id: uid(), name: "", lines: "" }),
};

/** A new section of a type (for "Add section"). */
export function newSection(type, title) {
    const base = { id: uid(), type, title: title || sectionTypes[type]?.label || "Section", on: true };
    switch (type) {
        case "languages":
            return { ...base, items: [blank.language()] };
        case "experience":
            return { ...base, items: [blank.job()] };
        case "education":
            return { ...base, items: [blank.exam()] };
        case "keyvalue":
            return { ...base, rows: [blank.row()] };
        case "list":
            return { ...base, items: [blank.item()] };
        case "references":
            return { ...base, items: [blank.reference()] };
        case "declaration":
            return { ...base, text: "", sign: "" };
        default:
            return { ...base, type: "text", text: "" };
    }
}

export const DECLARATION =
    "I do hereby declare that all information presented here is true to my knowledge. If required and where applicable this document is supported by appropriate authentic papers.";

/** A blank CV laid out like the shop's usual template. */
export function emptyCv() {
    return {
        v: 1,
        theme: "blue",
        title: "Resume Of",
        name: "",
        contact: ["", "Cell : ", "Email : "].map((text) => ({ id: uid(), text })),
        photo: null,
        layout: { breakAt: "auto", size: "auto" }, // where page 2 starts, text size (see html.js layoutCv)
        sections: [
            {
                ...newSection("text", "CAREER OBJECTIVE"),
                text: "To build up my career in a well-renowned organization where my educational qualification can be utilized effectively. Looking for a rewarding career path, which offers the opportunity for growth and development and the gradual assumption of greater responsibility using knowledge, perception and innovation and where I will be able to apply all skills.",
            },
            {
                ...newSection("text", "PROFILE"),
                text: "Hard working, well organized and can get work done through team context. Have dedication and patience in performing any responsibility independently or as a part of a team. Have flexibility and good adaptation power with any changing atmosphere.",
            },
            {
                ...newSection("languages", "LANGUAGES PROFICIENCY"),
                items: [
                    { id: uid(), name: "Bengali", detail: "Mother tongue" },
                    { id: uid(), name: "English", detail: "Written - Average Level\nVerbal - Average Level" },
                ],
            },
            { ...newSection("experience", "WORKING EXPERIENCE"), items: [] },
            {
                ...newSection("education", "ACADEMIC QUALIFICATIONS"),
                items: [blank.exam("Higher Secondary Certificate (HSC)"), blank.exam("Secondary School Certificate (SSC)")],
            },
            { ...newSection("list", "COMPUTER SKILLS"), on: false, items: [blank.item()] },
            { ...newSection("list", "TRAINING"), on: false, items: [blank.item()] },
            {
                ...newSection("keyvalue", "PERSONAL INFORMATION"),
                rows: personalLabels.map((l) => kv(l, l === "Nationality" ? "Bangladeshi" : "")),
            },
            { ...newSection("references", "REFERENCES"), on: false, items: [blank.reference()] },
            { ...newSection("declaration", "DECLARATION"), text: DECLARATION, sign: "" },
        ],
    };
}

const has = (s) => typeof s === "string" && s.trim() !== "";

/**
 * What a section will actually show (empty rows dropped). Returns null when there is nothing to print,
 * so an empty / switched-off section never leaves a lonely heading on the page.
 */
export function visibleSection(s) {
    if (!s?.on) return null;
    switch (s.type) {
        case "text":
            return has(s.text) ? s : null;
        case "languages": {
            const items = (s.items || []).filter((i) => has(i.name) || has(i.detail));
            return items.length ? { ...s, items } : null;
        }
        case "experience": {
            const items = (s.items || []).filter((i) => has(i.company) || has(i.designation) || has(i.location) || has(i.duration));
            return items.length ? { ...s, items } : null;
        }
        case "education": {
            const items = (s.items || [])
                .map((e) => ({ ...e, rows: (e.rows || []).filter((r) => has(r.value)) }))
                .filter((e) => has(e.exam) || e.rows.length);
            return items.length ? { ...s, items } : null;
        }
        case "keyvalue": {
            const rows = (s.rows || []).filter((r) => has(r.value));
            return rows.length ? { ...s, rows } : null;
        }
        case "list": {
            const items = (s.items || []).filter((i) => has(i.text));
            return items.length ? { ...s, items } : null;
        }
        case "references": {
            const items = (s.items || []).filter((i) => has(i.name) || has(i.lines));
            return items.length ? { ...s, items } : null;
        }
        case "declaration":
            return has(s.text) || has(s.sign) ? s : null;
        default:
            return null;
    }
}

/** The sections that will be printed, in order (empty / switched-off ones left out). The signature name falls back to
 * the person's name. Used by the print and by Word, so both show the same thing. */
export const shownSections = (cv) =>
    (cv.sections || [])
        .map(visibleSection)
        .filter(Boolean)
        .map((s) => (s.type === "declaration" && !has(s.sign) ? { ...s, sign: cv.name || "" } : s));

/** Contact lines that have something in them ("Cell : " alone is left out). */
export const contactLines = (cv) => (cv.contact || []).map((c) => c.text.trim()).filter((t) => t && !/:\s*$/.test(t));

/** Lines of a multi-line box, without empty ones. */
export const lines = (t) =>
    String(t || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

/** Does a saved value look like a CV? */
export const isCv = (v) => v && typeof v === "object" && Array.isArray(v.sections) && typeof v.name === "string";

/** File-name-safe version of the person's name. */
export const fileName = (cv) =>
    (cv.name || "CV")
        .replace(/[\\/:*?"<>|]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60) || "CV";