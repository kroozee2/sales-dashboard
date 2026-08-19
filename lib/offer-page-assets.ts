export type OfferPageCategory = "funnel" | "lead-magnet" | "client-asset" | "member-asset" | "event-asset";

export type OfferPageAsset = {
  id: string;
  title: string;
  url: string;
  category: OfferPageCategory;
  purpose: string;
  audience: string;
  tags: string[];
  featured?: boolean;
};

export const OFFER_PAGE_CATEGORIES = [
  { id: "all", label: "All Pages", emoji: "✦", description: "Every public page and client-facing asset" },
  { id: "funnel", label: "Funnels", emoji: "💰", description: "Pages designed to sell or convert" },
  { id: "lead-magnet", label: "Lead Magnets", emoji: "🧲", description: "Free value that captures or warms leads" },
  { id: "client-asset", label: "Client Assets", emoji: "🛠️", description: "Tools and systems built for clients" },
  { id: "member-asset", label: "Member Assets", emoji: "🎓", description: "Private resources for programs and communities" },
  { id: "event-asset", label: "Event Assets", emoji: "🎤", description: "Event, speaker, and attendee experiences" },
] as const;

export const OFFER_PAGE_ASSETS: OfferPageAsset[] = [
  {
    id: "7fc-ai-mastermind",
    title: "7-Figure CEO AI Mastermind",
    url: "https://7fc-ai-mastermind-doc.vercel.app/",
    category: "funnel",
    purpose: "Private invitation and application page for the flagship AI Mastermind.",
    audience: "Established coaches and consultants building lean 7-figure businesses.",
    tags: ["7-Figure CEO", "mastermind", "application", "high ticket"],
    featured: true,
  },
  {
    id: "miami-ai-mastermind",
    title: "Miami AI Mastermind Event",
    url: "https://miami-event-five.vercel.app/",
    category: "funnel",
    purpose: "Invitation and ticket funnel for the three-day Miami AI Mastermind.",
    audience: "High-ticket founders ready to install AI systems in person.",
    tags: ["mastermind", "Miami", "event", "ticket"],
    featured: true,
  },
  {
    id: "claude-for-founders",
    title: "Claude for Founders",
    url: "https://claude-for-founders.vercel.app/start",
    category: "lead-magnet",
    purpose: "Free login experience teaching founders to build AI apps and agents with Claude.",
    audience: "Nontechnical founders who want an AI operating system.",
    tags: ["Claude", "AI apps", "free access", "signup"],
    featured: true,
  },
  {
    id: "skool-launch-system",
    title: "Skool Launch AI System",
    url: "https://skool-graphics-generator.vercel.app/",
    category: "client-asset",
    purpose: "Generates Skool positioning, copy, graphics, onboarding, courses, and content plans.",
    audience: "Coaches and creators launching or growing a Skool community.",
    tags: ["Skool", "graphics", "community", "AI system"],
  },
  {
    id: "scriptless-sales",
    title: "Scriptless Sales AI",
    url: "https://scriptless-xi.vercel.app/",
    category: "client-asset",
    purpose: "Turns an offer brain dump into a nine-section sales-call system and training.",
    audience: "Founders and sales teams who want confident calls without rigid scripts.",
    tags: ["sales", "script", "calls", "AI system"],
  },
  {
    id: "listings-lab-setting-system",
    title: "Listings Lab Setting System",
    url: "https://listings-lab-setting-system.vercel.app/",
    category: "client-asset",
    purpose: "Private prospect, setter, and pipeline workspace built for Listings Lab.",
    audience: "The Listings Lab sales and setting team.",
    tags: ["Listings Lab", "prospects", "setting", "client portal"],
  },
  {
    id: "mastermind-member-portal",
    title: "7-Figure CEO Member Portal",
    url: "https://mastermind-portal-zeta.vercel.app/",
    category: "member-asset",
    purpose: "Private operating portal for Mastermind training, calls, replays, content, and implementation.",
    audience: "Active 7-Figure CEO Mastermind members.",
    tags: ["mastermind", "portal", "training", "replays"],
  },
  {
    id: "ai-employee-course",
    title: "Build Your First AI Employee",
    url: "https://mastermind-portal-zeta.vercel.app/ai-employee-course",
    category: "member-asset",
    purpose: "Step-by-step course for choosing, defining, and building a useful AI employee.",
    audience: "Founders implementing their first AI agent or employee.",
    tags: ["AI employee", "course", "Hermes", "implementation"],
  },
  {
    id: "elite-live-speaker-kit",
    title: "Elite Live Speaker Kit",
    url: "https://elite-live-speaker-kit.vercel.app/",
    category: "event-asset",
    purpose: "Complete speaker handoff with sessions, bio, headshots, stage intro, and promotional copy.",
    audience: "Event organizers and the Elite Live promotion team.",
    tags: ["speaker", "event", "bio", "promotion"],
  },
  {
    id: "7fc-case-studies",
    title: "7-Figure CEO Case Studies",
    url: "https://7fc-case-studies.vercel.app/",
    category: "funnel",
    purpose: "Authority and proof page that explains the AI systems offer and drives qualified calls.",
    audience: "Coaches and consultants evaluating 7-Figure CEO.",
    tags: ["case studies", "AI systems", "book a call", "proof"],
    featured: true,
  },
  {
    id: "skool-launch-offer",
    title: "7-Figure Skool Launch System",
    url: "https://skool-launch.vercel.app/",
    category: "funnel",
    purpose: "Application funnel for the eight-week done-for-you Skool community build.",
    audience: "Coaches with a proven offer who need a community-powered client pipeline.",
    tags: ["Skool", "application", "community funnel", "high ticket"],
    featured: true,
  },
  {
    id: "listings-lab-offer",
    title: "Listings Lab DM Sales Engine",
    url: "https://listings-lab-offer.vercel.app/",
    category: "funnel",
    purpose: "Private proposal outlining the DM setting system, implementation plan, and partnership.",
    audience: "Jess Lenouvel and the Listings Lab leadership team.",
    tags: ["Listings Lab", "proposal", "DM sales", "partnership"],
  },
  {
    id: "ai-agent-webinar",
    title: "AI Agent Free Training Funnel",
    url: "https://webinar-funnel-eta.vercel.app/",
    category: "lead-magnet",
    purpose: "Opt-in page for the free 5 C's AI-agent training.",
    audience: "Coaches who want AI agents running meaningful business work.",
    tags: ["webinar", "free training", "5 C's", "opt in"],
  },
  {
    id: "identity-ai",
    title: "Identity AI",
    url: "https://identity-ai.vercel.app/",
    category: "lead-magnet",
    purpose: "Free identity-change app that exposes patterns and creates a daily embodiment practice.",
    audience: "Founders becoming the person their goals require.",
    tags: ["identity", "personal growth", "free app", "daily practice"],
  },
  {
    id: "uare-growth-brief",
    title: "Uare.ai Growth Brief",
    url: "https://uare-growth-brief.vercel.app/",
    category: "client-asset",
    purpose: "Interactive 30-day organic growth strategy and partnership brief for Uare.ai.",
    audience: "The Uare.ai founding team.",
    tags: ["Uare.ai", "growth strategy", "proposal", "client brief"],
  },
  {
    id: "partnership-ai-engine",
    title: "Partnership AI Engine",
    url: "https://flow-deal-system.vercel.app/",
    category: "client-asset",
    purpose: "Private deal-flow and partnership operating system.",
    audience: "Founders managing strategic partnerships and opportunities.",
    tags: ["partnerships", "deal flow", "CRM", "client system"],
  },
  {
    id: "messaging-builder",
    title: "7-Figure CEO Messaging Builder",
    url: "https://messaging-builder-zeta.vercel.app/",
    category: "member-asset",
    purpose: "Private builder for creating clear, conversion-focused offer messaging.",
    audience: "7-Figure CEO clients refining positioning and copy.",
    tags: ["messaging", "positioning", "copy", "builder"],
  },
  {
    id: "instagram-growth-engine",
    title: "Instagram Growth Engine",
    url: "https://reel-script-app.vercel.app/",
    category: "member-asset",
    purpose: "Private app for developing Instagram Reel scripts and growth content.",
    audience: "Clients building a consistent Instagram content engine.",
    tags: ["Instagram", "Reels", "scripts", "content"],
  },
  {
    id: "masterclass-promo-hub",
    title: "Claude AI Masterclass Promo Hub",
    url: "https://masterclass-promo-hub.vercel.app/",
    category: "event-asset",
    purpose: "Partner-ready launch plan, copy library, speaker proof, and media kit for a live masterclass.",
    audience: "Partners and community teams promoting Andrew's guest training.",
    tags: ["masterclass", "promo kit", "partner", "event"],
  },
  {
    id: "miami-speaker-hub",
    title: "Miami Mastermind Speaker Hub",
    url: "https://miami-speaker-hub.vercel.app/",
    category: "event-asset",
    purpose: "Central information and asset hub for Miami AI Mastermind speakers.",
    audience: "Confirmed speakers and the Miami event team.",
    tags: ["Miami", "speakers", "event", "assets"],
  },
];

export function filterOfferPageAssets(
  assets: OfferPageAsset[],
  category: OfferPageCategory | "all",
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  return assets.filter((asset) => {
    if (category !== "all" && asset.category !== category) return false;
    if (!normalized) return true;
    return [asset.title, asset.purpose, asset.audience, ...asset.tags]
      .some((value) => value.toLowerCase().includes(normalized));
  });
}
