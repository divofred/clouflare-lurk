/** A dedicated workspace owner preserves the existing project authorization boundary.
 * Only verified, explicitly allowlisted identities may act for this workspace.
 * Individual Clerk sessions remain separate; no password sharing is required.
 */
export function agencyIdentity(
  identity: { email: string | null; verified: boolean },
  allowedEmails: string | undefined,
  workspaceId: string,
) {
  const allowed = (allowedEmails ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!identity.verified || !identity.email || !allowed.includes(identity.email.toLowerCase())) return null;
  return { clerkUserId: `agency:${workspaceId}`, email: null, emailVerified: false };
}
