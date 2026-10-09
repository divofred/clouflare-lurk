import { afterEach, expect, it, vi } from "vitest";
import { apifyReddit, mapApifyItems, ApifyRunError } from "@/lib/providers/apify";
const post = { dataType: "post", id: "t3_abc", title: "Need a website", username: "buyer",
  communityName: "r/smallbusiness", url: "https://www.reddit.com/r/smallbusiness/comments/abc/title/",
  createdAt: "2026-10-01T00:00:00Z", body: "Who builds websites?", upVotes: 3, numberOfComments: 2 };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("retains the run ID and maximum spend when polling fails, and attempts to abort", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("APIFY_TOKEN", "test-secret");
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: {
    id: "run1", defaultDatasetId: "dataset1", status: "RUNNING",
  } })).mockRejectedValue(new Error("network unavailable"));
  vi.stubGlobal("fetch", fetch);
  const error = await apifyReddit({ query: "website" }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ApifyRunError);
  expect(error).toMatchObject({ requestId: "run1", costUsd: 0.1 });
  expect(fetch.mock.calls[2][0]).toContain("actor-runs/run1/abort");
});
it("maps documented post and comment records without inventing missing flags", () => {
  const result = mapApifyItems([post, { ...post, dataType: "comment", id: "t1_def", parentId: "t3_abc" }]);
  expect(result.posts[0]).toMatchObject({ subreddit: "smallbusiness", id: "t3_abc", numComments: 2 });
  expect(result.posts[0].isLocked).toBeUndefined();
  expect(result.comments[0].parentId).toBe("t3_abc");
  expect(() => mapApifyItems([{ ...post, createdAt: "broken" }])).toThrow();
});
it("starts one bounded run and polls it without spending on another run", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("APIFY_TOKEN", "test-secret");
  const run = { id: "run1", defaultDatasetId: "dataset1", status: "RUNNING" };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: run }))
    .mockResolvedValueOnce(Response.json({ data: { ...run, status: "SUCCEEDED", usageTotalUsd: 0.03 } }))
    .mockResolvedValueOnce(Response.json([post]));
  vi.stubGlobal("fetch", fetch);
  const result = await apifyReddit({ query: "website" });
  expect(result.costUsd).toBe(0.03);
  expect(result.requestId).toBe("run1");
  expect(fetch.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  expect(fetch.mock.calls[0][0]).toContain("maxTotalChargeUsd=0.1");
  expect(fetch.mock.calls[0][0]).not.toContain("test-secret");
  expect(JSON.parse(fetch.mock.calls[0][1].body).skipComments).toBe(true);
});
it("keeps saved posts from a timed-out run and reports partial coverage", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("APIFY_TOKEN", "test-secret");
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: {
    id: "run1", defaultDatasetId: "dataset1", status: "TIMED-OUT", usageTotalUsd: 0.076,
  } })).mockResolvedValueOnce(Response.json([post]));
  vi.stubGlobal("fetch", fetch);
  const result = await apifyReddit({ query: "local SEO" });
  expect(result.posts).toHaveLength(1);
  expect(result.costUsd).toBe(0.076);
  expect(result.warning).toContain("TIMED-OUT");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not turn an empty timed-out run into a successful empty search", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("APIFY_TOKEN", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ data: {
    id: "run1", defaultDatasetId: "dataset1", status: "TIMED-OUT", usageTotalUsd: 0.076,
  } })).mockResolvedValueOnce(Response.json([])));
  await expect(apifyReddit({ query: "local SEO" })).rejects.toMatchObject({ requestId: "run1", costUsd: 0.076 });
});
