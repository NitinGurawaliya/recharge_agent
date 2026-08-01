import { PLANS, supportedPlanKeys } from "./plans";

/** Welcome copy (sent via TwiML — this Twilio account blocks Content API / REST Body WhatsApp). */
export function welcomeText(): string {
  return [
    "Hey! I can generate a Jio recharge UPI QR for you.",
    "",
    "Send the 10-digit Jio number to recharge.",
    "Example: 9466444175",
    "",
    "Then reply with a plan amount:",
    ...supportedPlanKeys().map((k) => `- ${PLANS[k].shortLabel} -> reply ${k}`),
  ].join("\n");
}

export function planMenuText(number: string): string {
  return [
    `Hey! Number saved: ${number}`,
    "",
    "Available plans — reply with the amount (e.g. 19 or 139):",
    ...supportedPlanKeys().map((key) => {
      const p = PLANS[key];
      return `- ${p.shortLabel} — ${p.planData}, ${p.planValidity} -> reply ${key}`;
    }),
  ].join("\n");
}

export function generatingText(number: string, plan: string): string {
  return [
    `Got it — generating UPI QR for ${number} (plan ${plan}).`,
    "Hang tight, this can take up to a minute…",
  ].join("\n");
}

/** Sent only AFTER the QR file exists — ask user to claim it. */
export function qrReadyPromptText(): string {
  return [
    "Your UPI QR is ready!",
    "",
    "Type QR to receive the image.",
  ].join("\n");
}
