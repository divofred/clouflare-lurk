import { AsyncLocalStorage } from "node:async_hooks";

export class CloudflareAiError extends Error {
  constructor(message: string) { super(message); this.name = "CloudflareAiError"; }
}

export interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}
// The custom Worker and OpenNext server can bundle this module separately.
const root = globalThis as typeof globalThis & { __lurkAiScope?: AsyncLocalStorage<AiBinding | undefined> };
const aiScope = root.__lurkAiScope ??= new AsyncLocalStorage<AiBinding | undefined>();

export function withAiBinding<T>(binding: AiBinding | undefined, work: () => T): T {
  return aiScope.run(binding, work);
}

/** Both Jev and text generation use the current Worker's AI binding. */
export async function runCloudflareAi(model: string, input: unknown, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const binding = aiScope.getStore();
  if (!binding) throw new CloudflareAiError("Cloudflare AI binding is unavailable. Run the Cloudflare Worker preview or deployed Worker with its AI binding configured.");
  // The binding has no AbortSignal option. Stop waiting on timeout without retrying;
  // the underlying inference may still finish and incur usage.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return binding.run(model, input); })
      .then(resolve, (error: unknown) => {
        const message = error instanceof Error ? error.message : "";
        reject(new CloudflareAiError(message.includes("2021") || /insufficient.*credits/i.test(message)
          ? "Cloudflare reports insufficient AI credits. Check the selected model and billing configuration; saved results are retained."
          : "Cloudflare AI inference failed. Check model access and the Worker logs before retrying."));
      })
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
