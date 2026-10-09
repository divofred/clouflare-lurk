import { z } from "zod";
import { config } from "../config";
import type { RawPost, RawComment } from "../reddit/store";

const API = "https://api.apify.com/v2";
const ACTOR = "trudax~reddit-scraper-lite";
const runSchema = z.object({
  id: z.string(), status: z.string(), defaultDatasetId: z.string(),
  usageTotalUsd: z.number().nonnegative().optional(),
});
const itemSchema = z.object({
  dataType: z.string(), id: z.string(), url: z.url(), createdAt: z.string(),
  title: z.string().optional(), body: z.string().optional(), username: z.string().optional(),
  communityName: z.string().optional(), category: z.string().optional(),
  upVotes: z.number().optional(), numberOfComments: z.number().optional(), parentId: z.string().optional(),
}).passthrough();

export function mapApifyItems(value: unknown): { posts: RawPost[]; comments: RawComment[] } {
  const items = z.array(itemSchema).parse(value);
  const posts: RawPost[] = [];
  const comments: RawComment[] = [];
  for (const item of items) {
    const createdUtc = Date.parse(item.createdAt) / 1000;
    if (!Number.isFinite(createdUtc)) throw new Error("Apify returned an invalid Reddit timestamp.");
    const common = { id: item.id, author: item.username, body: item.body,
      score: item.upVotes, url: item.url, createdUtc };
    if (item.dataType === "post") {
      const subreddit = (item.communityName ?? item.category ?? "").replace(/^r\//, "");
      if (!subreddit || !item.title) throw new Error("Apify returned an incomplete Reddit post.");
      posts.push({ ...common, title: item.title, subreddit, numComments: item.numberOfComments });
    } else if (item.dataType === "comment") {
      comments.push({ ...common, parentId: item.parentId });
    }
  }
  return { posts, comments };
}

async function request(path: string, init: RequestInit = {}) {
  const token = config().APIFY_TOKEN;
  if (!token) throw new Error("Set APIFY_TOKEN before scanning Reddit.");
  const response = await fetch(`${API}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Apify request failed (HTTP ${response.status}).`);
  return response.json();
}

/** A failed run may still have incurred charges; expose them to the caller's ledger. */
export class ApifyRunError extends Error {
  constructor(message: string, readonly costUsd: number, readonly requestId: string) {
    super(message);
    this.name = "ApifyRunError";
  }
}

export async function apifyReddit(input: {
  query?: string; url?: string; comments?: boolean; sort?: string; timeframe?: string;
}) {
  const settings = config();
  if (input.url) {
    const url = new URL(input.url);
    if (url.protocol !== "https:" || !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(url.hostname)) {
      throw new Error("Only public HTTPS Reddit URLs can be collected.");
    }
  }
  const limit = settings.APIFY_MAX_ITEMS;
  const params = new URLSearchParams({
    waitForFinish: "30", timeout: "180", maxItems: String(limit),
    maxTotalChargeUsd: String(settings.APIFY_MAX_RUN_USD),
  });
  const created = await request(`acts/${ACTOR}/runs?${params}`, {
    method: "POST",
    body: JSON.stringify({
      ...(input.query ? { searches: [input.query] } : { startUrls: [{ url: input.url }] }),
      searchPosts: true, searchComments: false, searchCommunities: false, searchUsers: false,
      skipCommunity: true, skipUserPosts: true, skipComments: !input.comments,
      includeMediaLinks: true, includeNSFW: false,
      maxItems: limit, maxPostCount: input.comments ? 1 : limit,
      maxComments: input.comments ? limit - 1 : 0,
      sort: input.sort ?? "new", time: input.timeframe ?? "month",
    }),
  });
  let run = runSchema.parse(created.data);
  // GET waitForFinish waits server-side; never launch another paid run while polling.
  try {
    for (let attempt = 0; ["READY", "RUNNING"].includes(run.status) && attempt < 7; attempt++) {
      run = runSchema.parse((await request(`actor-runs/${run.id}?waitForFinish=30`)).data);
    }
  } catch {
    await request(`actor-runs/${run.id}/abort`, { method: "POST" }).catch(() => undefined);
    throw new ApifyRunError(`Could not confirm Apify run ${run.id}. Check the run before retrying.`, settings.APIFY_MAX_RUN_USD, run.id);
  }
  if (["READY", "RUNNING"].includes(run.status)) {
    await request(`actor-runs/${run.id}/abort`, { method: "POST" }).catch(() => undefined);
    throw new ApifyRunError(`Apify run ${run.id} has not finished. Recover its results after it stops.`, settings.APIFY_MAX_RUN_USD, run.id);
  }
  return readRunResults(run);
}

/** Reads a completed run without launching another scrape. */
export async function recoverApifyRun(runId: string) {
  if (!/^[a-zA-Z0-9]+$/.test(runId)) throw new Error("Invalid Apify run ID.");
  const run = runSchema.parse((await request(`actor-runs/${runId}`)).data);
  if (["READY", "RUNNING", "ABORTING", "TIMING-OUT"].includes(run.status)) {
    throw new Error("Wait for the Apify run to stop before recovering it.");
  }
  return readRunResults(run);
}

async function readRunResults(run: z.infer<typeof runSchema>) {
  const costUsd = run.usageTotalUsd ?? config().APIFY_MAX_RUN_USD;
  const partial = run.status !== "SUCCEEDED";
  if (partial && !["TIMED-OUT", "ABORTED", "FAILED"].includes(run.status)) {
    throw new ApifyRunError(`Apify run ${run.id} ended with ${run.status}.`, costUsd, run.id);
  }
  try {
    const raw = await request(`datasets/${run.defaultDatasetId}/items?clean=true&limit=${config().APIFY_MAX_ITEMS}`);
    const mapped = mapApifyItems(raw);
    if (partial && mapped.posts.length + mapped.comments.length === 0) {
      throw new Error("No recoverable records");
    }
    return { ...mapped, costUsd, requestId: run.id, nextCursor: null,
      warning: partial ? `Apify run ${run.id} ${run.status}; using partial results.` : undefined };
  } catch {
    throw new ApifyRunError(`Could not read usable results from Apify run ${run.id} (${run.status}).`, costUsd, run.id);
  }
}
