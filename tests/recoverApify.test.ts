import { expect, it, vi } from "vitest";
import { describeDb, makeProject, makeUser } from "./fixtures/db";
vi.mock("@/lib/providers/apify", () => ({ recoverApifyRun: vi.fn() }));

describeDb("Apify recovery", () => {
  it("recovers once without double billing and refuses a different project", async () => {
    const { db } = await import("@/db");
    const { usageLedger, candidateSources } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { recoverApifyRun } = await import("@/lib/providers/apify");
    const { saveRecoveredApifyPosts } = await import("@/lib/providers/recoverApify");
    const project = await makeProject((await makeUser()).id);
    await db().insert(usageLedger).values({ projectId: project.id, sku: "reddit.search", costUsd: "0.076", requestId: "run123", fundedBy: "house", reused: false });
    vi.mocked(recoverApifyRun).mockResolvedValue({ posts: [{ id: "recovered123", title: "Need SEO help", subreddit: "smallbusiness", createdUtc: 1700000000 }], comments: [], costUsd: 0.076, requestId: "run123", nextCursor: null, warning: "partial" });
    await saveRecoveredApifyPosts(project.id, "run123");
    await saveRecoveredApifyPosts(project.id, "run123");
    expect(await db().select().from(usageLedger).where(eq(usageLedger.projectId, project.id))).toHaveLength(1);
    expect(await db().select().from(candidateSources).where(eq(candidateSources.projectId, project.id))).toHaveLength(1);
    await expect(saveRecoveredApifyPosts("other-project", "run123")).rejects.toThrow("not recorded");
    expect(recoverApifyRun).toHaveBeenCalledTimes(2);
  });
});
