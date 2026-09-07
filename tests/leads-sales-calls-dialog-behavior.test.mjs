import assert from "node:assert/strict";
import test, { after, afterEach, beforeEach } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/leads/sales-calls" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;
globalThis.Node = dom.window.Node;
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { default: LeadsSalesCallsPage } = await import("../app/leads/sales-calls/page.tsx");
let originalFetch;

const bookedCall = {
  id: "call-1",
  name: "Alex Example",
  email: "alex@example.com",
  phone: "+1 555 111 2222",
  call_type: "📞 Sales Call",
  call_date: "2099-09-06T12:00:00.000Z",
  confirmed: "✅ Confirmed",
  result: "🔜 Upcoming",
  showed: null,
  success: null,
  offer: null,
  deal_amount: null,
  follow_up_status: null,
  follow_up_date: null,
  follow_up_notes: null,
};

const secondBookedCall = {
  ...bookedCall,
  id: "call-2",
  name: "Blair Example",
  email: "blair@example.com",
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ calls: [bookedCall] });
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

after(() => dom.window.close());

async function renderLoadedPage() {
  const view = render(React.createElement(LeadsSalesCallsPage));
  await waitFor(() => assert.ok(view.container.querySelector("tbody tr[tabindex='0']")));
  return view;
}

function bookedRow(container) {
  const row = container.querySelector("tbody tr[tabindex='0']");
  assert.ok(row, "expected a booked sales-call row");
  return row;
}

test("dialog initially focuses Close, traps Tab in both directions, and makes its background inert", async () => {
  const { container, getByRole } = await renderLoadedPage();
  const row = bookedRow(container);
  fireEvent.click(row);

  const dialog = await waitFor(() => getByRole("dialog"));
  const close = within(dialog).getByRole("button", { name: "Close sales call editor" });
  await waitFor(() => assert.equal(document.activeElement, close));

  const background = dialog.parentElement.previousElementSibling;
  assert.equal(background.getAttribute("aria-hidden"), "true");
  assert.ok(background.hasAttribute("inert"));

  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  const focusable = [...dialog.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  assert.equal(document.activeElement, focusable.at(-1));
  fireEvent.keyDown(window, { key: "Tab" });
  assert.equal(document.activeElement, close);
});

test("Escape closes the dialog and restores the exact connected opener", async () => {
  const { container, queryByRole } = await renderLoadedPage();
  const row = bookedRow(container);
  row.focus();
  fireEvent.keyDown(row, { key: "Enter" });
  await waitFor(() => assert.ok(queryByRole("dialog")));

  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => assert.equal(queryByRole("dialog"), null));
  await waitFor(() => assert.equal(document.activeElement, row));
});

test("Close button restores the exact pointer opener while its row remains connected", async () => {
  const { container, getByRole, queryByRole } = await renderLoadedPage();
  const row = bookedRow(container);
  fireEvent.click(row);
  const dialog = await waitFor(() => getByRole("dialog"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Close sales call editor" }));
  await waitFor(() => assert.equal(queryByRole("dialog"), null));
  await waitFor(() => assert.equal(document.activeElement, row));
});

test("close restores stable search focus when an update removes the opener row", async () => {
  const { container, getByRole, queryByRole } = await renderLoadedPage();
  const row = bookedRow(container);
  fireEvent.click(row);
  const dialog = await waitFor(() => getByRole("dialog"));

  globalThis.fetch = async (_input, init = {}) => {
    assert.equal(init.method, "PATCH");
    return Response.json({ call: { ...bookedCall, booked_view_moved_off: true, booked_view_revision: "v1:test", updated_at: "2026-09-06T12:01:00.000Z" }, leadSync: { status: "unchanged" } });
  };
  fireEvent.click(within(dialog).getByRole("button", { name: "Move off booked calls" }));
  await waitFor(() => assert.equal(row.isConnected, false));

  fireEvent.click(within(dialog).getByRole("button", { name: "Close sales call editor" }));
  await waitFor(() => assert.equal(queryByRole("dialog"), null));
  const search = getByRole("searchbox", { name: "Search sales calls" });
  await waitFor(() => assert.equal(document.activeElement, search));
});


test("failed PATCH is announced as an error rather than a success status", async () => {
  const { container } = await renderLoadedPage();
  const row = bookedRow(container);
  globalThis.fetch = async (_input, init = {}) => {
    assert.equal(init.method, "PATCH");
    return Response.json({ error: "Unable to save call" }, { status: 500 });
  };

  await act(async () => {
    fireEvent.click(within(row).getByRole("button", { name: /Move off booked calls/ }));
  });

  const notice = await waitFor(() => {
    const element = [...container.querySelectorAll("[role]")].find((candidate) => candidate.textContent === "Unable to save call");
    assert.ok(element);
    return element;
  });
  assert.equal(notice.getAttribute("role"), "alert");
  assert.match(notice.className, /red/);
  assert.doesNotMatch(notice.className, /blue/);
});

test("Move off then Restore preserves an exact Rebook status through the server-owned action", async () => {
  let stored = { ...bookedCall, id: "rebook-status", name: "Rebook Status", follow_up_status: "🚀 Rebook", updated_at: "2026-09-06T12:00:00.000Z" };
  const requests = [];
  globalThis.fetch = async (_input, init = {}) => {
    if (!init.method) return Response.json({ calls: [stored] });
    const body = JSON.parse(init.body);
    requests.push(body);
    if (body.booked_view_action === "move_off") {
      stored = { ...stored, booked_view_moved_off: true, booked_view_revision: "v1:test", updated_at: "2026-09-06T12:01:00.000Z" };
    } else if (body.booked_view_action === "restore") {
      stored = { ...stored, booked_view_moved_off: false, booked_view_revision: undefined, follow_up_status: "🚀 Rebook", updated_at: "2026-09-06T12:02:00.000Z" };
    } else throw new Error("expected booked-view action");
    return Response.json({ call: stored, leadSync: { status: "unchanged" } });
  };

  const view = render(React.createElement(LeadsSalesCallsPage));
  await waitFor(() => assert.ok(view.getByText("Rebook Status")));
  const row = view.getByText("Rebook Status").closest("tr");
  assert.ok(row);
  await act(async () => { fireEvent.click(within(row).getByRole("button", { name: /Move off booked calls/ })); });
  assert.equal(view.queryByText("Rebook Status"), null);

  fireEvent.click(view.getByRole("checkbox", { name: "Show moved off / history" }));
  await waitFor(() => assert.ok(view.getByText("Rebook Status")));
  const movedRow = view.getByText("Rebook Status").closest("tr");
  assert.ok(movedRow);
  await act(async () => { fireEvent.click(within(movedRow).getByRole("button", { name: /Restore natural call view/ })); });
  assert.equal(view.queryByText("Rebook Status"), null);
  fireEvent.click(view.getByRole("checkbox", { name: "Show moved off / history" }));
  await waitFor(() => assert.ok(view.getByText("Rebook Status")));

  assert.deepEqual(requests, [
    { id: "rebook-status", booked_view_action: "move_off", expected_updated_at: "2026-09-06T12:00:00.000Z" },
    { id: "rebook-status", booked_view_action: "restore", expected_updated_at: "2026-09-06T12:01:00.000Z", booked_view_revision: "v1:test" },
  ]);
  assert.equal(stored.follow_up_status, "🚀 Rebook");
});


async function openDialogAndMutateAttendance(responseFactory) {
  const view = await renderLoadedPage();
  fireEvent.click(bookedRow(view.container));
  const dialog = await waitFor(() => view.getByRole("dialog"));
  const background = dialog.parentElement.previousElementSibling;
  assert.equal(background.getAttribute("aria-hidden"), "true");
  assert.ok(background.hasAttribute("inert"));

  globalThis.fetch = async (_input, init = {}) => {
    assert.equal(init.method, "PATCH");
    return responseFactory();
  };
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Attendance for Alex Example" }), {
    target: { value: "showed" },
  });
  return { ...view, dialog, background };
}

function assertSingleDialogFeedback(container, dialog, background, role, message) {
  const feedback = within(dialog).getByRole(role);
  assert.equal(feedback.textContent, message);
  assert.equal(feedback.getAttribute("aria-live"), role === "alert" ? "assertive" : "polite");
  assert.equal(feedback.getAttribute("aria-atomic"), "true");
  assert.equal(feedback.closest("[aria-hidden='true'], [inert]"), null);
  assert.equal(background.contains(feedback), false);
  const announcements = [...container.querySelectorAll('[role="status"], [role="alert"]')];
  assert.equal(announcements.length, 1, "expected exactly one non-conflicting announcement");
  assert.equal(announcements[0], feedback);
}

test("dialog save success is visibly announced once inside the active dialog", async () => {
  const { container, dialog, background } = await openDialogAndMutateAttendance(() => Response.json({
    call: { ...bookedCall, showed: true },
    leadSync: { status: "unchanged" },
  }));
  await waitFor(() => assertSingleDialogFeedback(
    container,
    dialog,
    background,
    "status",
    "Call saved. The linked lead already has the correct stage.",
  ));
});

test("ordinary dialog save failure is visibly announced once as an alert inside the active dialog", async () => {
  const { container, dialog, background } = await openDialogAndMutateAttendance(() => Response.json(
    { error: "Unable to save call" },
    { status: 500 },
  ));
  await waitFor(() => assertSingleDialogFeedback(container, dialog, background, "alert", "Unable to save call"));
});

test("ambiguous lead matching is visibly announced once as an alert inside the active dialog", async () => {
  const { container, dialog, background } = await openDialogAndMutateAttendance(() => Response.json({
    call: { ...bookedCall, showed: true },
    leadSync: { status: "ambiguous", count: 2, method: "email" },
  }));
  await waitFor(() => assertSingleDialogFeedback(
    container,
    dialog,
    background,
    "alert",
    "Call saved. Lead stage was not changed because 2 exact email matches were found.",
  ));
});

test("partial lead-sync outcome is visibly announced once as an alert inside the active dialog", async () => {
  const { container, dialog, background } = await openDialogAndMutateAttendance(() => Response.json({
    call: { ...bookedCall, showed: true },
    leadSync: { status: "error", message: "CRM unavailable" },
  }));
  await waitFor(() => assertSingleDialogFeedback(
    container,
    dialog,
    background,
    "alert",
    "Call saved, but the lead could not be updated: CRM unavailable",
  ));
});


test("an old dialog success cannot appear in call B or clear call B's loading state, while call B's result still appears", async () => {
  const oldMutation = deferred();
  const currentMutation = deferred();
  globalThis.fetch = async (_input, init = {}) => {
    if (!init.method) return Response.json({ calls: [bookedCall, secondBookedCall] });
    const body = JSON.parse(init.body);
    if (body.id === bookedCall.id) return oldMutation.promise;
    if (body.id === secondBookedCall.id) return currentMutation.promise;
    throw new Error(`unexpected call id ${body.id}`);
  };

  const view = render(React.createElement(LeadsSalesCallsPage));
  await waitFor(() => assert.ok(view.getByText("Alex Example")));
  fireEvent.click(view.getByText("Alex Example").closest("tr"));
  let dialog = await waitFor(() => view.getByRole("dialog"));
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Attendance for Alex Example" }), {
    target: { value: "showed" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Close sales call editor" }));

  fireEvent.click(view.getByText("Blair Example").closest("tr"));
  dialog = await waitFor(() => view.getByRole("dialog"));
  const currentAttendance = within(dialog).getByRole("combobox", { name: "Attendance for Blair Example" });
  fireEvent.change(currentAttendance, { target: { value: "showed" } });
  assert.equal(currentAttendance.disabled, true);

  await act(async () => {
    oldMutation.resolve(Response.json({
      call: { ...bookedCall, showed: true },
      leadSync: { status: "unchanged" },
    }));
    await oldMutation.promise;
  });
  assert.ok(
    !within(dialog).queryByText("Call saved. The linked lead already has the correct stage."),
    "stale call A success must not appear in call B",
  );
  assert.equal(currentAttendance.disabled, true, "stale completion must not clear the current call's loading state");

  await act(async () => {
    currentMutation.resolve(Response.json({
      call: { ...secondBookedCall, showed: true },
      leadSync: { status: "updated", stage: "Follow Up" },
    }));
    await currentMutation.promise;
  });
  await waitFor(() => assert.equal(
    within(dialog).getByRole("status").textContent,
    "Call saved. Lead moved to Follow Up.",
  ));
  assert.equal(currentAttendance.disabled, false);
});


for (const staleOutcome of [
  {
    label: "failure",
    message: "Old call A failed",
    response: () => Response.json({ error: "Old call A failed" }, { status: 500 }),
  },
  {
    label: "partial result",
    message: "Call saved, but the lead could not be updated: old CRM result",
    response: () => Response.json({
      call: { ...bookedCall, showed: true },
      leadSync: { status: "error", message: "old CRM result" },
    }),
  },
]) {
  test(`an old dialog ${staleOutcome.label} cannot appear after call B opens`, async () => {
    const oldMutation = deferred();
    globalThis.fetch = async (_input, init = {}) => {
      if (!init.method) return Response.json({ calls: [bookedCall, secondBookedCall] });
      const body = JSON.parse(init.body);
      assert.equal(body.id, bookedCall.id);
      return oldMutation.promise;
    };

    const view = render(React.createElement(LeadsSalesCallsPage));
    await waitFor(() => assert.ok(view.getByText("Alex Example")));
    fireEvent.click(view.getByText("Alex Example").closest("tr"));
    let dialog = await waitFor(() => view.getByRole("dialog"));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Attendance for Alex Example" }), {
      target: { value: "showed" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close sales call editor" }));

    fireEvent.click(view.getByText("Blair Example").closest("tr"));
    dialog = await waitFor(() => view.getByRole("dialog"));
    await act(async () => {
      oldMutation.resolve(staleOutcome.response());
      await oldMutation.promise;
    });
    await waitFor(() => assert.equal(
      view.container.querySelector("#result-call-1").disabled,
      false,
    ));

    assert.ok(!within(dialog).queryByText(staleOutcome.message));
    assert.equal(within(dialog).queryAllByRole("status").length, 0);
    assert.equal(within(dialog).queryAllByRole("alert").length, 0);
  });
}

test("closing and reopening the same call invalidates the old dialog generation", async () => {
  const oldMutation = deferred();
  globalThis.fetch = async (_input, init = {}) => {
    if (!init.method) return Response.json({ calls: [bookedCall] });
    return oldMutation.promise;
  };

  const view = render(React.createElement(LeadsSalesCallsPage));
  await waitFor(() => assert.ok(view.getByText("Alex Example")));
  fireEvent.click(view.getByText("Alex Example").closest("tr"));
  let dialog = await waitFor(() => view.getByRole("dialog"));
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Attendance for Alex Example" }), {
    target: { value: "showed" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Close sales call editor" }));

  fireEvent.click(view.getByText("Alex Example").closest("tr"));
  dialog = await waitFor(() => view.getByRole("dialog"));
  const reopenedAttendance = within(dialog).getByRole("combobox", { name: "Attendance for Alex Example" });
  assert.equal(reopenedAttendance.disabled, true);

  await act(async () => {
    oldMutation.resolve(Response.json({
      call: { ...bookedCall, showed: true },
      leadSync: { status: "unchanged" },
    }));
    await oldMutation.promise;
  });
  await waitFor(() => assert.equal(reopenedAttendance.disabled, false));

  assert.ok(!within(dialog).queryByText("Call saved. The linked lead already has the correct stage."));
  assert.equal(within(dialog).queryAllByRole("status").length, 0);
  assert.equal(within(dialog).queryAllByRole("alert").length, 0);
});
