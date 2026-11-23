// src/lib/cv/docx.js
// CV → Word (.docx), built in the browser (fflate zip, no server, no extra package). Same look as the print:
// A4, Poppins, gradient heading bars, photo top-right, bordered experience table, ❖ Label : Value rows.
// Nothing floats: the heading bars are text boxes set "in line with text" and the header is a borderless table, so
// when the customer edits the file in Word nothing slides out of place. Label / colon / value line up on tab stops with
// a hanging indent, so long values (addresses) wrap under the value, never under the label.
import { strToU8, zipSync } from "fflate";
import { contactLines, lines, shownSections, themes } from "./model";
import { CONTENT_W, PAGE, SIZES, tint } from "./html";

const TW = 1440 / 25.4; // twips per mm
const PT_MM = 25.4 / 72; // mm per pt
const EMU = 36000; // EMU per mm
const tw = (mm) => Math.round(mm * TW);
const emu = (mm) => Math.round(mm * EMU);
const hp = (pt) => Math.round(pt * 2); // half-points

const x = (s) =>
    String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const FONT = "Poppins";
const HEAD_FONT = "Times New Roman";
const SYMBOL_FONT = "Segoe UI Symbol";
const POPPINS_LINE = 1.5; // Poppins: ascent + descent + gap = 1.5 em

/** Same spacing / font scale as the print (see html.js layoutCv): k = gaps, f = font. */
let FIT = { k: 1, f: 1 };
const WORD_K = 0.96; // Word's gaps a little tighter than the print's, so a page that is full in print never spills in Word
const lhK = () => 1 + (FIT.k - 1) * 0.35;

/** One run of text. Line breaks inside become <w:br/>. */
function run(text, { b, u, color, size, font } = {}) {
    const rPr = [
        font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` : "",
        b ? "<w:b/><w:bCs/>" : "",
        u ? `<w:u w:val="single"/>` : "",
        color ? `<w:color w:val="${color.replace("#", "")}"/>` : "",
        size ? `<w:sz w:val="${hp(size * FIT.f)}"/><w:szCs w:val="${hp(size * FIT.f)}"/>` : "",
    ].join("");
    const parts = String(text ?? "").split("\n");
    const body = parts.map((t, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(t)}</w:t>`).join("");
    return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}${body}</w:r>`;
}
const tab = () => "<w:r><w:tab/></w:r>";

/** One paragraph. opts: align, before/after (pt), line (multiple), ind {left, hanging, right} mm, tabs [mm], border. */
/** An empty paragraph exactly `pt` points tall (× spacing k) — the same gaps as the print's padding. */
const gap = (pt, o = {}) =>
    `<w:p><w:pPr>${o.pageBreak ? "<w:pageBreakBefore/>" : ""}${o.keepNext ? "<w:keepNext/>" : ""}<w:spacing w:before="0" w:after="0" w:line="${Math.max(
        20,
        Math.round(pt * FIT.k * 20),
    )}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;

function para(runs, o = {}) {
    const empty = !runs || (Array.isArray(runs) && !runs.length);
    // Gaps grow / shrink with k; line heights a little (as lh() in html.js); an empty spacer line is all gap.
    const line = o.rawLine ?? ((o.line ?? 1.45) / POPPINS_LINE) * (empty ? FIT.k : lhK());
    const pPr = [
        o.pageBreak ? "<w:pageBreakBefore/>" : "",
        o.keepNext ? "<w:keepNext/>" : "",
        o.keepLines ? "<w:keepLines/>" : "",
        o.borderTop ? `<w:pBdr><w:top w:val="single" w:sz="6" w:space="3" w:color="000000"/></w:pBdr>` : "",
        o.tabs?.length ? `<w:tabs>${o.tabs.map((t) => `<w:tab w:val="left" w:pos="${tw(t)}"/>`).join("")}</w:tabs>` : "",
        // o.line is a CSS-style line height (as in the print). Poppins' own "single" line in Word is already 1.5× the font
        // size, so divide by 1.5; other fonts (rawLine) are used as given.
        `<w:spacing w:before="${Math.round((o.before ?? 0) * FIT.k * 20)}" w:after="${Math.round((o.after ?? 0) * FIT.k * 20)}" w:line="${Math.round(
            240 * line,
        )}" w:lineRule="auto"/>`,
        o.ind
            ? `<w:ind w:left="${tw(o.ind.left ?? 0)}" w:right="${tw(o.ind.right ?? 0)}"${o.ind.hanging ? ` w:hanging="${tw(o.ind.hanging)}"` : ""}/>`
            : "",
        o.align ? `<w:jc w:val="${o.align}"/>` : "",
    ].join("");
    return `<w:p><w:pPr>${pPr}</w:pPr>${Array.isArray(runs) ? runs.join("") : runs || ""}</w:p>`;
}

let shapeId = 100;

/** Heading bar: a gradient text box placed in line with the text (never floats). */
function heading(title, t, first, pageBreak) {
    const w = emu(CONTENT_W);
    const h = emu(SIZES.barH);
    const id = shapeId++;
    const box = `<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>
<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>
<wp:docPr id="${id}" name="Heading ${id}"/><wp:cNvGraphicFramePr/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${tint(t.bar, 0.8).slice(1)}"/></a:gs><a:gs pos="100000"><a:srgbClr val="${t.bar.slice(1)}"/></a:gs></a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>
<a:ln><a:noFill/></a:ln></wps:spPr>
<wps:txbx><w:txbxContent>${para(run(title, { b: true, color: t.heading, size: SIZES.heading, font: HEAD_FONT }), { rawLine: 1 })}</w:txbxContent></wps:txbx>
<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="${emu(2.5)}" tIns="0" rIns="${emu(1)}" bIns="0" anchor="ctr" anchorCtr="0" upright="1"><a:noAutofit/></wps:bodyPr>
</wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice></mc:AlternateContent></w:r>`;
    // The first bar sits right under the header table; its gap is not scaled (a smaller gap there upsets some Word
    // readers' layout, e.g. LibreOffice).
    const before = pageBreak ? 0 : first ? 6 / FIT.k : 9;
    return para(box, { before, after: 4, rawLine: 1, keepNext: true, pageBreak });
}

/** ❖ Label : Value — tab stops + hanging indent, so a long value wraps under the value. */
function kvPara(label, value, pageBreak) {
    const i0 = SIZES.indent;
    const labelAt = i0 + SIZES.bulletCol;
    const colonAt = labelAt + SIZES.labelCol;
    const valueAt = colonAt + SIZES.colonCol;
    return para(
        [run("❖", { font: SYMBOL_FONT, size: 8 }), tab(), run(label), tab(), run(":"), tab(), run(lines(value).join("\n"))],
        {
            tabs: [labelAt, colonAt, valueAt],
            ind: { left: valueAt, hanging: valueAt - i0 },
            line: 1.5,
            after: 1,
            keepLines: true,
            pageBreak,
        },
    );
}

function bulletPara(text, pageBreak) {
    const i0 = SIZES.indent;
    const at = i0 + SIZES.bulletCol;
    return para([run("❖", { font: SYMBOL_FONT, size: 8 }), tab(), run(lines(text).join("\n"))], {
        tabs: [at],
        ind: { left: at, hanging: SIZES.bulletCol },
        line: 1.5,
        after: 1,
        pageBreak,
    });
}

const NO_BORDERS = `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>`;
const LINES = `<w:tblBorders><w:top w:val="single" w:sz="6" w:color="000000"/><w:left w:val="single" w:sz="6" w:color="000000"/><w:bottom w:val="single" w:sz="6" w:color="000000"/><w:right w:val="single" w:sz="6" w:color="000000"/><w:insideH w:val="single" w:sz="6" w:color="000000"/><w:insideV w:val="single" w:sz="6" w:color="000000"/></w:tblBorders>`;

/** A table: widths in mm, rows = arrays of cell XML (paragraphs). */
function table(
    widthsMm,
    rows,
    { borders = false, indent = 0, header = false, cellPad = 1.2, vPad = cellPad * 0.6, vAlign } = {},
) {
    const grid = widthsMm.map((w) => `<w:gridCol w:w="${tw(w)}"/>`).join("");
    const total = widthsMm.reduce((a, b) => a + b, 0);
    const tr = rows
        .map(
            (cells, r) =>
                `<w:tr><w:trPr><w:cantSplit/>${header && r === 0 ? "<w:tblHeader/>" : ""}</w:trPr>${cells
                    .map(
                        (c, i) =>
                            `<w:tc><w:tcPr><w:tcW w:w="${tw(widthsMm[i])}" w:type="dxa"/>${vAlign ? `<w:vAlign w:val="${vAlign}"/>` : ""}</w:tcPr>${c || "<w:p/>"}</w:tc>`,
                    )
                    .join("")}</w:tr>`,
        )
        .join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/>${indent ? `<w:tblInd w:w="${tw(indent)}" w:type="dxa"/>` : ""}${borders ? LINES : NO_BORDERS
        }<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${tw(vPad)}" w:type="dxa"/><w:left w:w="${tw(cellPad)}" w:type="dxa"/><w:bottom w:w="${tw(vPad)}" w:type="dxa"/><w:right w:w="${tw(cellPad)}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${tr}</w:tbl>`;
}

function photoRun(rid) {
    const cx = emu(SIZES.photoW);
    const cy = emu(SIZES.photoH);
    return `<w:r><w:rPr><w:noProof/></w:rPr><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>
<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Photo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="photo.jpg"/><pic:cNvPicPr/></pic:nvPicPr>
<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function headerXml(cv, t, hasPhoto) {
    const contact = contactLines(cv);
    const left = [
        cv.title?.trim() ? para(run(cv.title, { b: true, color: t.title, size: SIZES.title }), { align: "center", line: 1.15 }) : "",
        cv.name?.trim() ? para(run(cv.name, { b: true, color: t.title, size: SIZES.name }), { align: "center", line: 1.2 }) : "",
        gap(contact.length ? 10 : 2),
        cv.name?.trim() && contact.length ? para(run(cv.name), { line: 1.55 }) : "",
        ...contact.map((c, i) => para(run(c), { line: 1.55, after: i === contact.length - 1 ? 3 : 0 })),
    ].join("");
    if (!hasPhoto) return left;
    const space = 6;
    const right = para(photoRun("rIdPhoto"), { align: "right", rawLine: 1 });
    return table([CONTENT_W - SIZES.photoW - space, SIZES.photoW + space], [[left, right]], { cellPad: 0, vAlign: "bottom" });
}

/**
 * Rows of a table, split into separate tables where the print starts a new page (a page break can't go inside a table).
 * brk[i] = true when page 2 starts at row i; header (optional) is repeated on top of each part.
 */
function splitTable(widths, rows, brk, opts, header) {
    const parts = [[]];
    rows.forEach((r, i) => {
        if (i && brk[i]) parts.push([]);
        parts[parts.length - 1].push(r);
    });
    return parts
        .map(
            (part, n) =>
                (n || brk[0] ? gap(2, { pageBreak: true }) : "") +
                table(widths, header ? [header, ...part] : part, { ...opts, header: !!header }),
        )
        .join("");
}

function sectionXml(s, t, pb) {
    const k = (i) => `${s.id}:${i}`;
    switch (s.type) {
        case "text":
            return String(s.text)
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) =>
                    para(run(lines(p).join("\n"), { size: SIZES.para }), { align: "both", line: 1.7, after: 3, pageBreak: pb(k(i)) }),
                )
                .join("");
        case "languages": {
            const cols = Math.min(3, s.items.length);
            const w = (CONTENT_W - SIZES.indent) / cols;
            const rows = [];
            const brk = [];
            for (let i = 0; i < s.items.length; i += cols) {
                brk.push(pb(k(rows.length)));
                const row = s.items.slice(i, i + cols).map(
                    (l) =>
                        para(run(`❖ ${l.name}${l.name?.trim() ? ":" : ""}`, { b: true }), { line: 1.5 }) +
                        lines(l.detail)
                            .map((d) => para(run(d), { line: 1.5, ind: { left: SIZES.bulletCol } }))
                            .join(""),
                );
                while (row.length < cols) row.push("<w:p/>");
                rows.push(row);
            }
            return gap(1) + splitTable(Array(cols).fill(w), rows, brk, { indent: SIZES.indent, cellPad: 0 }) + gap(4);
        }
        case "experience": {
            const widths = SIZES.jobCols.map((p) => (CONTENT_W * p) / 100);
            const cell = (v, b) => para(run(lines(v).join("\n"), { b }), { align: "center", line: 1.45 });
            const header = ["Name of Company", "Designation", "Location", "Duration"].map((h) => cell(h, true));
            const brk = [];
            const rows = s.items.map((j, i) => {
                brk.push(pb(k(i)));
                return [j.company, j.designation, j.location, j.duration].map((v) => cell(v, false));
            });
            return (
                gap(2) + splitTable(widths, rows, brk, { borders: true, cellPad: PT_MM * 3, vPad: PT_MM * 2 * FIT.k }, header) + gap(4)
            );
        }
        case "education":
            return s.items
                .map(
                    (e, i) =>
                        (e.exam?.trim()
                            ? para(run(e.exam, { b: true, u: true }), { line: 1.6, after: 2, keepNext: true, pageBreak: pb(k(i)) })
                            : "") +
                        e.rows.map((r, j) => kvPara(r.label, r.value, pb(`${k(i)}.${j}`))).join("") +
                        gap(4),
                )
                .join("");
        case "keyvalue":
            return s.rows.map((r, i) => kvPara(r.label, r.value, pb(k(i)))).join("");
        case "list":
            return s.items.map((it, i) => bulletPara(it.text, pb(k(i)))).join("");
        case "references": {
            const w = (CONTENT_W - SIZES.indent) / 2;
            const rows = [];
            const brk = [];
            for (let i = 0; i < s.items.length; i += 2) {
                brk.push(pb(k(rows.length)));
                const row = s.items.slice(i, i + 2).map(
                    (p) =>
                        para(run(p.name, { b: true }), { line: 1.5 }) +
                        lines(p.lines)
                            .map((l) => para(run(l), { line: 1.5 }))
                            .join(""),
                );
                while (row.length < 2) row.push("<w:p/>");
                rows.push(row);
            }
            return gap(1) + splitTable([w, w], rows, brk, { indent: SIZES.indent, cellPad: 0 }) + gap(6);
        }
        case "declaration":
            return (
                (s.text?.trim()
                    ? para(run(lines(s.text).join("\n"), { size: SIZES.para }), {
                        align: "both",
                        line: 1.7,
                        keepNext: true,
                        before: 2,
                        pageBreak: pb(k(0)),
                    })
                    : "") +
                gap(45.35, { keepNext: true, pageBreak: !s.text?.trim() && pb(k(0)) }) +
                para(run(s.sign || ""), { borderTop: true, line: 1.5, ind: { right: CONTENT_W - 58 } })
            );
        default:
            return "";
    }
}

/** Data URL → { bytes, ext } */
function fromDataUrl(url) {
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/.exec(url || "");
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, ext: m[1] === "png" ? "png" : "jpeg" };
}

/**
 * Build the .docx.
 * @param {object} cv
 * @param {{ fit?: { k1: number, k2: number, f: number }, breakKey?: string | null }} [layout]  from the preview
 *   (CvPages onLayout), so Word has the same spacing on each page and starts page 2 at the same place as the print
 * @returns {Blob}
 */
export function cvToDocx(cv, { fit = {}, breakKey = null } = {}) {
    shapeId = 100;
    const k1 = fit.k1 ?? fit.k ?? 1;
    const k2 = fit.k2 ?? k1;
    FIT = { k: k1 * WORD_K, f: fit.f ?? 1 };
    // Called in order for every block key: at the block that starts page 2, page 2's spacing takes over and that
    // paragraph (or table part) gets "page break before".
    const pb = (key) => {
        if (!breakKey || key !== breakKey) return false;
        FIT = { ...FIT, k: k2 * WORD_K };
        return true;
    };
    const t = themes[cv.theme] ?? themes.blue;
    const photo = fromDataUrl(cv.photo);
    let body = headerXml(cv, t, !!photo);
    let first = true;
    for (const s of shownSections(cv)) {
        body += heading(s.title, t, first, pb(`${s.id}:h`)) + sectionXml(s, t, pb);
        first = false;
    }
    if (body.endsWith("</w:tbl>")) body += gap(1);
    const sect = `<w:sectPr><w:pgSz w:w="${tw(PAGE.w)}" w:h="${tw(PAGE.h)}" w:code="9"/><w:pgMar w:top="${tw(PAGE.top)}" w:right="${tw(
        PAGE.right,
    )}" w:bottom="${tw(PAGE.bottom)}" w:left="${tw(PAGE.left)}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14"><w:body>${body}${sect}</w:body></w:document>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="${hp(
        SIZES.body * FIT.f,
    )}"/><w:szCs w:val="${hp(SIZES.body * FIT.f)}"/><w:lang w:val="en-US" w:bidi="bn-BD"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${Math.round((240 * 1.45) / POPPINS_LINE)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
${photo ? `<Relationship Id="rIdPhoto" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo.${photo.ext === "png" ? "png" : "jpg"}"/>` : ""}
</Relationships>`;

    const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${x(`${cv.title || "Resume"} ${cv.name || ""}`.trim())}</dc:title><dc:creator>${x(cv.name || "")}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

    const files = {
        "[Content_Types].xml": strToU8(types),
        "_rels/.rels": strToU8(rels),
        "docProps/core.xml": strToU8(core),
        "word/document.xml": strToU8(document),
        "word/styles.xml": strToU8(styles),
        "word/settings.xml": strToU8(settings),
        "word/_rels/document.xml.rels": strToU8(docRels),
    };
    if (photo) files[`word/media/photo.${photo.ext === "png" ? "png" : "jpg"}`] = [photo.bytes, { level: 0 }];
    return new Blob([zipSync(files, { level: 6 })], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
}