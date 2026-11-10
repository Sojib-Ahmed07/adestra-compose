// src/components/accounts/price-editor.jsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { taka } from "@/lib/accounts";
import { cn } from "@/lib/utils";
import { deletePriceItem, movePriceItem, saveAccountSettings, savePriceItem } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/interactive";
import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { MoneyInput } from "./bits";

const blank = { name: "", price: 0, unit: "", active: true };

export function PriceEditor({ items, canEdit }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(null); // item | "new" | null
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();

  const open = (item) => {
    setEditing(item ?? "new");
    setForm(item ? { ...item } : blank);
    setErrors({});
  };

  const run = (fn, ok) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors || {});
        if (res.error) toast(res.error, "error");
        return;
      }
      if (ok) toast(ok);
      setEditing(null);
      router.refresh();
    });

  const save = (e) => {
    e.preventDefault();
    run(
      () =>
        savePriceItem({
          ...form,
          id: editing === "new" ? undefined : editing.id,
          price: Number.isNaN(form.price) ? -1 : form.price,
        }),
      "Saved.",
    );
  };

  const formRow = (
    <form
      onSubmit={save}
      className="grid gap-3 border-b border-line bg-paper px-4 py-4 sm:grid-cols-[1fr_140px_140px_auto] sm:items-end"
    >
      <Field label="Service" htmlFor="pi-name" error={errors.name}>
        <Input
          id="pi-name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Photocopy (A4)"
          autoFocus
        />
      </Field>
      <Field label="Price" htmlFor="pi-price" error={errors.price}>
        <MoneyInput id="pi-price" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} />
      </Field>
      <Field label="Per" htmlFor="pi-unit" error={errors.unit}>
        <Input
          id="pi-unit"
          value={form.unit}
          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          placeholder="page, copy, set…"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox label="Show" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => setEditing(null)}
          className="rounded-lg p-2 text-muted hover:bg-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader
        title="Price list"
        description="Shown as one-tap buttons on New sale, and on the printed rate chart."
        action={
          <div className="flex gap-2">
            <a
              href="/print/rates"
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[13px] font-medium hover:bg-ink-50"
            >
              Print rate chart
            </a>
            {canEdit ? (
              <Button size="sm" onClick={() => open(null)}>
                <Plus className="h-3.5 w-3.5" /> Add service
              </Button>
            ) : null}
          </div>
        }
      />
      {editing === "new" ? formRow : null}
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((it, i) =>
            editing && editing !== "new" && editing.id === it.id ? (
              <li key={it.id}>{formRow}</li>
            ) : (
              <li key={it.id} className={cn("flex items-center gap-3 px-4 py-2.5", !it.active && "opacity-50")}>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{it.name}</span>
                  {!it.active ? <Badge className="ml-2">Hidden</Badge> : null}
                </span>
                <span className="tabular text-sm font-medium">
                  {taka(it.price)}
                  {it.unit ? <span className="font-normal text-muted"> / {it.unit}</span> : null}
                </span>
                {canEdit ? (
                  <span className="flex gap-0.5">
                    <IconBtn label="Move up" disabled={i === 0 || pending} onClick={() => run(() => movePriceItem(it.id, "up"))}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label="Move down"
                      disabled={i === items.length - 1 || pending}
                      onClick={() => run(() => movePriceItem(it.id, "down"))}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label={`Edit ${it.name}`} onClick={() => open(it)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label={`Remove ${it.name}`}
                      danger
                      disabled={pending}
                      onClick={() => run(() => deletePriceItem(it.id), `${it.name} removed.`)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </span>
                ) : null}
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-subtle">
          {canEdit ? "No services yet. Add your first one." : "The owner hasn't added services yet."}
        </p>
      )}
    </Card>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted hover:bg-ink-50 disabled:opacity-30",
        danger && "hover:bg-danger-50 hover:text-danger",
      )}
    >
      {children}
    </button>
  );
}

export function AccountSettingsForm({ expenseTypes, receiptNote }) {
  const toast = useToast();
  const router = useRouter();
  const [types, setTypes] = useState(expenseTypes);
  const [newType, setNewType] = useState("");
  const [note, setNote] = useState(receiptNote);
  const [pending, start] = useTransition();

  const add = () => {
    const t = newType.trim();
    if (t && !types.includes(t)) setTypes([...types, t]);
    setNewType("");
  };

  const save = () =>
    start(async () => {
      const res = await saveAccountSettings({ expenseTypes: types, receiptNote: note });
      if (!res.ok) return toast(res.error || "Couldn't save.", "error");
      toast("Saved.");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title="Expense types and receipt" />
      <div className="space-y-5 p-5">
        <Field label="Expense types">
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-white py-1 pr-1 pl-3 text-sm"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => setTypes(types.filter((x) => x !== t))}
                  className="rounded-full p-1 text-subtle hover:bg-danger-50 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="New expense type"
              placeholder="Add a type, e.g. Generator fuel"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className="max-w-xs"
            />
            <Button variant="outline" onClick={add} disabled={!newType.trim()}>
              Add
            </Button>
          </div>
        </Field>
        <Field label="Line at the bottom of receipts" htmlFor="rc-note" hint="e.g. Thank you. Please come again.">
          <Textarea id="rc-note" rows={2} className="min-h-14" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button onClick={save} disabled={pending || !types.length}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
