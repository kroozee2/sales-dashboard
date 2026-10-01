// Rendering a stored phone number back into something a person can read.

/**
 * Country codes are not a fixed width, so the split is looked up rather than
 * guessed. Guessing produced "+3 365 012 4394" for a French number whose code
 * is 33, which reads as a different country entirely.
 */
export const COUNTRY_CODES = [
  "1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45",
  "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63",
  "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98",
  "212", "213", "216", "218", "220", "233", "234", "254", "255", "256", "260", "263", "264", "27",
  "351", "352", "353", "354", "355", "356", "357", "358", "359", "370", "371", "372", "380", "381",
  "385", "386", "420", "421", "852", "853", "855", "856", "880", "886", "962", "965", "966", "971",
  "972", "973", "974", "975", "977", "992", "994", "995", "998",
].sort((a, b) => b.length - a.length);

export function prettyPhone(digits: string | null): string {
  if (!digits) return "\u2014";
  const code = COUNTRY_CODES.find((c) => digits.startsWith(c) && digits.length > c.length + 5);
  if (!code) return `+${digits}`;
  const rest = digits.slice(code.length);
  // Group the national part in threes from the left, last group takes the rest.
  const parts: string[] = [];
  for (let i = 0; i < rest.length; i += 3) parts.push(rest.slice(i, i + 3));
  if (parts.length > 1 && parts[parts.length - 1].length === 1) {
    parts[parts.length - 2] += parts.pop();
  }
  return `+${code} ${parts.join(" ")}`;
}
