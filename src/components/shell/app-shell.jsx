// src/components/shell/app-shell.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  BookOpen,
  Home,
  ListOrdered,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Tags,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { toolGroups, tools } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/actions/auth";
import { ToolIcon } from "./tool-icon";

function NavLink({ href, active, children, onClick }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
        active ? "bg-white/10 font-medium text-white" : "text-ink-300 hover:bg-white/5 hover:text-white",
      )}
    >
      {children}
    </Link>
  );
}

/** Shop accounts menu. owner: true = only the owner sees it. */
const accountLinks = [
  { href: "/accounts", label: "Overview", icon: Wallet, exact: true },
  { href: "/accounts/sale", label: "New sale", icon: ReceiptText },
  { href: "/accounts/expense", label: "New expense", icon: BookOpen },
  { href: "/accounts/entries", label: "Sales & expenses", icon: ListOrdered },
  { href: "/accounts/people", label: "Customers & dues", icon: Users },
  { href: "/accounts/reports", label: "Reports", icon: ChartColumn, owner: true },
  { href: "/accounts/prices", label: "Price list", icon: Tags },
];

function Sidebar({ user, shopName, pathname, onNavigate }) {
  return (
    <div className="flex h-full flex-col bg-ink-950 text-white">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-sm font-semibold">
          {shopName.slice(0, 1).toUpperCase()}
        </div>
        <span className="truncate text-sm font-semibold">{shopName}</span>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <div className="space-y-0.5">
          <NavLink href="/" active={pathname === "/"} onClick={onNavigate}>
            <Home className="h-4 w-4" /> All tools
          </NavLink>
        </div>
        <div>
          <p className="px-2.5 pb-1 text-[11px] font-medium text-ink-400">Shop accounts</p>
          <div className="space-y-0.5">
            {accountLinks
              .filter((l) => !l.owner || user.role === "owner")
              .map((l) => (
                <NavLink
                  key={l.href}
                  href={l.href}
                  active={l.exact ? pathname === l.href : pathname.startsWith(l.href)}
                  onClick={onNavigate}
                >
                  <l.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{l.label}</span>
                </NavLink>
              ))}
          </div>
        </div>
        {toolGroups.map((g) => (
          <div key={g.id}>
            <p className="px-2.5 pb-1 text-[11px] font-medium text-ink-400">{g.label}</p>
            <div className="space-y-0.5">
              {tools
                .filter((t) => t.group === g.id)
                .map((t) => (
                  <NavLink key={t.slug} href={`/tools/${t.slug}`} active={pathname === `/tools/${t.slug}`} onClick={onNavigate}>
                    <ToolIcon name={t.icon} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.name}</span>
                  </NavLink>
                ))}
            </div>
          </div>
        ))}
        <div className="space-y-0.5 border-t border-white/10 pt-4">
          <NavLink href="/settings" active={pathname.startsWith("/settings")} onClick={onNavigate}>
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
        </div>
      </nav>
      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="text-[11px] text-ink-400">{user.role === "owner" ? "Owner" : "Operator"}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-ink-300 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ user, shopName, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block print:hidden">
        <Sidebar user={user} shopName={shopName} pathname={pathname} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:hidden print:hidden">
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="-ml-2 rounded-lg p-2 hover:bg-ink-50"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold">{shopName}</span>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <Sidebar user={user} shopName={shopName} pathname={pathname} onNavigate={() => setOpen(false)} />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1.5 text-ink-300 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
