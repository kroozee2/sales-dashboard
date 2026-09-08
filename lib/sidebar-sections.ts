// Which sidebar sections you collapsed, remembered per browser.
//
// Ten sections and close to fifty destinations: collapsing the ones you do not
// use is the difference between scanning and scrolling, and that choice is
// worthless if it resets on every navigation.

export const SIDEBAR_SECTIONS_KEY = "salesos:sidebar:sections:v1";

export type SectionState = Record<string, boolean>;

/**
 * Turns stored JSON into an expanded-state map for the sections that exist now.
 * A section added since the last save stays open rather than inheriting a
 * collapsed state it never had, and anything unparseable means "all open".
 */
export function parseSectionState(raw: string | null, sections: readonly string[]): SectionState {
  const allOpen = () => Object.fromEntries(sections.map((name) => [name, true]));
  if (!raw) return allOpen();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return allOpen();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return allOpen();
  const stored = parsed as Record<string, unknown>;
  return Object.fromEntries(sections.map((name) => [name, stored[name] !== false]));
}

/** Only the collapsed ones are worth storing; everything else is the default. */
export function serializeSectionState(state: SectionState): string {
  return JSON.stringify(Object.fromEntries(Object.entries(state).filter(([, open]) => open === false)));
}

export function toggleSectionState(state: SectionState, section: string): SectionState {
  return { ...state, [section]: !state[section] };
}
