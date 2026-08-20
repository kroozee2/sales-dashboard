import { NextResponse } from "next/server";
import { contentDb } from "@/lib/supabase-content";

export const runtime = "nodejs";

export async function GET() {
  const db = contentDb();

  // Query posted content from Supabase
  const { data: posts } = await db
    .from("posted_content")
    .select("*")
    .eq("platform", "instagram")
    .order("posted_at", { ascending: false });

  const igPosts = posts ?? [];

  // Exact Andrew Kroeze profile & metrics from instagram-dashboard-andrew
  const summary = {
    name: "Andrew Kroeze",
    handle: "@kaptainkroeze",
    bio: "Peaceful, purposeful & wildly profitable 7-figure business",
    postsCount: 318,
    reelsCount: 196,
    followers: 64218,
    followersDelta: 2.4,
    followersDeltaAbs: 1512,
    impressions: "241.6k",
    impressionsDelta: 18.2,
    reach: "158.3k",
    reachDelta: 11.4,
    profileVisits: "5,910",
    profileVisitsDelta: 9.7,
    linkClicks: "1,284",
    linkClicksDelta: -3.1,
    lastUpdated: new Date().toISOString(),
  };

  // Top Performing Posts with real hooks, retentions, and "what worked" breakdowns
  const topPosts = [
    {
      id: "p1",
      rank: 1,
      type: "reel",
      title: "The AI workflow that replaced my $4k/mo VA",
      likes: 14200,
      saves: 3180,
      shares: 1290,
      comments: 642,
      reach: 198000,
      views: 412000,
      er: 7.4,
      date: "Apr 18",
      hook: '"I fired my VA in March. Here\'s the system that replaced her — for $0."',
      cta: 'Comment "STACK" and I\'ll send the full automation map.',
      retention: [100, 96, 88, 84, 80, 77, 74, 72, 70, 68, 66],
      worked: [
        'Cold-open with a concrete claim ("I fired my VA") — stops the scroll in <1s.',
        'Names a dollar figure in the first line; specificity reads as proof.',
        'Comment-to-DM CTA drove 3,180 saves and 642 comments — highest save rate this month.',
      ],
    },
    {
      id: "p2",
      rank: 2,
      type: "carousel",
      title: "5 prompts that book me 5 sales calls a week",
      likes: 9820,
      saves: 4410,
      shares: 870,
      comments: 388,
      reach: 141000,
      views: null,
      er: 8.1,
      date: "Apr 16",
      hook: 'Slide 1: "Steal my 5 prompts (swipe)." Big number + imperative verb.',
      cta: "Save this so you actually use it. Follow for the full SOP.",
      retention: [100, 92, 85, 79, 76, 71],
      worked: [
        'Carousels with a "steal this" framing over-index on saves — 4,410 here vs 1,900 avg.',
        "Each slide is one prompt, one outcome — zero filler, high swipe-through.",
        "Save-first CTA matches the format intent; best save:reach ratio (3.1%).",
      ],
    },
    {
      id: "p3",
      rank: 3,
      type: "reel",
      title: "Why your coaching offer isn't converting (60s fix)",
      likes: 11200,
      saves: 2140,
      shares: 1510,
      comments: 511,
      reach: 167000,
      views: 289000,
      er: 6.8,
      date: "Apr 14",
      hook: '"Your offer isn\'t broken. Your first sentence is." — problem-reframe hook.',
      cta: 'DM "OFFER" for the 1-page positioning template.',
      retention: [100, 90, 82, 78, 73, 69, 66, 63, 61],
      worked: [
        'Reframe hooks ("it\'s not X, it\'s Y") are your highest-share format — 1,510 shares.',
        "Tight 48s runtime kept retention above 60% to the end.",
        "Pattern-interrupt b-roll cut every 2.5s sustained watch-time.",
      ],
    },
    {
      id: "p4",
      rank: 4,
      type: "reel",
      title: "I write a week of content in 20 minutes. The stack:",
      likes: 8740,
      saves: 3920,
      shares: 980,
      comments: 297,
      reach: 132000,
      views: 241000,
      er: 6.0,
      date: "Apr 12",
      hook: '"20 minutes. One week of content. No team." — time-compression promise.',
      cta: 'Comment "CONTENT" for the exact prompt chain.',
      retention: [100, 88, 80, 75, 70, 66, 62, 60],
      worked: [
        "Numeric promise in the hook sets a clear, testable expectation.",
        "Showed the screen recording of the actual workflow — proof > claims.",
        "High save rate signals 'I\'ll do this later' intent.",
      ],
    },
  ];

  // Competitor Intelligence from instagram-dashboard-andrew
  const competitors = [
    {
      id: "c1",
      handle: "justyn.ai",
      name: "Justyn · AI Operator",
      followers: "312k",
      avgViews: "1.4M",
      perWeek: 5,
      cadence: "5 reels/wk · Tue–Sat · 6pm",
      summary: "Demo-driven. Almost every reel is a screen-recording of a real automation with a numeric promise in the first 2 seconds.",
      topics: ["Multi-agent systems", "No-code automations", "Content ops", "Client delivery"],
      hookStyle: 'Time/money compression ("X in Y minutes") + live screen proof.',
      posts: [
        {
          id: "c1p1",
          views: "2.4M",
          title: "The 3-agent setup that runs my business",
          hook: '"This runs my entire business while I sleep." (over a live dashboard)',
          retention: "87% avg watch · strongest in his last 30 posts",
          tactic: "Opens mid-action on a working dashboard — no intro, no face. Curiosity + proof in frame 1.",
          cta: '"Comment AGENTS for the build doc."',
          why: "Pairs a bold sleep-economy claim with on-screen proof; keyword CTA farms comments for reach.",
          format: "Screen-record + captions, no talking head",
        },
        {
          id: "c1p2",
          views: "980k",
          title: "I replaced 4 tools with 1 prompt",
          hook: '"You\'re paying for 4 tools that one prompt replaces."',
          retention: "71% avg watch",
          tactic: "Cost-anchoring hook (attacks viewer\'s current spend), then reveals the consolidation.",
          cta: '"Save this before your next renewal."',
          why: "Loss-aversion framing + save CTA.",
          format: "Screen-record walkthrough",
        },
      ],
    },
    {
      id: "c2",
      handle: "advicewithjean",
      name: "Jean · Business Advice",
      followers: "588k",
      avgViews: "1.1M",
      perWeek: 7,
      cadence: "7 reels/wk · daily · 8am",
      summary: "Contrarian, conversational. Leads with a belief-flip the audience holds, then justifies it in 30s. Talking-head, eye-contact heavy.",
      topics: ["Pricing & positioning", "Offer design", "Mindset", "Client acquisition"],
      hookStyle: 'Belief-flip / "stop doing X" contrarian openers.',
      posts: [
        {
          id: "c2p1",
          views: "1.8M",
          title: "Quit charging for your time",
          hook: '"Charging hourly is keeping you broke. Stop it."',
          retention: "74% avg watch",
          tactic: "Direct command + named enemy (hourly billing). Polarizing on purpose.",
          cta: '"Comment OFFER for my pricing framework."',
          why: "Polarizing belief-flips generate debate in comments; keyword CTA converts reach into leads.",
          format: "Talking head, direct to camera",
        },
        {
          id: "c2p2",
          views: "920k",
          title: "The 1 sentence that doubled my close rate",
          hook: '"I said one sentence and my close rate doubled."',
          retention: "69% avg watch",
          tactic: "Curiosity gap with a quantified outcome; withholds the sentence until 0:20 to hold watch-time.",
          cta: '"Save this for your next sales call."',
          why: "Delayed payoff structure keeps retention high.",
          format: "Talking head + on-screen text",
        },
      ],
    },
    {
      id: "c3",
      handle: "the.ai.operator",
      name: "Devon · AI for Agencies",
      followers: "141k",
      avgViews: "640k",
      perWeek: 4,
      cadence: "4 posts/wk · Mon/Wed/Fri/Sun",
      summary: "Carousel-first educator. Turns one workflow into a 7-slide SOP. Highest save rates in the set.",
      topics: ["Agency delivery", "SOPs", "Client onboarding", "Margins"],
      hookStyle: '"Steal my SOP" + numbered, save-bait carousels.',
      posts: [
        {
          id: "c3p1",
          views: "1.1M",
          title: "Steal my client onboarding SOP (7 steps)",
          hook: 'Slide 1: "Steal my onboarding SOP →" with a blurred doc preview.',
          retention: "63% swipe-through to last slide",
          tactic: 'Blurred-asset preview creates a "I want that" pull; numbered steps promise completeness.',
          cta: '"Save + follow — I post one SOP a week."',
          why: "Save-bait carousels compound: saves signal value.",
          format: "7-slide carousel, doc screenshots",
        },
      ],
    },
  ];

  // Strategic Content Gaps & Weekly Recommendations
  const gaps = [
    { text: 'You have no posts on "pricing" — your audience\'s #1 saved topic from competitors. Worth a reel?', tag: "content gap" },
    { text: "justyn.ai posts at 6pm and you post at 8am. Your reach peaks Wed 12p–3p — test an afternoon slot?", tag: "timing" },
    { text: 'Carousels are 21% of your posts but 31% of your saves. Make more "steal this" SOP carousels?', tag: "format" },
    { text: 'Your strongest hooks are dollar-proof ("$12k","$4k"). Only 2 of last 10 posts used a number — lean in?', tag: "hooks" },
  ];

  const recommendations = [
    {
      id: "rec-1",
      type: "reel",
      title: "🎬 High-Reach Demo Reel: 'The AI Workflow That Runs My $100k/mo Business'",
      format: "Reels",
      reasoning: "Modeled after justyn.ai's top reel (2.4M views). Live screen proof + dollar claim in frame 1.",
      hook: "This 3-agent setup runs my entire business while I sleep. Here's the exact build...",
      cta: "Comment 'AGENTS' and I'll send you the build doc.",
      targetPillar: "AI & Systems",
    },
    {
      id: "rec-2",
      type: "carousel",
      title: "🎠 Steal My SOP Carousel: '5 Prompts That Book 5 High-Ticket Sales Calls a Week'",
      format: "Carousel",
      reasoning: "Modeled after your #2 post (4.4k saves) and Devon's SOP carousels.",
      hook: "Steal my 5 prompts (swipe). Slide 1: The cold re-opener prompt...",
      cta: "Save this post so you actually use it on your next outreach.",
      targetPillar: "Sales & Prompt Chains",
    },
    {
      id: "rec-3",
      type: "reel",
      title: "🎬 Contrarian Belief-Flip Reel: 'Quit Charging Hourly or Per Month'",
      format: "Reels",
      reasoning: "Modeled after advicewithjean's 1.8M view reel. Polarizing belief-flip that drives comments.",
      hook: "Charging hourly or monthly retainers is keeping you broke. Here's what 7-figure founders do instead...",
      cta: "Comment 'OFFER' for my value-positioning framework.",
      targetPillar: "Pricing & Offers",
    },
  ];

  return NextResponse.json({
    summary,
    topPosts,
    competitors,
    gaps,
    recommendations,
    postedCount: igPosts.length,
    dbPosts: igPosts.slice(0, 10),
  });
}
