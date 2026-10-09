import { withDatabaseScope } from "../src/db/scope";
import { saveRecoveredApifyPosts } from "../src/lib/providers/recoverApify";

const [projectId, runId] = process.argv.slice(2);
if (!projectId || !runId) throw new Error("Usage: node --env-file=.dev.vars --import tsx scripts/recover-apify.ts PROJECT_ID RUN_ID");
await withDatabaseScope(async () => {
  const result = await saveRecoveredApifyPosts(projectId, runId);
  console.log(JSON.stringify({ storedPosts: result.posts.length, warning: result.warning, scoring: "pending" }));
});
