"use client";

import { useEffect, useState, useRef, useCallback } from "react";

// ─── Training Curriculum ──────────────────────────────────────────────────────

interface LessonSection {
  type: "text" | "callout" | "list" | "subheading";
  heading?: string;
  body?: string;
  items?: string[];
}

interface TrainingLesson {
  id: string;
  title: string;
  duration: string;
  embedUrl: string;
  platform: "loom" | "youtube" | "zoom";
  resources?: { label: string; url: string }[];
  content: LessonSection[];
}

interface TrainingModule {
  id: string;
  emoji: string;
  title: string;
  category: string;
  lessons: TrainingLesson[];
}

const CURRICULUM: TrainingModule[] = [
  {
    id: "foundations",
    emoji: "🧠",
    title: "Sales Foundations",
    category: "Sales",
    lessons: [
      {
        id: "buying-beliefs",
        title: "The Buying Beliefs",
        duration: "15 min",
        embedUrl: "https://www.loom.com/embed/650b19ec6bd14972947bff803c1977da",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "Your prospect isn't resisting your offer. They're missing one of 7 beliefs. Figure out which one — and address that. Everything else is noise.",
          },
          {
            type: "text",
            body: "Most sales reps try to convince. The best closers diagnose. Before any prospect says yes, 7 specific beliefs have to be present in their mind. If even one is missing, no amount of persuasion will close the deal. Your job on every call is to identify which belief is absent and build it through conversation — not pressure.",
          },
          {
            type: "subheading",
            heading: "The 7 Buying Beliefs",
          },
          {
            type: "list",
            items: [
              "Pain — They believe they have a real, urgent problem worth solving. Without this, nothing else matters.",
              "Doubt — They believe others have solved this problem but are unsure if they can. The right stories and proof bridge this gap.",
              "Cost of Inaction — They understand that staying where they are is more expensive than your investment. Time, money, opportunity — all eroding.",
              "Desire — They genuinely want the transformation, not just the idea of it. Surface desires won't sustain a decision.",
              "Trust in You — They believe YOU specifically can help them get there. Authority, specificity, and relatability build this.",
              "External Support — They believe the key people in their life will support this decision. Spouse, partners, community — unaddressed, this kills deals.",
              "Money Access — They believe they can find the funds. Not that they have them sitting there — that they can access them.",
            ],
          },
          {
            type: "subheading",
            heading: "How to Use This on a Call",
          },
          {
            type: "text",
            body: "As you move through the call, mentally check each belief. When you hit an objection — 'I need to think about it,' 'I can't afford it,' 'my husband…' — map it to the missing belief and address THAT. The objection is the symptom. The missing belief is the cause.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "After your next call, write down which beliefs were present and which were missing.",
              "For any lost deal this week, identify the exact belief that was absent.",
              "Build 2–3 stories or questions for each belief so you have them ready.",
            ],
          },
        ],
      },
      {
        id: "scriptless-sales",
        title: "Scriptless Sales",
        duration: "22 min",
        embedUrl: "https://www.loom.com/embed/6a4af16bec7c41e19686acaead1dace1",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "Scripts make you sound like a telemarketer. Frameworks make you sound like a trusted advisor. The difference is where the words come from — a prompt or a principle.",
          },
          {
            type: "text",
            body: "The Scriptless Selling System is built around one idea: great closers don't memorize lines, they internalize principles. When you understand WHY each part of a conversation matters, you know what to say in any situation — including the unexpected ones a script can never prepare you for.",
          },
          {
            type: "subheading",
            heading: "The 5 Phases of a Scriptless Call",
          },
          {
            type: "list",
            items: [
              "Frame the Call — Set the agenda, establish peer-level authority, and make clear you're both evaluating fit. 'I'm going to ask you some questions, you'll ask me some, and at the end we'll both decide if it makes sense to go further.'",
              "North Star — Anchor the prospect in their biggest goal. Not the surface goal ('make more money') but the identity behind it. What does their life look like when this is solved?",
              "Current Reality — Get clear on where they are now. Revenue, team, what's working, what's broken. Let them articulate their own pain without you projecting it.",
              "The Gap — Highlight the distance between their current reality and their North Star. This is where urgency is born — not manufactured by you, but felt by them.",
              "The Offer — Only after all four stages are complete do you present the solution. Now you're not pitching — you're prescribing.",
            ],
          },
          {
            type: "subheading",
            heading: "Why It Works Better Than Scripts",
          },
          {
            type: "text",
            body: "When a prospect says something you didn't expect, a script fails you. A framework never does — because you understand the goal of each stage and can adapt your words while keeping the structure intact. The framework is the rails. Your language is the train.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Memorize the 5 phases by name and goal — not word-for-word, but what each phase is trying to accomplish.",
              "Record your next 3 calls and identify which phases you rushed, skipped, or lingered in too long.",
              "Identify your go-to opener for the Frame — something that immediately establishes peer energy.",
            ],
          },
        ],
      },
      {
        id: "art-of-interjection",
        title: "The Art of Interjection",
        duration: "18 min",
        embedUrl: "https://www.loom.com/embed/e80e53ff8af34b2c9780b618bb7bcfec",
        platform: "loom",
        resources: [
          {
            label: "Interjection Examples Doc",
            url: "https://docs.google.com/document/d/1I3NdYKPOVjQnb2Sw0Q2cvjAUbxJ0U9l_GHLR-hUWDBE/edit?usp=sharing",
          },
        ],
        content: [
          {
            type: "callout",
            body: "Interjection is the silent skill that separates amateur closers from elite ones. Too much and you kill the prospect's momentum. Too little and you get steamrolled. The sweet spot is an art form.",
          },
          {
            type: "text",
            body: "Most sales training focuses on what to say. Almost none focuses on when to interrupt — and when to stay silent. Interjection is the ability to redirect a conversation that's drifting, without breaking the prospect's trust or train of thought. Used correctly, it keeps the call on track, builds rapport, and gives you control without feeling controlling.",
          },
          {
            type: "subheading",
            heading: "The Three Levels",
          },
          {
            type: "list",
            items: [
              "Too Much — You interject so frequently the prospect can't finish a thought. They feel interrogated, not heard. They shut down or get defensive. Their guard goes up and stays up.",
              "Just Right — You interject at natural pauses, redirect rambling with a focused question, and let the prospect feel like they led the conversation while you steered it. This is the zone.",
              "Too Little — You let the prospect dominate. They ramble, shift topics, bring up irrelevant concerns, and you never regain the structure. You leave the call feeling like it 'went everywhere.'",
            ],
          },
          {
            type: "subheading",
            heading: "Interjection Phrases That Work",
          },
          {
            type: "list",
            items: [
              "'That's a great point — let me ask you something about that…' (redirects without dismissing)",
              "'Hold that thought — before we go there, I want to make sure I understand X…' (pauses a tangent)",
              "'I'm going to pause you there for a second…' (direct, confident, non-apologetic)",
              "'What I'm hearing is [summary] — is that right?' (proves you were listening, reclaims direction)",
              "A simple 'Mmm' or 'Got it' mid-sentence signals you're tracking and the prospect can wrap up their thought",
            ],
          },
          {
            type: "subheading",
            heading: "When to Interject",
          },
          {
            type: "list",
            items: [
              "When the prospect is heading off-topic and the call is losing structure",
              "When they're about to talk themselves out of the deal with a tangent",
              "When a key pain point surfaces that you want to anchor before they move past it",
              "When they give you an objection mid-pitch before you've laid the groundwork",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Review the Interjection Examples Doc (linked above) and mark 3 phrases to practice this week.",
              "On your next call, notice how many times you interject — set a mental target of 1 interjection per 2–3 minutes.",
              "Record yourself and listen back specifically for moments you stayed silent when you should have redirected.",
            ],
          },
        ],
      },
      {
        id: "four-skills",
        title: "4 Skills Every Closer Must Know",
        duration: "28 min",
        embedUrl: "https://www.youtube.com/embed/dJ7s1W5Q2Pg?start=213",
        platform: "youtube",
        content: [
          {
            type: "callout",
            body: "Closing isn't one skill — it's four distinct competencies. Most closers are strong in one and weak in three. Identify your gap and it becomes your fastest lever.",
          },
          {
            type: "text",
            body: "Elite closers aren't just 'good with people.' They've developed four specific skills that work together like a system. When all four are firing, calls feel effortless. When one is missing, there's friction — and you often can't pinpoint why the call felt off.",
          },
          {
            type: "subheading",
            heading: "The 4 Skills",
          },
          {
            type: "list",
            items: [
              "Active Listening — Not waiting for your turn to talk. Genuinely hearing what the prospect is saying AND what they're not saying. The unsaid is often where the real objection lives.",
              "Precision Questioning — Asking questions that extract information, create awareness, and move the prospect toward their own conclusion. Great questions do more selling than great pitches.",
              "Emotional Intelligence — Reading the room. Knowing when the energy shifted, when the prospect went cold, when to speed up and when to slow down. Tone awareness is a skill.",
              "Decisive Leadership — The ability to make a recommendation with conviction. 'Based on what you've told me, here's what I think you should do.' Prospects want to be led — not pressured.",
            ],
          },
          {
            type: "subheading",
            heading: "Self-Assessment",
          },
          {
            type: "text",
            body: "After watching this lesson, rate yourself 1–10 on each skill honestly. Your lowest score is where your highest return on practice lives. Don't try to improve all four at once — pick the weakest and drill it for 30 days.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Rate yourself 1–10 on each of the 4 skills right now.",
              "Pick your lowest-rated skill and identify one specific behavior change to make on your next call.",
              "Ask a teammate or coach to watch a call recording and rate you on the same 4 dimensions.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "pitching",
    emoji: "🎯",
    title: "The Pitch",
    category: "Sales",
    lessons: [
      {
        id: "pitch-like-a-pro",
        title: "Pitch Like a Pro",
        duration: "20 min",
        embedUrl: "https://www.youtube.com/embed/Qoku4C81OaU",
        platform: "youtube",
        content: [
          {
            type: "callout",
            body: "The best pitch doesn't feel like a pitch at all. It feels like the prospect just described their exact problem and you happened to have exactly the thing that solves it.",
          },
          {
            type: "text",
            body: "Most closers pitch too early and too broadly. They share features before the prospect has emotionally connected to the gap between where they are and where they want to be. When you pitch at the right moment, with the right specificity, resistance drops — because you're not selling. You're prescribing.",
          },
          {
            type: "subheading",
            heading: "The 4 Elements of a Pro Pitch",
          },
          {
            type: "list",
            items: [
              "Mirror Their Language — Use the exact words they used to describe their pain and goals. 'You mentioned feeling stuck at $20K/month and exhausted…' This signals you were listening and creates instant resonance.",
              "Bridge the Gap — Explicitly connect where they are to where they want to be. 'Right now you're at X. You want to get to Y. Here's the path.'",
              "Specificity Over Features — Don't list what the program includes. Describe what their life looks like 90 days in. Paint the after picture using their own North Star.",
              "Confidence, Not Desperation — Your energy when you make the offer communicates more than the words. Offer like you believe it's the right move. Hesitation creates hesitation.",
            ],
          },
          {
            type: "subheading",
            heading: "The Timing Rule",
          },
          {
            type: "text",
            body: "Never pitch until the prospect has articulated their own pain in their own words AND has confirmed the gap is significant. If they haven't felt the weight of where they are, your pitch will feel like a brochure — not a solution.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out your current pitch word-for-word. Read it back and circle every word that's about your program (vs. about their outcome).",
              "Rewrite the pitch so 80% of the words are about their transformation and 20% are about what they get.",
              "Practice delivering the pitch in under 90 seconds without reading it.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "objections",
    emoji: "💰",
    title: "Objection Handling",
    category: "Sales",
    lessons: [
      {
        id: "objection-framework",
        title: "Objection Handling Framework",
        duration: "16 min",
        embedUrl: "https://www.loom.com/embed/1f31713177de485180a0a1d987c05dbb",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "An objection is not a 'no.' It's a question in disguise. Translate the objection into the real question — then answer that.",
          },
          {
            type: "text",
            body: "The most dangerous thing you can do when you hear an objection is respond to the surface words. 'I can't afford it' rarely means 'I literally do not have access to any money.' It usually means 'I'm not sure the value justifies the risk.' Your job is to get underneath the stated objection to the real one — and address that.",
          },
          {
            type: "subheading",
            heading: "The Universal Objection Framework",
          },
          {
            type: "list",
            items: [
              "Acknowledge — 'I totally get that.' Never argue, never immediately counter. First, make them feel heard. Resistance drops when people feel understood.",
              "Clarify — 'When you say [objection], what specifically do you mean?' Get them to say more. The real objection almost always comes out in the elaboration.",
              "Isolate — 'If we could solve [X], would that be the only thing in the way?' Test whether this is the real objection or one of many. If they say no, there are more — get them all before addressing any.",
              "Reframe — Address the real concern using their values, their goals, and the cost of inaction. Don't debate. Redirect.",
              "Check — 'Does that make sense? Does that help?' Confirm you've moved the needle before continuing.",
            ],
          },
          {
            type: "subheading",
            heading: "The One Rule",
          },
          {
            type: "text",
            body: "Never try to handle more than one objection at a time. Get them all on the table first ('What else?'), then prioritize, then address one at a time. Chasing objections reactively makes you look desperate. Gathering them first makes you look thorough.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "List the 5 most common objections you hear. For each, write what the real underlying question probably is.",
              "Practice the Acknowledge → Clarify → Isolate sequence until it feels natural — not mechanical.",
              "On your next call, resist the urge to respond to the first objection immediately. Ask a clarifying question first.",
            ],
          },
        ],
      },
      {
        id: "money-objection-1",
        title: "Money Objection — Part 1",
        duration: "14 min",
        embedUrl: "https://www.loom.com/embed/fd0890690cfe4decb5b17b0968228938",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "'I can't afford it' is the most common objection and the most mishandled. It almost never means what it says.",
          },
          {
            type: "text",
            body: "When a prospect says 'I can't afford it,' one of three things is true: (1) they genuinely don't have access to funds, (2) they don't believe the value is worth the risk, or (3) they're using money as a polite exit because something else is unresolved. Your job is to find out which one — before you respond at all.",
          },
          {
            type: "subheading",
            heading: "The Money Objection Diagnostic",
          },
          {
            type: "list",
            items: [
              "Acknowledge without collapsing — 'I hear you — money is always a real consideration. Can I ask you something about that?'",
              "Test the belief — 'Is the concern that you don't have access to the funds, or is it more that you're not sure the investment is worth it right now?'",
              "If it's access — 'Let's talk about what options you might have. Most people in your position have used [credit card / business line / 0% intro APR / etc.]. Have you explored any of those?'",
              "If it's value — return to the gap. 'You mentioned it's costing you $X/month to stay stuck here. How long are you willing to let that continue?'",
              "The ROI frame — 'If this gets you to [their goal] within [timeframe], what's that worth? Because that's actually the math we're evaluating here.'",
            ],
          },
          {
            type: "subheading",
            heading: "What NOT to Do",
          },
          {
            type: "list",
            items: [
              "Don't immediately offer a payment plan — it signals you're negotiating with yourself before they asked you to",
              "Don't defend the price — price defense is value weakness",
              "Don't let silence make you backpedal — learn to sit in the pause after a question",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out the three possible meanings of 'I can't afford it' and your opening response to each.",
              "Practice the ROI reframe out loud until it feels like a natural, confident question — not a sales trick.",
            ],
          },
        ],
      },
      {
        id: "money-objection-2",
        title: "Money Objection — Part 2",
        duration: "12 min",
        embedUrl: "https://www.loom.com/embed/a7ad9174b33d47e897158941c9365e4b",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "Part 2 is about the deeper money story — the identity and worthiness beliefs hiding behind the 'I can't afford it.' This is where the real work happens.",
          },
          {
            type: "text",
            body: "Sometimes the money objection isn't about access or value — it's about self-worth. 'Am I the kind of person who invests in themselves?' 'Do I deserve to spend this on me?' These questions are rarely spoken out loud, but they're running in the background on every call. The way you handle this changes entirely.",
          },
          {
            type: "subheading",
            heading: "The Identity Reframe",
          },
          {
            type: "list",
            items: [
              "Shift from 'this is expensive' to 'what kind of decision-maker are you' — 'Most successful people I work with made a decision like this when they didn't have the money. What's different about you?'",
              "Use their own North Star — 'You said you want to be at $100K/month. What does the version of you making $100K/month do when they see an opportunity like this?'",
              "The commitment question — 'On a scale of 1–10, how committed are you to solving this problem in the next 90 days?' Anything under 8 means the pain isn't acute enough yet.",
              "The delay cost — 'What's the cost of waiting 6 months to start? Not just financially — in energy, stress, missed opportunity?'",
            ],
          },
          {
            type: "subheading",
            heading: "When to Let It Go",
          },
          {
            type: "text",
            body: "Not every money objection is closeable in the moment — and that's okay. Some prospects need 30–90 days and a follow-up sequence. The mistake is either giving up too early OR pushing so hard you damage the relationship. Read the energy. If they've said no to 3 reframes, plant the follow-up seed and close with class.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out the identity reframe in your own words — then practice it until it sounds like you, not a script.",
              "Set up a 30/60/90 day follow-up sequence for every money objection that didn't close in the call.",
            ],
          },
        ],
      },
      {
        id: "fear-objections",
        title: "Fear Based Objections",
        duration: "19 min",
        embedUrl: "https://www.youtube.com/embed/mE_oNtH4N1U",
        platform: "youtube",
        content: [
          {
            type: "callout",
            body: "Fear objections sound like logic but they're emotion. Trying to logic your way through a fear objection is like handing someone a map when they're having a panic attack.",
          },
          {
            type: "text",
            body: "Fear-based objections include: 'What if it doesn't work for me?', 'I've tried things before and they haven't worked', 'I'm not sure I can do this', and 'The timing isn't right.' These are not logical objections — they're expressions of self-doubt, past failure, or fear of the unknown. They require empathy first, reframing second, and evidence third.",
          },
          {
            type: "subheading",
            heading: "Types of Fear Objections",
          },
          {
            type: "list",
            items: [
              "Fear of failure — 'What if I invest and it doesn't work?' → Acknowledge the past, reframe the variables, point to your process and support",
              "Fear of the unknown — 'I've never done anything like this before' → Normalize the feeling, share a similar client story, lower the perceived risk",
              "Fear of judgment — 'What will my [spouse/team/peers] think?' → Speak to the cost of seeking approval over taking ownership",
              "Fear of commitment — 'I'm just not ready yet' → Explore what 'ready' actually means and what it would take to feel ready",
            ],
          },
          {
            type: "subheading",
            heading: "The 3-Step Fear Response",
          },
          {
            type: "list",
            items: [
              "Validate — 'That makes complete sense. Most people I talk to feel exactly the same way before they start.'",
              "Reframe the risk — 'The question isn't whether this might not work. The question is: what's the risk of staying exactly where you are?'",
              "Offer evidence — Share a specific client story (not a generic testimonial) of someone who had the same fear and moved through it.",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out the 3 most common fear objections you hear and your validated response to each.",
              "Identify 3 client stories that directly address fear objections — one for failure, one for 'I'm not ready,' one for past disappointment.",
              "Practice leading with empathy before any reframe — the impulse to counter immediately is the thing to break.",
            ],
          },
        ],
      },
      {
        id: "partner-objection",
        title: "Partner / Spouse Objection",
        duration: "11 min",
        embedUrl: "https://www.loom.com/embed/5a906f8b98d64c4b978f00f20efe1510",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "'I need to talk to my partner' almost never means what it says. Handle it wrong and you lose the deal. Handle it right and you get a second call with both of them — and close 70%+ of those.",
          },
          {
            type: "text",
            body: "The partner objection is one of the most common and most mishandled objections in high-ticket sales. Most reps immediately offer to set up a call with both partners — but skip the most important question first: does the partner even know this call was happening? If not, you're not handling a logistics problem. You're handling a permission problem. And those require very different approaches.",
          },
          {
            type: "subheading",
            heading: "The 3 Scenarios",
          },
          {
            type: "list",
            items: [
              "Partner knows and is supportive — Schedule the joint call with confidence. Position it as 'getting your partner up to speed so you can move forward together.'",
              "Partner doesn't know about the call — The prospect is seeking permission. Gently explore this: 'Does your partner know you were looking into this today?' This surfaces the real conversation.",
              "Using the partner as a shield — The prospect isn't sold yet and is outsourcing the 'no' to avoid conflict. Go back to the gap. 'Help me understand — if your partner was fully on board, would YOU be ready to move forward?'",
            ],
          },
          {
            type: "subheading",
            heading: "The Joint Call Setup",
          },
          {
            type: "list",
            items: [
              "Brief your prospect before the call — 'Here's what we'll cover, here's what your partner will want to know, here's what I'll ask them'",
              "Spend the first 10 min of the joint call building rapport with the partner — they're walking in skeptical",
              "Let the prospect share their why in their own words — don't do it for them",
              "Address the partner's concerns first before re-presenting the offer",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out your script for diagnosing which of the 3 scenarios you're in.",
              "Practice the pivot question: 'If your partner was fully on board, would YOU be ready?' until it feels natural.",
              "Set up a 24-hour turnaround policy for partner calls — urgency dies fast when you give it 3–5 days.",
            ],
          },
        ],
      },
      {
        id: "is-it-worth-it-close",
        title: "The 'Is It Worth It for You' Close",
        duration: "9 min",
        embedUrl: "https://www.loom.com/embed/968a2be3a2ad4962bc93eae2af329cd4",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "The best close isn't a closing line. It's a question that makes the prospect close themselves.",
          },
          {
            type: "text",
            body: "The 'Is It Worth It For You' close is one of the most elegant and effective closes in consultative selling because it removes pressure entirely. Instead of pushing, you hand the decision back to the prospect — anchored in everything they've told you about where they want to go. When it's executed after a well-run call, the prospect often answers the question before you finish asking it.",
          },
          {
            type: "subheading",
            heading: "The Setup",
          },
          {
            type: "text",
            body: "This close only works if the call has been run correctly. The North Star is clear. The gap is felt. The offer has been presented. The objections have been addressed. Now — and only now — you ask the close.",
          },
          {
            type: "subheading",
            heading: "The Close (Word for Word)",
          },
          {
            type: "list",
            items: [
              "'So you told me that you want to get to [North Star]. And right now you're at [current reality]. And what's been getting in the way is [gap].'",
              "'What we do is [brief offer summary]. And the investment is [price].'",
              "'Based on everything you've shared with me today — is getting to [North Star] worth [investment] to you?'",
              "Then stop talking. The first person to speak loses.",
            ],
          },
          {
            type: "subheading",
            heading: "Why This Works",
          },
          {
            type: "text",
            body: "You're not asking 'do you want to buy?' You're asking 'is your goal worth it to you?' Almost everyone will say yes to that — because saying no means saying their goal doesn't matter. From there, it's just logistics.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out the close with your specific offer and typical client North Star filled in.",
              "Practice delivering it out loud 10 times until the pause after the question feels comfortable — not urgent.",
              "After every closed deal this week, note whether you used this close and how the prospect responded.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "deep-dive",
    emoji: "🎬",
    title: "Deep Dive",
    category: "Sales",
    lessons: [
      {
        id: "workshop-2022",
        title: "The Scriptless Sales Workshop (Full)",
        duration: "90 min",
        embedUrl: "https://www.youtube.com/embed/RgMuZodWEso",
        platform: "youtube",
        content: [
          {
            type: "callout",
            body: "This is the full system. Every concept from this training track applied in real time. Watch it once to learn. Watch it again to implement. Watch it a third time to spot what you missed.",
          },
          {
            type: "text",
            body: "The 2022 Scriptless Sales Workshop brings everything together: the buying beliefs, the call framework, interjection, pitching, and objection handling — all in one live session with real examples, demos, and Q&A. This is the closest thing to sitting in the room.",
          },
          {
            type: "subheading",
            heading: "How to Get the Most from This Workshop",
          },
          {
            type: "list",
            items: [
              "Watch with a notepad and write down any phrase, question, or frame that resonates",
              "Pause and rewind any section you want to internalize — don't watch passively",
              "After watching, identify the 3 things you'll apply on your very next call",
              "Share your 3 takeaways in the community group for accountability",
            ],
          },
          {
            type: "subheading",
            heading: "Key Timestamps to Revisit",
          },
          {
            type: "list",
            items: [
              "The full call structure walkthrough (early section)",
              "Live roleplay demonstrations",
              "Objection handling Q&A",
              "The closing sequence demonstration",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Block 90 uninterrupted minutes to watch this in full — headphones, no distractions.",
              "Immediately after, write your 3 biggest takeaways and the one thing you're changing on your next call.",
              "Come back to this workshop once per quarter — you'll catch something new every time.",
            ],
          },
        ],
      },
    ],
  },

  // ── DM SALES ─────────────────────────────────────────────────────────────────
  {
    id: "dm-foundations",
    emoji: "🧠",
    title: "DM Foundations",
    category: "DM Sales",
    lessons: [
      {
        id: "dm-sales-mindset",
        title: "The DM Sales Mindset",
        duration: "17 min",
        embedUrl: "https://www.loom.com/embed/d34f6288f4cf478abca2d40417c2c1a6",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "DM selling isn't about being slick. It's about being in a genuinely good energetic state, serving with curiosity, and never letting your emotional state become someone else's problem.",
          },
          {
            type: "text",
            body: "Most people treat DMs like a numbers game — blast enough messages and something will stick. The best DM sellers know it's a state game. Before you send a single message, your energy, intention, and mindset are already shaping the result. If you're desperate, prospects feel it. If you're genuinely curious and resourceful, they feel that too.",
          },
          {
            type: "subheading",
            heading: "The Core DM Setting Philosophy",
          },
          {
            type: "list",
            items: [
              "I am here to serve and help — not to pitch or close",
              "I am not here to manipulate anyone into anything they don't want",
              "I will challenge and push, but always from a place of genuine care",
              "I will maintain my standards — not everyone is a fit, and that's okay",
              "I will seek permission before I make any recommendation",
              "I will not be afraid of a 'no' — a no now is a yes later",
            ],
          },
          {
            type: "subheading",
            heading: "The DM Setting Mindset (Daily Pre-Work)",
          },
          {
            type: "list",
            items: [
              "Always be in a good energetic state — physically, mentally, emotionally, and spiritually before prospecting",
              "Never let your emotions get the best of you — they're probably just busy or in their own stuff",
              "Visualize and feel what it's going to be like to book X calls today",
              "Be genuinely curious about the prospect and compassionate with their current situation",
              "Know your numbers — what does your activity need to look like to hit your call booking goal this week?",
            ],
          },
          {
            type: "subheading",
            heading: "The 3 Core Skills of DM Setter Mastery",
          },
          {
            type: "list",
            items: [
              "Pattern Interruption — Standing out in a flooded inbox. Most DMs look the same. Yours can't.",
              "Curiosity Creation — Making them want to know more without revealing everything. The teaser, not the pitch.",
              "Frictionless Transition — Getting from conversation to booked call in the fewest, most natural steps possible.",
            ],
          },
          {
            type: "subheading",
            heading: "The 12 Don'ts of DM Selling",
          },
          {
            type: "list",
            items: [
              "Don't pitch immediately — it's the fastest way to get ignored",
              "Don't send a wall of text — short messages, every time",
              "Don't be vague — 'let's connect' is not a conversation starter",
              "Don't be needy — one follow-up, then move on",
              "Don't use generic openers — 'hey, loved your content!' is invisible",
              "Don't make the ask too big too fast — earn the right to the next step",
              "Don't skip the warm-up — people buy from people they know and trust",
              "Don't forget to follow up — most conversations need 3-5 touches",
              "Don't over-explain your offer — curiosity beats description every time",
              "Don't argue — if they're not interested, wish them well and move on",
              "Don't DM without a clear objective for each conversation",
              "Don't assume — always ask before you recommend",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out your personal DM setting philosophy (your version of the 6 beliefs above) and read it before you start prospecting every day.",
              "Identify which of the 3 core skills you're weakest in — that's your focus this week.",
              "Review the 12 Don'ts and honestly audit your last 10 DM conversations for violations.",
            ],
          },
        ],
      },
      {
        id: "hot-list",
        title: "Create Your Hot List (Prospect Inventory)",
        duration: "20 min",
        embedUrl: "https://www.youtube.com/embed/VXoWY5snnCU",
        platform: "youtube",
        content: [
          {
            type: "callout",
            body: "Your Hot List is your single most valuable sales asset. It's not a CRM. It's not a spreadsheet. It's a living, prioritized inventory of people who already know you and could say yes this week.",
          },
          {
            type: "text",
            body: "The biggest mistake in DM sales is reaching out cold when you have warm relationships sitting untouched. Your Hot List changes that. It forces you to systematically inventory every person in your network who has the potential to become a client or refer one — and then work that list with intention before ever going cold.",
          },
          {
            type: "subheading",
            heading: "What Goes on Your Hot List",
          },
          {
            type: "list",
            items: [
              "Past clients — even ones from years ago. They already trust you. Reconnection is fast.",
              "Current followers who engage with your content — they're warm but haven't taken a step.",
              "People who've asked questions in your DMs, comments, or stories in the last 90 days.",
              "People you've had real conversations with in the last 6 months (online or in person).",
              "Referral targets — people your current clients know and have mentioned.",
              "Anyone who's attended a workshop, webinar, or challenge you've run.",
            ],
          },
          {
            type: "subheading",
            heading: "How to Build It",
          },
          {
            type: "list",
            items: [
              "Spend 60 minutes going through your followers, past DM threads, email list, and event attendees",
              "Write down every name — don't filter yet, just capture",
              "Assign a temperature: Hot (would likely say yes today), Warm (needs a few touchpoints), Cold (no prior relationship)",
              "Start every day by working your Hot contacts first, then Warm, then add new Cold contacts",
              "Target minimum 100 people on your initial list — most people have more than they think",
            ],
          },
          {
            type: "subheading",
            heading: "The Daily Hot List Habit",
          },
          {
            type: "text",
            body: "Your Hot List isn't a one-time exercise — it's a daily ritual. Every morning, review your list, identify 10–20 people to reach out to, execute the outreach, and update the list with what happened. The list grows as you add new contacts and shrinks as people convert or go cold. A maintained Hot List is the closest thing to guaranteed pipeline.",
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Build your initial Hot List today — minimum 50 names, goal of 100+.",
              "Categorize each as Hot, Warm, or Cold.",
              "Commit to a daily outreach number: how many DMs will you send per day from this list?",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dm-system",
    emoji: "💬",
    title: "The DM System",
    category: "DM Sales",
    lessons: [
      {
        id: "call-transition",
        title: "The Simplest 3-Step Call Transition",
        duration: "12 min",
        embedUrl: "https://www.loom.com/embed/f1e7a3109d7146e597bb8333e4327728",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "The goal of every DM conversation is one thing: get to a call. The simplest path there is three steps. Master these three steps and your booking rate changes overnight.",
          },
          {
            type: "text",
            body: "Most DM sellers overcomplicate the transition to a call. They pitch too early, explain too much, or ask in a way that creates friction. The 3-Step Call Transition removes all of that. It's elegant, it's non-pushy, and it works because it's built around permission — the most powerful word in sales.",
          },
          {
            type: "subheading",
            heading: "Step 1 — Ask for Permission",
          },
          {
            type: "list",
            items: [
              "\"I have a recommendation, if you're open to it?\"",
              "This is it. The whole step. Wait for them to say yes before you say anything else.",
              "Why it works: people can't say no to a recommendation they haven't heard yet — but they feel in control because you asked. That 'yes' is the first micro-commitment.",
              "Do NOT follow with the recommendation until they respond. Silence is the move here.",
            ],
          },
          {
            type: "subheading",
            heading: "Step 2 — Provide the No-Brainer Opportunity",
          },
          {
            type: "list",
            items: [
              "Frame the call around value THEY get — not what you're selling.",
              "Example: \"Hop on a session with my business partner [Name]. He/she works specifically with [their situation] and can help you with [their goal]. Regardless of whether we ever work together — it should be a super valuable call.\"",
              "Key phrase: 'Regardless of whether we ever work together.' This removes the sales pressure and makes the call feel safe.",
              "Keep it short. One sentence for the opportunity, one for the no-pressure frame.",
            ],
          },
          {
            type: "subheading",
            heading: "Step 3 — Make the NO a YES",
          },
          {
            type: "list",
            items: [
              "After presenting the opportunity, soften the ask with a disqualifier:",
              "\"If that doesn't sound stupid to you?\"",
              "\"If that doesn't sound ridiculous to you?\"",
              "\"If that's something you'd be open to?\"",
              "These phrases do two things: they make saying yes feel effortless (who's going to say 'yes, that sounds stupid'?), and they give the prospect an easy out if they're not interested — which paradoxically makes them MORE likely to say yes.",
              "Then stop talking. Give them room to respond.",
            ],
          },
          {
            type: "subheading",
            heading: "The Full Script in Action",
          },
          {
            type: "list",
            items: [
              "You: \"I have a recommendation, if you're open to it?\"",
              "Them: \"Sure, what is it?\"",
              "You: \"Hop on a quick session with my business partner [Name]. He works with [type of person] on [their specific situation]. Regardless of whether we ever work together — it'd be a super valuable call for you. If that doesn't sound ridiculous to you?\"",
              "Them: \"Yeah, that could be interesting.\"",
              "You: [Send calendar link or ask for their availability]",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Write out your version of each of the 3 steps in your own words — not copied, personalized.",
              "Practice the full sequence out loud 5 times until it feels conversational.",
              "Use it on your next 5 DM conversations and track how many book a call.",
            ],
          },
        ],
      },
      {
        id: "three-resources",
        title: "Send 3 Resources After Call Bookings",
        duration: "10 min",
        embedUrl: "https://www.loom.com/embed/2f637be3e3f2492bbed8df53f095bf1d",
        platform: "loom",
        content: [
          {
            type: "callout",
            body: "The window between 'yes, I'll get on a call' and the call itself is where most deals are won or lost. Sending 3 resources after every booking is the simplest way to win that window.",
          },
          {
            type: "text",
            body: "When someone books a call, they're excited in the moment — but that excitement fades fast. By the time the call comes around 2–5 days later, they may have talked themselves out of it, gotten distracted, or forgotten why they said yes. The 3 Resources system solves this by keeping them warm, building belief, and increasing show rates dramatically.",
          },
          {
            type: "subheading",
            heading: "Why 3 Resources?",
          },
          {
            type: "list",
            items: [
              "One resource is forgettable. Two is better. Three is a pattern — it signals that you give freely, that you're serious about their success, and that the call is going to be worth their time.",
              "Resources serve double duty: they build belief in your methodology AND they create social proof before the prospect ever gets on the call.",
              "The right 3 resources should address the top 3 doubts a prospect typically has before a sales call: 'Is this for someone like me?', 'Does this actually work?', 'Is this person the real deal?'",
            ],
          },
          {
            type: "subheading",
            heading: "What to Send",
          },
          {
            type: "list",
            items: [
              "Resource 1 — Belief Builder: A short video, post, or case study that proves your method works. Ideally a transformation story from a client who looks like them.",
              "Resource 2 — Credibility Asset: Something that establishes authority — a framework, a training snippet, or a piece of content that shows how you think.",
              "Resource 3 — Social Proof / FOMO: A testimonial, a result screenshot, or an outcome story. Make it feel like they'd be crazy to miss this call.",
            ],
          },
          {
            type: "subheading",
            heading: "Timing and Delivery",
          },
          {
            type: "list",
            items: [
              "Send the first resource within 30 minutes of the booking confirmation — while the excitement is still fresh.",
              "Send the second resource 24 hours later.",
              "Send the third resource the day before the call as a 'looking forward to tomorrow' message.",
              "Keep each message short — 1–2 sentences introducing the resource, then the link. Never explain why you're sending it. Just send it with a natural, human note.",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Identify your 3 best resources right now — one belief builder, one credibility asset, one social proof piece.",
              "Write the 3 message templates so they're ready to copy-paste after every booking.",
              "Track your show rate this week vs. last week once you implement this system.",
            ],
          },
        ],
      },
      {
        id: "book-3-5-calls",
        title: "Book 3–5 Calls Today (Exact Examples)",
        duration: "25 min",
        embedUrl: "https://us02web.zoom.us/clips/share/GBxrAHAGQ56ITSiNVzCRmQ",
        platform: "zoom",
        resources: [
          { label: "Zoom Training (watch here)", url: "https://us02web.zoom.us/clips/share/GBxrAHAGQ56ITSiNVzCRmQ" },
          { label: "Full Script Examples Doc", url: "https://docs.google.com/document/d/1yE2jyQAPeHHx-y8Cwo7JSJ28Fnz8unYxJRXSuir_vMg/edit?usp=sharing" },
        ],
        content: [
          {
            type: "callout",
            body: "Booking 3–5 calls today is not a goal — it's a decision. The difference between a slow week and a full calendar is usually 2 focused hours and a system you actually execute.",
          },
          {
            type: "text",
            body: "This training walks through exact, real DM examples of conversations that booked calls — not theoretical scripts, but actual screenshots and sequences from real outreach. Use the linked resources above to watch the training and download the script examples doc.",
          },
          {
            type: "subheading",
            heading: "The 2-Hour Call Booking Sprint",
          },
          {
            type: "list",
            items: [
              "Block 2 uninterrupted hours — phone on silent, no distractions",
              "Open your Hot List and identify 20–30 people to contact today",
              "Set a session goal: 'I will send X outreach messages and book Y calls'",
              "Work through your list using the 3-Step Call Transition",
              "Track every response, every 'not now,' every booking in real time",
            ],
          },
          {
            type: "subheading",
            heading: "Opening Message Frameworks",
          },
          {
            type: "list",
            items: [
              "The Check-In: \"Hey [Name] — been a while since we connected. How's [thing you know about them] going?\" (warm, personal, no agenda yet)",
              "The Content React: \"Just watched your reel on [topic] — that point about [specific thing] was spot on. What made you start going deep on that?\"",
              "The Curiosity Spike: \"Saw you've been posting a lot about [topic] lately. Are you building something new or doubling down on [existing thing]?\"",
              "The Direct Opener (for warm leads): \"Hey, I've been thinking about you — I have something that might be exactly what you're working on right now. Open to hearing it?\"",
            ],
          },
          {
            type: "subheading",
            heading: "What to Do When They Don't Respond",
          },
          {
            type: "list",
            items: [
              "Wait 48 hours, then send one natural follow-up — not 'just following up', but a new value drop or observation",
              "After a second non-response: move them to 'Cold' on your Hot List and add them to a 30-day re-engage sequence",
              "Never chase more than twice — maintain your value and energy for people who want to engage",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Watch the training above (Zoom link) and download the Script Examples Doc for real conversation templates.",
              "Schedule your 2-hour call booking sprint for today or tomorrow morning.",
              "Report your results: how many outreach messages sent, how many replies, how many calls booked.",
            ],
          },
        ],
      },
    ],
  },
  {
    id: "dm-setting-system",
    emoji: "🎯",
    title: "The DM Setting System",
    category: "DM Sales",
    lessons: [
      {
        id: "setter-flow-overview",
        title: "The 7-Figure DM Setter Flow",
        duration: "15 min",
        embedUrl: "https://www.loom.com/embed/73b510e9d1a14797ade45b2ddd31791c",
        platform: "loom",
        content: [
          { type: "callout", body: "The whole system in one flow: open the conversation → probe with permission → transition → book → double-confirm → pre-call warm-up. Every DM you send lives somewhere on this map." },
          { type: "subheading", heading: "The Flow" },
          { type: "list", items: [
            "Opening: value first, zero pitch — new friends, followers, Skool members, CTA post commenters, online-right-now",
            "Probing: ask permission, then current situation → desired situation → bottleneck → urgency",
            "Transition: 3 steps — permission → no-brainer opportunity → make the NO a YES",
            "Booking: two concrete times, then double-confirm (+10-20% show rate)",
            "Confirmed: pre-call homework + 24-48h check-in (+10-20% close rate)",
          ]},
          { type: "subheading", heading: "Your Move" },
          { type: "list", items: ["The stage tracker in each lead's Connect tab follows this exact flow — set the stage, use the scripts it serves."] },
        ],
      },
      {
        id: "call-booking-workshop",
        title: "7-Figure DM Sales Call Booking Workshop",
        duration: "60 min",
        embedUrl: "https://www.youtube.com/embed/EarJp2bRZ_g",
        platform: "youtube",
        content: [
          { type: "callout", body: "The full workshop on booking sales calls from the DMs — the deep version of everything in this module." },
          { type: "list", items: ["Watch once end to end, then revisit sections as you hit them in real conversations."] },
        ],
      },
      {
        id: "same-day-5k",
        title: "Same Day $5K Close in the DMs",
        duration: "12 min",
        embedUrl: "https://www.loom.com/embed/600708576e1a476ab555bb9112fdc7a6",
        platform: "loom",
        content: [
          { type: "callout", body: "A real conversation that went from re-engagement to $5,000 collected the same day. Watch the speed: no drawn-out nurture, just clean stages executed fast." },
          { type: "list", items: ["Note how quickly permission → probing → transition happens when the prospect is hot. Speed is a feature, not a risk."] },
        ],
      },
      {
        id: "low-ticket-dms",
        title: "Sell Low-Ticket Offers in the DMs",
        duration: "10 min",
        embedUrl: "https://www.loom.com/embed/1a9f24137d194e6081480cad5f38a002",
        platform: "loom",
        content: [
          { type: "callout", body: "Not everyone is ready for a call. The $47 trial is the frictionless YES that keeps the conversation converting — and trial buyers show up at nearly 100%." },
          { type: "subheading", heading: "When to pitch the trial instead of a call" },
          { type: "list", items: [
            "They're interested but hesitant about a call",
            "Lower revenue level — the trial meets them where they are",
            "They've ghosted a call transition once already — downshift, don't push",
          ]},
        ],
      },
      {
        id: "tension-reengagement",
        title: "Building Up the Tension — Re-Engagement Strategy",
        duration: "12 min",
        embedUrl: "https://www.loom.com/embed/a259c61943c14d6092c21a9e7cddb45f",
        platform: "loom",
        content: [
          { type: "callout", body: "The 4-touch re-engagement arc: each message raises the stakes slightly until the prospect either re-engages or self-selects out. The magic is in the follow-ups." },
          { type: "list", items: [
            "24h: outbound dial or 'I have a crazy idea... do you have 10 minutes?'",
            "48h: dial again, or keep it light (GIF)",
            "72h: 'You okay?'",
            "1 week: 'Do you still want [RESULT] or should I stop reaching out?'",
            "Final CTA: 'How would you like to proceed from here?' — then remove from the hot list",
          ]},
        ],
      },
      {
        id: "authority-statements",
        title: "Authority Statements — Holding the Leadership Frame",
        duration: "14 min",
        embedUrl: "https://www.loom.com/embed/4024d89a7f8d4aaf8ae291eca51a774a",
        platform: "loom",
        resources: [
          { label: "Example: Authority + Leadership Frame in action", url: "https://www.loom.com/share/22d9035ce24b4a95911f2603e055ea22" },
        ],
        content: [
          { type: "callout", body: "Use authority statements A LOT. One casual proof drop mid-conversation changes who's leading: 'Got some ideas for you based on the $274K launch we did with Cole Gordon.'" },
          { type: "subheading", heading: "The craft" },
          { type: "list", items: [
            "Drop them casually, mid-thought — never as a brag, always as context for the value you're giving",
            "Match the statement to their situation: fear of investing gets your own scary-investment story, margin problems get the Nick result",
            "Your full arsenal lives in Scripts → 👑 Authority, personalized per lead in the Connect tab",
          ]},
        ],
      },
      {
        id: "challenging-prospects",
        title: "Challenging Prospects — Permission-Based Pushback",
        duration: "12 min",
        embedUrl: "https://www.loom.com/embed/5e912d4d5eee4ac3b4b3b304fcf53958",
        platform: "loom",
        resources: [
          { label: "Challenge example 1", url: "https://www.loom.com/share/1d5e1b8b65ad4e16b21aa1000bd2876f" },
          { label: "Challenge example 2 — avoiding the appointment", url: "https://www.loom.com/share/a6ccb154b02b4c08a25d9054dfe61e0e" },
        ],
        content: [
          { type: "callout", body: "'As a coach, mind if I challenge your thought process here?' — the highest-leverage sentence in DM sales. Ask permission, then challenge with care. Prospects respect the coach who coaches them before they pay." },
          { type: "subheading", heading: "The two plays for 'not the right time'" },
          { type: "list", items: [
            "Push off with value: 'No problem, my calendar is packed anyhow... I'll have my team book us for [DATE]' — implies non-neediness, keeps the frame",
            "Challenge: get permission, then challenge the thought process directly",
            "Never argue. Permission first, always.",
          ]},
        ],
      },
      {
        id: "outbound-dial",
        title: "The Simple Outbound Dial",
        duration: "10 min",
        embedUrl: "https://www.loom.com/embed/a06c88878c004fee9bf903f8036b5778",
        platform: "loom",
        content: [
          { type: "callout", body: "30 dials a day → 5 pickups → 1-2 booked calls. The phone is the most underused channel in DM sales because nobody else is using it." },
          { type: "subheading", heading: "The structure (SPIN-style)" },
          { type: "list", items: [
            "Context: 'What attracted your attention to Andrew's community?'",
            "Situation: 'What are you focused on in terms of scaling right now?'",
            "Problem: 'Are you happy with those results?'",
            "Implication: 'How long has this been going on? Why is it important to fix now?'",
            "Pitch to call: 'Well, for our clients it's typical to [RESULT]... so what we can do is...'",
          ]},
        ],
      },
    ],
  },
  {
    id: "dm-deep-dive",
    emoji: "🎬",
    title: "DM Deep Dive",
    category: "DM Sales",
    lessons: [
      {
        id: "dm-sales-workshop",
        title: "The $3M DM Sales Workshop",
        duration: "60 min",
        embedUrl: "https://www.youtube.com/embed/UGPoV1DstZE",
        platform: "youtube",
        resources: [
          { label: "DM Sales SOP (Notion)", url: "https://7figceo.notion.site/settersop" },
        ],
        content: [
          {
            type: "callout",
            body: "This is the full system that's generated over $3M in DM sales — the mindset, the messaging, the transitions, the follow-up, and the close. Watch this once to see the whole picture. Watch it again to install it.",
          },
          {
            type: "text",
            body: "The $3M DM Sales Workshop is the most complete training on the DM Domination System. It covers every stage of a DM sales conversation — from the first opener to the booked call — with real examples, live demos, and the exact frameworks that have generated millions in revenue through direct message selling alone.",
          },
          {
            type: "subheading",
            heading: "What This Workshop Covers",
          },
          {
            type: "list",
            items: [
              "The full DM Domination philosophy and why it works in 2025+",
              "The Hot List system in action — live examples of outreach that books calls",
              "Opening messages that get responses (pattern interruption in practice)",
              "The 3-Step Call Transition with real conversation examples",
              "Handling 'not right now,' 'I'm busy,' and 'send me more info' responses",
              "The follow-up sequence that brings cold leads back to life",
              "Closing the call booking — what to say when they're 90% there but stalling",
            ],
          },
          {
            type: "subheading",
            heading: "The DM Sales SOP",
          },
          {
            type: "text",
            body: "After watching the workshop, open the DM Sales SOP in Notion (linked above). This is your operational reference doc — the step-by-step process you follow every day to run a DM sales system that consistently books 3–5 calls per day. Bookmark it and build a habit of reviewing it weekly.",
          },
          {
            type: "subheading",
            heading: "How to Get the Most from This Workshop",
          },
          {
            type: "list",
            items: [
              "Watch the full workshop without stopping — get the whole picture first",
              "On the second watch, pause at every example and write down the framework being demonstrated",
              "After watching: identify the ONE thing you'll do differently tomorrow in your DMs",
              "Share that one thing in the community for accountability",
            ],
          },
          {
            type: "subheading",
            heading: "Your Move",
          },
          {
            type: "list",
            items: [
              "Block 60–90 uninterrupted minutes to watch this in full.",
              "Open the DM Sales SOP Notion doc after and read it once cover to cover.",
              "Write your 3 biggest takeaways and send them in the community chat.",
            ],
          },
        ],
      },
    ],
  },
];

// ─── Playbook Types ───────────────────────────────────────────────────────────
interface ScriptSection {
  id: string;
  order_index: number;
  emoji: string;
  title: string;
  transition_text: string | null;
  questions: string[];
}

interface MessageScript {
  id: string;
  category: string;
  channel: string;
  title: string;
  subject: string | null;
  body: string;
  order_index: number;
}

interface TrainingVideo {
  id: string;
  category: string;
  title: string;
  description: string | null;
  url: string;
  duration_min: number | null;
  order_index: number;
}

const MSG_CATEGORIES: { key: string; label: string; emoji: string; description: string }[] = [
  { key: "pre_call",           label: "Pre-Call",           emoji: "🔜", description: "Booking confirms, reminders, warm-up" },
  { key: "post_call_followup", label: "Post-Call Follow-Up",emoji: "📣", description: "Recaps, check-ins, angle shifts" },
  { key: "no_show",            label: "No-Show Recovery",   emoji: "👻", description: "Check-ins and rebook attempts" },
  { key: "objection_followup", label: "Objection Follow-Up",emoji: "💰", description: "Money, time, spouse, skepticism" },
  { key: "nurture",            label: "Nurture / Opener",   emoji: "🌱", description: "Cold/warm DMs, value drops, invites" },
  { key: "enrolled",           label: "Enrolled / Won",     emoji: "✅", description: "Welcome and referral messages" },
];

const VIDEO_CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "pre_call",    label: "Pre-Call",         emoji: "🔜" },
  { key: "during_call", label: "During Call",      emoji: "📞" },
  { key: "post_call",   label: "Post-Call",        emoji: "📣" },
  { key: "objections",  label: "Objections",       emoji: "💰" },
  { key: "dm_setting",  label: "DM Setting",       emoji: "💬" },
  { key: "general",     label: "General Training", emoji: "🎓" },
];

const CHANNELS: { key: string; label: string; color: string }[] = [
  { key: "dm",       label: "DM",       color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { key: "email",    label: "Email",    color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { key: "sms",      label: "SMS",      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { key: "whatsapp", label: "WhatsApp", color: "bg-green-500/20 text-green-300 border-green-500/30" },
];

const inputCls = "w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors";

function channelStyle(ch: string) {
  return CHANNELS.find((c) => c.key === ch)?.color ?? "bg-zinc-700 text-zinc-300 border-zinc-600";
}

type MainTab = "team" | "training" | "script" | "messages";

interface TeamSop {
  id: string;
  cadence: string; // daily | weekly | monthly
  title: string;
  assignee: string | null;
  video_url: string | null;
  description: string | null;
  steps: string[];
  links: { emoji?: string; label: string; url: string }[];
  order_index: number;
}

const CADENCES: { key: string; label: string; emoji: string; blurb: string }[] = [
  { key: "daily",   label: "Daily",   emoji: "☀️", blurb: "Do these every working day" },
  { key: "weekly",  label: "Weekly",  emoji: "📅", blurb: "Once a week" },
  { key: "monthly", label: "Monthly", emoji: "🗓️", blurb: "Once a month" },
];

// share url → embed url (Loom / YouTube)
function toEmbed(url: string | null): { src: string; kind: "loom" | "youtube" | "other" } | null {
  if (!url) return null;
  const loom = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (loom) return { src: `https://www.loom.com/embed/${loom[1]}`, kind: "loom" };
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]+)/);
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}`, kind: "youtube" };
  return { src: url, kind: "other" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PROGRESS_KEY = "7fc-sales-training-progress";

function loadProgress(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveProgress(s: Set<string>) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify([...s])); } catch {}
}

const ALL_LESSONS = CURRICULUM.flatMap((m) => m.lessons);
const TOTAL_LESSONS = ALL_LESSONS.length;

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

// ─── Team SOP card ─────────────────────────────────────────────────────────────
function SopCard({ sop, onEdit, onDelete }: { sop: TeamSop; onEdit: () => void; onDelete: () => void }) {
  const embed = toEmbed(sop.video_url);
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Video */}
      {embed && (
        <div className="relative w-full bg-black" style={{ aspectRatio: "16 / 9" }}>
          <iframe src={embed.src} allowFullScreen className="absolute inset-0 w-full h-full" title={sop.title} />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-white font-bold text-lg leading-tight">{sop.title}</h3>
            {sop.assignee && (
              <div className="flex items-center gap-2 mt-2">
                <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{initialsOf(sop.assignee)}</span>
                <span className="text-emerald-300 text-xs font-medium">{sop.assignee}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} title="Edit" className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors text-sm">✏️</button>
            <button onClick={onDelete} title="Delete" className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-colors text-sm">🗑️</button>
          </div>
        </div>

        {sop.description && <p className="text-zinc-400 text-sm mt-3 leading-relaxed whitespace-pre-wrap">{sop.description}</p>}

        {sop.steps.length > 0 && (
          <ol className="mt-4 space-y-2">
            {sop.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-zinc-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-600/20 text-violet-300 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        )}

        {sop.links.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-[11px] uppercase tracking-wide text-zinc-600 font-semibold mb-2">Quick links — click and go</p>
            <div className="flex flex-wrap gap-2">
              {sop.links.map((l, i) => {
                const external = /^https?:\/\//.test(l.url);
                return (
                  <a
                    key={i}
                    href={l.url}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer" : undefined}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-violet-600/20 border border-zinc-700 hover:border-violet-500/40 text-zinc-200 hover:text-white text-xs font-medium transition-colors"
                  >
                    {l.emoji && <span>{l.emoji}</span>}
                    {l.label}
                    <span className="opacity-40">↗</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Team SOP add/edit form ────────────────────────────────────────────────────
function SopForm({ sop, onSave, onCancel }: {
  sop: Partial<TeamSop> | null;
  onSave: (data: Partial<TeamSop> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [cadence, setCadence] = useState(sop?.cadence ?? "daily");
  const [title, setTitle] = useState(sop?.title ?? "");
  const [assignee, setAssignee] = useState(sop?.assignee ?? "Jameson Salazar");
  const [videoUrl, setVideoUrl] = useState(sop?.video_url ?? "");
  const [description, setDescription] = useState(sop?.description ?? "");
  const [stepsText, setStepsText] = useState((sop?.steps ?? []).join("\n"));
  const [linksText, setLinksText] = useState((sop?.links ?? []).map((l) => `${l.label} | ${l.url}${l.emoji ? ` | ${l.emoji}` : ""}`).join("\n"));

  function submit() {
    if (!title.trim()) return;
    const steps = stepsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const links = linksText.split("\n").map((line) => {
      const [label, url, emoji] = line.split("|").map((p) => p.trim());
      if (!label || !url) return null;
      return { label, url, emoji: emoji || undefined };
    }).filter(Boolean) as TeamSop["links"];
    onSave({ id: sop?.id, cadence, title: title.trim(), assignee: assignee.trim() || null, video_url: videoUrl.trim() || null, description: description.trim() || null, steps, links });
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg my-8 bg-zinc-900 border border-zinc-700 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-bold text-lg">{sop?.id ? "Edit SOP" : "New Team SOP"}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 font-medium">Cadence</label>
            <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={inputCls}>
              {CADENCES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 font-medium">Assigned to</label>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls} placeholder="Team member" />
          </div>
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-medium">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Scrape New Leads with Apify" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-medium">Video URL (Loom or YouTube)</label>
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={inputCls} placeholder="https://www.loom.com/share/..." />
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-medium">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="What this SOP is and when to do it" />
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-medium">Steps — one per line</label>
          <textarea value={stepsText} onChange={(e) => setStepsText(e.target.value)} rows={5} className={inputCls} placeholder={"Open Apify...\nPaste the post URL...\nRun the actor..."} />
        </div>
        <div>
          <label className="text-xs text-zinc-500 font-medium">Quick links — one per line as <span className="text-zinc-400">Label | URL | emoji</span></label>
          <textarea value={linksText} onChange={(e) => setLinksText(e.target.value)} rows={3} className={inputCls} placeholder={"Apify Console | https://console.apify.com | 🕷️\nLeads Pipeline | /leads | 🎯"} />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={submit} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors">Save SOP</button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PlaybookPage() {
  const [tab, setTab] = useState<MainTab>("team");

  // Training state
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [activeLesson, setActiveLesson] = useState<TrainingLesson>(CURRICULUM[0].lessons[0]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(CURRICULUM.map((m) => m.id)));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Script state
  const [sections, setSections] = useState<ScriptSection[]>([]);
  const [scriptLoading, setScriptLoading] = useState(true);
  const [editingScriptId, setEditingScriptId] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [deleteScriptConfirm, setDeleteScriptConfirm] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragSections = useRef<ScriptSection[]>([]);

  // Messages state
  const [scripts, setScripts] = useState<MessageScript[]>([]);
  const [msgLoading, setMsgLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("pre_call");
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [editingMsg, setEditingMsg] = useState<MessageScript | null>(null);
  const [addingMsg, setAddingMsg] = useState(false);
  const [previewScript, setPreviewScript] = useState<MessageScript | null>(null);
  const [deleteMsgConfirm, setDeleteMsgConfirm] = useState<string | null>(null);

  // Training videos (legacy)
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [vidLoading, setVidLoading] = useState(false);
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);
  const [deleteVideoConfirm, setDeleteVideoConfirm] = useState<string | null>(null);

  // Team SOPs
  const [sops, setSops] = useState<TeamSop[]>([]);
  const [sopLoading, setSopLoading] = useState(false);
  const [editingSop, setEditingSop] = useState<TeamSop | null>(null);
  const [addingSop, setAddingSop] = useState(false);
  const [deleteSopConfirm, setDeleteSopConfirm] = useState<string | null>(null);

  useEffect(() => {
    setCompleted(loadProgress());
    loadSections();
    loadMessages();
    loadVideos();
    loadSops();
  }, []);

  // ── Team SOPs ────────────────────────────────────────────────────────────────
  async function loadSops() {
    setSopLoading(true);
    try {
      const res = await fetch("/api/playbook/team-sops");
      const data = await res.json();
      setSops((data.sops ?? []) as TeamSop[]);
    } finally {
      setSopLoading(false);
    }
  }

  async function saveSop(data: Partial<TeamSop> & { id?: string }) {
    if (data.id) {
      await fetch(`/api/playbook/team-sops/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/playbook/team-sops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setEditingSop(null);
    setAddingSop(false);
    await loadSops();
  }

  async function deleteSop(id: string) {
    await fetch(`/api/playbook/team-sops/${id}`, { method: "DELETE" });
    setDeleteSopConfirm(null);
    await loadSops();
  }

  // ── Progress ────────────────────────────────────────────────────────────────
  function toggleComplete(lessonId: string) {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      saveProgress(next);
      return next;
    });
  }

  // ── Script actions ──────────────────────────────────────────────────────────
  async function loadSections() {
    setScriptLoading(true);
    const res = await fetch("/api/script/sections");
    const data = await res.json();
    const s = data.sections ?? [];
    setSections(s);
    dragSections.current = s;
    setScriptLoading(false);
  }

  async function saveSectionEdit(id: string, updates: Partial<ScriptSection>) {
    setSavingSection(true);
    await fetch(`/api/script/sections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    setSavingSection(false);
    setEditingScriptId(null);
    await loadSections();
  }

  async function addSection() {
    setSavingSection(true);
    await fetch("/api/script/sections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New Section", emoji: "📝", questions: [] }) });
    setSavingSection(false);
    const res = await fetch("/api/script/sections");
    const data = await res.json();
    const newSections: ScriptSection[] = data.sections ?? [];
    setSections(newSections);
    const newest = newSections[newSections.length - 1];
    if (newest) setEditingScriptId(newest.id);
  }

  async function deleteSection(id: string) {
    await fetch(`/api/script/sections/${id}`, { method: "DELETE" });
    setDeleteScriptConfirm(null);
    if (editingScriptId === id) setEditingScriptId(null);
    await loadSections();
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const cur = [...sections];
    const fromIdx = cur.findIndex((s) => s.id === dragId);
    const toIdx = cur.findIndex((s) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = cur.splice(fromIdx, 1);
    cur.splice(toIdx, 0, moved);
    const reordered = cur.map((s, i) => ({ ...s, order_index: i }));
    setSections(reordered);
    setDragId(null); setDragOverId(null);
    fetch("/api/script/sections/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: reordered.map((s) => ({ id: s.id, order_index: s.order_index })) }) });
  }
  function onDragEnd() { setDragId(null); setDragOverId(null); }

  // ── Message actions ─────────────────────────────────────────────────────────
  async function loadMessages() {
    setMsgLoading(true);
    const res = await fetch("/api/playbook/scripts");
    const data = await res.json();
    setScripts(data.scripts ?? []);
    setMsgLoading(false);
  }

  async function saveMsg(data: Partial<MessageScript> & { id?: string }) {
    if (data.id) {
      await fetch(`/api/playbook/scripts/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/playbook/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setEditingMsg(null); setAddingMsg(false);
    await loadMessages();
  }

  async function deleteMsg(id: string) {
    await fetch(`/api/playbook/scripts/${id}`, { method: "DELETE" });
    setDeleteMsgConfirm(null);
    await loadMessages();
  }

  // ── Video actions ───────────────────────────────────────────────────────────
  async function loadVideos() {
    setVidLoading(true);
    const res = await fetch("/api/playbook/videos");
    const data = await res.json();
    setVideos(data.videos ?? []);
    setVidLoading(false);
  }

  async function saveVideo(data: Partial<TrainingVideo> & { id?: string }) {
    if (data.id) {
      await fetch(`/api/playbook/videos/${data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    } else {
      await fetch("/api/playbook/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    }
    setEditingVideo(null); setAddingVideo(false);
    await loadVideos();
  }

  async function deleteVideo(id: string) {
    await fetch(`/api/playbook/videos/${id}`, { method: "DELETE" });
    setDeleteVideoConfirm(null);
    await loadVideos();
  }

  const filteredMsgs = scripts.filter((s) => s.category === activeCategory && (!activeChannel || s.channel === activeChannel));
  const completedCount = [...completed].filter((id) => ALL_LESSONS.find((l) => l.id === id)).length;
  const progressPct = Math.round((completedCount / TOTAL_LESSONS) * 100);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Playbook</h1>
          <p className="text-sm text-zinc-500 mt-1">Sales training, scripts, and message templates.</p>
        </div>
        <div className="flex gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {([
            { key: "team",     label: "🧑‍🚀 Team"     },
            { key: "training", label: "🎓 Training"  },
            { key: "script",   label: "📋 Script"    },
            { key: "messages", label: "💬 Messages"  },
          ] as { key: MainTab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${tab === key ? "bg-violet-600 text-white shadow" : "text-zinc-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: TEAM ──────────────────────────────────────────────────────── */}
      {tab === "team" && (
        <div>
          {/* Team header */}
          <div className="bg-gradient-to-br from-emerald-900/30 to-teal-900/20 border border-emerald-800/40 rounded-2xl p-5 mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-white font-bold text-lg">Team SOPs</h2>
              <p className="text-zinc-400 text-sm mt-1">Standard operating procedures for the team — what to run <span className="text-emerald-300">daily, weekly, and monthly</span>. Drop in a Loom, assign an owner, and it&apos;s click-and-go.</p>
            </div>
            <button onClick={() => setAddingSop(true)} className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors">+ Add SOP</button>
          </div>

          {sopLoading && sops.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">Loading SOPs…</div>
          ) : sops.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">
              <p className="text-4xl mb-3">🧑‍🚀</p>
              <p>No SOPs yet. Add your first one to assign it to a team member.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {CADENCES.map((cad) => {
                const group = sops.filter((s) => s.cadence === cad.key);
                if (group.length === 0) return null;
                return (
                  <div key={cad.key}>
                    <div className="flex items-baseline gap-2 mb-3">
                      <h3 className="text-white font-bold text-base">{cad.emoji} {cad.label}</h3>
                      <span className="text-zinc-600 text-xs">{cad.blurb}</span>
                      <span className="text-zinc-600 text-xs ml-auto">{group.length} {group.length === 1 ? "SOP" : "SOPs"}</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {group.map((sop) => (
                        <SopCard key={sop.id} sop={sop} onEdit={() => setEditingSop(sop)} onDelete={() => setDeleteSopConfirm(sop.id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(addingSop || editingSop) && (
            <SopForm sop={editingSop} onSave={saveSop} onCancel={() => { setAddingSop(false); setEditingSop(null); }} />
          )}

          {deleteSopConfirm && (
            <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDeleteSopConfirm(null)}>
              <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-sm w-full">
                <h3 className="text-white font-bold">Delete this SOP?</h3>
                <p className="text-zinc-400 text-sm mt-1">This can&apos;t be undone.</p>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => deleteSop(deleteSopConfirm)} className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-colors">Delete</button>
                  <button onClick={() => setDeleteSopConfirm(null)} className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-sm transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TRAINING ──────────────────────────────────────────────────── */}
      {tab === "training" && (
        <div>
          {/* Course header */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-white font-bold text-lg">The Scriptless Selling System</h2>
                <p className="text-zinc-500 text-sm mt-0.5">{completedCount} of {TOTAL_LESSONS} lessons complete</p>
              </div>
              <span className="text-violet-400 font-bold text-2xl">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-purple-400 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Main layout */}
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
            {/* Sidebar */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden md:sticky md:top-20">
              <div className="divide-y divide-zinc-800/60">
                {(() => {
                  const categories = [...new Set(CURRICULUM.map((m) => m.category))];
                  return categories.map((cat) => {
                    const catModules = CURRICULUM.filter((m) => m.category === cat);
                    return (
                      <div key={cat}>
                        <div className="px-4 py-2 bg-zinc-950/60">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{cat}</span>
                        </div>
                        {catModules.map((mod) => {
                  const isExpanded = expandedModules.has(mod.id);
                  const modCompleted = mod.lessons.filter((l) => completed.has(l.id)).length;
                  return (
                    <div key={mod.id}>
                      <button
                        onClick={() => setExpandedModules((prev) => {
                          const next = new Set(prev);
                          if (next.has(mod.id)) next.delete(mod.id); else next.add(mod.id);
                          return next;
                        })}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{mod.emoji}</span>
                          <div>
                            <p className="text-white font-semibold text-sm">{mod.title}</p>
                            <p className="text-zinc-600 text-xs">{modCompleted}/{mod.lessons.length} lessons</p>
                          </div>
                        </div>
                        <svg className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {isExpanded && (
                        <div className="bg-zinc-950/40">
                          {mod.lessons.map((lesson) => {
                            const isActive = activeLesson.id === lesson.id;
                            const isDone = completed.has(lesson.id);
                            return (
                              <button
                                key={lesson.id}
                                onClick={() => setActiveLesson(lesson)}
                                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? "bg-violet-600/15 border-l-2 border-violet-500" : "hover:bg-zinc-800/30 border-l-2 border-transparent"}`}
                              >
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isDone ? "bg-emerald-500" : "border-2 border-zinc-700"}`}>
                                  {isDone && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-xs font-medium leading-snug ${isActive ? "text-violet-300" : isDone ? "text-zinc-400" : "text-zinc-300"}`}>{lesson.title}</p>
                                  <p className="text-zinc-600 text-[10px] mt-0.5">{lesson.duration}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                    </div>
                  );
                })
              })()}
              </div>
            </div>

            {/* Lesson content */}
            <div className="min-w-0">
              {/* Video */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-4">
                {activeLesson.platform === "zoom" ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 bg-zinc-950/50">
                    <span className="text-5xl mb-4">🎥</span>
                    <p className="text-white font-semibold text-base mb-1">{activeLesson.title}</p>
                    <p className="text-zinc-500 text-sm mb-6 text-center">This training is hosted on Zoom Clips. Click below to watch.</p>
                    <a href={activeLesson.embedUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-colors shadow-lg">
                      ▶ Watch on Zoom
                    </a>
                  </div>
                ) : (
                <div className="relative pb-[56.25%] bg-black">
                  <iframe
                    key={activeLesson.id}
                    src={activeLesson.embedUrl}
                    className="absolute inset-0 w-full h-full"
                    allowFullScreen
                    allow="autoplay; fullscreen"
                    frameBorder="0"
                  />
                </div>
                )}
                <div className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-base">{activeLesson.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{activeLesson.duration} · {activeLesson.platform === "loom" ? "Loom" : activeLesson.platform === "zoom" ? "Zoom" : "YouTube"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeLesson.resources?.map((r) => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700">
                        📎 {r.label}
                      </a>
                    ))}
                    <button
                      onClick={() => toggleComplete(activeLesson.id)}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold transition-all border ${completed.has(activeLesson.id) ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" : "bg-violet-600 border-violet-500 text-white hover:bg-violet-500 shadow shadow-violet-500/20"}`}
                    >
                      {completed.has(activeLesson.id) ? (
                        <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> Completed</>
                      ) : "Mark Complete"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Written lesson content */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
                {activeLesson.content.map((section, i) => {
                  if (section.type === "callout") return (
                    <div key={i} className="bg-violet-600/10 border border-violet-500/30 rounded-xl px-5 py-4">
                      <p className="text-violet-200 text-sm leading-relaxed font-medium italic">&ldquo;{section.body}&rdquo;</p>
                    </div>
                  );
                  if (section.type === "subheading") return (
                    <h3 key={i} className="text-white font-bold text-base pt-2">{section.heading}</h3>
                  );
                  if (section.type === "text") return (
                    <p key={i} className="text-zinc-400 text-sm leading-relaxed">{section.body}</p>
                  );
                  if (section.type === "list") return (
                    <ol key={i} className="space-y-3">
                      {section.items?.map((item, j) => (
                        <li key={j} className="flex gap-3 text-sm">
                          <span className="text-violet-400 font-bold flex-shrink-0 w-5 text-right">{j + 1}.</span>
                          <span className="text-zinc-300 leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ol>
                  );
                  return null;
                })}
              </div>

              {/* Next lesson nav */}
              <div className="flex items-center justify-between mt-4">
                <button
                  onClick={() => {
                    const prev = ALL_LESSONS[ALL_LESSONS.findIndex((l) => l.id === activeLesson.id) - 1];
                    if (prev) setActiveLesson(prev);
                  }}
                  disabled={ALL_LESSONS[0].id === activeLesson.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <button
                  onClick={() => {
                    const next = ALL_LESSONS[ALL_LESSONS.findIndex((l) => l.id === activeLesson.id) + 1];
                    if (next) { toggleComplete(activeLesson.id); setActiveLesson(next); }
                  }}
                  disabled={ALL_LESSONS[ALL_LESSONS.length - 1].id === activeLesson.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow shadow-violet-500/20"
                >
                  Complete & Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: SCRIPT ────────────────────────────────────────────────────── */}
      {tab === "script" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs text-zinc-500">Drag to reorder. Click a section to edit questions and talking points.</p>
            <button onClick={addSection} disabled={savingSection} className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-violet-500/20">
              + Add Section
            </button>
          </div>
          {scriptLoading ? (
            <div className="flex items-center justify-center py-16"><div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {sections.map((s, idx) => (
                <div key={s.id} draggable onDragStart={() => onDragStart(s.id)} onDragOver={(e) => onDragOver(e, s.id)} onDrop={(e) => onDrop(e, s.id)} onDragEnd={onDragEnd}
                  className={`bg-zinc-900 border rounded-2xl transition-all ${dragOverId === s.id ? "border-violet-500 bg-violet-500/5 scale-[1.01]" : dragId === s.id ? "border-zinc-700 opacity-50" : "border-zinc-800 hover:border-zinc-700"}`}>
                  {editingScriptId === s.id ? (
                    <SectionEditor section={s} saving={savingSection} onSave={(updates) => saveSectionEdit(s.id, updates)} onCancel={() => setEditingScriptId(null)} onDelete={() => setDeleteScriptConfirm(s.id)} />
                  ) : (
                    <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setEditingScriptId(s.id)}>
                      <div className="text-zinc-700 hover:text-zinc-500 cursor-grab active:cursor-grabbing flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg>
                      </div>
                      <span className="text-zinc-600 text-xs font-mono w-4 flex-shrink-0">{idx + 1}</span>
                      <span className="text-xl leading-none flex-shrink-0">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-semibold text-sm">{s.title}</span>
                        <span className="text-zinc-600 text-xs ml-2">{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                        {s.transition_text && <p className="text-zinc-600 text-[11px] mt-0.5 truncate italic">{s.transition_text.slice(0, 80)}…</p>}
                      </div>
                      <span className="text-zinc-500 hover:text-white text-xs px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex-shrink-0">Edit</span>
                    </div>
                  )}
                </div>
              ))}
              {sections.length === 0 && (
                <div className="text-center py-16 text-zinc-600">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm">No script sections yet. Add your first one above.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: MESSAGES ──────────────────────────────────────────────────── */}
      {tab === "messages" && (
        <div className="flex gap-5">
          <div className="w-52 flex-shrink-0 space-y-1">
            {MSG_CATEGORIES.map((cat) => {
              const count = scripts.filter((s) => s.category === cat.key).length;
              return (
                <button key={cat.key} onClick={() => { setActiveCategory(cat.key); setAddingMsg(false); setEditingMsg(null); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all ${activeCategory === cat.key ? "bg-violet-600/20 border border-violet-500/30 text-violet-300" : "hover:bg-zinc-900 text-zinc-400 hover:text-white"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{cat.emoji} {cat.label}</span>
                    {count > 0 && <span className="text-xs text-zinc-600">{count}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-white font-semibold">{MSG_CATEGORIES.find((c) => c.key === activeCategory)?.emoji} {MSG_CATEGORIES.find((c) => c.key === activeCategory)?.label}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{MSG_CATEGORIES.find((c) => c.key === activeCategory)?.description}</p>
              </div>
              <button onClick={() => { setAddingMsg(true); setEditingMsg(null); }} className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-xl transition-colors">+ Add Message</button>
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => setActiveChannel(null)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${!activeChannel ? "bg-zinc-700 text-white border-zinc-600" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>All</button>
              {CHANNELS.map((ch) => (
                <button key={ch.key} onClick={() => setActiveChannel(activeChannel === ch.key ? null : ch.key)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${activeChannel === ch.key ? ch.color : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>{ch.label}</button>
              ))}
            </div>
            {addingMsg && <MsgEditor defaultCategory={activeCategory} onSave={saveMsg} onCancel={() => setAddingMsg(false)} />}
            {msgLoading ? (
              <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-zinc-600 border-t-violet-400 rounded-full animate-spin" /></div>
            ) : filteredMsgs.length === 0 && !addingMsg ? (
              <div className="text-center py-12 text-zinc-600">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm">No messages here yet.</p>
                <button onClick={() => setAddingMsg(true)} className="mt-3 text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Add your first one →</button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMsgs.map((script) => (
                  <div key={script.id}>
                    {editingMsg?.id === script.id ? (
                      <MsgEditor script={script} defaultCategory={activeCategory} onSave={saveMsg} onCancel={() => setEditingMsg(null)} />
                    ) : (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-700 transition-colors group">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${channelStyle(script.channel)}`}>{CHANNELS.find((c) => c.key === script.channel)?.label ?? script.channel}</span>
                            <span className="text-sm font-semibold text-white">{script.title}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => setPreviewScript(script)} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">Preview</button>
                            <button onClick={() => { setEditingMsg(script); setAddingMsg(false); }} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">Edit</button>
                            <button onClick={() => setDeleteMsgConfirm(script.id)} className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors">✕</button>
                          </div>
                        </div>
                        {script.subject && <p className="text-xs text-zinc-500 mb-1.5">Subject: <span className="text-zinc-400">{script.subject}</span></p>}
                        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-3 whitespace-pre-wrap">{script.body}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {previewScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setPreviewScript(null)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium mr-2 ${channelStyle(previewScript.channel)}`}>{CHANNELS.find((c) => c.key === previewScript.channel)?.label}</span>
                <span className="text-white font-semibold text-sm">{previewScript.title}</span>
              </div>
              <button onClick={() => setPreviewScript(null)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            {previewScript.subject && <div className="px-5 py-2 border-b border-zinc-800"><span className="text-xs text-zinc-500">Subject: </span><span className="text-xs text-zinc-300">{previewScript.subject}</span></div>}
            <div className="px-5 py-4 max-h-80 overflow-y-auto"><pre className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">{previewScript.body}</pre></div>
            <div className="px-5 py-3 border-t border-zinc-800 flex justify-end gap-2">
              <button onClick={() => navigator.clipboard.writeText(previewScript.body)} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors">Copy</button>
              <button onClick={() => setPreviewScript(null)} className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
      {deleteScriptConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Delete section?</h3>
            <p className="text-zinc-400 text-sm mb-5">This will delete all notes for this section across every call. Cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteScriptConfirm(null)} className="flex-1 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={() => deleteSection(deleteScriptConfirm)} className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
      {deleteMsgConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Delete this message?</h3>
            <p className="text-zinc-400 text-sm mb-5">Cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteMsgConfirm(null)} className="flex-1 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={() => deleteMsg(deleteMsgConfirm)} className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
      {deleteVideoConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Delete this video?</h3>
            <p className="text-zinc-400 text-sm mb-5">Cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteVideoConfirm(null)} className="flex-1 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
              <button onClick={() => deleteVideo(deleteVideoConfirm)} className="flex-1 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section Editor ───────────────────────────────────────────────────────────
function SectionEditor({ section, saving, onSave, onCancel, onDelete }: {
  section: ScriptSection; saving: boolean;
  onSave: (updates: Partial<ScriptSection>) => void;
  onCancel: () => void; onDelete: () => void;
}) {
  const [emoji, setEmoji] = useState(section.emoji);
  const [title, setTitle] = useState(section.title);
  const [transition, setTransition] = useState(section.transition_text ?? "");
  const [questions, setQuestions] = useState<string[]>(section.questions.length > 0 ? section.questions : [""]);

  function updateQ(idx: number, val: string) { setQuestions((prev) => prev.map((q, i) => (i === idx ? val : q))); }
  function addQ() { setQuestions((prev) => [...prev, ""]); }
  function removeQ(idx: number) { setQuestions((prev) => prev.filter((_, i) => i !== idx)); }
  const lastQRef = useCallback((el: HTMLInputElement | null) => { if (el) el.focus(); }, [questions.length]);

  return (
    <div className="p-5 space-y-4">
      <div className="flex gap-3">
        <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={2} className="w-14 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xl text-center focus:outline-none focus:border-violet-500" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Section title" className={`${inputCls} flex-1`} />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Transition / Bridge Statement</label>
        <textarea value={transition} onChange={(e) => setTransition(e.target.value)} placeholder="What you say to move into this section…" rows={2} className={`${inputCls} resize-none`} />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-2 block">Questions & Talking Points</label>
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="text-zinc-600 text-xs mt-2.5 w-5 flex-shrink-0 text-right">{idx + 1}.</span>
              <input ref={idx === questions.length - 1 && questions[idx] === "" ? lastQRef : null} value={q} onChange={(e) => updateQ(idx, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQ(); } }} placeholder="Question or talking point…" className={`${inputCls} flex-1`} />
              {questions.length > 1 && <button onClick={() => removeQ(idx)} className="mt-2 text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
            </div>
          ))}
          <button onClick={addQ} className="text-xs text-zinc-500 hover:text-violet-400 flex items-center gap-1.5 mt-1 transition-colors ml-7">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Add question (or press Enter)
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors">Delete section</button>
        <div className="flex-1" />
        <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
        <button onClick={() => onSave({ emoji, title, transition_text: transition || null, questions: questions.filter((q) => q.trim()) })} disabled={saving || !title.trim()} className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

// ─── Message Editor ───────────────────────────────────────────────────────────
function MsgEditor({ script, defaultCategory, onSave, onCancel }: {
  script?: MessageScript; defaultCategory: string;
  onSave: (data: Partial<MessageScript> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(script?.category ?? defaultCategory);
  const [channel, setChannel] = useState(script?.channel ?? "dm");
  const [title, setTitle] = useState(script?.title ?? "");
  const [subject, setSubject] = useState(script?.subject ?? "");
  const [body, setBody] = useState(script?.body ?? "");
  const [saving, setSaving] = useState(false);

  async function handle() { setSaving(true); await onSave({ id: script?.id, category, channel, title, subject: subject || null, body }); setSaving(false); }

  const variables = (body.match(/\{\{[^}]+\}\}/g) ?? []).filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="bg-zinc-900 border border-violet-500/40 rounded-2xl p-5 mb-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>{MSG_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}</select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Channel</label>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls}>{CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Same-Day Follow-Up DM" className={inputCls} />
      </div>
      {channel === "email" && (
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Email Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Following up, {{first_name}}" className={inputCls} />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-500">Message Body</label>
          <span className="text-[10px] text-zinc-600">Use {`{{first_name}} {{offer}} {{your_goal}} {{call_date}}`}</span>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message. Use {{first_name}} for personalization…" rows={8} className={`${inputCls} resize-none font-mono text-xs leading-relaxed`} />
        {variables.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] text-zinc-600">Variables:</span>
            {variables.map((v) => <span key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-violet-400 font-mono">{v}</span>)}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
        <button onClick={handle} disabled={saving || !title.trim() || !body.trim()} className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">{saving ? "Saving…" : script ? "Save Changes" : "Add Message"}</button>
      </div>
    </div>
  );
}
