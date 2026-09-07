export const MANAGEABLE_SETTINGS_KEYS = [
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'GHL_API_KEY',
  'GHL_LOCATION_ID',
  'GOOGLE_CALENDAR_ICAL_URL',
] as const;

export const MANAGEABLE_SETTINGS_KEY_SET = new Set<string>(MANAGEABLE_SETTINGS_KEYS);


export function manageableSettingValueIsValid(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}
