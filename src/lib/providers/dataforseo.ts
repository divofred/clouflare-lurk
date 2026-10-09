import { z } from "zod";
import type { GoogleResult } from "../seo/links";
import { config } from "../config";

const item = z.object({ type: z.string(), rank_absolute: z.number().optional(),
  url: z.string().optional(), title: z.string().optional(), description: z.string().nullish() });
const schema = z.object({ status_code: z.number(), cost: z.number().nonnegative(),
  tasks: z.array(z.object({ status_code: z.number(), id: z.string(),
    result: z.array(z.object({ items: z.array(item).nullable() })).nullable() })).min(1) });

export async function dataforseoSearch(query: string, timeframe?: string): Promise<{ costUsd: number; requestId: string; data: { results: GoogleResult[] } }> {
  const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = config();
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) throw new Error("Set DataForSEO API login and password before discovery or SEO scans.");
  const filters: Record<string, string> = { day: "d", week: "w", month: "m", year: "y", d: "d", w: "w", m: "m", y: "y", "7d": "w" };
  if (timeframe && !filters[timeframe]) throw new Error("Unsupported Google search timeframe.");
  const response = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
    method: "POST", headers: {
      Authorization: `Basic ${Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{ keyword: query, location_code: 2840, language_code: "en", depth: 10,
      ...(timeframe ? { search_param: `&tbs=qdr:${filters[timeframe]}` } : {}),
    }]), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`DataForSEO request failed (HTTP ${response.status}).`);
  const data = schema.parse(await response.json());
  if (data.status_code !== 20000 || data.tasks.some((task) => task.status_code !== 20000)) {
    throw new Error("DataForSEO could not complete the search. Check your API account and task status.");
  }
  return { costUsd: data.cost, requestId: data.tasks[0].id,
    data: { results: data.tasks.flatMap((task) => task.result ?? []).flatMap((result) => result.items ?? [])
      .filter((entry) => entry.type === "organic" && entry.url && entry.rank_absolute !== undefined)
      .map((entry) => ({ link: entry.url!, position: entry.rank_absolute!, title: entry.title, snippet: entry.description ?? undefined })) },
  };
}
