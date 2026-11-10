// src/components/accounts/party-forms.jsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { payMethods, taka } from "@/lib/accounts";
import { archiveParty, saveParty, savePayment } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, Segmented, useToast } from "@/components/ui/interactive";
import { MoneyInput, useQueryState } from "./bits";

/** Add / edit a customer or supplier. */
export function PartyFormButton({ party, kind = "customer", label, variant = "accent" }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { kind, name: "", phone: "", address: "", note: "" };
  const [form, setForm] = useState(party ?? empty);
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await saveParty(form);
      setErrors(res.fieldErrors || {});
      if (!res.ok) {
        if (res.error) toast(res.error, "error");
        return;
      }
      toast(party ? "Saved." : `${form.name} added.`);
      setOpen(false);
      if (party) router.refresh();
      else router.push(`/accounts/people/${res.id}`);
    });
  };

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => {
          setForm(party ?? empty);
          setErrors({});
          setOpen(true);
        }}
      >
        {label ?? (party ? "Edit" : "Add customer or supplier")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={party ? `Edit ${party.name}` : "Add customer or supplier"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Type">
            <Segmented
              options={[
                { value: "customer", label: "Customer" },
                { value: "supplier", label: "Supplier" },
              ]}
              value={form.kind}
              onChange={(v) => setForm((f) => ({ ...f, kind: v }))}
            />
          </Field>
          <Field label="Name" htmlFor="pt-name" error={errors.name}>
            <Input id="pt-name" value={form.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Phone" htmlFor="pt-phone" error={errors.phone}>
            <Input id="pt-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
          </Field>
          <Field label="Address" htmlFor="pt-addr" error={errors.address}>
            <Input id="pt-addr" value={form.address} onChange={set("address")} />
          </Field>
          <Field label="Note" htmlFor="pt-note" error={errors.note}>
            <Textarea id="pt-note" rows={2} className="min-h-14" value={form.note} onChange={set("note")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Take a payment from a customer (direction "in") or pay a supplier ("out"). */
export function PaymentForm({ party, direction, today }) {
  const toast = useToast();
  const router = useRouter();
  const owed = direction === "in" ? party.receivable : party.payable;
  const [amount, setAmount] = useState(owed);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();

  useEffect(() => setAmount(owed), [owed]);

  const submit = (print) => {
    setErrors({});
    const win = print ? window.open("about:blank", "_blank") : null;
    start(async () => {
      const res = await savePayment({
        partyId: party.id,
        direction,
        amount: Number.isNaN(amount) ? -1 : amount,
        date,
        method,
        note,
      });
      if (!res.ok) {
        win?.close();
        setErrors(res.fieldErrors || {});
        toast(res.fieldErrors ? Object.values(res.fieldErrors)[0] : res.error, "error");
        return;
      }
      if (win) win.location.href = `/print/payment/${res.id}?auto=1`;
      toast(direction === "in" ? `${taka(amount)} received from ${party.name}.` : `${taka(amount)} paid to ${party.name}.`);
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={direction === "in" ? "Amount received" : "Amount paid"} htmlFor={`pay-${direction}`} error={errors.amount}>
          <MoneyInput id={`pay-${direction}`} value={amount} onChange={setAmount} invalid={Boolean(errors.amount)} />
        </Field>
        <Field label="Date" htmlFor={`pay-date-${direction}`} error={errors.date}>
          <Input id={`pay-date-${direction}`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="How">
        <Segmented
          size="sm"
          options={Object.entries(payMethods).map(([value, label]) => ({ value, label }))}
          value={method}
          onChange={setMethod}
        />
      </Field>
      <Field label="Note" htmlFor={`pay-note-${direction}`}>
        <Input id={`pay-note-${direction}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="accent" disabled={pending} onClick={() => submit(direction === "in")}>
          {pending ? "Saving…" : direction === "in" ? "Save & print money receipt" : "Save payment"}
        </Button>
        {direction === "in" ? (
          <Button variant="outline" disabled={pending} onClick={() => submit(false)}>
            Save
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ArchivePartyButton({ id, name }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Remove from list
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${name}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await archiveParty(id);
                  if (!res.ok) return toast(res.error, "error");
                  toast(`${name} removed from the list.`);
                  router.push("/accounts/people");
                })
              }
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          They disappear from lists and search. Their old sales and payments stay in the records and reports.
        </p>
      </Modal>
    </>
  );
}

export function PeopleFilters({ q, kind, show }) {
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
      <Segmented
        size="sm"
        options={[
          { value: "all", label: "Everyone" },
          { value: "owes", label: "Owe me (baki)" },
          { value: "owed", label: "I owe" },
        ]}
        value={show}
        onChange={(v) => set({ show: v === "all" ? "" : v })}
      />
      <Select aria-label="Type" className="h-9 w-36" value={kind} onChange={(e) => set({ kind: e.target.value })}>
        <option value="">Customers & suppliers</option>
        <option value="customer">Customers</option>
        <option value="supplier">Suppliers</option>
      </Select>
      <div className="relative min-w-48 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle" />
        <Input
          aria-label="Search"
          placeholder="Name or phone"
          className="h-9 pl-9"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </div>
  );
}
