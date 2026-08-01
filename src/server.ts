import "dotenv/config";
import express, { type Response } from "express";
import fs from "fs";
import path from "path";
import twilio from "twilio";
import { supportedPlanKeys, supportedPlansHelp, type PlanKey } from "./plans";
import {
  clearJob,
  clearPending,
  getJob,
  getPendingNumber,
  setJobError,
  setJobGenerating,
  setJobReady,
  setPendingNumber,
} from "./session";
import { runJioRechargeAsync } from "./webcmd";
import type { RechargeResult } from "./types";
import {
  isGreetingOrHelp,
  tryExtractExplicitPlan,
  tryExtractNumber,
  tryParsePlanSelection,
} from "./whatsapp-intent";
import { generatingText, planMenuText, welcomeText } from "./whatsapp-ui";

const PORT = 3000;
const WEBHOOK_WAIT_MS = 13_000;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const qrCodesDir = path.join(__dirname, "..", "qr-codes");

app.get("/", (_req, res) => {
  res.send("OK");
});

app.get("/qr-codes/:file", (req, res) => {
  const file = path.basename(String(req.params.file ?? ""));
  if (!/^qr-[\w.-]+\.png$/i.test(file)) {
    res.status(400).send("Bad filename");
    return;
  }
  const full = path.join(qrCodesDir, file);
  if (!fs.existsSync(full)) {
    res.status(404).send("Not found");
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(full);
});

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
  }
  return twilio(accountSid, authToken);
}

function whatsappFrom(): string {
  const from = process.env.TWILIO_WHATSAPP_NUMBER?.trim();
  if (!from) throw new Error("Missing TWILIO_WHATSAPP_NUMBER");
  return from;
}

function listPickerSid(): string | null {
  return process.env.TWILIO_LIST_PICKER_SID?.trim() || null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function publicBaseUrl(): string {
  const base = process.env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("PUBLIC_BASE_URL must be set to your current ngrok https URL");
  }
  return base;
}

function sendTwimlMessages(
  res: Response,
  messages: Array<{ body?: string; mediaUrl?: string }>,
): void {
  if (res.headersSent) {
    console.error("TwiML skipped — headers already sent");
    return;
  }
  const parts = messages.map((m) => {
    const body = m.body != null ? `<Body>${escapeXml(m.body)}</Body>` : "";
    const media = m.mediaUrl ? `<Media>${escapeXml(m.mediaUrl)}</Media>` : "";
    return `<Message>${body}${media}</Message>`;
  });
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>${parts.join("")}</Response>`;
  console.log(
    ">>> Sending TwiML:",
    messages
      .map((m) => {
        const b = (m.body ?? "").replace(/\s+/g, " ").slice(0, 80);
        return `{${b}${m.mediaUrl ? " +media" : ""}}`;
      })
      .join(" | "),
  );
  res.status(200).type("text/xml").send(xml);
}

function sendTwiml(res: Response, body: string): void {
  sendTwimlMessages(res, [{ body }]);
}

function mediaUrlForQr(qrImagePath: string): string | null {
  try {
    const base = publicBaseUrl();
    const file = path.basename(qrImagePath);
    const skip = base.includes("ngrok") ? "?ngrok-skip-browser-warning=1" : "";
    return `${base}/qr-codes/${file}${skip}`;
  } catch {
    return null;
  }
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid jio number/i.test(msg)) {
    return "That number doesn't look like a valid Jio mobile. Send a 10-digit number starting with 6-9.";
  }
  if (/unsupported plan/i.test(msg)) {
    return `That plan isn't supported. Available: ${supportedPlansHelp()}.`;
  }
  return "Sorry, something went wrong. Send hi to start again.";
}

function qrCaption(result: RechargeResult): string {
  return [
    `${result.plan_name} | Rs ${result.amount}`,
    `${result.plan_data} | ${result.plan_validity}`,
    "",
    "UPI link:",
    result.upi_uri,
  ].join("\n");
}

function isQrClaim(body: string): boolean {
  return /^(qr|ready|status|done|image|pic|photo)$/i.test(body.trim());
}

async function sendPlanListPicker(to: string): Promise<boolean> {
  const contentSid = listPickerSid();
  if (!contentSid) return false;
  try {
    await getTwilioClient().messages.create({
      from: whatsappFrom(),
      to,
      contentSid,
    });
    console.log(`Sent list picker (${contentSid}) to ${to}`);
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`List picker failed (${detail}) — text menu`);
    return false;
  }
}

function deliverQrTwiml(res: Response, from: string): boolean {
  const job = getJob(from);
  if (job.state === "ready") {
    const mediaUrl = mediaUrlForQr(job.result.qr_image_path);
    const caption = qrCaption(job.result);
    console.log(`Delivering QR to ${from}${mediaUrl ? ` media=${mediaUrl}` : ""}`);
    // Text first (always arrives). Image separate so a bad media URL can't kill the reply.
    if (mediaUrl) {
      sendTwimlMessages(res, [{ body: caption }, { body: "QR", mediaUrl }]);
    } else {
      sendTwiml(res, caption);
    }
    clearJob(from);
    clearPending(from);
    return true;
  }
  if (job.state === "error") {
    sendTwiml(res, job.message);
    clearJob(from);
    return true;
  }
  return false;
}

async function waitForJobSettled(
  from: string,
  timeoutMs: number,
): Promise<ReturnType<typeof getJob>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = getJob(from);
    if (job.state === "ready" || job.state === "error") return job;
    await new Promise((r) => setTimeout(r, 250));
  }
  return getJob(from);
}

function startRechargeJob(from: string, number: string, plan: string): void {
  setJobGenerating(from, number, plan);
  void (async () => {
    try {
      console.log(`Starting webcmd for ${from}: ${number} plan ${plan}`);
      const result = await runJioRechargeAsync(number, plan);
      setJobReady(from, result);
      console.log(
        `QR ready for ${from}: ${result.plan_name} Rs${result.amount} -> ${result.qr_image_path}`,
      );
    } catch (err) {
      console.error(
        `Recharge job failed for ${from}:`,
        err instanceof Error ? err.message : err,
      );
      setJobError(from, friendlyError(err));
    }
  })();
}

async function beginRecharge(
  res: Response,
  from: string,
  number: string,
  plan: string,
): Promise<void> {
  startRechargeJob(from, number, plan);
  console.log(`Waiting up to ${WEBHOOK_WAIT_MS}ms for QR…`);

  const job = await waitForJobSettled(from, WEBHOOK_WAIT_MS);

  if (job.state === "ready") {
    deliverQrTwiml(res, from);
    return;
  }
  if (job.state === "error") {
    sendTwiml(res, job.message);
    clearJob(from);
    return;
  }

  sendTwiml(
    res,
    [
      generatingText(number, plan),
      "",
      "Usually 30-60s. Then reply: QR",
    ].join("\n"),
  );
}

function planFromWebhook(fields: {
  listId?: string;
  buttonPayload?: string;
  buttonText?: string;
  body?: string;
}): PlanKey | null {
  const keys = supportedPlanKeys() as string[];
  const candidates = [
    fields.listId,
    fields.buttonPayload,
    fields.buttonText,
    fields.body,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const asKey = raw.startsWith("plan_") ? raw.slice("plan_".length) : raw;
    if (keys.includes(asKey)) return asKey as PlanKey;
    const parsed = tryParsePlanSelection(raw, raw);
    if (parsed) return parsed;
  }
  return null;
}

async function handleIncomingWhatsApp(
  res: Response,
  from: string,
  body: string,
  selection: {
    listId: string;
    buttonPayload: string;
    buttonText: string;
  },
): Promise<void> {
  const numberPeek = tryExtractNumber(body);
  const planPeek = planFromWebhook({
    listId: selection.listId,
    buttonPayload: selection.buttonPayload,
    buttonText: selection.buttonText,
    body,
  });
  const job = getJob(from);

  console.log(
    `Handler: body=${JSON.stringify(body)} job=${job.state} plan=${planPeek ?? "-"} number=${numberPeek ?? "-"}`,
  );

  // Greetings ALWAYS win (even if a stale QR job is sitting in memory).
  if (isGreetingOrHelp(body) && !numberPeek && !planPeek) {
    clearJob(from);
    clearPending(from);
    sendTwiml(res, welcomeText());
    return;
  }

  if (job.state === "ready" && !numberPeek && !planPeek) {
    if (isQrClaim(body)) {
      deliverQrTwiml(res, from);
      return;
    }
    sendTwiml(res, "Your QR is ready. Reply QR to get it.");
    return;
  }

  if (job.state === "error" && !numberPeek && !planPeek) {
    deliverQrTwiml(res, from);
    return;
  }

  if (job.state === "generating" && !numberPeek && !planPeek) {
    sendTwiml(
      res,
      `Still generating for ${job.number} (plan ${job.plan})… reply QR soon.`,
    );
    return;
  }

  const pendingNumber = getPendingNumber(from);

  if (planPeek && pendingNumber && !numberPeek) {
    console.log(`Plan ${planPeek} for ${pendingNumber}`);
    await beginRecharge(res, from, pendingNumber, planPeek);
    return;
  }

  if (planPeek && !pendingNumber && !numberPeek) {
    sendTwiml(res, "Send the 10-digit Jio number first, then the plan.");
    return;
  }

  if (numberPeek && tryExtractExplicitPlan(body)) {
    const plan = tryExtractExplicitPlan(body)!;
    setPendingNumber(from, numberPeek);
    await beginRecharge(res, from, numberPeek, plan);
    return;
  }

  if (numberPeek) {
    setPendingNumber(from, numberPeek);
    console.log(`Saved number=${numberPeek}`);
    const sent = await sendPlanListPicker(from);
    if (sent) {
      sendTwiml(res, `Number saved: ${numberPeek}. Pick a plan from the list.`);
      return;
    }
    sendTwiml(res, planMenuText(numberPeek));
    return;
  }

  sendTwiml(
    res,
    "Send a 10-digit Jio number (e.g. 9466444175), then a plan amount.",
  );
}

app.post("/whatsapp", (req, res) => {
  console.log("=== WhatsApp inbound ===");
  console.log(JSON.stringify(req.body, null, 2));

  const body = String(req.body?.Body ?? "");
  const from = String(req.body?.From ?? "");
  const listId = String(
    req.body?.ListId ?? req.body?.listId ?? req.body?.ListItemId ?? "",
  );
  const buttonPayload = String(
    req.body?.ButtonPayload ?? req.body?.ButtonText ?? "",
  );
  const buttonText = String(req.body?.ButtonText ?? "");

  if (!from) {
    sendTwiml(res, "Missing sender.");
    return;
  }

  // Sync fast-path: hi/hey must reply immediately (no async delay).
  if (
    isGreetingOrHelp(body) &&
    !tryExtractNumber(body) &&
    !planFromWebhook({ listId, buttonPayload, buttonText, body })
  ) {
    clearJob(from);
    clearPending(from);
    console.log("Fast-path welcome for", from);
    sendTwiml(res, welcomeText());
    return;
  }

  void handleIncomingWhatsApp(res, from, body, {
    listId,
    buttonPayload,
    buttonText,
  }).catch((err) => {
    console.error("Handler failed:", err);
    if (!res.headersSent) sendTwiml(res, friendlyError(err));
  });
});

process.stdin.resume();

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://localhost:${PORT} (pid ${process.pid})`);
  console.log(
    `PUBLIC_BASE_URL: ${process.env.PUBLIC_BASE_URL?.trim() || "(not set)"}`,
  );
  console.log("Send hi/hey — you should see '>>> Sending TwiML' in this log.");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} in use. Kill the other process, then restart.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
