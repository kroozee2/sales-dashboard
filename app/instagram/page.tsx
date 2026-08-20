"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CompetitorResearch from "@/components/competitor-research";
import type { ContentCompetitor } from "@/lib/content-competitors";
import { isInstagramContentPlatform } from "@/lib/instagram-command";

type Tab = "dashboard" | "calendar" | "create" | "competitors";
type CreatorType = "reel" | "carousel";
type WindowDays = 7 | 30 | 90;
type PostedRow = { external_id:string; posted_at:string|null; media_type:string|null; views:number; likes:number; comments:number; shares:number; text:string|null; post_url:string|null };
type Metrics = { days:number; posts:number; views:number; likes:number; comments:number; shares:number; averageViews:number|null; engagementRate:number|null; formatMix:{reels:number;carousels:number;images:number}; topPosts:PostedRow[] };
type Analytics = { profile:{name:string;handle:string;url:string;followers:number|null;followersNote:string}; windows:Record<WindowDays,Metrics>; recommendations:Record<WindowDays,string[]>; freshness:{newestPostAt:string|null;source:string;automaticRefresh:boolean;coverageStart:string;truncated:boolean;coverageNote:string}; creditGuard:{profileCooldownHours:number;competitorCacheDays:number;maxSamplePosts:number;maxEvidencePosts:number} };
type ContentItem = { id:string; title:string; category:string; status:string; scheduled_date:string|null; platforms:string[]; creative_type?:string; video_script?:string; drafts?:Record<string,string>; notes?:string; updated_at?:string };
type Generated = { type:CreatorType; generationId:string; result:{hook?:string;script?:string;slides?:{heading:string;body:string}[];caption:string}; sourceAnalyzed:boolean; sourceUrl:string|null; scheduledDate:string|null; inputs:{topic:string;pillar:string;hookStyle:string;ctaWord:string;ctaGive:string;competitorId:string|null} };

const TABS: Array<{id:Tab;label:string;icon:string;note:string}> = [
  {id:"dashboard",label:"Command",icon:"◉",note:"What is working"},
  {id:"calendar",label:"Calendar",icon:"▦",note:"Plan the month"},
  {id:"create",label:"Create",icon:"✦",note:"Reels + carousels"},
  {id:"competitors",label:"Competitors",icon:"⌁",note:"Patterns + evidence"},
];
const STATUS:Record<string,string> = {drafted:"bg-zinc-700 text-zinc-200",scheduled:"bg-blue-500/15 text-blue-300",published:"bg-emerald-500/15 text-emerald-300",posted:"bg-emerald-500/15 text-emerald-300",ready:"bg-violet-500/15 text-violet-300"};
const nf = new Intl.NumberFormat("en-US", {notation:"compact",maximumFractionDigits:1});
const fmt = (n:number|null) => n === null ? "Unavailable" : nf.format(n || 0);
const dateKey = (date:Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

export default function InstagramCommandCenter() {
  const [tab,setTab] = useState<Tab>("dashboard");
  const [analytics,setAnalytics] = useState<Analytics|null>(null);
  const [items,setItems] = useState<ContentItem[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [days,setDays] = useState<WindowDays>(30);
  const [syncing,setSyncing] = useState(false);
  const [syncMessage,setSyncMessage] = useState("");
  const [month,setMonth] = useState(() => new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [dragId,setDragId] = useState<string|null>(null);
  const [dragOverDate,setDragOverDate] = useState<string|null>(null);
  const [creatorType,setCreatorType] = useState<CreatorType>("reel");
  const [topic,setTopic] = useState("");
  const [pillar,setPillar] = useState("AI + peaceful growth");
  const [hookStyle,setHookStyle] = useState("specific outcome");
  const [targetLength,setTargetLength] = useState(60);
  const [ctaWord,setCtaWord] = useState("REELS");
  const [ctaGive,setCtaGive] = useState("the free training");
  const [sourceUrl,setSourceUrl] = useState("");
  const [modeledCreatorId,setModeledCreatorId] = useState<string|null>(null);
  const [scheduledDate,setScheduledDate] = useState("");
  const [generating,setGenerating] = useState(false);
  const [saving,setSaving] = useState(false);
  const [generated,setGenerated] = useState<Generated|null>(null);
  const [creatorMessage,setCreatorMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [analyticsResponse,contentResponse] = await Promise.all([fetch("/api/instagram/analytics"),fetch("/api/content")]);
      const [a,c] = await Promise.all([analyticsResponse.json(),contentResponse.json()]);
      if (!analyticsResponse.ok) throw new Error(a.error || "Instagram analytics failed");
      if (!contentResponse.ok) throw new Error(c.error || "Content calendar failed");
      setAnalytics(a); setItems(c.items || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load Instagram command center"); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  },[load]);

  const metrics = analytics?.windows[days];
  const igItems = useMemo(() => items.filter((item) => isInstagramContentPlatform(item.platforms)),[items]);
  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(),month.getMonth(),1);
    const last = new Date(month.getFullYear(),month.getMonth()+1,0);
    const dates:Array<Date|null> = Array(first.getDay()).fill(null);
    for(let d=1;d<=last.getDate();d++) dates.push(new Date(month.getFullYear(),month.getMonth(),d));
    while(dates.length%7) dates.push(null);
    return dates;
  },[month]);
  const byDate = useMemo(() => {
    const map = new Map<string,ContentItem[]>();
    for(const item of igItems) if(item.scheduled_date) map.set(item.scheduled_date,[...(map.get(item.scheduled_date)||[]),item]);
    return map;
  },[igItems]);
  const unscheduled = igItems.filter((item) => !item.scheduled_date && !["published","posted"].includes(item.status));
  const monthItems = igItems.filter((item) => item.scheduled_date?.startsWith(`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,"0")}`));
  const planned = monthItems.length;
  const reels = monthItems.filter((item) => item.creative_type === "video" || item.video_script).length;
  const carousels = monthItems.filter((item) => item.creative_type === "carousel").length;

  async function syncInstagram() {
    if (!window.confirm("This starts one bounded Apify Instagram sync. SalesOS will block another normal sync for 24 hours. Continue?")) return;
    setSyncing(true); setSyncMessage("");
    try {
      const response = await fetch("/api/content/posted/sync-start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform:"instagram"})});
      const data = await response.json();
      if(response.status===409){setSyncMessage(`Credit guard blocked the sync.${data.nextEligibleAt?` Next eligible ${new Date(data.nextEligibleAt).toLocaleString()}.`:""}`);return;}
      if(!response.ok||!data.started) throw new Error(data.error || "Sync failed");
      setSyncMessage("Instagram sync is running. Waiting to ingest the bounded result…");
      for(let attempt=0;attempt<60;attempt++){
        await new Promise((resolve)=>window.setTimeout(resolve,5000));
        const pollResponse=await fetch("/api/content/posted/sync-poll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({platform:"instagram"})});
        const poll=await pollResponse.json();
        if(!pollResponse.ok) throw new Error(poll.error||"Sync polling failed");
        if(poll.done){setSyncMessage(`Instagram sync complete. Ingested ${poll.synced||0} posts.`);await load();return;}
      }
      setSyncMessage("Instagram is still processing. The credit reservation remains active to prevent duplicate spend.");
    } catch(e){setSyncMessage(e instanceof Error?e.message:"Sync failed");}
    finally{setSyncing(false);}
  }

  async function rescheduleItem(id:string,date:string) {
    const prior=items;
    const target=items.find((item)=>item.id===id);
    const patch={id,scheduled_date:date,...(target?.status==="drafted"?{status:"scheduled"}:{})};
    setItems((current)=>current.map((item)=>item.id===id?{...item,scheduled_date:date,status:item.status==="drafted"?"scheduled":item.status}:item));
    try {
      const response=await fetch("/api/content",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});
      const data=await response.json();
      if(!response.ok||!data.item) throw new Error(data.error||"Could not reschedule content");
      setItems((current)=>current.map((item)=>item.id===id?data.item:item));
    } catch(e) {
      setItems(prior);
      setError(e instanceof Error?e.message:"Could not reschedule content");
    } finally { setDragId(null);setDragOverDate(null); }
  }

  async function generate() {
    if(topic.trim().length<5){setCreatorMessage("Give me a specific topic first.");return;}
    if(sourceUrl && !window.confirm("Analyzing this example starts one bounded Apify post lookup. Continue?")) return;
    setGenerating(true);setCreatorMessage("");setGenerated(null);
    try{
      const response=await fetch("/api/instagram/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:creatorType,topic,pillar,hookStyle,targetLength,ctaWord,ctaGive,sourceUrl,competitorId:modeledCreatorId,scheduledDate:scheduledDate||undefined})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||"Generation failed");
      setGenerated(data);
    }catch(e){setCreatorMessage(e instanceof Error?e.message:"Generation failed");}
    finally{setGenerating(false);}
  }

  async function saveGenerated() {
    if(!generated||saving)return;
    const caption=generated.result.caption;
    const reelScript=generated.type==="reel"?`${generated.result.hook}\n\n${generated.result.script}`:"";
    const carouselText=generated.type==="carousel"?generated.result.slides?.map((s,i)=>`Slide ${i+1} — ${s.heading}\n${s.body}`).join("\n\n")||"":"";
    const savedDate=generated.scheduledDate;
    setSaving(true);setCreatorMessage("");
    try{
      const response=await fetch("/api/content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        title:generated.inputs.topic.trim().slice(0,100),category:"value",status:savedDate?"scheduled":"drafted",scheduled_date:savedDate,
        platforms:["instagram"],creative_type:generated.type==="reel"?"video":"carousel",video_script:generated.type==="reel"?reelScript:null,
        drafts:{instagram:caption},notes:generated.type==="carousel"?carouselText:null,
        meta:{generationId:generated.generationId,format:generated.type==="reel"?"Instagram Reel":"Instagram Carousel",hook:generated.result.hook||generated.result.slides?.[0]?.heading||"",cta:`Comment ${generated.inputs.ctaWord}`,sourceAnalyzed:generated.sourceAnalyzed,sourceUrl:generated.sourceUrl,competitorId:generated.inputs.competitorId,pillar:generated.inputs.pillar,hookStyle:generated.inputs.hookStyle},
      })});
      const data=await response.json(); if(!response.ok) throw new Error(data.error||"Save failed");
      setCreatorMessage(savedDate?"Saved and placed on the calendar.":"Saved to the unscheduled queue.");
      await load();
    }catch(e){setCreatorMessage(e instanceof Error?e.message:"Save failed");}
    finally{setSaving(false);}
  }

  function modelCreator(creator:ContentCompetitor,type:CreatorType){
    setCreatorType(type);setTopic(`${creator.signaturePattern}\n\nOriginal 7-Figure CEO angle: ${creator.andrewAdaptation}`);setPillar(creator.pillars[0]||"7-Figure CEO");setSourceUrl(creator.evidence?.[0]?.url||"");setModeledCreatorId(creator.id);setGenerated(null);setTab("create");
  }

  if(loading) return <div className="min-h-screen bg-[#07070a] p-8 text-center text-sm text-zinc-500">Loading Instagram Command Center…</div>;
  if(error) return <div className="min-h-screen bg-[#07070a] p-8"><div className="mx-auto max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] p-6 text-center"><p className="font-semibold text-rose-300">{error}</p><button onClick={()=>void load()} className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black">Retry</button></div></div>;

  return <div className="min-h-screen bg-[#07070a] text-white">
    <header className="border-b border-zinc-800/80 bg-gradient-to-r from-[#0d0d13] via-[#110b18] to-[#0d0d13] px-4 py-6 sm:px-7">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-pink-500/25 bg-pink-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-pink-300">Instagram operating system</div><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Make the next post obvious.</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Real cached performance, a visual publishing calendar, original creators, and evidence-backed competitor models in one place.</p></div>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-zinc-800 bg-black/20 px-4 py-2"><b className="block text-lg">{metrics?.posts||0}</b><span className="text-[9px] uppercase text-zinc-500">posts / {days}d</span></div><div className="rounded-xl border border-zinc-800 bg-black/20 px-4 py-2"><b className="block text-lg">{planned}</b><span className="text-[9px] uppercase text-zinc-500">planned</span></div><div className="rounded-xl border border-zinc-800 bg-black/20 px-4 py-2"><b className="block text-lg">{unscheduled.length}</b><span className="text-[9px] uppercase text-zinc-500">queue</span></div></div>
        </div>
        <nav className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">{TABS.map((item)=><button key={item.id} onClick={()=>setTab(item.id)} className={`rounded-xl border px-3 py-3 text-left transition ${tab===item.id?"border-pink-500/40 bg-pink-500/10":"border-zinc-800 bg-zinc-900/70 hover:border-zinc-700"}`}><span className="mr-2 text-pink-300">{item.icon}</span><b className="text-sm">{item.label}</b><span className="mt-1 block text-[10px] text-zinc-500">{item.note}</span></button>)}</nav>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] p-4 sm:p-7">
      {tab==="dashboard"&&metrics&&<div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold">{analytics?.profile.handle}</p><p className="text-xs text-zinc-500">{analytics?.freshness.source} · newest cached post {analytics?.freshness.newestPostAt?new Date(analytics.freshness.newestPostAt).toLocaleDateString():"unknown"}</p></div><div className="flex flex-wrap gap-2">{([7,30,90] as WindowDays[]).map((n)=><button key={n} onClick={()=>setDays(n)} className={`rounded-lg px-3 py-2 text-xs font-bold ${days===n?"bg-white text-black":"bg-zinc-800 text-zinc-400"}`}>{n} days</button>)}<button onClick={()=>void syncInstagram()} disabled={syncing} className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-bold hover:bg-pink-500 disabled:opacity-50">{syncing?"Starting…":"Sync now"}</button></div></div>
        {syncMessage&&<div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs text-amber-200">{syncMessage}</div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[["Views",fmt(metrics.views)],["Avg views",fmt(metrics.averageViews)],["Likes",fmt(metrics.likes)],["Comments",fmt(metrics.comments)],["Shares",fmt(metrics.shares)],["Engagement",metrics.engagementRate===null?"Unavailable":`${metrics.engagementRate}%`]].map(([label,value])=><div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-600">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div>
        <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><h2 className="font-bold">Top cached posts</h2><span className="text-[10px] text-zinc-500">Views + weighted engagement</span></div><div className="mt-4 space-y-2">{metrics.topPosts.length?metrics.topPosts.map((post,i)=><a key={post.external_id} href={post.post_url||"#"} target="_blank" rel="noreferrer" className="grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 hover:border-pink-500/30"><span className="text-center text-sm font-black text-pink-300">{i+1}</span><div className="min-w-0"><p className="truncate text-sm text-zinc-200">{post.text||"Instagram post"}</p><p className="text-[10px] text-zinc-600">{post.media_type||"post"} · {post.posted_at?new Date(post.posted_at).toLocaleDateString():"date unknown"}</p></div><div className="text-right"><b className="text-sm">{fmt(post.views)}</b><p className="text-[9px] text-zinc-600">views</p></div></a>):<p className="py-8 text-center text-sm text-zinc-600">No cached posts in this window.</p>}</div></section>
          <div className="space-y-5"><section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5"><h2 className="font-bold text-violet-200">What to do next</h2><div className="mt-3 space-y-3">{analytics?.recommendations[days].map((item,i)=><div key={item} className="flex gap-3 text-sm leading-relaxed text-zinc-300"><span className="font-black text-violet-400">{i+1}</span><p>{item}</p></div>)}</div></section><section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-bold">Format mix</h2>{Object.entries(metrics.formatMix).map(([label,value])=><div key={label} className="mt-3"><div className="flex justify-between text-xs"><span className="capitalize text-zinc-400">{label}</span><b>{value}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500" style={{width:`${metrics.posts?Math.max(4,(value/metrics.posts)*100):0}%`}}/></div></div>)}</section></div>
        </div><div className="rounded-xl border border-zinc-800 p-3 text-[11px] text-zinc-500">No fake follower or save numbers. SalesOS shows only fields available in the posted-content cache. Sync is manual, capped, and guarded by a 24-hour cooldown.</div>
      </div>}

      {tab==="calendar"&&<div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">{[["This month",planned],["Reels",reels],["Carousels",carousels],["Unscheduled",unscheduled.length]].map(([label,value])=><div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</div>
        <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="rounded-lg bg-zinc-800 px-3 py-2">←</button><div className="text-center"><h2 className="text-xl font-black">{month.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</h2><p className="text-xs text-zinc-500">Connection · Value · Proof · Action</p></div><button onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="rounded-lg bg-zinc-800 px-3 py-2">→</button></div>
        <div className="overflow-x-auto"><div className="min-w-[850px] overflow-hidden rounded-2xl border border-zinc-800"><div className="grid grid-cols-7 bg-zinc-900">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="border-r border-zinc-800 p-2 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">{d}</div>)}</div><div className="grid grid-cols-7 bg-zinc-950">{calendarDays.map((date,i)=><div key={i} onDragOver={(event)=>{if(date&&dragId){event.preventDefault();setDragOverDate(dateKey(date))}}} onDragLeave={()=>date&&dragOverDate===dateKey(date)&&setDragOverDate(null)} onDrop={(event)=>{event.preventDefault();const id=event.dataTransfer.getData("text/plain")||dragId;if(id&&date)void rescheduleItem(id,dateKey(date))}} className={`min-h-32 border-r border-t border-zinc-800 p-2 transition ${dateKey(new Date())=== (date?dateKey(date):"")?"bg-pink-500/[0.04]":""} ${date&&dragOverDate===dateKey(date)?"bg-blue-500/15 ring-2 ring-inset ring-blue-500/50":""}`}>{date&&<><div className="mb-2 flex items-center justify-between text-xs font-bold text-zinc-500"><span>{date.getDate()}</span>{(byDate.get(dateKey(date))||[]).length>3&&<button onClick={()=>window.location.assign("/content")} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] text-zinc-300">+{(byDate.get(dateKey(date))||[]).length-3} more</button>}</div><div className="space-y-1">{(byDate.get(dateKey(date))||[]).slice(0,3).map(item=><button key={item.id} draggable onDragStart={(event)=>{setDragId(item.id);event.dataTransfer.setData("text/plain",item.id);event.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{setDragId(null);setDragOverDate(null)}} onClick={()=>window.location.assign("/content")} className="block w-full cursor-grab rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-left active:cursor-grabbing"><p className="line-clamp-2 text-[10px] font-semibold">{item.title}</p><span className={`mt-1 inline-block rounded px-1.5 py-.5 text-[8px] ${STATUS[item.status]||STATUS.drafted}`}>{item.status}</span></button>)}</div></>}</div>)}</div></div></div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold">Unscheduled queue</h2><p className="text-xs text-zinc-500">Drag a card onto any calendar day, or tap to open it.</p></div><button onClick={()=>setTab("create")} className="rounded-xl bg-pink-600 px-4 py-2 text-xs font-bold">Create new</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{unscheduled.length?unscheduled.map(item=><button key={item.id} draggable onDragStart={(event)=>{setDragId(item.id);event.dataTransfer.setData("text/plain",item.id);event.dataTransfer.effectAllowed="move"}} onDragEnd={()=>{setDragId(null);setDragOverDate(null)}} onClick={()=>window.location.assign("/content")} className="cursor-grab rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-left active:cursor-grabbing"><p className="line-clamp-2 text-sm font-semibold">{item.title}</p><p className="mt-2 text-[10px] text-zinc-600">{item.creative_type||"content"} · {item.status}</p></button>):<p className="text-sm text-zinc-600">Queue is clear.</p>}</div></section>
      </div>}

      {tab==="create"&&<div className="grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"><div className="mb-5 flex rounded-xl bg-zinc-950 p-1">{(["reel","carousel"] as CreatorType[]).map(type=><button key={type} onClick={()=>{setCreatorType(type);setGenerated(null)}} className={`flex-1 rounded-lg py-2.5 text-sm font-bold capitalize ${creatorType===type?"bg-white text-black":"text-zinc-500"}`}>{type==="reel"?"Reel creator":"Carousel creator"}</button>)}</div><label className="text-xs font-bold text-zinc-400">Topic / specific idea<textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={5} placeholder="One sharp idea, proof point, or lesson…" className="mt-2 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white placeholder-zinc-700 focus:border-pink-500 focus:outline-none"/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-500">Pillar<input value={pillar} onChange={e=>setPillar(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/></label><label className="text-xs text-zinc-500">Hook mechanism<select value={hookStyle} onChange={e=>setHookStyle(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"><option>specific outcome</option><option>contrarian truth</option><option>costly mistake</option><option>client proof</option><option>curiosity gap</option></select></label>{creatorType==="reel"&&<label className="text-xs text-zinc-500">Target length<select value={targetLength} onChange={e=>setTargetLength(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"><option value={30}>30 seconds</option><option value={60}>60 seconds</option><option value={90}>90 seconds</option></select></label>}<label className="text-xs text-zinc-500">Calendar date<input type="date" value={scheduledDate} onChange={e=>setScheduledDate(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/></label><label className="text-xs text-zinc-500">Comment keyword<input value={ctaWord} onChange={e=>setCtaWord(e.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/></label><label className="text-xs text-zinc-500">What they receive<input value={ctaGive} onChange={e=>setCtaGive(e.target.value)} className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-white"/></label></div><div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3"><label className="text-xs font-bold text-amber-200">Optional example post<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://www.instagram.com/reel/..." className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-white placeholder-zinc-700"/></label><p className="mt-2 text-[10px] text-zinc-500">Leave blank for zero Apify spend. If supplied, one direct post is analyzed only after confirmation.</p></div><button onClick={()=>void generate()} disabled={generating} className="mt-5 w-full rounded-xl bg-gradient-to-r from-pink-600 to-violet-600 py-3.5 text-sm font-black hover:brightness-110 disabled:opacity-50">{generating?"Building original draft…":`Generate ${creatorType}`}</button>{creatorMessage&&<p className="mt-3 text-center text-xs text-amber-200">{creatorMessage}</p>}</section>
        <section className="min-h-[620px] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6">{!generated?<div className="flex min-h-[560px] items-center justify-center text-center"><div><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-pink-500/20 bg-pink-500/10 text-2xl">✦</div><h2 className="mt-4 text-xl font-black">Your finished {creatorType} appears here.</h2><p className="mt-2 max-w-sm text-sm text-zinc-500">Original Andrew voice, exact spoken copy or slide plan, caption, CTA, and calendar-ready metadata.</p></div></div>:<div><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Ready to edit and save</p><h2 className="text-xl font-black capitalize">{generated.type} draft</h2></div>{generated.sourceAnalyzed&&<span className="rounded-full bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300">Example analyzed</span>}</div>{generated.type==="reel"?<div className="space-y-4"><div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.05] p-4"><p className="text-[10px] font-bold uppercase text-pink-300">Hook</p><p className="mt-2 text-xl font-black">{generated.result.hook}</p></div><div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5"><p className="mb-3 text-[10px] font-bold uppercase text-zinc-600">Teleprompter script</p><pre className="whitespace-pre-wrap font-sans text-base leading-8 text-zinc-200">{generated.result.script}</pre></div></div>:<div className="grid gap-3 sm:grid-cols-2">{generated.result.slides?.map((slide,i)=><div key={i} className={`aspect-[4/5] rounded-xl border p-5 ${i===0?"border-pink-500/30 bg-gradient-to-br from-pink-950 to-violet-950":"border-zinc-800 bg-zinc-950"}`}><p className="text-[10px] font-bold uppercase text-zinc-600">Slide {i+1}</p><h3 className="mt-8 text-xl font-black leading-tight">{slide.heading}</h3><p className="mt-4 text-sm leading-relaxed text-zinc-400">{slide.body}</p></div>)}</div>}<div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-[10px] font-bold uppercase text-zinc-600">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{generated.result.caption}</p></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void saveGenerated()} disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black hover:bg-emerald-500 disabled:opacity-50">{saving?"Saving…":generated.scheduledDate?"Save to calendar":"Save to queue"}</button><button onClick={()=>void generate()} className="rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-3 text-sm font-bold">Regenerate</button></div></div>}</section>
      </div>}

      {tab==="competitors"&&<div className="space-y-4"><div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-xs leading-relaxed text-zinc-400"><b className="text-amber-200">Credit discipline:</b> profiles refresh only when you click, sample at most 20 posts, retain the 8 strongest evidence cards, and cache results for 7 days. Manual research links cost zero Apify credits.</div><CompetitorResearch onIdeaSaved={()=>void load()} onModel={modelCreator}/></div>}
    </main>
  </div>;
}
