/** Retry one failed Clerk transport request, never a rejected authentication. */
export async function withClerkNetworkRetry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const failure = error as {
      clerkError?: boolean; status?: number;
      errors?: { code?: string; message?: string }[];
    } | null;
    if (!failure?.clerkError || failure.status != null ||
        !failure.errors?.some((entry) => entry.code === "unexpected_error" && entry.message === "fetch failed")) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    return read();
  }
}
