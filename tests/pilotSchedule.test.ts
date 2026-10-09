import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobs, users } from "@/db/schema";
import { ensurePilotScanSchedules, PILOT_SCAN_INTERVAL_MS } from "@/jobs/pilotSchedule";
import { claimNextJob } from "@/jobs/runner";
import { nextRunAt } from "@/jobs/registry";
import { describeDb, makeProject, makeUser } from "./fixtures/db";

describeDb("daily Apify schedules", () => {
  const owners: string[] = [];
  beforeEach(() => vi.stubEnv("DATA_PROVIDER", "apify"));
  afterEach(async () => {
    for (const id of owners.splice(0)) await db().delete(users).where(eq(users.id, id));
    vi.unstubAllEnvs();
  });
  async function project() {
    const owner = await makeUser({ lastSeenAt: null });
    owners.push(owner.id);
    return makeProject(owner.id, { discoveredAt: new Date(Date.now() - 3 * PILOT_SCAN_INTERVAL_MS) });
  }
  async function pending(id: string) {
    return db().select().from(jobs).where(and(eq(jobs.projectId, id), eq(jobs.kind, "scan"), isNull(jobs.finishedAt)));
  }
  it("repairs old projects once under concurrent ticks and runs without a sign-in", async () => {
    const p = await project();
    const now = new Date();
    await Promise.all([ensurePilotScanSchedules(now), ensurePilotScanSchedules(now)]);
    const rows = await pending(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].runAt).toEqual(now);
    await db().update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.id, rows[0].id));
    const claimed = await claimNextJob(new Date(0));
    expect(claimed?.id).toBe(rows[0].id);
    const next = await nextRunAt(rows[0]);
    expect(next!.getTime() - Date.now()).toBeCloseTo(PILOT_SCAN_INTERVAL_MS, -2);
  });
  it("waits 24 hours after a completed sweep and preserves the queued time", async () => {
    const p = await project();
    const finishedAt = new Date();
    await db().insert(jobs).values({ kind: "backfill", projectId: p.id, finishedAt });
    await ensurePilotScanSchedules(finishedAt);
    await ensurePilotScanSchedules(new Date(finishedAt.getTime() + 1000));
    const rows = await pending(p.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].runAt.getTime()).toBe(finishedAt.getTime() + PILOT_SCAN_INTERVAL_MS);
  });
  it("does not queue a scan while the initial sweep is pending", async () => {
    const p = await project();
    await db().insert(jobs).values({ kind: "backfill", projectId: p.id });
    await ensurePilotScanSchedules();
    expect(await pending(p.id)).toHaveLength(0);
  });
  it("does not enroll other providers", async () => {
    const p = await project();
    vi.stubEnv("DATA_PROVIDER", "anyapi");
    await ensurePilotScanSchedules();
    expect(await pending(p.id)).toHaveLength(0);
  });
});
