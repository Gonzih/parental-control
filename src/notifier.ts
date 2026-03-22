import { execFile } from 'child_process';
import { promisify } from 'util';
import type { ClassificationResult } from './classifier.js';
import type { ChildProfile } from './profiles.js';
import { getGuidance } from './guidance.js';

const execFileAsync = promisify(execFile);

export interface NotificationPayload {
  profile: ChildProfile;
  result: ClassificationResult;
  content: string;
  role: string;
  approvalId?: string;
}

async function sendTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

async function sendIMessage(phone: string, message: string): Promise<void> {
  const script = `tell application "Messages" to send "${message.replace(/"/g, '\\"')}" to buddy "${phone}"`;
  await execFileAsync('osascript', ['-e', script]);
}

async function sendWhatsApp(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

  if (!accountSid || !authToken) throw new Error('Twilio credentials not set');

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    From: from,
    To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
    Body: message,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Twilio API error: ${err}`);
  }
}

async function sendEmail(toEmail: string, subject: string, body: string): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject,
    text: body,
  });
}

function buildNotificationText(payload: NotificationPayload): string {
  const { profile, result, content, role, approvalId } = payload;
  const guidance = getGuidance(result.category);

  const emoji = result.category === 'suicide' || result.category === 'self_harm'
    ? '🚨' : result.decision === 'hold_for_approval' ? '⚠️' : '📋';

  const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;

  let msg = `${emoji} *Parental Control Alert*\n\n`;
  msg += `*Child:* ${profile.name} (age ${profile.age})\n`;
  msg += `*Category:* ${result.category.replace(/_/g, ' ')}\n`;
  msg += `*Action:* ${result.decision.replace(/_/g, ' ')}\n`;
  msg += `*Confidence:* ${Math.round(result.confidence * 100)}%\n\n`;
  msg += `*Flagged content (${role}):*\n${truncated}\n\n`;
  msg += `*Reason:* ${result.reason}\n\n`;

  if (guidance) {
    msg += `*Parent Guidance:*\n${guidance.slice(0, 500)}\n\n`;
  }

  if (approvalId && result.decision === 'hold_for_approval') {
    msg += `*Action required:*\nReply with:\n/approve ${approvalId}\n/deny ${approvalId}\n\n`;
    msg += `_Message is held pending your decision. Timeout: ${process.env.APPROVAL_TIMEOUT_MINUTES ?? 30} min._`;
  }

  return msg;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const { profile } = payload;
  const message = buildNotificationText(payload);
  const plainMessage = message.replace(/\*/g, '').replace(/_/g, '');

  try {
    switch (profile.notificationChannel) {
      case 'telegram':
        await sendTelegram(profile.parentContact, message);
        break;
      case 'imessage':
        await sendIMessage(profile.parentContact, plainMessage);
        break;
      case 'whatsapp':
        await sendWhatsApp(profile.parentContact, plainMessage);
        break;
      case 'email':
        await sendEmail(
          profile.parentContact,
          `Parental Control Alert: ${payload.result.category}`,
          plainMessage
        );
        break;
    }
  } catch (err) {
    console.error(`[parental-control] Notification failed via ${profile.notificationChannel}:`, err);
    // Try email fallback if configured
    if (profile.notificationChannel !== 'email' && process.env.SMTP_PARENT_EMAIL) {
      try {
        await sendEmail(
          process.env.SMTP_PARENT_EMAIL,
          `[FALLBACK] Parental Control Alert: ${payload.result.category}`,
          plainMessage
        );
      } catch (fallbackErr) {
        console.error('[parental-control] Fallback email also failed:', fallbackErr);
      }
    }
  }
}

export async function pollTelegramUpdates(
  onApprove: (approvalId: string) => Promise<void>,
  onDeny: (approvalId: string) => Promise<void>
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  let offset = 0;

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`;
      const response = await fetch(url);
      if (!response.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }

      const data = await response.json() as {
        ok: boolean;
        result: Array<{ update_id: number; message?: { text?: string; chat?: { id: number } } }>;
      };

      if (!data.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }

      for (const update of data.result) {
        offset = update.update_id + 1;
        const text = update.message?.text?.trim() ?? '';

        const approveMatch = text.match(/^\/approve\s+(\S+)/);
        if (approveMatch) { await onApprove(approveMatch[1]); continue; }

        const denyMatch = text.match(/^\/deny\s+(\S+)/);
        if (denyMatch) { await onDeny(denyMatch[1]); continue; }
      }
    } catch {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}
