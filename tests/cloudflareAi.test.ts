import { expect, it, vi } from "vitest";
import { runCloudflareAi, withAiBinding } from "@/lib/cloudflareAi";

it.each(["typesafe/jev", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"])("calls %s through the binding", async (model) => {
  const expected = { answers: { fit: { type: "noul", noul: 0.8 } } };
  const run = vi.fn().mockResolvedValue(expected);
  const input = { state: "Need a website" };
  expect(await withAiBinding({ run }, () => runCloudflareAi(model, input, new AbortController().signal))).toEqual(expected);
  expect(run).toHaveBeenCalledExactlyOnceWith(model, input);
});

it("fails clearly outside a Worker binding scope", async () => {
  await expect(runCloudflareAi("typesafe/jev", {}, new AbortController().signal)).rejects.toThrow("binding is unavailable");
});

it("propagates binding errors without retrying", async () => {
  const run = vi.fn().mockRejectedValue(new Error("Model unavailable"));
  await expect(withAiBinding({ run }, () => runCloudflareAi("typesafe/jev", {}, new AbortController().signal))).rejects.toThrow("Cloudflare AI inference failed");
  expect(run).toHaveBeenCalledTimes(1);
});

it("does not start an aborted call", async () => {
  const run = vi.fn();
  const controller = new AbortController();
  controller.abort(new Error("Timed out"));
  await expect(withAiBinding({ run }, () => runCloudflareAi("typesafe/jev", {}, controller.signal))).rejects.toThrow("Timed out");
  expect(run).not.toHaveBeenCalled();
});

it("stops waiting when a running call times out", async () => {
  const run = vi.fn(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = withAiBinding({ run }, () => runCloudflareAi("typesafe/jev", {}, controller.signal));
  await Promise.resolve();
  controller.abort(new Error("Timed out"));
  await expect(pending).rejects.toThrow("Timed out");
  expect(run).toHaveBeenCalledTimes(1);
});

it("explains insufficient credits instead of treating them as no relevant leads", async () => {
  const run = vi.fn().mockRejectedValue(new Error("2021: Insufficient AI Gateway credits"));
  await expect(withAiBinding({ run }, () => runCloudflareAi("typesafe/jev", {}, new AbortController().signal)))
    .rejects.toThrow("insufficient AI credits");
  expect(run).toHaveBeenCalledTimes(1);
});
