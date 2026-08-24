import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createLeadsAdminClient } from "@/lib/supabase-leads";
import {
  MORNING_BRIEFS_KEY,
  linkChecklistTask,
  parseBriefDocument,
  type MorningBriefDocument,
} from "@/lib/morning-brief";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 4_000;
const MAX_RETRIES = 3;

type StoredRow = { value: string; updated_at: string };
type TaskRow = { id: string; name: string; done: boolean; status: string; due_date: string | null; owner: string | null; urgency: string | null };

async function readRow(): Promise<StoredRow | null> {
  const db = createLeadsAdminClient();
  const { data, error } = await db.from("settings").select("value, updated_at").eq("key", MORNING_BRIEFS_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return data as StoredRow | null;
}

async function compareAndSwap(mutate: (document: MorningBriefDocument) => MorningBriefDocument): Promise<MorningBriefDocument> {
  const db = createLeadsAdminClient();
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const row = await readRow();
    if (!row) throw new Error("morning brief archive not found");
    const current = parseBriefDocument(row.value);
    const next = mutate(current);
    const updatedAt = new Date(Date.now() + attempt).toISOString();
    const { data, error } = await db.from("settings")
      .update({ value: JSON.stringify(next), updated_at: updatedAt })
      .eq("key", MORNING_BRIEFS_KEY)
      .eq("updated_at", row.updated_at)
      .select("key");
    if (error) throw new Error(error.message);
    if (data?.length === 1) return next;
  }
  throw new Error("morning brief changed while saving, please retry");
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new Error("request body is too large");
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new Error("request body is too large");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("request body must be valid JSON"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("request body must be an object");
  return raw as Record<string, unknown>;
}

function exactBody(body: Record<string, unknown>, allowed: string[]) {
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`request contains unknown field: ${unknown}`);
}

function locate(document: MorningBriefDocument, briefId: string, itemId: string) {
  const brief = document.briefs.find((candidate) => candidate.id === briefId);
  if (!brief) throw new Error("brief not found");
  const item = brief.checklist.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("checklist item not found");
  return { brief, item };
}

export function deterministicTaskId(briefId: string, itemId: string): string {
  const chars = createHash("sha256").update(`salesos-morning-brief:${briefId}:${itemId}`).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function localToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function responseError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = /stale|changed while saving|immutable|already linked/.test(message) ? 409 : /required|unknown|must|too large|not found|not linked|unavailable|does not exactly match/.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    exactBody(body, ["brief_id", "item_id", "expected_revision"]);
    if (typeof body.brief_id !== "string" || typeof body.item_id !== "string" || typeof body.expected_revision !== "string") {
      throw new Error("brief_id, item_id, and expected_revision are required");
    }

    const current = parseBriefDocument((await readRow())?.value);
    const initial = locate(current, body.brief_id, body.item_id);
    const generatedTaskId = deterministicTaskId(initial.brief.id, initial.item.id);
    let linkedDocument = current;

    if (!initial.item.task_id) {
      linkedDocument = await compareAndSwap((document) => {
        const found = locate(document, initial.brief.id, initial.item.id);
        if (found.item.task_id === generatedTaskId) return document;
        if (found.item.task_id) throw new Error("checklist item is already linked to another task");
        return {
          ...document,
          briefs: document.briefs.map((candidate) => candidate.id === initial.brief.id
            ? linkChecklistTask(candidate, initial.item.id, generatedTaskId, body.expected_revision as string)
            : candidate),
        };
      });
    }

    const linked = locate(linkedDocument, initial.brief.id, initial.item.id);
    const taskId = linked.item.task_id;
    if (!taskId) throw new Error("checklist item could not be linked");
    const db = createLeadsAdminClient();
    const { data: existingTask, error: taskReadError } = await db.from("tasks")
      .select("id,name,done,status,due_date,owner,urgency")
      .eq("id", taskId)
      .eq("archived", false)
      .maybeSingle();
    if (taskReadError) throw new Error(taskReadError.message);
    let task = existingTask;

    if (!task && taskId === generatedTaskId) {
      const dueDate = linked.brief.date < localToday() ? localToday() : linked.brief.date;
      const marker = `[morning-brief:${linked.brief.id}:${linked.item.id}]`;
      const { error: insertError } = await db.from("tasks").upsert({
        id: taskId,
        name: linked.item.title,
        owner: "Andrew",
        due_date: dueDate,
        urgency: "high",
        status: linked.item.done ? "done" : "todo",
        done: linked.item.done,
        completed_at: linked.item.done ? new Date().toISOString() : null,
        archived: false,
        notes: `${marker} Created from Morning Brief · ${linked.brief.date}`,
      }, { onConflict: "id", ignoreDuplicates: true });
      if (insertError) throw new Error(insertError.message);
      const reread = await db.from("tasks")
        .select("id,name,done,status,due_date,owner,urgency")
        .eq("id", taskId)
        .eq("archived", false)
        .single();
      if (reread.error) throw new Error(reread.error.message);
      task = reread.data;
    }
    if (!task) throw new Error("linked task is unavailable");
    return NextResponse.json({ task: task as TaskRow, brief: linked.brief }, { status: initial.item.task_id ? 200 : 201 });
  } catch (error) {
    return responseError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await readBody(req);
    exactBody(body, ["brief_id", "item_id", "task_id", "expected_revision"]);
    if (typeof body.brief_id !== "string" || typeof body.item_id !== "string" || typeof body.task_id !== "string" || typeof body.expected_revision !== "string") {
      throw new Error("brief_id, item_id, task_id, and expected_revision are required");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.task_id)) {
      throw new Error("task_id must be a UUID");
    }

    const current = parseBriefDocument((await readRow())?.value);
    const { brief, item } = locate(current, body.brief_id, body.item_id);
    const db = createLeadsAdminClient();
    const { data: task, error: taskError } = await db.from("tasks")
      .select("id,name,done,status,due_date,owner,urgency")
      .eq("id", body.task_id)
      .eq("archived", false)
      .single();
    if (taskError) throw new Error(taskError.message);
    if (task.name !== item.title) throw new Error("task name does not exactly match checklist item");
    if (item.task_id && item.task_id !== task.id) throw new Error("checklist task link is immutable");

    const linkedDocument = item.task_id ? current : await compareAndSwap((document) => ({
      ...document,
      briefs: document.briefs.map((candidate) => candidate.id === brief.id
        ? linkChecklistTask(candidate, item.id, task.id, body.expected_revision as string)
        : candidate),
    }));
    const linked = locate(linkedDocument, brief.id, item.id);
    return NextResponse.json({ task: task as TaskRow, brief: linked.brief });
  } catch (error) {
    return responseError(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    exactBody(body, ["brief_id", "item_id", "done"]);
    if (typeof body.brief_id !== "string" || typeof body.item_id !== "string" || typeof body.done !== "boolean") {
      throw new Error("brief_id, item_id, and done are required");
    }
    const document = parseBriefDocument((await readRow())?.value);
    const { item } = locate(document, body.brief_id, body.item_id);
    if (!item.task_id) throw new Error("checklist item is not linked to a task");
    const db = createLeadsAdminClient();
    const { data, error } = await db.from("tasks")
      .update({
        done: body.done,
        status: body.done ? "done" : "todo",
        completed_at: body.done ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.task_id)
      .eq("archived", false)
      .select("id,name,done,status,due_date,owner,urgency")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ task: data as TaskRow });
  } catch (error) {
    return responseError(error);
  }
}
