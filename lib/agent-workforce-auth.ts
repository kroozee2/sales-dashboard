export type WorkforceMember = {
  role: string;
  active: boolean;
} | null;

export function agentWorkforceAuthorization(member: WorkforceMember): { status: 401 | 403; error: string } | null {
  if (!member) return { status: 401, error: "Sign in with an owner account." };
  if (!member.active || member.role !== "owner") {
    return { status: 403, error: "Only an active owner can access the AI workforce." };
  }
  return null;
}
