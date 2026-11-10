// src/components/accounts/expense-form.jsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { payMethods, round2, taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { saveExpense } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card } from "@/components/ui/misc";
import { MoneyInput, PartyPicker } from "./bits";
import { partyPayload } from "./sale-form";

export function ExpenseForm({ expenseTypes, today }) {
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paidTouched, setPaidTouched] = useState(false);
  const [method, setMethod] = useState("cash");
  const [party, setParty] = useState(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(null);
  const [pending, start] = useTransition();

  const paidNow = paidTouched ? paid : amount;
  const owed = round2((Number.isNaN(amount) ? 0 : amount) - (Number.isNaN(paidNow) ? 0 : paidNow));

  const submit = () => {
    setErrors({});
    start(async () => {
      const res = await saveExpense({
        date,
        category,
        amount: Number.isNaN(amount) ? -1 : amount,
        paid: Number.isNaN(paidNow) ? -1 : paidNow,
        method,
        ...partyPayload(party),
        note,
      });
      if (!res.ok) {
        setErrors(res.fieldErrors || {});
        toast(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error, "error");
        return;
      }
      toast(`Expense #${res.id} saved.`);
      setSaved({ id: res.id, amount, category });
      setCategory("");
      setAmount(0);
      setPaid(0);
      setPaidTouched(false);
      setParty(null);
      setNote("");
    });
  };

  return (
    <div className="max-w-2xl space-y-5">
      {saved ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-success-50 px-4 py-3 text-sm">
          <span className="font-medium text-success">
            Expense #{saved.id} saved — {saved.category} {taka(saved.amount)}
          </span>
          <Link href={`/accounts/entries/${saved.id}`} className="ml-auto font-medium text-brand-700 hover:underline">
            Open
          </Link>
        </div>
      ) : null}
      <Card className="space-y-5 p-5">
        <Field label="Expense type" error={errors.category}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Expense type">
            {expenseTypes.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={category === t}
                onClick={() => setCategory(t)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  category === t
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-line-strong bg-white hover:border-brand-300",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" htmlFor="ex-amount" error={errors.amount}>
            <MoneyInput id="ex-amount" value={amount} onChange={setAmount} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Date" htmlFor="ex-date" error={errors.date}>
            <Input id="ex-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field
            label="Paid now"
            htmlFor="ex-paid"
            error={errors.paid}
            hint={owed > 0 ? `${taka(owed)} will be owed to the supplier` : "Paid in full"}
          >
            <MoneyInput
              id="ex-paid"
              value={paidNow}
              onChange={(v) => {
                setPaid(v);
                setPaidTouched(true);
              }}
              invalid={Boolean(errors.paid)}
            />
          </Field>
          <Field label="Paid by">
            <Segmented
              size="sm"
              options={Object.entries(payMethods).map(([value, label]) => ({ value, label }))}
              value={method}
              onChange={setMethod}
            />
          </Field>
        </div>
        <Field label={owed > 0 ? "Supplier (needed — you'll owe them)" : "Supplier / shop"}>
          <PartyPicker kind="supplier" value={party} onChange={setParty} error={errors.party || errors["newParty.name"]} />
        </Field>
        <Field label="Note" htmlFor="ex-note">
          <Textarea
            id="ex-note"
            rows={2}
            className="min-h-14"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. 2 reams A4, November electricity bill"
          />
        </Field>
        <Button variant="accent" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : "Save expense"}
        </Button>
      </Card>
      <p className="text-xs text-subtle">
        Missing an expense type? The owner can add it in{" "}
        <Link href="/accounts/prices" className="text-brand-700 hover:underline">
          Price list & settings
        </Link>
        .
      </p>
    </div>
  );
}
