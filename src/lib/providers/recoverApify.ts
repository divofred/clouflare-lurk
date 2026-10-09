import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { usageLedger } from "@/db/schema";
import { recoverApifyRun } from "./apify";
import { upsertPosts } from "../reddit/store";
import { recordSources } from "../scan/sources";

/** Recover only a run already billed to this project. No new scrape or second charge. */
export async function saveRecoveredApifyPosts(projectId: string, runId: string) {
  const [usage] = await db().select({ id: usageLedger.id }).from(usageLedger).where(and(
    eq(usageLedger.projectId, projectId), eq(usageLedger.requestId, runId),
    eq(usageLedger.sku, "reddit.search"),
  )).limit(1);
  if (!usage) throw new Error("This run is not recorded as a Reddit search for this project.");
  const recovered = await recoverApifyRun(runId);
  const posts = await upsertPosts(recovered.posts);
  await recordSources(projectId, posts.map((post) => ({ postId: post.id,
    sources: [{ kind: "search", key: `apify-run:${runId}`, rows: [] }],
  })));
  return { posts, warning: recovered.warning };
}
