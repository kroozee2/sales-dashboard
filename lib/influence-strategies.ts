export type InfluenceCategoryId =
  | "proper-state"
  | "initial-engagement"
  | "sustainable-engagement"
  | "if-only-frames"
  | "open-loops"
  | "perceived-value"
  | "increasing-belief"
  | "moving-to-action";

export type InfluenceTactic = Readonly<{
  id: string;
  title: string;
  explanation: string;
  example: string;
}>;

export type InfluenceCategory = Readonly<{
  id: InfluenceCategoryId;
  title: string;
  purpose: string;
  icon: string;
  accent: "violet" | "sky" | "emerald" | "amber" | "rose" | "indigo" | "cyan" | "lime";
  tactics: readonly InfluenceTactic[];
}>;

export type InfluenceBuilderFieldId =
  | "audience"
  | "currentState"
  | "desiredState"
  | "ifOnly"
  | "reframe"
  | "openLoop"
  | "proof"
  | "nextAction";

export type InfluenceBuilderValues = Partial<Record<InfluenceBuilderFieldId, string>>;

type TacticSeed = readonly [title: string, explanation: string, example: string];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tactics(categoryId: InfluenceCategoryId, seeds: readonly TacticSeed[]): readonly InfluenceTactic[] {
  return seeds.map(([title, explanation, example]) => ({
    id: `${categoryId}-${slugify(title)}`,
    title,
    explanation,
    example,
  }));
}

export const INFLUENCE_CATEGORIES: readonly InfluenceCategory[] = [
  {
    id: "proper-state",
    title: "Proper State",
    purpose: "Help people feel understood, safe, and open to a more useful way forward.",
    icon: "HeartPulse",
    accent: "violet",
    tactics: tactics("proper-state", [
      ["Name the present emotion", "Say what the person may be feeling without exaggerating it.", "For a 7-Figure CEO coach: You are making money, but the unpredictability still feels heavier than it should."],
      ["Describe the desired feeling", "Make the emotional outcome as clear as the business outcome.", "For a heart-centered consultant: Imagine entering Monday with a peaceful plan for leads, sales, and delivery."],
      ["Normalize the struggle", "Separate a system problem from a character flaw.", "For a coach: Inconsistent revenue does not mean you are bad at business; it often means the growth activities are disconnected."],
      ["Remove shame before teaching", "Lower defensiveness by replacing blame with a solvable diagnosis.", "For 7-Figure CEO: You do not need more pressure; you need fewer disconnected strategies."],
      ["Create safety", "Show that progress does not require destroying what already works.", "For a consultant: You can protect profit, peace, and purpose without rebuilding the entire business."],
      ["Create possibility", "Use credible proximity, not inflated promises, to show the result is attainable.", "For a $50K-month coach: A calmer weekly conversion rhythm can begin before you add a bigger audience or team."],
      ["Activate identity", "Speak to who the person is becoming and what they value.", "For a heart-centered CEO: You are not becoming a full-time content creator; you are building a purposeful company."],
      ["Contrast chaos and control", "Make the difference between the current and desired operating experience visible.", "For 7-Figure CEO: Replace bursts of effort with Connect Daily, Convert Weekly, Compound Monthly."],
      ["Use calm urgency", "Clarify the cost of waiting without fear tactics.", "For a consultant: Each month without a conversion rhythm leaves good conversations and compounding proof unused."],
      ["Invite a micro-commitment", "Ask for one small internal decision before the larger action.", "For a coach: Decide whether you are willing to replace random activity with one peaceful weekly rhythm."],
    ]),
  },
  {
    id: "initial-engagement",
    title: "Initial Engagement",
    purpose: "Turn passive attention into active thought within the first moments.",
    icon: "MousePointerClick",
    accent: "sky",
    tactics: tactics("initial-engagement", [
      ["Ask a diagnostic question", "Invite the person to locate the problem in their own business.", "For a 7-Figure CEO coach: Which is less predictable right now, leads, sales, or profit?"],
      ["Offer a useful choice", "Use two meaningful options that reveal priorities rather than forcing agreement.", "For a consultant: Would you rather double your audience or double the percentage of qualified people who buy?"],
      ["Prompt self-identification", "Describe a recognizable role or behavior and let people opt in mentally.", "For a coach: Are you still the person holding content, sales, and delivery together?"],
      ["Challenge an assumption", "Lead with a credible tension that earns an explanation.", "For 7-Figure CEO: More leads will not stabilize a business that cannot Convert Weekly."],
      ["Invite a prediction", "Ask the audience to anticipate an outcome before you explain it.", "For an AI-enabled consultant: What happens when you automate a follow-up process that was never clear?"],
      ["Interrupt the pattern", "Use a concise line that changes how the problem is categorized.", "For a coach: Your content problem may actually be a conversation problem."],
      ["Use a self-score", "Give people a simple scale for honest self-assessment.", "For a $50K-$100K monthly profit CEO: From 1 to 10, how predictable is next month's revenue?"],
      ["Mirror a real moment", "Describe a specific scene the audience recognizes immediately.", "For a consultant: You publish a strong post, get engagement, and still start no qualified sales conversations."],
      ["Expose the contradiction", "Place two true observations beside each other to create productive tension.", "For a coach using AI: You have more tools and more content, yet the business still depends on you."],
      ["Request a one-word response", "Lower the effort required to participate.", "For 7-Figure CEO: Reply LEADS, SALES, or SYSTEMS with the constraint you want to fix first."],
    ]),
  },
  {
    id: "sustainable-engagement",
    title: "Sustainable Engagement",
    purpose: "Keep attention by continually rewarding it with clarity, progress, and relevance.",
    icon: "Waves",
    accent: "emerald",
    tactics: tactics("sustainable-engagement", [
      ["Show the roadmap", "Tell people where the teaching is going and how the pieces connect.", "For 7-Figure CEO: We will diagnose connection, conversion, and compounding in that order."],
      ["Mark visible progress", "Name what has been resolved before moving to the next layer.", "For a coach: We found the lead constraint; now we will inspect the weekly conversion event."],
      ["Alternate tension and relief", "Follow each meaningful problem with a useful insight or action.", "For a consultant: Identify the volatility, simplify it with Convert Weekly, then address the next constraint."],
      ["Use a callback", "Reconnect a later insight to an earlier promise or phrase.", "For 7-Figure CEO: Remember when we said the content problem was a conversation problem? This is where Connect Daily solves it."],
      ["Escalate relevance", "Connect a surface symptom to its larger operational consequence.", "For a coach: Inconsistent posting becomes inconsistent conversations, then sales volatility, then pressure on profit and peace."],
      ["Tell the change in stages", "Use before, realization, method, obstacle, and result instead of a miracle jump.", "For a consultant: Random launches became a weekly rhythm after the team connected AI follow-up to real conversations."],
      ["Repeat the anchor", "Return to one memorable organizing idea throughout the message.", "For 7-Figure CEO: Keep orienting every section to Connect Daily, Convert Weekly, Compound Monthly."],
      ["Invite micro-decisions", "Ask small questions that help people apply the idea while listening.", "For a coach: Would one protected weekly conversion event make next month feel more controllable?"],
      ["Change the mode", "Move between story, question, framework, demonstration, and action.", "For an AI consultant: Show the connected system, ask where theirs breaks, then map one real workflow."],
      ["Reward attention early", "Deliver a useful insight before asking for extended attention.", "For a $50K-month coach: Reveal the likely bottleneck in the first minute, then explain the full profit, peace, purpose path."],
    ]),
  },
  {
    id: "if-only-frames",
    title: "If-Only Frames",
    purpose: "Surface the condition people think must change, then reveal the more accurate constraint.",
    icon: "RefreshCw",
    accent: "amber",
    tactics: tactics("if-only-frames", [
      ["More followers", "Shift the focus from audience size to relevant conversations.", "For a coach: If only I had more followers becomes I need more qualified Connect Daily conversations."],
      ["More leads", "Show that volume amplifies the conversion system already in place.", "For 7-Figure CEO: If only I had more leads becomes I need a dependable Convert Weekly mechanism."],
      ["A better offer", "Separate offer quality from unclear promise, proof, or path.", "For a consultant: If only my offer were better becomes I need a clearer profit, peace, purpose promise with proof."],
      ["More time", "Reframe time scarcity as a missing operating rhythm when that is accurate.", "For a coach: If only I had more time becomes I need a protected Connect Daily block and weekly conversion event."],
      ["A bigger team", "Clarify that people cannot compensate for unclear processes.", "For a $50K-month CEO: If only I had a bigger team becomes I need a simple system the team can actually run."],
      ["A better AI tool", "Move from tool collecting to connected workflow design.", "For an AI-enabled consultant: If only I found the right AI becomes I need the current tools connected to one business outcome."],
      ["More confidence", "Position confidence as evidence built through repetitions and feedback.", "For a heart-centered coach: If only I felt confident becomes I need small, truthful sales repetitions that preserve peace."],
      ["Better content performance", "Replace maximum reach with relevant attention and conversation.", "For 7-Figure CEO: If only my content performed better becomes I need content that starts the right daily connections."],
      ["Consistent revenue", "Tie consistency to repeatable actions rather than hope.", "For a consultant: If only revenue were stable becomes I need a Convert Weekly rhythm I can measure and improve."],
      ["Permission to scale", "Redefine scale around the quality of the business, not revenue alone.", "For a coach: If only I could scale becomes I need growth that protects profit, peace, and purpose."],
    ]),
  },
  {
    id: "open-loops",
    title: "Open Loops",
    purpose: "Create a specific unanswered question, then reward attention by closing it honestly.",
    icon: "CircleDashed",
    accent: "rose",
    tactics: tactics("open-loops", [
      ["Result before method", "Reveal a credible outcome while briefly withholding the mechanism.", "For a coach: One change created more qualified conversations without increasing content; the 7-Figure CEO method comes next."],
      ["Unexpected cause", "Suggest a non-obvious diagnosis that you can substantiate.", "For a consultant: Your strongest content may not convert because the next conversation is unclear, not because the content is weak."],
      ["Numbered anticipation", "Promise a bounded set and signal which item deserves attention.", "For 7-Figure CEO: There are three breaks in predictability; the Convert Weekly break is the one many coaches miss."],
      ["Interrupted transformation", "Pause a story at the moment a new problem or insight appears.", "For a coach: The team fixed lead flow, then uncovered the constraint that was quietly limiting profit."],
      ["Name the mechanism first", "Introduce a memorable term before explaining how it works.", "For a consultant: We call it the Weekly Conversion Event; next, see how it supports Connect Daily."],
      ["Promise a mistake reveal", "Flag a specific error and close it within the same experience.", "For an AI-enabled coach: One automation mistake makes every lead feel colder; we will identify it before the workflow map ends."],
      ["Promise a diagnosis", "Tell people what they will be able to identify by the end.", "For 7-Figure CEO: By the end, you will know whether connection, conversion, or compounding is constraining growth."],
      ["Create a before-after gap", "Show the endpoints and hold back the pivotal change briefly.", "For a consultant: Random launches became peaceful weekly sales; the shift was not more content."],
      ["Preview a demonstration", "Tell people exactly what you will apply or show next.", "For a $50K-month coach: In a moment, we will map this onto a real path toward $100K monthly profit."],
      ["Bridge to the next asset", "Close today's promise while creating a truthful reason to continue.", "For 7-Figure CEO: Today we fix Connect Daily; next we connect it to Convert Weekly without leaving this loop unanswered."],
    ]),
  },
  {
    id: "perceived-value",
    title: "Perceived Value",
    purpose: "Make the result clearer, more credible, more relevant, and easier to act on.",
    icon: "Gem",
    accent: "indigo",
    tactics: tactics("perceived-value", [
      ["Specify the result", "Replace broad improvement language with an observable outcome.", "For a coach: Build a weekly rhythm for qualified conversations and conversions, not simply grow your business."],
      ["Name the mechanism", "Package the path in language people can remember and repeat.", "For 7-Figure CEO: Connect Daily, Convert Weekly, Compound Monthly gives the method a clear structure."],
      ["Simplify the path", "Organize many tactics into a small number of meaningful stages.", "For a consultant: Use three connected stages instead of twenty disconnected growth activities."],
      ["Diagnose before prescribing", "Tailor the recommendation to the actual constraint.", "For a $50K-month coach: Identify whether leads, conversion, or compounding blocks the path to $100K monthly profit."],
      ["Show what is unnecessary", "Reduce perceived effort by naming what the person does not need.", "For an AI-enabled consultant: You may not need daily posting, another funnel, or a new tool to create a connected system."],
      ["Attach proof to the promise", "Pair each meaningful claim with relevant evidence.", "For a coach: Support the profit promise with a verified client number, screenshot, recording, or live demonstration."],
      ["Clarify time to first value", "Explain the earliest useful result without promising the full outcome instantly.", "For 7-Figure CEO: In week one, identify the constraint and the activity that can be simplified."],
      ["Make inaction concrete", "Describe the realistic opportunity cost without manufactured fear.", "For a consultant: Disconnected follow-up can leave qualified conversations and compounding proof unused."],
      ["Personalize the application", "Show how the method changes for a recognizable situation.", "For a coach at $50K monthly: Protect the existing offer while installing one Convert Weekly event."],
      ["Reduce risk", "Clarify support, expectations, boundaries, and any genuine guarantee.", "For a heart-centered CEO: Define the implementation support and limits so the path protects peace as well as profit."],
    ]),
  },
  {
    id: "increasing-belief",
    title: "Increasing Belief",
    purpose: "Build confidence in the result, the mechanism, and the person's ability to implement it.",
    icon: "BadgeCheck",
    accent: "cyan",
    tactics: tactics("increasing-belief", [
      ["Use a specific case", "Share the starting point, intervention, and verified result.", "For a coach: Show how one 7-Figure CEO client moved from launch dependence to a measured weekly conversion rhythm."],
      ["Demonstrate the process", "Let people see the method operate instead of only hearing claims.", "For an AI consultant: Map one real lead from Connect Daily through connected follow-up and Convert Weekly."],
      ["Explain why it works", "Reveal the causal mechanism behind the result.", "For 7-Figure CEO: Daily connection creates inputs, weekly conversion creates decisions, and monthly compounding improves the system."],
      ["Explain prior failure", "Help people understand why reasonable earlier attempts did not solve the constraint.", "For a coach: More content did not stabilize sales because there was no clear path into a weekly conversation."],
      ["Use conservative claims", "Prefer precise evidence over spectacular language.", "For a consultant: Say the verified client outcome and timeframe, not that every coach will reach $100K monthly profit."],
      ["State who it is not for", "Increase trust by naming meaningful fit boundaries.", "For 7-Figure CEO: This is not for a coach seeking passive growth without daily connection or weekly conversion work."],
      ["Show imperfect implementation", "Prove the method can create value before everything is polished.", "For a heart-centered coach: Show the simple first weekly event before the full AI system was connected."],
      ["Deliver a small win", "Create useful evidence before asking for a larger commitment.", "For a consultant: Diagnose one disconnected follow-up today so they experience clarity before considering the full method."],
      ["Answer the strongest objection", "Address the most reasonable concern directly and specifically.", "For a coach: Explain how Connect Daily can fit a peaceful schedule instead of dismissing the time concern."],
      ["Use recognizable similarity", "Choose proof in which the audience can see relevant starting conditions.", "For a $50K-month CEO: Use a case from a consultant with a lean team, existing offer, and similar path toward $100K monthly profit."],
    ]),
  },
  {
    id: "moving-to-action",
    title: "Moving to Action",
    purpose: "Turn understanding into one clear, appropriate, low-friction next step.",
    icon: "MoveRight",
    accent: "lime",
    tactics: tactics("moving-to-action", [
      ["Give one next step", "Remove competing calls to action.", "For 7-Figure CEO: Choose one action, map your next Weekly Conversion Event."],
      ["Lower the starting effort", "Make the first action small enough to complete now.", "For a coach: Write the names of five qualified people for today's Connect Daily block."],
      ["Connect action to the goal", "Explicitly link the next step to the result the person wants.", "For a consultant: Map the follow-up path so more conversations can support predictable profit without more pressure."],
      ["Preview what happens next", "Reduce uncertainty by explaining the immediate sequence after action.", "For a coach: After the diagnostic, you will know whether to fix connection, conversion, or compounding first."],
      ["Remove extra decisions", "Provide a clear format, keyword, link, or first question.", "For 7-Figure CEO: Reply PREDICTABLE and begin with the three-part diagnostic."],
      ["Use only real deadlines", "Attach time boundaries only when capacity, timing, or access genuinely changes.", "For a heart-centered consultant: If enrollment closes Friday, explain what actually changes Friday and preserve trust."],
      ["Clarify the cost of delay", "Describe the realistic tradeoff of waiting without coercion.", "For a coach: Another month without Convert Weekly may mean more good conversations ending without a decision."],
      ["Name the right person", "Help people qualify themselves before acting.", "For 7-Figure CEO: This next step is for coaches and consultants with a proven offer but inconsistent lead-to-sale rhythm."],
      ["Use a low-friction response", "Match the response effort to the commitment level.", "For a consultant: Choose LEADS, SALES, or SYSTEMS before booking a deeper 7-Figure CEO conversation."],
      ["Reinforce chosen identity", "After commitment, reflect the constructive identity behind the action.", "For a heart-centered coach: You chose a growth step that protects profit, peace, and purpose."],
    ]),
  },
] as const;

export const INFLUENCE_BUILDER_FIELDS = [
  { id: "audience", label: "Audience / situation", placeholder: "Coaches at $50K/month with a proven offer but unpredictable lead flow" },
  { id: "currentState", label: "Current state", placeholder: "Revenue still depends on launches and bursts of owner effort" },
  { id: "desiredState", label: "Desired state", placeholder: "A peaceful weekly rhythm for qualified conversations and sales" },
  { id: "ifOnly", label: "Their if-only belief", placeholder: "If only I had more leads, revenue would become consistent" },
  { id: "reframe", label: "More useful reframe", placeholder: "More leads amplify the current system; the weekly conversion rhythm is the constraint" },
  { id: "openLoop", label: "Open loop", placeholder: "There are three places predictability breaks, and most owners fix the wrong one" },
  { id: "proof", label: "Proof you can verify", placeholder: "A specific client result, screenshot, recording, or live demonstration" },
  { id: "nextAction", label: "One next action", placeholder: "Map the next Weekly Conversion Event" },
] as const satisfies readonly { id: InfluenceBuilderFieldId; label: string; placeholder: string }[];

export const ETHICAL_INFLUENCE_GUARDRAILS = [
  { title: "Truthful pain", detail: "Describe the real problem without intensifying fear or shame." },
  { title: "Real proof", detail: "Use evidence you can verify and qualify what it does not prove." },
  { title: "Genuine urgency", detail: "Use deadlines and scarcity only when they are operationally real." },
  { title: "Close every loop", detail: "Reward attention by answering the question you opened." },
  { title: "Appropriate action", detail: "Invite the smallest next step that genuinely fits the person." },
] as const;

export type InfluenceTacticResult = InfluenceTactic & Readonly<{
  categoryId: InfluenceCategoryId;
  categoryTitle: string;
  categoryIcon: string;
  categoryAccent: InfluenceCategory["accent"];
}>;

export function filterInfluenceTactics(
  categories: readonly InfluenceCategory[],
  categoryId: InfluenceCategoryId | "all",
  query: string,
): InfluenceTacticResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return categories.flatMap((category) => {
    if (categoryId !== "all" && category.id !== categoryId) return [];
    return category.tactics
      .filter((tactic) => {
        if (!normalizedQuery) return true;
        return `${tactic.title} ${tactic.explanation} ${tactic.example}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .map((tactic) => ({
        ...tactic,
        categoryId: category.id,
        categoryTitle: category.title,
        categoryIcon: category.icon,
        categoryAccent: category.accent,
      }));
  });
}

const BRIEF_LABELS: Record<InfluenceBuilderFieldId, string> = {
  audience: "Audience",
  currentState: "Current state",
  desiredState: "Desired state",
  ifOnly: "If-only belief",
  reframe: "Reframe",
  openLoop: "Open loop",
  proof: "Proof",
  nextAction: "Next action",
};

export function buildInfluenceBrief(values: InfluenceBuilderValues): string {
  return INFLUENCE_BUILDER_FIELDS.flatMap((field) => {
    const value = values[field.id]?.trim();
    return value ? [`${BRIEF_LABELS[field.id]}: ${value}`] : [];
  }).join("\n");
}
