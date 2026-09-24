export type WorkforceMember = {
  role: string;
  active: boolean;
} | null;

/**
 * Who may read the workforce, and who may change it.
 *
 * Reading is open to anyone already signed in to Sales OS. The app's proxy has
 * gated that at the door, and the team seeing what the agents are is the point
 * of the boards. It used to require an owner account, which meant the workforce
 * was invisible to everyone except Andrew.
 *
 * Writing stays with an active owner. A PUT replaces the whole workforce
 * document, so one bad save takes every agent definition with it.
 */
export function agentWorkforceAuthorization(
  member: WorkforceMember,
  mode: "read" | "write" = "write",
): { status: 401 | 403; error: string } | null {
  if (mode === "read") return null;
  if (!member) return { status: 401, error: "Sign in with an owner account." };
  if (!member.active || member.role !== "owner") {
    return { status: 403, error: "Only an active owner can change the AI workforce." };
  }
  return null;
}
