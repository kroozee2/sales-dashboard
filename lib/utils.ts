import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

export function formatExact(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Contact links that carry a prefilled message body so the user can just hit send.
// sms: "?&body=" is the format that works across iOS + macOS Messages.
export function smsHref(phone: string, body?: string): string {
  const p = phone.trim();
  return body ? `sms:${p}?&body=${encodeURIComponent(body)}` : `sms:${p}`;
}
export function waHref(phone: string, body?: string): string {
  const digits = phone.replace(/\D/g, "");
  return body ? `https://wa.me/${digits}?text=${encodeURIComponent(body)}` : `https://wa.me/${digits}`;
}
