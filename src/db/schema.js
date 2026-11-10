// src/db/schema.js
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** owner = full access incl. settings and team. operator = uses the tools. */
export const roleEnum = pgEnum("role", ["owner", "operator"]);

// ---------- Better Auth tables ----------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("operator"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- App tables ----------

/** key → value. Keys: "shop" ({ name, tagline, phone, address, email }), "accounts" ({ expenseTypes: string[], receiptNote }) */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Shop accounts (Batch 4) ----------
// Money is numeric(12,2) taka, read back as strings — convert with Number(). Dates are "YYYY-MM-DD" in Asia/Dhaka.

export const partyKindEnum = pgEnum("party_kind", ["customer", "supplier"]);
export const entryKindEnum = pgEnum("entry_kind", ["income", "expense"]);
export const payMethodEnum = pgEnum("pay_method", ["cash", "bkash", "nagad", "rocket", "bank", "card"]);
export const paymentDirectionEnum = pgEnum("payment_direction", ["in", "out"]);

/** Customers (they may owe us) and suppliers (we may owe them). */
export const parties = pgTable(
  "parties",
  {
    id: serial("id").primaryKey(),
    kind: partyKindEnum("kind").notNull().default("customer"),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    note: text("note").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parties_name_idx").on(t.name), index("parties_phone_idx").on(t.phone)],
);

/** The shop's services and their usual rates (used when making a sale and for the printed rate chart). */
export const priceItems = pgTable("price_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  unit: text("unit").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One sale (income) or one expense. The id is also the receipt number.
 * Sale: items = [{ name, qty, rate, amount }], total = sum of items, discount, paid → due = total − discount − paid.
 * Expense: items = [], category = expense type, total = amount, paid ≤ total (rest is owed to the supplier).
 * Never deleted: cancelling sets voidedAt / voidedBy / voidReason.
 */
export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    kind: entryKindEnum("kind").notNull(),
    partyId: integer("party_id").references(() => parties.id, { onDelete: "set null" }),
    items: jsonb("items").notNull().default([]),
    category: text("category").notNull().default(""),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
    paid: numeric("paid", { precision: 12, scale: 2 }).notNull(),
    method: payMethodEnum("method").notNull().default("cash"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    index("entries_date_idx").on(t.date),
    index("entries_party_idx").on(t.partyId),
    index("entries_kind_date_idx").on(t.kind, t.date),
  ],
);

/** Money that settles dues later: "in" = a customer pays us, "out" = we pay a supplier. */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    date: date("date", { mode: "string" }).notNull(),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    direction: paymentDirectionEnum("direction").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: payMethodEnum("method").notNull().default("cash"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [index("payments_party_idx").on(t.partyId), index("payments_date_idx").on(t.date)],
);
