/**
 * Mirrors ~/.webcmd/clis/jio/recharge.js PLANS.
 * WhatsApp shortLabel: tappable / list-row title (keep ≤24 chars for list items).
 */
export const PLANS = {
  "19": {
    key: "19",
    amount: 19,
    planName: "MRP 19",
    shortLabel: "MRP 19 ₹19",
    planId: null as string | null,
    planValidity: "1 Day",
    planData: "1GB Data",
  },
  "29": {
    key: "29",
    amount: 29,
    planName: "MRP 29",
    shortLabel: "MRP 29 ₹29",
    planId: "1019864",
    planValidity: "2 Days",
    planData: "2GB High Speed Data",
  },
  "39": {
    key: "39",
    amount: 39,
    planName: "DATA ONLY PACK 39",
    shortLabel: "MRP 39 ₹39",
    planId: null as string | null,
    planValidity: "3 Days",
    planData: "3GB/Day",
  },
  "49": {
    key: "49",
    amount: 49,
    planName: "Unlimited Data Pack",
    shortLabel: "Unlimited ₹49",
    planId: null as string | null,
    planValidity: "1 Day",
    planData: "Unlimited Data",
  },
  "69": {
    key: "69",
    amount: 69,
    planName: "DATA ONLY PACK 69",
    shortLabel: "MRP 69 ₹69",
    planId: null as string | null,
    planValidity: "7 Days",
    planData: "6GB",
  },
  "139": {
    key: "139",
    amount: 139,
    planName: "DATA ONLY PACK 139",
    shortLabel: "MRP 139 ₹139",
    planId: null as string | null,
    planValidity: "7 Days",
    planData: "12GB",
  },
  "219": {
    key: "219",
    amount: 219,
    planName: "DATA ONLY PACK 219",
    shortLabel: "MRP 219 ₹219",
    planId: null as string | null,
    planValidity: "30 Days",
    planData: "30GB",
  },
} as const;

/** Alias for WhatsApp / intent consumers. */
export const PLAN_CATALOG = PLANS;

export type PlanKey = keyof typeof PLANS;
export const DEFAULT_PLAN: PlanKey = "29";

export function supportedPlanKeys(): PlanKey[] {
  return Object.keys(PLANS) as PlanKey[];
}

export function supportedPlansHelp(): string {
  return supportedPlanKeys()
    .map((key) => {
      const p = PLANS[key];
      return `${p.shortLabel} (${p.planData}, ${p.planValidity})`;
    })
    .join("; ");
}

/** Resolve a plan key from amount, short label, plan name, or plan id. */
export function resolvePlan(raw: string | undefined | null): PlanKey {
  const key = String(raw ?? DEFAULT_PLAN).trim();
  if (key in PLANS) return key as PlanKey;

  const lower = key.toLowerCase();
  for (const [planKey, plan] of Object.entries(PLANS)) {
    if (plan.planName.toLowerCase() === lower) return planKey as PlanKey;
    if (plan.shortLabel.toLowerCase() === lower) return planKey as PlanKey;
    if (plan.planId && plan.planId === key) return planKey as PlanKey;
  }

  // "Unlimited ₹49" / titles from list picker
  const amountInLabel = lower.match(/₹\s*(\d{2,4})\b/) || lower.match(/\b(\d{2,4})\s*₹/);
  if (amountInLabel && amountInLabel[1] in PLANS) {
    return amountInLabel[1] as PlanKey;
  }

  throw new Error(
    `Unsupported plan "${key}". Supported: ${supportedPlansHelp()}. ` +
      `Send e.g. "recharge 9466444175 plan 139".`,
  );
}
