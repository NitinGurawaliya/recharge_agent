import {
  PLANS,
  resolvePlan,
  supportedPlanKeys,
  type PlanKey,
} from "./plans";

/** Button / list action id prefix used in Twilio Content templates. */
export const PLAN_ACTION_PREFIX = "plan_";

export function planActionId(key: PlanKey): string {
  return `${PLAN_ACTION_PREFIX}${key}`;
}

/** 10-digit mobile from free text, or null. */
export function tryExtractNumber(msg: string): string | null {
  const match = String(msg ?? "").match(/\b\d{10}\b/);
  return match ? match[0] : null;
}

/**
 * Plan only when the user explicitly mentioned amount / MRP / id.
 * Returns null when nothing plan-like is in the text (do NOT default to 29).
 */
export function tryExtractExplicitPlan(msg: string): PlanKey | null {
  const text = String(msg ?? "");
  const number = tryExtractNumber(text);
  const withoutNumber = number ? text.replace(number, " ") : text;
  const lower = withoutNumber.toLowerCase();

  for (const key of supportedPlanKeys()) {
    const id = PLANS[key].planId;
    if (id && new RegExp(`\\b${id}\\b`).test(withoutNumber)) {
      return key;
    }
  }

  const mrp =
    lower.match(/\bmrp\s*(\d{2,4})\b/) || lower.match(/\bplan\s*(\d{2,4})\b/);
  if (mrp) {
    try {
      return resolvePlan(mrp[1]);
    } catch {
      return null;
    }
  }

  for (const key of supportedPlanKeys()) {
    if (new RegExp(`\\b${key}\\b`).test(withoutNumber)) {
      return key;
    }
  }

  return null;
}

/**
 * Resolve a plan from a WhatsApp button tap (ButtonPayload / Body)
 * or a short reply like "19" / "MRP 29".
 */
export function tryParsePlanSelection(
  buttonPayload: string,
  body: string,
): PlanKey | null {
  const payload = String(buttonPayload ?? "").trim();
  if (payload.startsWith(PLAN_ACTION_PREFIX)) {
    const key = payload.slice(PLAN_ACTION_PREFIX.length);
    try {
      return resolvePlan(key);
    } catch {
      return null;
    }
  }

  const text = String(body ?? "").trim();
  if (!text) return null;

  // Exact action id pasted as body
  if (text.startsWith(PLAN_ACTION_PREFIX)) {
    return tryParsePlanSelection(text, "");
  }

  // Button / list titles: "MRP 139 ₹139", "Unlimited ₹49"
  try {
    const mrp = text.match(/mrp\s*(\d{2,4})/i);
    if (mrp) return resolvePlan(mrp[1]);
    if (/unlimited/i.test(text) && /\b49\b/.test(text)) return resolvePlan("49");
    if (/^\d{2,4}$/.test(text)) return resolvePlan(text);
    const rupee = text.match(/₹\s*(\d{2,4})\b/);
    if (rupee) return resolvePlan(rupee[1]);
  } catch {
    return null;
  }

  return tryExtractExplicitPlan(text);
}

export function isGreetingOrHelp(msg: string): boolean {
  const t = String(msg ?? "").trim().toLowerCase();
  if (!t) return true;
  return /^(hi|hello|hey|hii|start|help|menu|plans|recharge|jiorecharge)\b/.test(
    t,
  );
}
