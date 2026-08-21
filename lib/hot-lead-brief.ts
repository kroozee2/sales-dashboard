export type HotLeadBriefMessage = {
  text: string;
  is_sender: boolean;
  timestamp: string;
};

type HotLeadBriefInput = {
  name: string | null;
  source: string | null;
  stage: string | null;
  quality: string | null;
  notes: string | null;
  messages: HotLeadBriefMessage[];
};

export type HotLeadBrief = {
  who: string;
  conversation: string;
  recommendation: string;
};

function clean(value: string | null | undefined, max = 260): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function quote(value: string): string { return `“${clean(value, 220) || "Media message"}”`; }

export function buildHotLeadBrief(input: HotLeadBriefInput): HotLeadBrief {
  const name = clean(input.name, 100) || "This lead";
  const descriptors = [clean(input.quality, 60), clean(input.stage, 80), clean(input.source, 80) ? `from ${clean(input.source, 80)}` : ""].filter(Boolean);
  const context = clean(input.notes, 360);
  const who = `${name}${descriptors.length ? ` is ${descriptors.join(", ")}` : " is on your Hot list"}.${context ? ` ${context}` : ""}`;

  const messages = input.messages.filter((message) => clean(message.text, 220)).slice(-3);
  let conversation = "There is no synced Instagram conversation yet.";
  if (messages.length) {
    conversation = messages.map((message, index) => {
      const role = message.is_sender ? "You said" : index === 0 ? `${name} said` : `${name} then said`;
      return `${role} ${quote(message.text)}.`;
    }).join(" ");
  }

  const latest = messages.at(-1);
  let recommendation = "Open their strongest verified channel and start a personal conversation using the Hot context above.";
  if (latest?.is_sender) {
    recommendation = `You sent the latest message. If ${name} has not responded, follow up with one short, specific question that makes the next step easy.`;
  } else if (latest) {
    const inbound = latest.text.toLowerCase();
    if (/\b(yes|please|interested|help|send|talk|call|book|ready)\b/.test(inbound)) {
      recommendation = `Reply now while the interest is active and move ${name} toward one clear next step, ideally a short call or the most relevant offer overview.`;
    } else if (inbound.includes("?")) {
      recommendation = `Answer ${name}’s latest question directly, then end with one clear next step so the conversation keeps moving.`;
    } else {
      recommendation = `Reply while the conversation is warm, acknowledge what ${name} said, and ask one focused question that reveals the best next step.`;
    }
  }

  return { who, conversation, recommendation };
}
