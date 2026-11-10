// src/components/settings/settings-view.jsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMember,
  changeMyPassword,
  resetMemberPassword,
  saveShop,
  setMemberActive,
  setMemberRole,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal, Segmented, useToast } from "@/components/ui/interactive";
import { Badge, Card, CardHeader } from "@/components/ui/misc";

export function SettingsView({ isOwner, me, shop, team }) {
  const [tab, setTab] = useState(isOwner ? "shop" : "password");
  const tabs = isOwner
    ? [
        { value: "shop", label: "Shop details" },
        { value: "team", label: "Team" },
        { value: "password", label: "My password" },
      ]
    : [{ value: "password", label: "My password" }];

  return (
    <div className="space-y-5">
      {tabs.length > 1 ? <Segmented options={tabs} value={tab} onChange={setTab} /> : null}
      {tab === "shop" && isOwner ? <ShopForm shop={shop} /> : null}
      {tab === "team" && isOwner ? <Team team={team} me={me} /> : null}
      {tab === "password" ? <PasswordForm /> : null}
    </div>
  );
}

function ShopForm({ shop }) {
  const toast = useToast();
  const router = useRouter();
  const [form, setForm] = useState({
    name: shop.name,
    tagline: shop.tagline,
    phone: shop.phone,
    email: shop.email,
    address: shop.address,
  });
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await saveShop(form);
      setErrors(res.fieldErrors || {});
      if (res.ok) {
        toast("Shop details saved.");
        router.refresh();
      } else if (res.error) toast(res.error, "error");
    });
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Shop details"
        description="Shown in the menu, on the sign-in page, and on printouts that carry the shop name."
      />
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Shop name" htmlFor="s-name" error={errors.name} className="sm:col-span-2">
          <Input id="s-name" value={form.name} onChange={set("name")} />
        </Field>
        <Field
          label="Tagline"
          htmlFor="s-tag"
          error={errors.tagline}
          className="sm:col-span-2"
          hint="e.g. Photo · Print · Computer"
        >
          <Input id="s-tag" value={form.tagline} onChange={set("tagline")} />
        </Field>
        <Field label="Phone" htmlFor="s-phone" error={errors.phone}>
          <Input id="s-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email" htmlFor="s-email" error={errors.email}>
          <Input id="s-email" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Address" htmlFor="s-addr" error={errors.address} className="sm:col-span-2">
          <Textarea id="s-addr" rows={2} value={form.address} onChange={set("address")} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save shop details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Team({ team, me }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [resetFor, setResetFor] = useState(null);

  const run = (fn, done) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast(done);
        router.refresh();
      } else toast(res.error || "Couldn't update.", "error");
    });

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Team"
        description="Owners can change settings and the team. Operators use the tools."
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            Add person
          </Button>
        }
      />
      <ul className="divide-y divide-line">
        {team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                {m.name}
                {m.id === me.id ? <Badge>You</Badge> : null}
                {!m.active ? <Badge tone="danger">Switched off</Badge> : null}
              </p>
              <p className="truncate text-xs text-muted">{m.email}</p>
            </div>
            <Select
              aria-label={`Role for ${m.name}`}
              className="h-9 w-32"
              value={m.role}
              disabled={pending || m.id === me.id}
              onChange={(e) => run(() => setMemberRole(m.id, e.target.value), "Role changed.")}
            >
              <option value="operator">Operator</option>
              <option value="owner">Owner</option>
            </Select>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => setResetFor(m)}>
              New password
            </Button>
            {m.id !== me.id ? (
              <Button
                size="sm"
                variant={m.active ? "ghost" : "subtle"}
                disabled={pending}
                onClick={() =>
                  run(
                    () => setMemberActive(m.id, !m.active),
                    m.active ? `${m.name} can no longer sign in.` : `${m.name} can sign in again.`,
                  )
                }
              >
                {m.active ? "Switch off" : "Switch on"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <AddMemberModal open={adding} onClose={() => setAdding(false)} />
      <ResetPasswordModal member={resetFor} onClose={() => setResetFor(null)} />
    </Card>
  );
}

function AddMemberModal({ open, onClose }) {
  const toast = useToast();
  const router = useRouter();
  const empty = { name: "", email: "", password: "", role: "operator" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setForm(empty);
    setErrors({});
    onClose();
  };
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await addMember(form);
      setErrors(res.fieldErrors || {});
      if (res.ok) {
        toast(`${form.name} can sign in now with ${form.email}.`);
        router.refresh();
        close();
      } else if (res.error) toast(res.error, "error");
    });
  };

  return (
    <Modal open={open} onClose={close} title="Add person">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="m-name" error={errors.name}>
          <Input id="m-name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email (used to sign in)" htmlFor="m-email" error={errors.email}>
          <Input id="m-email" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" htmlFor="m-pass" error={errors.password} hint="At least 8 characters. Tell them in person.">
          <Input id="m-pass" value={form.password} onChange={set("password")} autoComplete="new-password" />
        </Field>
        <Field label="Role" htmlFor="m-role">
          <Select id="m-role" value={form.role} onChange={set("role")}>
            <option value="operator">Operator — uses the tools</option>
            <option value="owner">Owner — can also change settings and the team</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add person"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ member, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const close = () => {
    setPassword("");
    setError("");
    onClose();
  };
  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await resetMemberPassword(member.id, password);
      if (res.ok) {
        toast(`New password set for ${member.name}.`);
        close();
      } else {
        setError(res.fieldErrors?.password || "");
        if (res.error) toast(res.error, "error");
      }
    });
  };

  return (
    <Modal open={Boolean(member)} onClose={close} title={member ? `New password for ${member.name}` : ""}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" htmlFor="r-pass" error={error} hint="They'll be signed out and must use the new password.">
          <Input id="r-pass" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Set password"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordForm() {
  const toast = useToast();
  const empty = { currentPassword: "", newPassword: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [pending, start] = useTransition();
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    start(async () => {
      const res = await changeMyPassword(form);
      setErrors(res.fieldErrors || {});
      if (res.ok) {
        toast("Password changed. Other devices were signed out.");
        setForm(empty);
      } else if (res.error) toast(res.error, "error");
    });
  };

  return (
    <Card className="max-w-md">
      <CardHeader title="My password" />
      <form onSubmit={submit} className="space-y-4 p-5">
        <Field label="Current password" htmlFor="p-cur" error={errors.currentPassword}>
          <Input
            id="p-cur"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={set("currentPassword")}
          />
        </Field>
        <Field label="New password" htmlFor="p-new" error={errors.newPassword} hint="At least 8 characters.">
          <Input id="p-new" type="password" autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} />
        </Field>
        <Field label="New password again" htmlFor="p-conf" error={errors.confirm}>
          <Input id="p-conf" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
