import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AuditEvent {
  ts: string;
  category: string;
  action: string;
  content_snippet: string;
  tool: string;
  session_id: string;
}

function getAuditLogPath(): string {
  return path.join(os.homedir(), '.parental-control', 'audit.log');
}

function ensureDir(): void {
  const dir = path.join(os.homedir(), '.parental-control');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function logAuditEvent(event: AuditEvent): void {
  ensureDir();
  const line = JSON.stringify(event) + '\n';
  try {
    fs.appendFileSync(getAuditLogPath(), line, 'utf-8');
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}

export function generateDailyReport(date?: string): string {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const logPath = getAuditLogPath();

  if (!fs.existsSync(logPath)) {
    return `No audit log found at ${logPath}`;
  }

  const lines = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
  const events: AuditEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as AuditEvent;
      if (event.ts.startsWith(targetDate)) events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  if (events.length === 0) {
    return `No events found for ${targetDate}`;
  }

  const categoryCounts = new Map<string, number>();
  const actionCounts: Record<string, number> = { block: 0, notify: 0, hold_for_approval: 0, allow: 0 };

  for (const event of events) {
    categoryCounts.set(event.category, (categoryCounts.get(event.category) ?? 0) + 1);
    if (event.action in actionCounts) {
      actionCounts[event.action]++;
    }
  }

  let report = `=== Audit Report for ${targetDate} ===\n\n`;
  report += `Total events: ${events.length}\n\n`;
  report += `Actions:\n`;
  for (const [action, count] of Object.entries(actionCounts)) {
    if (count > 0) report += `  ${action}: ${count}\n`;
  }
  report += `\nCategories:\n`;
  for (const [cat, count] of Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])) {
    report += `  ${cat}: ${count}\n`;
  }

  return report;
}
