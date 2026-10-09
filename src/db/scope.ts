import { AsyncLocalStorage } from "node:async_hooks";
import type { drizzle } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

type Connection = { db: ReturnType<typeof drizzle<typeof schema>>; close: () => Promise<void> };
type Scope = { connection?: Connection };
// OpenNext and the custom worker may bundle this file independently.
const root = globalThis as typeof globalThis & { __lurkDbScope?: AsyncLocalStorage<Scope> };
export const databaseScope = root.__lurkDbScope ??= new AsyncLocalStorage<Scope>();

export async function withDatabaseScope<T>(work: () => Promise<T>): Promise<T> {
  const scope: Scope = {};
  return databaseScope.run(scope, async () => {
    try { return await work(); }
    finally { await scope.connection?.close(); }
  });
}

/** Keep request connections alive until a streamed Next response finishes. */
export async function withDatabaseResponse(work: () => Promise<Response>): Promise<Response> {
  const scope: Scope = {};
  return databaseScope.run(scope, async () => {
    try {
      const response = await work();
      if (!response.body) {
        await scope.connection?.close();
        return response;
      }
      const reader = response.body.getReader();
      return new Response(new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) { controller.close(); await scope.connection?.close(); }
            else controller.enqueue(value);
          } catch (error) { controller.error(error); await scope.connection?.close(); }
        },
        async cancel(reason) { await reader.cancel(reason); await scope.connection?.close(); },
      }), { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { await scope.connection?.close(); throw error; }
  });
}
