import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { providerBudget } from "@/db/schema";
import { config } from "../config";

export async function reserveProviderSpend(projectId: string, provider: string, maximum: number) {
  const settings = config();
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return db().transaction(async (tx) => {
    // Every instance takes the same transaction lock before checking and reserving.
    await tx.execute(sql`select pg_advisory_xact_lock(7348921)`);
    const [spent] = await tx.select({
      month: sql<string>`coalesce(sum(${providerBudget.amountUsd}), 0)`,
      day: sql<string>`coalesce(sum(${providerBudget.amountUsd}) filter (where ${providerBudget.at} >= ${day.toISOString()}), 0)`,
      project: sql<string>`coalesce(sum(${providerBudget.amountUsd}) filter (where ${providerBudget.projectId} = ${projectId}), 0)`,
    }).from(providerBudget).where(gte(providerBudget.at, month));
    if (Number(spent.month) + maximum > settings.DATA_MONTHLY_CAP_USD ||
        Number(spent.day) + maximum > settings.HOUSE_DATA_CAP_USD_PER_DAY ||
        Number(spent.project) + maximum > settings.PROJECT_DATA_MONTHLY_CAP_USD) {
      throw new Error("The agency or client data budget cannot cover another run. Raise the budget or wait for the next period.");
    }
    const [reservation] = await tx.insert(providerBudget).values({
      projectId, provider, amountUsd: maximum.toFixed(6),
    }).returning();
    return reservation.id;
  });
}

export async function settleProviderSpend(id: string, costUsd: number) {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Invalid provider cost.");
  await db().update(providerBudget).set({ amountUsd: costUsd.toFixed(6) })
    .where(and(eq(providerBudget.id, id)));
}
