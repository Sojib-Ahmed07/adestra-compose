// src/components/shell/tool-hub.jsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { toolGroups, tools } from "@/lib/tools";
import { ToolIcon } from "./tool-icon";

export function ToolHub() {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const found = useMemo(
    () =>
      query ? tools.filter((t) => `${t.name} ${t.bangla} ${t.description} ${t.keywords}`.toLowerCase().includes(query)) : tools,
    [query],
  );

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tools — e.g. passport, signature, বয়স"
          aria-label="Search tools"
          className="h-11 w-full rounded-xl border border-line-strong bg-white pr-3 pl-9 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>

      {found.length === 0 ? <p className="text-sm text-muted">No tool matches “{q}”.</p> : null}

      {toolGroups.map((g) => {
        const list = found.filter((t) => t.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id}>
            <h2 className="mb-3 text-sm font-semibold text-ink-900">
              {g.label} <span className="font-bangla font-normal text-muted">· {g.bangla}</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => (
                <Link
                  key={t.slug}
                  href={`/tools/${t.slug}`}
                  className="group flex min-w-0 gap-3 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-lift)] transition hover:border-brand-200 hover:shadow-[var(--shadow-float)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white">
                    <ToolIcon name={t.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                    <p className="font-bangla text-xs text-muted">{t.bangla}</p>
                    <p className="mt-1.5 text-[13px] leading-snug text-muted">{t.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
