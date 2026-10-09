import { randomUUID } from "node:crypto";
import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";

/** Reservations survive crashes and are conservatively charged until reconciled. */
export const providerBudget = pgTable("provider_budget", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  projectId: text("project_id").notNull(),
  provider: text("provider").notNull(),
  amountUsd: numeric("amount_usd", { precision: 12, scale: 6 }).notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("provider_budget_at_idx").on(t.at)]);
