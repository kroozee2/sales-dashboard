import CallsWorkspace from "../calls/calls-workspace";

// The Client lane. It existed in call-lanes.ts from the start, but nothing
// rendered it — so changing a call's type to Client Call, Coaching Call or
// Group Call removed it from Sales and left it with nowhere to appear.
export default function ClientCallsPage() {
  return <CallsWorkspace lane="client" />;
}
