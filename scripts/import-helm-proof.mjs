// One-time import of Helm case studies + curated testimonials into Sales OS resources.
// Run: node scripts/import-helm-proof.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- load env from .env.local ---
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_CALLS_URL, env.SUPABASE_CALLS_SERVICE_KEY);

const cleanTitle = (h) => h.replace(/^🔔\s*Ring the Bell\s*[-–]\s*/i, "").trim();
const firstName = "{name}";

// --- Case studies (from Helm proof_items) ---
const CASE_STUDIES = [
  { headline: "🔔 Ring the Bell - First $12,000 High Ticket Sale With the IG Prospector Tool", proof_point: "$12K high ticket client landed with the IG Prospector", one_liner: "JR Spear just closed his first $12,000 high ticket client using my Social Prospector IG tool.", story: "JR was building and testing, doing the work but not seeing the sales come through. He put my Social Prospector IG Prospector tool to work and started reaching out with a real system instead of hoping. A few conversations later he landed his first high ticket client at $12,000. That is the difference between an app that almost works and one that gets paid.", person: "JR Spear", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/056d3a56-05c0-4a35-bb2b-2804521af7f7/1784417638049-pkqjw7.png", video_url: null },
  { headline: "🔔 Ring the Bell - $23.7K Revenue Week + 4 New Core Offer Clients", proof_point: "$23.7K revenue week, $9.5K collected, 4 new clients", one_liner: "Charlie booked a $23.7K revenue week with $9.5K collected and 4 new core offer clients, all by stepping OFF sales calls and onto onboarding and driving calls.", story: "A few weeks ago Charlie was stuck in the sales call grind, chasing every lead himself. We restructured his week around onboarding and driving calls instead of pitching. The result: a $23.7K revenue week, $9.5K collected, and 4 new core offer clients. Now he's building out his recurring revenue offer and finally tracking client success like a real CEO.", person: "Charlie", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/db55102e-dfd5-4b87-be3c-987177d8c5b8/1783548332631-wa4ivr.jpeg", video_url: null },
  { headline: "🔔 Ring the Bell - $85K in a Single Month, 7-Figure Run Rate Holding Strong Into Q1", proof_point: "$85K month, 7-figure run rate sustained into Q1", one_liner: "Just posted an $85K month, which keeps my 7-figure annual run rate rolling into Q1.", story: "A few years ago I was trading hours for dollars and stuck in the weeds of my own business. Then I built systems and layered AI into every part of how I operate and serve clients. This month closed at $85K, and the run rate is now firmly in seven figures heading into Q1. Proof that peaceful and profitable are not opposites.", person: "Andrew Kroeze", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/db55102e-dfd5-4b87-be3c-987177d8c5b8/1783548329405-aus3nn.png", video_url: null },
  { headline: "🔔 Ring the Bell - 6 New Clients Closed (2 of Them Whales) Before July Even Started", proof_point: "6 clients closed, 2 of them whales, in a single stretch", one_liner: "One of my clients just texted me that he closed 6 new clients, 2 of them whales, all starting the beginning of July.", story: "Before we built his systems, he was chasing leads one at a time and hoping the right person said yes. We dialed in his AI-powered sales process so the right conversations happened on repeat. Then this text landed: 6 clients closed, 2 of them whales, all starting in July. That is what happens when you stop guessing and build the machine.", person: null, image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/db55102e-dfd5-4b87-be3c-987177d8c5b8/1783548224023-t3cwpx.jpeg", video_url: null },
  { headline: "🔔 Ring the Bell - 11 App Upgrades Implemented in One Day!", proof_point: "11 AI-driven app improvements shipped in a single day", one_liner: "Dan Turner used one simple prompt tweak to pull 11 concrete recommendations from Claude and shipped every single one of them in a day, leveling up the custom diabetes coaching app he's building for his clients.", story: "Dan Turner coaches people living with diabetes, and he's been building custom apps to serve them at scale. He was stuck on how to make his app better until he tried one small shift, telling Claude to act as the top 0.001% of app creators. That one prompt pulled back 11 specific recommendations, and Dan implemented all of them in a single day. Now he's adding even more, and he can't stop telling me how excited he is about what he built.", person: "Dan Turner", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/unassigned/1782920335287.png", video_url: null },
  { headline: "From $20K to $100K in 2 Months — Samin Yasar", proof_point: "First $100K month, nearly all profit", one_liner: "Samin Yasar went from $20K months to his first $100K month in about 60 days, almost entirely profit, powered by his YouTube engine, Instagram engine, and Skool community.", story: "Two months ago Samin was sitting around $20K per month. He plugged in his content engines on YouTube and Instagram, built out his Skool community, and tightened up his offer and sales process. Last month he crossed $100K for the first time. And the best part: it came in with high profit, not bloated ad spend or a team eating the margins.", person: "Samin Yasar", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/35ef49b7-a68a-4e32-b17b-97ba3dc41d34/1782750840876.jpeg", video_url: null },
  { headline: "🔔 Ring the Bell - First $10K Month!", proof_point: "From no offer to $10K months", one_liner: "Dylan Kennelly went from having no clue what his offer should be to locking in $10K months.", story: "When Dylan came in, he had no idea what his offer should even be. No clarity, no traction. We got to work nailing down the offer first, then building the structure to sell it. Now he is running $10K months with a clear path to keep climbing.", person: "Dylan Kennelly", image_url: null, video_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/1eea99b3-2a2c-4412-a598-45e128a4400e/1782664252642.mov" },
  { headline: "🔔 Ring the Bell - 6 Clients Closed in 1 Week!", proof_point: "6 clients closed in one week, 2 of them whales", one_liner: "Kendall Shaw went from stuck to closing 6 new clients in a single week, with 2 of them being whales, all starting in early July.", story: "A few weeks ago Kendall was stuck, spinning his wheels, unsure where the next client was coming from. We tightened up his offer and his conversations. Then the floodgates opened. In one week he closed 6 new clients, 2 of them whales, all kicking off in early July.", person: "Kendall Shaw", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/82e4b99c-afb0-4c76-b632-5e84c206faea/1782661132649.jpeg", video_url: null },
  { headline: "🔔 Ring the Bell - $56K Best Month Ever in 3 Months!", proof_point: "$56K month in just 90 days, with a clear path to $100K", one_liner: "Nick Bonitatibus hit the biggest month in his business at $56K, and he did it in just 3 months of working together.", story: "When Nick started, a $56K month felt like a someday number. Three months in, he texted me the words every coach loves to hear: biggest month in business, made 56K. We didn't chase some new tactic or shiny funnel. We tightened what he already had, and now he sees the exact path to $100K months.", person: "Nick Bonitatibus", image_url: "https://sjavfzvbiolbnnvifnit.supabase.co/storage/v1/object/public/proof-media/95fbf083-5967-4bf0-9ee4-ee29eb3c5a3d/1782660681606.jpeg", video_url: null },
  { headline: "🔔 Ring the Bell - $1.1M in His First Year!", proof_point: "From burnt-out sales rep to $1.1M in 12 months", one_liner: "Cole Gordon went from a burnt-out sales rep to $70K on his first launch, $270K on his second, and $1.1M in his first year.", story: "Cole was a sales rep running on fumes. He built his community funnel, crafted his high-ticket offers, and gave himself a real shot. His first launch brought in $70K. His second hit $270K. Twelve months later he had scaled the whole thing to $1.1 million.", person: "Cole Gordon", image_url: null, video_url: null },
  { headline: "🔔 Ring the Bell - First $100K Month!", proof_point: "$0 to $1.1M in 12 months, first $100K month locked in", one_liner: "Jen & Stacy Conkey hit their first $100K month on the way to $1.1M in 12 months, starting from scratch in cash flow real estate coaching.", story: "Jen and Stacy started from zero. No list, no offer proven at scale, just a message they believed in around cash flow real estate. Twelve months later they crossed $1.1M, and this screenshot is the moment they hit their first $100K month. Today they run multiple 8-figure businesses. This one is an OG shout out.", person: "Jen & Stacy Conkey", image_url: "https://rruzgmiauexvbxspkyuz.supabase.co/storage/v1/object/public/proof-media/8409b2b3-fa52-4acb-a625-cf1163f54f77/1781558639765-Screenshot-2026-06-15-at-2.23.06-PM.png", video_url: null },
];

// --- Curated testimonials (cleaned client wins) ---
const TESTIMONIALS = [
  { name: "Kavetha", quote: "Ended November with $155K in cash collected. Grateful beyond words.", result: "$155K cash collected in a month" },
  { name: "Rae Ireland", quote: "$70K cash month, 7 masterminds, 5 cities.", result: "$70K cash month" },
  { name: "Yvette Kahn", quote: "Just got my first client for my 10K Passive Income Accelerator with $3,500 cash collected on the call. Never ever had this happen before!", result: "First client, $3,500 collected on the call" },
  { name: "LEX JAY", quote: "My CEO win: last week I sold $129,500 in sponsorships.", result: "$129,500 in sponsorships" },
  { name: "Sammy / Moses Taggett", quote: "New record month for us! $102K in sales this month.", result: "$102K record month" },
  { name: "Scott Barrie", quote: "$115K revenue in May. Conversion has proven itself, now focusing on increasing leads.", result: "$115K month" },
  { name: "Jason Jackson", quote: "Another record revenue month for my agency and we started October with a $25K paid-in-full custom AI build. People are paying top dollar for solutions.", result: "$25K PIF build, record month" },
  { name: "Josh Chernikoff", quote: "Recorded a masterclass for an online conference. It aired Saturday while I was with family, and by Saturday afternoon I had five booked calls from that appearance.", result: "5 booked calls from one masterclass" },
  { name: "Danno Hanfling", quote: "I just had my back to back $30K months in my business. This has never ever happened before and I can't wait to do it again next month.", result: "Back-to-back $30K months" },
  { name: "Bastiaan Slot", quote: "Scaled from $30K per month to $100K per month within 90 days, then kept going and now runs a thriving 8-figure coaching company.", result: "$30K → $100K/mo in 90 days" },
];

function caseStudyRow(cs, i) {
  const title = cleanTitle(cs.headline);
  const script = {
    title: "📤 Send this proof",
    body: `${firstName} this is the kind of result we help people create...\n\n${cs.one_liner}\n\nwhat would a win like that mean for you right now?`,
  };
  return {
    title,
    subtitle: cs.proof_point,
    about: cs.one_liner,
    url: cs.video_url ?? cs.image_url ?? null,
    image_url: cs.image_url,
    category: "case_study",
    type: "case_study",
    sort_order: i,
    metadata: { story: cs.story, person_name: cs.person, source: "helm", media_type: cs.video_url ? "video" : "image" },
    value_scripts: [script],
    active: true,
  };
}

function testimonialRow(t, i) {
  const script = {
    title: "📤 Drop this testimonial",
    body: `${firstName} here's a client who was right where you are...\n\n"${t.quote}" — ${t.name}\n\nreal person, real result. curious what's got you looking into this right now?`,
  };
  return {
    title: t.name,
    subtitle: t.result,
    about: t.quote,
    url: null,
    image_url: null,
    category: "testimonial",
    type: "testimonial",
    sort_order: i,
    metadata: { source: "helm" },
    value_scripts: [script],
    active: true,
  };
}

const rows = [
  ...CASE_STUDIES.map(caseStudyRow),
  ...TESTIMONIALS.map(testimonialRow),
];

// Avoid duplicates if run twice: delete prior helm-sourced rows first
const { error: delErr } = await db.from("resources").delete().eq("metadata->>source", "helm");
if (delErr) console.error("cleanup warn:", delErr.message);

const { data, error } = await db.from("resources").insert(rows).select("id, category, title");
if (error) { console.error("INSERT ERROR:", error); process.exit(1); }
console.log(`Inserted ${data.length} resources:`);
console.log(`  case studies: ${data.filter((r) => r.category === "case_study").length}`);
console.log(`  testimonials: ${data.filter((r) => r.category === "testimonial").length}`);
