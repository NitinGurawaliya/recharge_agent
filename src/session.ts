/** In-memory WhatsApp sessions for the Twilio sandbox bot. */

import type { RechargeResult } from "./types";

export interface PendingRecharge {
  number: string;
  createdAt: number;
}

export type JobStatus =
  | { state: "idle" }
  | { state: "generating"; number: string; plan: string; startedAt: number }
  | { state: "ready"; result: RechargeResult; readyAt: number }
  | { state: "error"; message: string; at: number };

const SESSION_TTL_MS = 30 * 60 * 1000;
const numberSessions = new Map<string, PendingRecharge>();
const jobs = new Map<string, JobStatus>();

export function setPendingNumber(from: string, number: string): void {
  numberSessions.set(from, { number, createdAt: Date.now() });
}

export function getPendingNumber(from: string): string | null {
  const row = numberSessions.get(from);
  if (!row) return null;
  if (Date.now() - row.createdAt > SESSION_TTL_MS) {
    numberSessions.delete(from);
    return null;
  }
  return row.number;
}

export function clearPending(from: string): void {
  numberSessions.delete(from);
}

export function getJob(from: string): JobStatus {
  const job = jobs.get(from);
  if (!job || job.state === "idle") return { state: "idle" };
  const ts =
    job.state === "generating"
      ? job.startedAt
      : job.state === "ready"
        ? job.readyAt
        : job.at;
  if (Date.now() - ts > SESSION_TTL_MS) {
    jobs.delete(from);
    return { state: "idle" };
  }
  return job;
}

export function setJobGenerating(from: string, number: string, plan: string): void {
  jobs.set(from, { state: "generating", number, plan, startedAt: Date.now() });
}

export function setJobReady(from: string, result: RechargeResult): void {
  jobs.set(from, { state: "ready", result, readyAt: Date.now() });
}

export function setJobError(from: string, message: string): void {
  jobs.set(from, { state: "error", message, at: Date.now() });
}

export function clearJob(from: string): void {
  jobs.delete(from);
}
