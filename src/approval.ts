import { randomUUID } from 'crypto';
import { createApproval, getApprovalStatus, resolveApproval } from './memory.js';
import { sendNotification } from './notifier.js';
import type { ClassificationResult } from './classifier.js';
import type { ChildProfile } from './profiles.js';

export interface PendingApproval {
  id: string;
  profileId: string;
  content: string;
  category: string;
  role: string;
  resolve: (decision: 'approve' | 'deny') => void;
}

const pendingApprovals = new Map<string, PendingApproval>();
const TIMEOUT_MS = parseInt(process.env.APPROVAL_TIMEOUT_MINUTES ?? '30', 10) * 60 * 1000;

const SAFE_DEFLECTION = `I'd like to pause on this topic. Perhaps we could talk about something else, or if you're going through something difficult, consider reaching out to a trusted adult or counselor.`;

export async function holdForApproval(
  profile: ChildProfile,
  result: ClassificationResult,
  content: string,
  role: string
): Promise<{ approved: boolean; note?: string }> {
  const id = randomUUID();

  createApproval(id, profile.id, content, result.category);

  // Send notification to parent
  await sendNotification({ profile, result, content, role, approvalId: id });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingApprovals.delete(id);
      resolveApproval(id, 'deny', 'Timeout — auto-denied after ' + (TIMEOUT_MS / 60000) + ' min');
      resolve({ approved: false, note: 'No response from parent within timeout period.' });
    }, TIMEOUT_MS);

    pendingApprovals.set(id, {
      id,
      profileId: profile.id,
      content,
      category: result.category,
      role,
      resolve: (decision) => {
        clearTimeout(timeout);
        pendingApprovals.delete(id);
        resolve({ approved: decision === 'approve' });
      },
    });
  });
}

export function handleApprovalDecision(
  id: string,
  decision: 'approve' | 'deny',
  parentNote?: string
): boolean {
  const approval = pendingApprovals.get(id);
  if (!approval) return false;

  resolveApproval(id, decision, parentNote);
  approval.resolve(decision);
  return true;
}

export function getSafeDeflection(): string {
  return SAFE_DEFLECTION;
}

export function listPendingApprovals(profileId?: string): Array<{
  id: string; profileId: string; content: string; category: string; role: string;
}> {
  const all = Array.from(pendingApprovals.values());
  if (profileId) return all.filter(a => a.profileId === profileId);
  return all;
}

// Re-export for external use if needed
export { getApprovalStatus };
