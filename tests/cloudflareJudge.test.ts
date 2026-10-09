import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/llm", () => ({ generateStructured: vi.fn(), LlmCapReachedError: class extends Error {} }));
import { generateStructured } from "@/lib/llm";
import { askCloudflareJudge, judgeSchema } from "@/lib/cloudflareJudge";
const questions = { fit: { type: "noul" as const, instructions: "Fits?" }, role: { type: "choice" as const, instructions: "Role?", criteria: { buyer: "Needs help", seller: "Selling" } }, level: { type: "score" as const, instructions: "Level?", criteria: ["Low", "Medium", "High"] } };
beforeEach(() => vi.clearAllMocks());
it("validates exact keys, ranges, and available choices", () => {
  const schema = judgeSchema(questions);
  const answers = { fit: { type: "noul", noul: 0.8 }, role: { type: "choice", choice: "buyer" }, level: { type: "score", score: 1.5 } };
  expect(schema.safeParse({ answers }).success).toBe(true);
  for (const changed of [{ fit: { type: "noul", noul: 2 } }, { role: { type: "choice", choice: "invented" } }, { level: { type: "score", score: 3 } }]) expect(schema.safeParse({ answers: { ...answers, ...changed } }).success).toBe(false);
  expect(schema.safeParse({ answers: {} }).success).toBe(false);
});
it("uses structured generation and preserves caller answer keys", async () => {
  const answers = { fit: { type: "noul" as const, noul: 0.9 } };
  vi.mocked(generateStructured).mockResolvedValue({ answers });
  expect(await askCloudflareJudge({ purpose: "triage", projectId: "p", state: "Need SEO", questions: { fit: questions.fit } })).toEqual(answers);
  expect(generateStructured).toHaveBeenCalledOnce();
});
it("splits large question sets into bounded calls", async () => {
  vi.mocked(generateStructured).mockImplementation(async (call) => ({ answers: Object.fromEntries(Object.keys(JSON.parse(call.prompt).questions).map((key) => [key, { type: "noul", noul: 0.5 }])) }));
  const result = await askCloudflareJudge({ purpose: "triage", projectId: "p", state: {}, questions: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`q${i}`, questions.fit])) });
  expect(Object.keys(result)).toHaveLength(25);
  expect(generateStructured).toHaveBeenCalledTimes(2);
});
it("surfaces invalid scoring instead of silently returning no leads", async () => {
  vi.mocked(generateStructured).mockRejectedValue(new Error("Invalid JSON"));
  await expect(askCloudflareJudge({ purpose: "triage", projectId: "p", state: {}, questions })).rejects.toThrow("invalid answers");
});
