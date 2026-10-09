import { sql } from "drizzle-orm";
import { db } from "@/db";
import { config } from "@/lib/config";

export const PILOT_SCAN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Repair missing schedules for existing and new pilot projects, without stacking jobs. */
export async function ensurePilotScanSchedules(now = new Date()): Promise<void> {
  if (config().DATA_PROVIDER !== "apify") return;
  await db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7348922)`);
    await tx.execute(sql`
      insert into jobs (id, kind, project_id, run_at)
      select gen_random_uuid()::text, 'scan', p.id,
        greatest(${now.toISOString()}::timestamptz,
          coalesce((select max(j.finished_at) from jobs j
            where j.project_id = p.id and j.kind in ('scan', 'backfill')),
            p.discovered_at) + interval '24 hours')
      from projects p
      where p.discovered_at is not null
        and not exists (select 1 from jobs j where j.project_id = p.id
          and j.kind in ('discovery_initial', 'backfill', 'scan') and j.finished_at is null)
    `);
  });
}
