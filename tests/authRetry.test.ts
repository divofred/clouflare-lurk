import { expect, it, vi } from "vitest";
import { withClerkNetworkRetry } from "@/lib/authRetry";
const networkError = { clerkError: true, errors: [{ code: "unexpected_error", message: "fetch failed" }] };
it("recovers from one Clerk network failure", async () => {
  const read = vi.fn().mockRejectedValueOnce(networkError).mockResolvedValueOnce({ id: "user1" });
  expect(await withClerkNetworkRetry(read)).toEqual({ id: "user1" });
  expect(read).toHaveBeenCalledTimes(2);
});
it("stops after the second transport failure", async () => {
  const read = vi.fn().mockRejectedValue(networkError);
  await expect(withClerkNetworkRetry(read)).rejects.toBe(networkError);
  expect(read).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 429])("does not retry status %s", async (status) => {
  const error = { ...networkError, status };
  const read = vi.fn().mockRejectedValue(error);
  await expect(withClerkNetworkRetry(read)).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(1);
});
it("does not retry unrelated errors", async () => {
  const error = new Error("failure");
  const read = vi.fn().mockRejectedValue(error);
  await expect(withClerkNetworkRetry(read)).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(1);
});
