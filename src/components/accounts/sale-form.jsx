// src/components/accounts/sale-form.jsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Printer, Trash2 } from "lucide-react";
import { payMethods, round2, taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { saveSale } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card } from "@/components/ui/misc";
import { MoneyInput, PartyPicker } from "./bits";

let nextKey = 1;
const blankLine = () => ({ key: nextKey++, name: "", qty: 1, rate: 0 });

/** Turn the picker value into what the server expects. */
export function partyPayload(v) {
  if (v?.party) return { partyId: v.party.id, newParty: null };
  if (v?.newParty?.name?.trim()) return { partyId: null, newParty: v.newParty };
  return { partyId: null, newParty: null };
}

export function SaleForm({ priceList, today }) {
  const toast = useToast();
  const [lines, setLines] = useState([]);
  const [date, setDate] = useState(today);
  const [party, setParty] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paidTouched, setPaidTouched] = useState(false);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(null);
  const [pending, start] = useTransition();

  const total = useMemo(() => round2(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0)), [lines]);
  const net = round2(total - (Number.isNaN(discount) ? 0 : discount));
  const paidNow = paidTouched ? paid : net; // follows the total until changed by hand
  const due = round2(net - (Number.isNaN(paidNow) ? 0 : paidNow));

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addItem = (item) =>
    setLines((ls) => {
      const same = ls.find((l) => l.name === item.name && l.rate === item.price);
      if (same) return ls.map((l) => (l === same ? { ...l, qty: round2(Number(l.qty) + 1) } : l));
      return [...ls, { key: nextKey++, name: item.name, qty: 1, rate: item.price }];
    });

  const reset = () => {
    setLines([]);
    setParty(null);
    setDiscount(0);
    setPaid(0);
    setPaidTouched(false);
    setMethod("cash");
    setNote("");
    setErrors({});
  };

  const submit = (print) => {
    setErrors({});
    // Open the tab now (during the click) — browsers block pop-ups opened later.
    const win = print ? window.open("about:blank", "_blank") : null;
    const items = lines.filter((l) => l.name.trim() || Number(l.rate));
    start(async () => {
      const res = await saveSale({
        date,
        ...partyPayload(party),
        items: items.map((l) => ({ name: l.name.trim(), qty: Number(l.qty), rate: Number(l.rate) })),
        discount: Number.isNaN(discount) ? -1 : discount,
        paid: Number.isNaN(paidNow) ? -1 : paidNow,
        method,
        note,
      });
      if (!res.ok) {
        win?.close();
        setErrors(res.fieldErrors || {});
        toast(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error, "error");
        return;
      }
      setSaved({ id: res.id, total: net, due });
      toast(`Sale #${res.id} saved.`);
      if (win) win.location.href = `/print/receipt/${res.id}?auto=1`;
      reset();
    });
  };

  const lineError = (i, f) => errors[`items.${i}.${f}`];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-5">
        {saved ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-success-50 px-4 py-3 text-sm">
            <span className="font-medium text-success">
              Sale #{saved.id} saved — {taka(saved.total)}
            </span>
            {saved.due > 0 ? <span className="text-warn">Baki {taka(saved.due)}</span> : null}
            <span className="ml-auto flex gap-2">
              <a
                href={`/print/receipt/${saved.id}`}
                target="_blank"
                rel="noopener"
                className="font-medium text-brand-700 hover:underline"
              >
                Print receipt
              </a>
              <Link href={`/accounts/entries/${saved.id}`} className="font-medium text-brand-700 hover:underline">
                Open
              </Link>
            </span>
          </div>
        ) : null}

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Tap a service to add it</h2>
          {priceList.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {priceList.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="rounded-xl border border-line bg-white px-3 py-2 text-left text-sm hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="block font-medium">{p.name}</span>
                  <span className="tabular block text-xs text-muted">
                    {taka(p.price)}
                    {p.unit ? ` / ${p.unit}` : ""}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Your price list is empty. Add your services in{" "}
              <Link href="/accounts/prices" className="font-medium text-brand-700 hover:underline">
                Price list
              </Link>{" "}
              to add them here with one tap, or type lines below.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Items</h2>
            <Button size="sm" variant="outline" onClick={() => setLines((l) => [...l, blankLine()])}>
              <Plus className="h-3.5 w-3.5" /> Add a line
            </Button>
          </div>
          {lines.length ? (
            <div className="space-y-2">
              <div className="hidden grid-cols-[1fr_80px_120px_100px_36px] gap-2 px-1 text-xs text-muted sm:grid">
                <span>Item</span>
                <span>Qty</span>
                <span>Rate</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              {lines.map((l, i) => (
                <div
                  key={l.key}
                  className="grid grid-cols-[1fr_80px] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_80px_120px_100px_36px] sm:items-center sm:border-0 sm:p-0"
                >
                  <Input
                    aria-label={`Item ${i + 1}`}
                    placeholder="e.g. Photocopy"
                    value={l.name}
                    onChange={(e) => setLine(l.key, { name: e.target.value })}
                    className={cn("col-span-2 sm:col-span-1", lineError(i, "name") && "border-danger")}
                    autoFocus={!l.name && i === lines.length - 1}
                  />
                  <Input
                    aria-label={`Quantity ${i + 1}`}
                    inputMode="decimal"
                    value={l.qty}
                    onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d)) })}
                    className={cn("tabular", lineError(i, "qty") && "border-danger")}
                  />
                  <MoneyInput aria-label={`Rate ${i + 1}`} value={l.rate} onChange={(v) => setLine(l.key, { rate: v })} />
                  <p className="tabular self-center text-right text-sm font-medium">
                    {taka((Number(l.qty) || 0) * (Number(l.rate) || 0))}
                  </p>
                  <button
                    type="button"
                    aria-label={`Remove line ${i + 1}`}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="justify-self-end rounded-lg p-2 text-subtle hover:bg-danger-50 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-subtle">No items yet.</p>
          )}
          {errors.items ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errors.items}
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-6">
        <Field label="Date" htmlFor="sale-date" error={errors.date}>
          <Input id="sale-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Customer">
          <PartyPicker kind="customer" value={party} onChange={setParty} error={errors.party || errors["newParty.name"]} />
        </Field>

        <dl className="space-y-2 rounded-xl bg-paper p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Total</dt>
            <dd className="tabular font-medium">{taka(total)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Discount</dt>
            <dd className="w-32">
              <MoneyInput
                aria-label="Discount"
                value={discount}
                onChange={setDiscount}
                invalid={Boolean(errors.discount)}
                className="h-9"
              />
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base">
            <dt className="font-semibold">To pay</dt>
            <dd className="tabular font-semibold">{taka(net)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Paid now</dt>
            <dd className="w-32">
              <MoneyInput
                aria-label="Paid now"
                value={paidNow}
                onChange={(v) => {
                  setPaid(v);
                  setPaidTouched(true);
                }}
                invalid={Boolean(errors.paid)}
                className="h-9"
              />
            </dd>
          </div>
          <div className="flex justify-end gap-3 text-xs">
            <button
              type="button"
              className="font-medium text-brand-700 hover:underline"
              onClick={() => {
                setPaidTouched(false);
              }}
            >
              Paid in full
            </button>
            <button
              type="button"
              className="font-medium text-warn hover:underline"
              onClick={() => {
                setPaid(0);
                setPaidTouched(true);
              }}
            >
              All baki
            </button>
          </div>
          <div className={cn("flex justify-between border-t border-line pt-2", due > 0 ? "text-warn" : "text-success")}>
            <dt className="font-medium">{due > 0 ? "Baki (due)" : due < 0 ? "Change to give" : "Fully paid"}</dt>
            <dd className="tabular font-semibold">{taka(Math.abs(due))}</dd>
          </div>
        </dl>
        {errors.discount || errors.paid ? (
          <p role="alert" className="text-sm text-danger">
            {errors.discount || errors.paid}
          </p>
        ) : null}

        <Field label="Paid by">
          <Segmented
            size="sm"
            options={Object.entries(payMethods).map(([value, label]) => ({ value, label }))}
            value={method}
            onChange={setMethod}
          />
        </Field>
        <Field label="Note" htmlFor="sale-note">
          <Textarea
            id="sale-note"
            rows={2}
            className="min-h-14"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" className="flex-1" disabled={pending || !lines.length} onClick={() => submit(true)}>
            <Printer className="h-4 w-4" /> {pending ? "Saving…" : "Save & print"}
          </Button>
          <Button variant="outline" disabled={pending || !lines.length} onClick={() => submit(false)}>
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
