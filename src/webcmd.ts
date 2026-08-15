import { exec, execSync } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { DEFAULT_PLAN, resolvePlan } from "./plans";
import type { RechargeResult } from "./types";

const execAsync = promisify(exec);

function isRechargeResult(value: unknown): value is RechargeResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.status === "qr_generated" &&
    typeof row.number === "string" &&
    typeof row.amount === "number" &&
    typeof row.plan_name === "string" &&
    typeof row.plan_validity === "string" &&
    typeof row.plan_data === "string" &&
    typeof row.upi_uri === "string" &&
    typeof row.qr_image_path === "string"
  );
}

const QR_FILENAME_RE = /^qr-\d{10}-\d+-\d+\.png$/i;

/** Copy adapter QR into project ./qr-codes/; return local path or original on failure. */
function copyQrIntoProject(result: RechargeResult): string {
  const source = result.qr_image_path;
  try {
    const projectRoot = path.resolve(__dirname, "..");
    const destDir = path.join(projectRoot, "qr-codes");
    fs.mkdirSync(destDir, { recursive: true });

    const base = path.basename(source);
    const filename = QR_FILENAME_RE.test(base)
      ? base
      : `qr-${result.number}-${result.amount}-${Date.now()}.png`;
    const dest = path.join(destDir, filename);

    fs.copyFileSync(source, dest);
    return dest;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: could not copy QR into ./qr-codes/ (${detail}). Using original path.`);
    return source;
  }
}

function parseRechargeStdout(stdout: string, trimmed: string): RechargeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error(
      `webcmd returned non-JSON output for ${trimmed}. ` +
        `First line: ${stdout.trim().split(/\r?\n/)[0] ?? "(empty)"}`,
    );
  }

  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!isRechargeResult(row)) {
    throw new Error(
      `webcmd JSON did not match RechargeResult for ${trimmed}. ` +
        `Got: ${JSON.stringify(row)?.slice(0, 200) ?? "undefined"}`,
    );
  }

  const localQrPath = copyQrIntoProject(row);
  return {
    ...row,
    qr_image_path: localQrPath,
  };
}

function validateNumber(number: string): string {
  const trimmed = String(number ?? "").trim();
  if (!/^[6-9]\d{9}$/.test(trimmed)) {
    throw new Error(
      `Invalid Jio number "${number}". Expected a 10-digit mobile starting with 6-9.`,
    );
  }
  return trimmed;
}

/**
 * Shells out to the verified private adapter:
 *   webcmd jio recharge <number> [plan] -f json
 */
export function runJioRecharge(
  number: string,
  plan: string = DEFAULT_PLAN,
): RechargeResult {
  const trimmed = validateNumber(number);
  const planKey = resolvePlan(plan);

  let stdout: string;
  const command = process.platform === 'win32' ? 'webcmd.cmd' : 'webcmd';
  const commandPath = path.resolve(__dirname, '../node_modules/.bin', command);
  try {
    stdout = execSync(`"${commandPath}" jio recharge ${trimmed} ${planKey} -f json`, {
      encoding: "utf8",
      timeout: 300_000,
      windowsHide: true,
      env: {
        ...process.env,
        WEBCMD_BROWSER_COMMAND_TIMEOUT: process.env.WEBCMD_BROWSER_COMMAND_TIMEOUT ?? "300",
      },
    });
  } catch (error) {
    const err = error as { stderr?: string; message?: string; status?: number | null };
    const detail = (err.stderr || err.message || String(error)).trim();
    throw new Error(
      `webcmd jio recharge failed for ${trimmed} plan ${planKey}` +
        (err.status != null ? ` (exit ${err.status})` : "") +
        (detail ? `: ${detail.split(/\r?\n/)[0]}` : ""),
    );
  }

  return parseRechargeStdout(stdout, trimmed);
}

/** Non-blocking variant so the WhatsApp webhook can wait without freezing the event loop. */
export async function runJioRechargeAsync(
  number: string,
  plan: string = DEFAULT_PLAN,
): Promise<RechargeResult> {
  const trimmed = validateNumber(number);
  const planKey = resolvePlan(plan);

  try {
    const { stdout } = await execAsync(
      `webcmd jio recharge ${trimmed} ${planKey} -f json`,
      {
        encoding: "utf8",
        timeout: 300_000,
        windowsHide: true,
        env: {
          ...process.env,
          WEBCMD_BROWSER_COMMAND_TIMEOUT:
            process.env.WEBCMD_BROWSER_COMMAND_TIMEOUT ?? "300",
        },
      },
    );
    return parseRechargeStdout(stdout, trimmed);
  } catch (error) {
    const err = error as { stderr?: string; message?: string; code?: number | null };
    const detail = (err.stderr || err.message || String(error)).trim();
    throw new Error(
      `webcmd jio recharge failed for ${trimmed} plan ${planKey}` +
        (err.code != null ? ` (exit ${err.code})` : "") +
        (detail ? `: ${detail.split(/\r?\n/)[0]}` : ""),
    );
  }
}
