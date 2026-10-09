import { afterEach, expect, it, vi } from "vitest";
import { dataforseoSearch } from "@/lib/providers/dataforseo";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps organic absolute rankings and the billed task cost", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused");
  vi.stubEnv("DATAFORSEO_LOGIN", "test@example.com");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  const fetch = vi.fn().mockResolvedValue(Response.json({ status_code: 20000, cost: 0.002,
    tasks: [{ id: "task1", status_code: 20000, result: [{ items: [
      { type: "paid", rank_absolute: 1, url: "https://example.com" },
      { type: "organic", rank_absolute: 3, url: "https://reddit.com/r/test/comments/abc/title", title: "test" },
    ] }] }],
  }));
  vi.stubGlobal("fetch", fetch);
  const result = await dataforseoSearch("website reddit", "7d");
  expect(result.costUsd).toBe(0.002);
  expect(result.data.results).toHaveLength(1);
  expect(result.data.results[0].position).toBe(3);
  expect(result.data.results[0].link).toBe("https://reddit.com/r/test/comments/abc/title");
  expect(JSON.parse(fetch.mock.calls[0][1].body)[0].search_param).toBe("&tbs=qdr:w");
});
