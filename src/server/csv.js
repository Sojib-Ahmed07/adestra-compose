// src/server/csv.js
import "server-only";

/** One CSV cell: quoted, and protected from spreadsheet formulas (=, +, -, @ at the start). */
function cell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV download that opens correctly in Excel (UTF-8 with BOM, so Bangla shows properly). */
export function csvResponse(filename, header, rows) {
  const body = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
