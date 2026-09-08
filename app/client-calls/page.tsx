import CallsWorkspace from "../calls/calls-workspace";

// The Client lane. call-lanes.ts has always known about sales, client and
// partner, but only /calls and /partners rendered — so typing a call as Client
// Call, Coaching Call or Group Call correctly removed it from Sales and left it
// with nowhere to appear, which read as "the change didn't save".
export default function ClientCallsPage() {
  return <CallsWorkspace lane="client" />;
}
