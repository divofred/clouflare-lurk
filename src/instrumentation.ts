export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.RUN_SCHEDULER !== "true") {
    return;
  }
  const { startScheduler } = await import("./jobs/scheduler");
  startScheduler();
}

/** Production React hides render errors; keep a credential-free cause chain in server logs. */
export const onRequestError: import("next").Instrumentation.onRequestError = (error, _request, context) => {
  const causes: { name: string; code?: string; status?: number }[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current !== "object") break;
    const value = current as { name?: unknown; code?: unknown; status?: unknown; cause?: unknown };
    causes.push({
      name: typeof value.name === "string" ? value.name : "Error",
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      ...(typeof value.status === "number" ? { status: value.status } : {}),
    });
    current = value.cause;
  }
  console.error("[request-error]", JSON.stringify({ route: context.routePath, digest: error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : undefined, causes }));
};
