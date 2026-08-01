import type { RechargeIntent } from "./types";
import {
  DEFAULT_PLAN,
  PLAN_CATALOG,
  PLANS,
  resolvePlan,
  supportedPlanKeys,
  type PlanKey,
} from "./plans";

export { PLAN_CATALOG, PLANS };

/**
 * Extract a 10-digit mobile number and optional plan from free text (CLI).
 * WhatsApp plan choice normally comes from list tap / amount reply — see whatsapp-intent.
 */
export function parseMessage(msg: string): RechargeIntent {
  const raw = String(msg ?? "");
  const match = raw.match(/\b\d{10}\b/);
  if (!match) {
    throw new Error(
      "No 10-digit number found in the message. Include a Jio mobile like 9466444175.",
    );
  }
  const number = match[0];
  const withoutNumber = raw.replace(number, " ");
  const plan = extractPlan(withoutNumber);

  return { number, plan, raw };
}

function extractPlan(text: string): PlanKey {
  const lower = text.toLowerCase();

  for (const key of supportedPlanKeys()) {
    const id = PLANS[key].planId;
    if (id && new RegExp(`\\b${id}\\b`).test(text)) return key;
  }

  const mrp =
    lower.match(/\bmrp\s*(\d{2,4})\b/) || lower.match(/\bplan\s*(\d{2,4})\b/);
  if (mrp) return resolvePlan(mrp[1]);

  // Prefer longer keys first so "139" wins over "39"/"19" false issues (word boundaries handle this)
  for (const key of [...supportedPlanKeys()].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return key;
  }

  return DEFAULT_PLAN;
}
