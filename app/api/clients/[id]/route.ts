import { NextResponse } from "next/server";
import { helmDb } from "@/lib/helm-clients";
import {
  EMPTY_DETAIL, shapeCalls, shapeCashGoals, shapeCheckIns, shapeGraphics, shapeNotes,
  shapeProjects, shapeProof, shapeTickets, shapeTodos, type ClientDetail,
} from "@/lib/client-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything about one client, from the client's own record.
 *
 * Eight tables in one round trip rather than eight requests from the browser:
 * the drawer opens once and fills once. A section that fails is empty rather
 * than fatal — one missing table should not blank the whole client.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT = 200;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not a client id" }, { status: 400 });

  const connection = await helmDb();
  if (!connection.ok) {
    return NextResponse.json(
      { error: connection.reason === "auth"
        ? "The client database rejected our sign-in."
        : "The client database is not connected." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const db = connection.db;
  const forClient = (table: string, columns: string, order: string, ascending = false) =>
    db.from(table).select(columns).eq("client_id", id).order(order, { ascending, nullsFirst: false }).limit(LIMIT);

  const [graphics, calls, todos, checkIns, cashGoals, projects, proof, testimonials, tickets, notes] = await Promise.all([
    db.from("clients")
      .select("headshot_url,welcome_square_url,welcome_story_url,welcome_message,welcome_caption,skool_url,socials")
      .eq("id", id).maybeSingle(),
    forClient("calls", "id,title,call_date,starts_at,is_group,status,attended,fathom_url,ai_summary,ai_next_steps", "call_date"),
    forClient("todos", "id,title,description,due_date,done,owner,status,urgency", "created_at"),
    forClient("check_ins", "id,month_label,month_date,cash_collected,new_revenue,nps,sales_calls_booked,stop,start,favorite", "month_date"),
    forClient("client_cash_goals", "id,year,month,goal", "year"),
    forClient("client_projects", "id,name,note,done,due_date,kind,is_focus", "created_at"),
    forClient("proof_items", "id,headline,proof_point,one_liner,story,raw_input,video_url,image_urls,source,created_at", "created_at"),
    forClient("testimonials", "id,content,format,source,date,media_url,created_at", "created_at"),
    forClient("support_tickets", "id,type,status,message,submitted_at,resolved_at", "submitted_at"),
    forClient("client_notes", "id,body,category,pinned,created_at", "created_at"),
  ]);

  const rows = (result: { data: unknown }) => (result.data ?? []) as Record<string, unknown>[];

  const detail: ClientDetail = {
    ...EMPTY_DETAIL,
    graphics: shapeGraphics(graphics.data as Record<string, unknown> | null),
    calls: shapeCalls(rows(calls)),
    todos: shapeTodos(rows(todos)),
    checkIns: shapeCheckIns(rows(checkIns)),
    cashGoals: shapeCashGoals(rows(cashGoals)),
    projects: shapeProjects(rows(projects)),
    proof: shapeProof(rows(proof), rows(testimonials)),
    tickets: shapeTickets(rows(tickets)),
    notes: shapeNotes(rows(notes)),
  };

  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
