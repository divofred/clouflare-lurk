import { expect, it } from "vitest";
import { agencyIdentity } from "@/lib/agency";
it("shares a workspace only for explicitly approved verified accounts", () => {
  const allowed = "owner@example.com, staff@example.com";
  const owner = agencyIdentity({ email: "OWNER@example.com", verified: true }, allowed, "one");
  expect(owner).toEqual(agencyIdentity({ email: "staff@example.com", verified: true }, allowed, "one"));
  expect(owner?.clerkUserId).toBe("agency:one");
  expect(agencyIdentity({ email: "owner@example.com", verified: false }, allowed, "one")).toBeNull();
  expect(agencyIdentity({ email: "stranger@example.com", verified: true }, allowed, "one")).toBeNull();
  expect(agencyIdentity({ email: "owner@example.com", verified: true }, undefined, "one")).toBeNull();
});
