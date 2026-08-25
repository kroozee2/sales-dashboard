"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { mergeEditableCompetitorResponse, slugifyCompetitorName, type ContentCompetitor } from "@/lib/content-competitors";
import { averageCompetitorViews, competitorPostMetric } from "@/lib/instagram-command";

type View = "competitors" | "content";
type AddForm = { name:string; focus:string; instagramUrl:string };
const EMPTY_ADD:AddForm = { name:"", focus:"", instagramUrl:"" };
const nf = new Intl.NumberFormat("en-US", { notation:"compact", maximumFractionDigits:1 });
const metric = (value:number|undefined|null) => value == null ? "Unavailable" : nf.format(value);
const performance = (post:NonNullable<ContentCompetitor["evidence"]>[number]) => competitorPostMetric(post);

export default function CompetitorResearch({ onModel }: {
  onIdeaSaved?: () => void;
  onModel?: (creator:ContentCompetitor,type:"reel"|"carousel",post?:NonNullable<ContentCompetitor["evidence"]>[number]) => void;
}) {
  const [creators,setCreators] = useState<ContentCompetitor[]>([]);
  const [view,setView] = useState<View>("competitors");
  const [contentCreatorId,setContentCreatorId] = useState("all");
  const [query,setQuery] = useState("");
  const [showAll,setShowAll] = useState(false);
  const [showAdd,setShowAdd] = useState(false);
  const [add,setAdd] = useState<AddForm>(EMPTY_ADD);
  const [loading,setLoading] = useState(true);
  const [savingIds,setSavingIds] = useState<Set<string>>(new Set());
  const [dirtyIds,setDirtyIds] = useState<Set<string>>(new Set());
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const mutationLocks = useRef<Set<string>>(new Set());

  function markSaving(id:string,saving:boolean) {
    setSavingIds((current) => { const next=new Set(current); if(saving) next.add(id); else next.delete(id); return next; });
  }

  useEffect(() => {
    fetch("/api/content/competitors")
      .then(async (response) => {
        const data = await response.json() as { creators?:ContentCompetitor[]; error?:string };
        if(!response.ok) throw new Error(data.error || "Could not load competitors");
        setCreators(data.creators || []);
      })
      .catch((reason:unknown) => setError(reason instanceof Error ? reason.message : "Could not load competitors"))
      .finally(() => setLoading(false));
  },[]);

  async function persistCreator(creator:ContentCompetitor, success="Saved") {
    if(mutationLocks.current.has(creator.id)) { setError("That row is already saving. Please wait a moment."); return null; }
    mutationLocks.current.add(creator.id);
    markSaving(creator.id,true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/content/competitors", {
        method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({creator}),
      });
      const data = await response.json() as { creator?:ContentCompetitor; error?:string };
      if(!response.ok || !data.creator) throw new Error(data.error || "Could not save competitor");
      setCreators((current) => {
        const existing = current.find((item) => item.id === data.creator!.id);
        const saved = mergeEditableCompetitorResponse(existing,data.creator!);
        return existing ? current.map((item) => item.id === saved.id ? saved : item) : [...current,saved];
      });
      setDirtyIds((current) => { const next=new Set(current); next.delete(creator.id); return next; });
      setMessage(success); window.setTimeout(() => setMessage(""),2200);
      return data.creator;
    } catch(reason) {
      setError(reason instanceof Error ? reason.message : "Could not save competitor");
      return null;
    } finally { mutationLocks.current.delete(creator.id); markSaving(creator.id,false); }
  }

  function updateCreator(id:string,patch:Partial<ContentCompetitor>) {
    setCreators((current) => current.map((creator) => creator.id === id ? {...creator,...patch} : creator));
    setDirtyIds((current) => new Set(current).add(id));
  }

  async function addCreator() {
    if(!add.name.trim() || !add.focus.trim()) { setError("Add a name and focus first"); return; }
    const baseId = slugifyCompetitorName(add.name);
    const id = creators.some((creator) => creator.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
    const creator:ContentCompetitor = {
      id, name:add.name.trim(), focus:add.focus.trim(), instagramUrl:add.instagramUrl.trim() || undefined,
      whyFit:"Tracked as a relevant content model for Andrew's market.", pillars:[],
      signaturePattern:"Capture the recurring hook, structure, proof, and call to action in the strongest posts.",
      andrewAdaptation:"Reuse the mechanism, not the wording, in Andrew's warm, proof-led 7-Figure CEO voice.",
      notes:"", watchStatus:"watching",
    };
    const saved = await persistCreator(creator,`${creator.name} added`);
    if(saved) { setAdd(EMPTY_ADD); setShowAdd(false); }
  }

  async function refreshCreator(creator:ContentCompetitor) {
    if(!creator.instagramUrl) { setError("Add the Instagram profile URL first"); return; }
    const persisted = await persistCreator(creator,"");
    if(!persisted) return;
    if(mutationLocks.current.has(creator.id)) return;
    mutationLocks.current.add(creator.id);
    markSaving(creator.id,true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/instagram/competitors/refresh", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({creatorId:persisted.id,profileUrl:persisted.instagramUrl}),
      });
      const data = await response.json();
      if(response.status === 409 && data.code === "COMPETITOR_COOLDOWN") {
        setError(`Research is still fresh. Next refresh ${new Date(data.nextEligibleAt).toLocaleString()}.`); return;
      }
      if(!response.ok || !data.creator) throw new Error(data.error || "Refresh failed");
      setCreators((current) => current.map((item) => item.id === data.creator.id ? data.creator : item));
      setMessage(`Updated ${data.creator.name}: ${data.persistedEvidenceCount} top posts saved.`);
    } catch(reason) { setError(reason instanceof Error ? reason.message : "Refresh failed"); }
    finally { mutationLocks.current.delete(creator.id); markSaving(creator.id,false); }
  }

  const filteredCreators = useMemo(() => {
    const needle=query.trim().toLowerCase();
    const result=creators.filter((creator) => !needle || [creator.name,creator.focus,creator.notes,creator.instagramHandle].join(" ").toLowerCase().includes(needle));
    return showAll ? result : result.slice(0,5);
  },[creators,query,showAll]);

  const contentRows = useMemo(() => creators.flatMap((creator) => (creator.evidence || []).map((post) => ({creator,post})))
    .filter(({creator,post}) => (contentCreatorId === "all" || creator.id === contentCreatorId)
      && (!query.trim() || [creator.name,post.title,post.hook,post.description,post.cta].join(" ").toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a,b) => (performance(b.post).value || 0) - (performance(a.post).value || 0)),[creators,contentCreatorId,query]);

  if(loading) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center text-sm text-zinc-500">Loading competitor spreadsheet…</div>;
  if(error && !creators.length) return <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[.05] p-6 text-center text-sm text-rose-300">{error}</div>;

  return <div className="space-y-4">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-pink-400">Competitor spreadsheet</p><h2 className="mt-1 text-2xl font-black">See what is working. Model the mechanism.</h2><p className="mt-1 text-sm text-zinc-500">Simple rows for profiles, notes, metrics, hooks, descriptions, and calls to action.</p></div>
        <button onClick={() => setShowAdd((value) => !value)} className="rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black">{showAdd?"Close":"+ Add competitor"}</button>
      </div>
      <div className="mt-5 flex gap-2 border-t border-zinc-800 pt-4">
        <button onClick={() => setView("competitors")} className={`rounded-lg px-4 py-2 text-xs font-bold ${view==="competitors"?"bg-pink-600 text-white":"bg-zinc-800 text-zinc-400"}`}>Competitors</button>
        <button onClick={() => {setView("content");setContentCreatorId("all")}} className={`rounded-lg px-4 py-2 text-xs font-bold ${view==="content"?"bg-pink-600 text-white":"bg-zinc-800 text-zinc-400"}`}>Best content</button>
      </div>
    </section>

    {showAdd && <section className="grid gap-3 rounded-2xl border border-blue-500/25 bg-blue-500/[.04] p-4 sm:grid-cols-3">
      <input value={add.name} onChange={(event)=>setAdd({...add,name:event.target.value})} placeholder="Competitor name" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"/>
      <input value={add.focus} onChange={(event)=>setAdd({...add,focus:event.target.value})} placeholder="What they focus on" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"/>
      <input value={add.instagramUrl} onChange={(event)=>setAdd({...add,instagramUrl:event.target.value})} placeholder="Instagram URL or @handle" className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm"/>
      <button onClick={()=>void addCreator()} disabled={savingIds.size>0} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold disabled:opacity-50 sm:col-span-3">Add to spreadsheet</button>
    </section>}

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={view==="competitors"?"Search competitors…":"Search hooks, titles, CTAs…"} className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm placeholder-zinc-600 focus:border-pink-500 focus:outline-none"/>
      <div className="min-h-5 text-xs">{message&&<span className="text-emerald-400">{message}</span>}{error&&<span className="text-rose-400">{error}</span>}</div>
    </div>

    {view === "competitors" && <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] border-collapse text-left">
        <thead className="bg-zinc-950/70 text-[10px] uppercase tracking-wider text-zinc-500"><tr>
          <th className="border-b border-r border-zinc-800 p-3">Name</th><th className="border-b border-r border-zinc-800 p-3">Followers</th><th className="border-b border-r border-zinc-800 p-3">Top-content avg views</th><th className="border-b border-r border-zinc-800 p-3">Best content</th><th className="border-b border-r border-zinc-800 p-3">Instagram</th><th className="border-b border-zinc-800 p-3">Notes</th>
        </tr></thead>
        <tbody>{filteredCreators.map((creator) => <tr key={creator.id} className="align-top hover:bg-zinc-800/30">
          <td className="border-b border-r border-zinc-800 p-3"><button onClick={()=>{setView("content");setContentCreatorId(creator.id)}} className="font-bold text-white hover:text-pink-300">{creator.name}</button><p className="mt-1 max-w-56 text-[11px] text-zinc-500">{creator.focus}</p></td>
          <td className="border-b border-r border-zinc-800 p-3 text-sm font-bold">{metric(creator.followers)}</td>
          <td className="border-b border-r border-zinc-800 p-3 text-sm font-bold">{metric(averageCompetitorViews(creator.evidence || []))}</td>
          <td className="border-b border-r border-zinc-800 p-3"><button onClick={()=>{setView("content");setContentCreatorId(creator.id)}} className="rounded-lg bg-pink-500/10 px-3 py-2 text-xs font-bold text-pink-300 hover:bg-pink-500/20">View content ({creator.evidence?.length || 0})</button></td>
          <td className="border-b border-r border-zinc-800 p-3"><div className="flex gap-2"><input value={creator.instagramUrl||""} onChange={(event)=>updateCreator(creator.id,{instagramUrl:event.target.value})} disabled={savingIds.has(creator.id)} placeholder="@handle or URL" className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs disabled:opacity-50"/>{creator.instagramUrl?.startsWith("https://www.instagram.com/")&&<a href={creator.instagramUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-800 px-2 py-1.5 text-xs text-pink-300">Open ↗</a>}</div><button onClick={()=>void refreshCreator(creator)} disabled={savingIds.has(creator.id)||!creator.instagramUrl} className="mt-2 text-[10px] font-bold text-blue-400 disabled:text-zinc-700">{savingIds.has(creator.id)?"Updating…":"Refresh metrics + top posts"}</button></td>
          <td className="border-b border-zinc-800 p-3"><textarea value={creator.notes} onChange={(event)=>updateCreator(creator.id,{notes:event.target.value})} disabled={savingIds.has(creator.id)} rows={3} placeholder="Type notes here…" className="w-full min-w-64 resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs leading-relaxed placeholder-zinc-700 disabled:opacity-50"/><button onClick={()=>void persistCreator(creator,"Row saved")} disabled={savingIds.has(creator.id)||!dirtyIds.has(creator.id)} className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-bold disabled:bg-zinc-800 disabled:text-zinc-600">Save row</button></td>
        </tr>)}</tbody>
      </table></div>
      {creators.length>5&&!query&&<button onClick={()=>setShowAll((value)=>!value)} className="w-full border-t border-zinc-800 py-3 text-xs font-bold text-zinc-400 hover:text-white">{showAll?"Show first five":`Show all ${creators.length} competitors`}</button>}
    </section>}

    {view === "content" && <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold">Content to model</h3><p className="text-xs text-zinc-500">Ranked by verified views or plays. Open the source, then reuse the mechanism, not the wording.</p></div><select value={contentCreatorId} onChange={(event)=>setContentCreatorId(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs"><option value="all">All competitors</option>{creators.map((creator)=><option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></div>
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"><div className="overflow-x-auto"><table className="w-full min-w-[1450px] border-collapse text-left">
        <thead className="bg-zinc-950/70 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="border-b border-r border-zinc-800 p-3">Creator</th><th className="border-b border-r border-zinc-800 p-3">Views / plays</th><th className="border-b border-r border-zinc-800 p-3">Title</th><th className="border-b border-r border-zinc-800 p-3">Hook</th><th className="border-b border-r border-zinc-800 p-3">Description</th><th className="border-b border-r border-zinc-800 p-3">Call to action</th><th className="border-b border-r border-zinc-800 p-3">Source</th><th className="border-b border-zinc-800 p-3">Model</th></tr></thead>
        <tbody>{contentRows.map(({creator,post})=>{const postMetric=performance(post);return <tr key={`${creator.id}-${post.url}`} className="align-top hover:bg-zinc-800/30"><td className="border-b border-r border-zinc-800 p-3 text-xs font-bold">{creator.name}</td><td className="border-b border-r border-zinc-800 p-3 text-sm font-black text-pink-300">{postMetric.value?`${metric(postMetric.value)} ${postMetric.label}`:"Unavailable"}</td><td className="border-b border-r border-zinc-800 p-3 text-xs font-semibold">{post.title||"Unavailable"}</td><td className="border-b border-r border-zinc-800 p-3 text-xs leading-relaxed">{post.hook||"Unavailable"}</td><td className="border-b border-r border-zinc-800 p-3 text-xs leading-relaxed text-zinc-400">{post.description||post.captionExcerpt||"Unavailable"}</td><td className="border-b border-r border-zinc-800 p-3 text-xs leading-relaxed text-emerald-300">{post.cta||"Unavailable"}</td><td className="border-b border-r border-zinc-800 p-3"><a href={post.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-pink-300">Open post ↗</a></td><td className="border-b border-zinc-800 p-3"><div className="flex gap-1">{onModel&&<><button onClick={()=>onModel(creator,"reel",post)} className="rounded-lg bg-pink-600 px-2.5 py-1.5 text-[10px] font-bold">Reel</button><button onClick={()=>onModel(creator,"carousel",post)} className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold">Carousel</button></>}</div></td></tr>})}</tbody>
      </table></div>{!contentRows.length&&<div className="p-10 text-center text-sm text-zinc-600">No researched posts yet. Add an Instagram URL in Competitors, then click “Refresh metrics + top posts.”</div>}</div>
    </section>}
  </div>;
}
