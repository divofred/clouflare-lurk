import { getPlatformProxy } from "wrangler";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { projects } from "../src/db/schema";
import { withDatabaseScope } from "../src/db/scope";
import { withAiBinding, type AiBinding } from "../src/lib/cloudflareAi";
import { saveRecoveredApifyPosts } from "../src/lib/providers/recoverApify";
import { scoreRecoveredPosts } from "../src/lib/scan/backfill";
import { loadEvidence, applyRelevances, parseDestinations } from "../src/lib/discovery/store";
import { dedupeThreads, competitorsFrom } from "../src/lib/discovery/rank";
import { labelThreads } from "../src/lib/discovery/label";
import { publishFromEvidence } from "../src/lib/discovery/run";
import { manualSearchPhrases } from "../src/lib/discovery/manualPhrases";
import { productFacts } from "../src/lib/product";
import { limitsForUser } from "../src/lib/tier";

const [projectId, runId] = process.argv.slice(2);
if (!projectId || !runId) throw new Error("Usage: node --env-file=.dev.vars --import tsx scripts/review-recovered.ts PROJECT_ID RUN_ID");
// Uses your Wrangler login and AI binding, never an AI API token.
const proxy = await getPlatformProxy({ remoteBindings: true });
try {
  for (const [key, value] of Object.entries(proxy.env)) if (typeof value === "string") process.env[key] = value;
  await withAiBinding(proxy.env.AI as AiBinding, () => withDatabaseScope(async () => {
    const [project] = await db().select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new Error("Project not found.");
    const facts = productFacts(project, []);
    const destinations = parseDestinations(project.destinations);
    const threads = dedupeThreads(await loadEvidence(projectId));
    const labels = await labelThreads({ projectId, product: facts, destinations: destinations.map((d) => d.name),
      candidates: threads.map((thread) => ({ id: thread.postId, subreddit: thread.subreddit, title: thread.title, snippet: thread.snippet })),
    });
    if (labels.length < threads.length) throw new Error("AI left some saved Google results unevaluated; recovery did not finish.");
    await applyRelevances(projectId, labels);
    const recovered = await saveRecoveredApifyPosts(projectId, runId);
    const outcome = await scoreRecoveredPosts(projectId, recovered.posts, runId);
    const phrases = await manualSearchPhrases(projectId, facts);
    await db().update(projects).set({ problemPhrasings: phrases }).where(eq(projects.id, projectId));
    const { limits } = await limitsForUser(project.userId);
    await publishFromEvidence({ projectId, rows: await loadEvidence(projectId), destinations, limits,
      competitors: competitorsFrom(labels), productTexts: [project.pain ?? "", project.solution ?? ""], phrasings: phrases });
    console.log(JSON.stringify({ googleThreadsEvaluated: labels.length, ...outcome, searchPhrases: phrases }));
  }));
} finally { await proxy.dispose(); }
