// src/components/accounts/entry-filters.jsx
"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { payMethods } from "@/lib/accounts";
import { Input, Select } from "@/components/ui/form";
import { RangePicker, useQueryState } from "./bits";

export function EntryFilters({ range, from, to, kind, method, staff, status, q, staffList }) {
  const { set, pending } = useQueryState();
  const [text, setText] = useState(q);
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => set({ q: text }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <RangePicker range={range} from={from} to={to} />
      <Select aria-label="Type" className="h-9 w-32" value={kind} onChange={(e) => set({ kind: e.target.value })}>
        <option value="">Sales & expenses</option>
        <option value="income">Sales</option>
        <option value="expense">Expenses</option>
      </Select>
      <Select aria-label="Paid by" className="h-9 w-32" value={method} onChange={(e) => set({ method: e.target.value })}>
        <option value="">Any payment</option>
        {Object.entries(payMethods).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      {staffList ? (
        <Select aria-label="Entered by" className="h-9 w-36" value={staff} onChange={(e) => set({ staff: e.target.value })}>
          <option value="">Anyone</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : null}
      <Select aria-label="Status" className="h-9 w-32" value={status} onChange={(e) => set({ status: e.target.value })}>
        <option value="active">Not cancelled</option>
        <option value="voided">Cancelled</option>
        <option value="all">All</option>
      </Select>
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Search"
          placeholder="Search item, name, phone or #"
          className="h-9 pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  );
}
