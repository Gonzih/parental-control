#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { classifyContent, computeSpiralScore, type Category } from './classifier.js';
import { logMessage, getRecentMessages, analyzeSpiralRisk, resolveApproval as dbResolveApproval } from './memory.js';
import { sendNotification } from './notifier.js';
import { holdForApproval, handleApprovalDecision, getSafeDeflection, listPendingApprovals } from './approval.js';
import { getOrCreateDefaultProfile, getProfile, setProfile } from './profiles.js';
import type { ChildProfile } from './profiles.js';
import { pollTelegramUpdates } from './notifier.js';
import { loadPolicy, getPolicy, watchPolicy } from './policy.js';
import { logAuditEvent, generateDailyReport } from './audit.js';
import { checkSessionAllowed, recordActivity, getUsageSummary } from './session-tracker.js';
import { detectPii } from './privacy-router.js';
import { randomUUID } from 'crypto';

// --- CLI flag handling ---
const cliArgs = process.argv.slice(2);

if (cliArgs.includes('--audit-report')) {
  const date = cliArgs[cliArgs.indexOf('--audit-report') + 1];
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  console.log(generateDailyReport(validDate));
  process.exit(0);
}

if (cliArgs.includes('--reload-policy')) {
  loadPolicy();
  console.log('[policy] Policy reloaded from disk.');
  process.exit(0);
}

// --- Startup: load policy, start file watcher ---
loadPolicy();
watchPolicy();

// --- Session ID for audit log ---
const SESSION_ID = randomUUID().slice(0, 8);

const server = new Server(
  { name: 'parental-control', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

const TOOLS: Tool[] = [
  {
    name: 'check_message',
    description: 'Classify a message for safety before it reaches or comes from the child. Returns classification result with decision (allow/notify/block/hold_for_approval).',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The message content to classify' },
        profileId: { type: 'string', description: 'Child profile ID (uses default if omitted)' },
        role: { type: 'string', enum: ['user', 'assistant'], description: 'Who sent the message' },
      },
      required: ['content', 'role'],
    },
  },
  {
    name: 'log_interaction',
    description: 'Log an interaction to the conversation history for pattern analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Child profile ID' },
        role: { type: 'string', description: 'Message role (user/assistant)' },
        content: { type: 'string', description: 'Message content' },
      },
      required: ['role', 'content'],
    },
  },
  {
    name: 'resolve_approval',
    description: 'Approve or deny a held message. Called by parent (or via bot command).',
    inputSchema: {
      type: 'object',
      properties: {
        approvalId: { type: 'string', description: 'The approval ID to resolve' },
        decision: { type: 'string', enum: ['approve', 'deny'], description: 'Parent decision' },
        parentNote: { type: 'string', description: 'Optional note from parent' },
      },
      required: ['approvalId', 'decision'],
    },
  },
  {
    name: 'list_pending',
    description: 'List all messages currently held for parent approval.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Filter by child profile ID (optional)' },
      },
    },
  },
  {
    name: 'update_profile',
    description: 'Update child profile settings (age, restrictions, notification channel).',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Profile ID to update' },
        settings: { type: 'object', description: 'Partial profile settings to update' },
      },
      required: ['profileId', 'settings'],
    },
  },
  {
    name: 'get_risk_summary',
    description: 'Get a conversation risk summary and spiral detection score for a child profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Child profile ID' },
        hours: { type: 'number', description: 'Look back N hours (default: 24)' },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'check_message': {
        const { content, role, profileId } = args as {
          content: string; role: string; profileId?: string;
        };

        // Session limit check
        const sessionStatus = checkSessionAllowed();
        if (!sessionStatus.allowed) {
          logAuditEvent({
            ts: new Date().toISOString(),
            category: 'session_limit',
            action: 'block',
            content_snippet: content.slice(0, 100),
            tool: 'check_message',
            session_id: SESSION_ID,
          });
          const policy = getPolicy();
          // Notify parent if daily limit hit
          if (sessionStatus.reason?.includes('Daily limit')) {
            const profile = profileId ? (getProfile(profileId) ?? getOrCreateDefaultProfile()) : getOrCreateDefaultProfile();
            sendNotification({
              profile,
              result: {
                decision: 'block',
                category: 'safe',
                confidence: 1.0,
                reason: sessionStatus.reason,
              },
              content: sessionStatus.reason,
              role: 'system',
            }).catch(console.error);
            // Also check telegram from policy
            if (!profile.parentContact && policy.notifications.telegram_chat_id) {
              console.error(`[session] Notify parent (telegram): ${sessionStatus.reason}`);
            }
          }
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ decision: 'block', reason: sessionStatus.reason }),
            }],
          };
        }

        recordActivity();

        const profile = profileId ? (getProfile(profileId) ?? getOrCreateDefaultProfile()) : getOrCreateDefaultProfile();
        const recent = getRecentMessages(profile.id, parseInt(process.env.SPIRAL_WINDOW_MESSAGES ?? '20', 10));
        const spiralScore = computeSpiralScore(recent);

        // Two-pass classification: regex first, LLM only for edge cases
        const result = await classifyContent(content, {
          recentMessages: recent,
          spiralScore,
        });

        // PII check: runs independently of classifier (regex-only, never LLM)
        const piiResult = detectPii(content);
        if (piiResult.hasPii && result.category === 'safe') {
          result.category = 'pii_extraction';
          result.decision = 'block';
          result.reason = `PII detected: ${piiResult.types.join(', ')}`;
        }

        // Log the message
        logMessage(profile.id, role, content, result.decision !== 'allow', result.category !== 'safe' ? result.category : undefined);

        // Apply policy content_rules (overrides age-based profile defaults)
        const policy = getPolicy();
        const policyAction = policy.content_rules[result.category];
        if (policyAction) {
          result.decision = policyAction;
        } else {
          // Fall back to profile-based restrictions
          const { restrictions } = profile;
          if (restrictions.blockedCategories.includes(result.category as Category)) {
            result.decision = 'block';
          } else if (restrictions.holdCategories.includes(result.category as Category)) {
            result.decision = 'hold_for_approval';
          } else if (restrictions.notifyCategories.includes(result.category as Category)) {
            result.decision = 'notify';
          }
        }

        // Write to audit log
        logAuditEvent({
          ts: new Date().toISOString(),
          category: result.category,
          action: result.decision,
          content_snippet: content.slice(0, 100),
          tool: 'check_message',
          session_id: SESSION_ID,
        });

        // Send notification
        if (result.decision === 'notify') {
          sendNotification({ profile, result, content, role }).catch(console.error);
        }

        // Hold for approval
        if (result.decision === 'hold_for_approval') {
          const { approved, note } = await holdForApproval(profile, result, content, role);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ...result,
                held: true,
                approved,
                parentNote: note,
                safeDeflection: approved ? undefined : getSafeDeflection(),
              }),
            }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      }

      case 'log_interaction': {
        const { role, content, profileId } = args as {
          role: string; content: string; profileId?: string;
        };
        const profile = profileId ? (getProfile(profileId) ?? getOrCreateDefaultProfile()) : getOrCreateDefaultProfile();
        logMessage(profile.id, role, content);
        return { content: [{ type: 'text', text: JSON.stringify({ logged: true }) }] };
      }

      case 'resolve_approval': {
        const { approvalId, decision, parentNote } = args as {
          approvalId: string; decision: 'approve' | 'deny'; parentNote?: string;
        };
        const resolved = handleApprovalDecision(approvalId, decision, parentNote);
        if (!resolved) {
          dbResolveApproval(approvalId, decision, parentNote);
        }
        return { content: [{ type: 'text', text: JSON.stringify({ resolved: true }) }] };
      }

      case 'list_pending': {
        const { profileId } = (args ?? {}) as { profileId?: string };
        const pending = listPendingApprovals(profileId);
        return { content: [{ type: 'text', text: JSON.stringify(pending) }] };
      }

      case 'update_profile': {
        const { profileId, settings } = args as { profileId: string; settings: Partial<ChildProfile> };
        const existing = getProfile(profileId) ?? getOrCreateDefaultProfile();
        const updated: ChildProfile = { ...existing, ...settings, id: profileId };
        setProfile(updated);
        return { content: [{ type: 'text', text: JSON.stringify(updated) }] };
      }

      case 'get_risk_summary': {
        const { profileId } = (args ?? {}) as { profileId?: string };
        const profile = profileId ? (getProfile(profileId) ?? getOrCreateDefaultProfile()) : getOrCreateDefaultProfile();
        const analysis = analyzeSpiralRisk(profile.id);
        const usage = getUsageSummary();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              profileId: profile.id,
              childName: profile.name,
              riskScore: analysis.spiralScore,
              flags: analysis.flags,
              spiralIndicators: analysis.topTopics,
              messageCount: analysis.recentMessages.length,
              sessionUsage: usage,
            }),
          }],
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start Telegram polling in background if configured
const telegramToken = process.env.TELEGRAM_BOT_TOKEN ?? getPolicy().notifications.telegram_bot_token;
if (telegramToken) {
  if (!process.env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = telegramToken;
  pollTelegramUpdates(
    async (id) => { handleApprovalDecision(id, 'approve'); },
    async (id) => { handleApprovalDecision(id, 'deny'); }
  ).catch(console.error);
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[parental-control] MCP server running on stdio');
