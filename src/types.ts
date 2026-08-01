/** Exact JSON shape returned by `webcmd jio recharge <number> [plan] -f json`. */
export interface RechargeResult {
  status: "qr_generated";
  number: string;
  amount: number;
  plan_name: string;
  plan_validity: string;
  plan_data: string;
  upi_uri: string;
  qr_image_path: string;
}

/** Parsed intent from a free-text message (e.g. WhatsApp). */
export interface RechargeIntent {
  number: string;
  /** Adapter plan key: "19" | "29" (etc.) */
  plan: string;
  raw: string;
}
