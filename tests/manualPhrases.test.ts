import { expect, it, vi } from "vitest";
vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn() }));
import { needsSearchPhrases, searchPhrasesSchema } from "@/lib/discovery/manualPhrases";
it("rewrites paragraph seeds but preserves useful short searches", () => {
  const pain = "Businesses struggle to appear in local Google searches, track their rankings, keep business listings accurate, and manage online reviews.";
  expect(needsSearchPhrases([pain], pain)).toBe(true);
  expect(needsSearchPhrases([], pain)).toBe(true);
  expect(needsSearchPhrases(["local rank tracking", "fix business listings", "manage customer reviews"], pain)).toBe(false);
});
it("rejects a paragraph disguised as a search phrase", () => {
  expect(searchPhrasesSchema.safeParse({ phrases: ["word ".repeat(15), "local SEO help", "review management tools"] }).success).toBe(false);
});
