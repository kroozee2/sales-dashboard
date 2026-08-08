"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MessageSquare, ChevronRight, DollarSign } from "lucide-react";
import { type Lead, PIPELINE_STAGES, type PipelineStage } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const STAGE_COLORS: Record<string, string> = {
  "New": "border-slate-500/40 bg-slate-500/5",
  "Contacted": "border-blue-500/40 bg-blue-500/5",
  "Call Booked": "border-purple-500/40 bg-purple-500/5",
  "Proposal": "border-amber-500/40 bg-amber-500/5",
  "Closed Won": "border-emerald-500/40 bg-emerald-500/5",
  "Closed Lost": "border-red-500/40 bg-red-500/5",
};

const STAGE_DOT: Record<string, string> = {
  "New": "bg-slate-400",
  "Contacted": "bg-blue-400",
  "Call Booked": "bg-purple-400",
  "Proposal": "bg-amber-400",
  "Closed Won": "bg-emerald-400",
  "Closed Lost": "bg-red-400",
};

const OFFERS = ["BOARDROOM", "LAUNCH", "Workshop", "Other"];

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsLead, setSmsLead] = useState<Lead | null>(null);
  const [smsMsg, setSmsMsg] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLead, setNewLead] = useState({ name: "", email: "", phone: "", offer: "BOARDROOM", value: "", notes: "" });
  const [detailLead, setDetailLead] = useState<Lead | null>(null);

  useEffect(() => {
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads));
  }, []);

  const moveStage = async (id: string, stage: PipelineStage) => {
    await fetch("/api/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage }) });
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
  };

  const addLead = async () => {
    const res = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newLead, value: Number(newLead.value) || 0, stage: "New" }),
    });
    const { lead } = await res.json();
    setLeads((prev) => [lead, ...prev]);
    setAddOpen(false);
    setNewLead({ name: "", email: "", phone: "", offer: "BOARDROOM", value: "", notes: "" });
  };

  const sendSms = async () => {
    if (!smsLead) return;
    setSmsSending(true);
    await fetch("/api/ghl/sms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: smsLead.id, phone: smsLead.phone, message: smsMsg }),
    });
    setSmsSending(false);
    setSmsOpen(false);
    setSmsMsg("");
  };

  const pipelineValue = leads.filter((l) => l.stage !== "Closed Lost").reduce((s, l) => s + l.value, 0);
  const wonValue = leads.filter((l) => l.stage === "Closed Won").reduce((s, l) => s + l.value, 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(pipelineValue)} open · {formatCurrency(wonValue)} won
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        </div>

        {/* Kanban */}
        <div className="overflow-x-auto">
          <div className="flex gap-3 pb-4" style={{ minWidth: `${PIPELINE_STAGES.length * 220}px` }}>
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage === stage);
              const stageValue = stageLeads.reduce((s, l) => s + l.value, 0);
              return (
                <div key={stage} className="w-52 flex-none">
                  <div className={`mb-2 rounded-lg border p-2 ${STAGE_COLORS[stage]}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                        <span className="text-xs font-semibold">{stage}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span className="rounded-full bg-muted px-1.5 py-0.5">{stageLeads.length}</span>
                        {stageValue > 0 && <span>{formatCurrency(stageValue)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {stageLeads.map((lead) => (
                      <Card key={lead.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setDetailLead(lead)}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-sm font-medium leading-tight">{lead.name}</p>
                            <span className="shrink-0 text-xs font-semibold text-primary">{formatCurrency(lead.value)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{lead.offer}</p>
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); setSmsLead(lead); setSmsOpen(true); }}
                              className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                            >
                              <MessageSquare className="h-3 w-3" /> SMS
                            </button>
                            {stage !== "Closed Won" && stage !== "Closed Lost" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const idx = PIPELINE_STAGES.indexOf(stage);
                                  if (idx < PIPELINE_STAGES.length - 2) moveStage(lead.id, PIPELINE_STAGES[idx + 1]);
                                }}
                                className="flex items-center gap-0.5 rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                              >
                                Move <ChevronRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* SMS Dialog */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send SMS to {smsLead?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{smsLead?.phone}</p>
            <Textarea
              placeholder="Type your message..."
              value={smsMsg}
              onChange={(e) => setSmsMsg(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSmsOpen(false)}>Cancel</Button>
              <Button onClick={sendSms} disabled={!smsMsg.trim() || smsSending}>
                {smsSending ? "Sending..." : "Send SMS"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Lead Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Full name *" value={newLead.name} onChange={(e) => setNewLead((p) => ({ ...p, name: e.target.value }))} />
            <Input placeholder="Email" value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Phone (+1...)" value={newLead.phone} onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))} />
            <select
              value={newLead.offer}
              onChange={(e) => setNewLead((p) => ({ ...p, offer: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {OFFERS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <Input placeholder="Deal value (e.g. 15000)" type="number" value={newLead.value} onChange={(e) => setNewLead((p) => ({ ...p, value: e.target.value }))} />
            <Textarea placeholder="Notes" rows={3} value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={addLead} disabled={!newLead.name.trim()}>Add Lead</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lead Detail Dialog */}
      <Dialog open={!!detailLead} onOpenChange={(o) => !o && setDetailLead(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detailLead?.name}</DialogTitle>
          </DialogHeader>
          {detailLead && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Offer</p>
                  <p className="font-medium">{detailLead.offer}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Value</p>
                  <p className="font-semibold text-primary flex items-center gap-1"><DollarSign className="h-3 w-3" />{detailLead.value.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Stage</p>
                  <p className="font-medium">{detailLead.stage}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{detailLead.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{detailLead.email}</p>
                </div>
              </div>
              {detailLead.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed">{detailLead.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Move to stage</p>
                <div className="flex flex-wrap gap-1">
                  {PIPELINE_STAGES.filter((s) => s !== detailLead.stage).map((s) => (
                    <button key={s} onClick={() => { moveStage(detailLead.id, s); setDetailLead((p) => p ? { ...p, stage: s } : p); }}
                      className="rounded-md bg-muted px-2 py-1 text-xs hover:bg-primary/20 hover:text-primary transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="gap-1 flex-1" onClick={() => { setDetailLead(null); setSmsLead(detailLead); setSmsOpen(true); }}>
                  <MessageSquare className="h-3 w-3" /> Send SMS
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
