import fs from 'fs';
import path from 'path';
import os from 'os';
import { getPolicy } from './policy.js';

interface UsageData {
  date: string;
  totalMinutes: number;
  sessionCount: number;
  sessionStart: number | null;
  lastActive: number;
}

function getUsagePath(): string {
  return path.join(os.homedir(), '.parental-control', 'usage.json');
}

function ensureDir(): void {
  const dir = path.join(os.homedir(), '.parental-control');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function loadUsage(): UsageData {
  ensureDir();
  const today = todayStr();
  const usagePath = getUsagePath();

  if (!fs.existsSync(usagePath)) {
    return { date: today, totalMinutes: 0, sessionCount: 0, sessionStart: null, lastActive: Date.now() };
  }

  try {
    const raw = fs.readFileSync(usagePath, 'utf-8');
    const data = JSON.parse(raw) as UsageData;
    // Reset if it's a new day
    if (data.date !== today) {
      return { date: today, totalMinutes: 0, sessionCount: 0, sessionStart: null, lastActive: Date.now() };
    }
    return data;
  } catch {
    return { date: today, totalMinutes: 0, sessionCount: 0, sessionStart: null, lastActive: Date.now() };
  }
}

function saveUsage(data: UsageData): void {
  ensureDir();
  fs.writeFileSync(getUsagePath(), JSON.stringify(data, null, 2), 'utf-8');
}

export function startSession(): void {
  const usage = loadUsage();
  if (!usage.sessionStart) {
    usage.sessionStart = Date.now();
    usage.sessionCount++;
    saveUsage(usage);
  }
}

export function endSession(): void {
  const usage = loadUsage();
  if (usage.sessionStart) {
    const elapsed = Math.floor((Date.now() - usage.sessionStart) / 60000);
    usage.totalMinutes += elapsed;
    usage.sessionStart = null;
    saveUsage(usage);
  }
}

export function recordActivity(): void {
  const usage = loadUsage();
  if (!usage.sessionStart) {
    usage.sessionStart = Date.now();
    usage.sessionCount++;
  }
  usage.lastActive = Date.now();
  saveUsage(usage);
}

export interface SessionStatus {
  allowed: boolean;
  reason?: string;
  minutesUsed: number;
  minutesRemaining: number;
}

export function checkSessionAllowed(): SessionStatus {
  const policy = getPolicy();
  const usage = loadUsage();
  const { time_limits } = policy;

  // Current session minutes (not yet flushed to totalMinutes)
  const sessionMinutes = usage.sessionStart
    ? Math.floor((Date.now() - usage.sessionStart) / 60000)
    : 0;
  const totalUsed = usage.totalMinutes + sessionMinutes;
  const remaining = time_limits.daily_minutes - totalUsed;

  if (remaining <= 0) {
    return {
      allowed: false,
      reason: `Daily limit reached: ${policy.child.name} has used ${totalUsed} minutes today.`,
      minutesUsed: totalUsed,
      minutesRemaining: 0,
    };
  }

  // Check curfew
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // "HH:MM"
  const { curfew_start, curfew_end } = time_limits;
  if (isInCurfew(timeStr, curfew_start, curfew_end)) {
    return {
      allowed: false,
      reason: `Curfew is active (${curfew_start}–${curfew_end}). AI access is paused until ${curfew_end}.`,
      minutesUsed: totalUsed,
      minutesRemaining: remaining,
    };
  }

  return { allowed: true, minutesUsed: totalUsed, minutesRemaining: remaining };
}

function isInCurfew(current: string, start: string, end: string): boolean {
  // Handles overnight curfew (e.g., 21:00–08:00)
  if (start > end) {
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

export function getUsageSummary(): { date: string; totalMinutes: number; sessionCount: number } {
  const usage = loadUsage();
  return { date: usage.date, totalMinutes: usage.totalMinutes, sessionCount: usage.sessionCount };
}
