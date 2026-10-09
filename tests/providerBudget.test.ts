import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { describeDb } from "./fixtures/db";
import { reserveProviderSpend, settleProviderSpend } from "@/lib/providers/budget";
describeDb("provider budget", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("serializes concurrent purchases against the client's remaining allowance", async () => {
    vi.stubEnv("DATA_MONTHLY_CAP_USD", "100000");
    vi.stubEnv("HOUSE_DATA_CAP_USD_PER_DAY", "100000");
    vi.stubEnv("PROJECT_DATA_MONTHLY_CAP_USD", "0.1");
    const project = randomUUID();
    const attempts = await Promise.allSettled([
      reserveProviderSpend(project, "apify", 0.1), reserveProviderSpend(project, "apify", 0.1),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const success = attempts.find((result) => result.status === "fulfilled")!;
    if (success.status === "fulfilled") {
      await settleProviderSpend(success.value, 0.02);
      await expect(reserveProviderSpend(project, "apify", 0.07)).resolves.toBeTruthy();
    }
  });
});
