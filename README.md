# parental-control

An open-source MCP (Model Context Protocol) server that gives parents real-time oversight and guardrails over their children's AI agent interactions — without taking away the benefits of AI for learning and creativity.

## The Problem

AI assistants are increasingly used by children and teenagers. Unlike parental controls for websites or games, there are no native guardrails for AI conversations. A child could:

- Explore self-harm or suicidal ideation with an AI that responds helpfully
- Get pulled into echo chambers where the AI reinforces extreme views
- Encounter explicit or age-inappropriate content through creative writing prompts
- Develop an unhealthy emotional dependency on an AI companion

Parents have no visibility into these interactions — until now.

## Architecture

```
Child's Claude session
        │
        ▼
┌─────────────────────┐
│  parental-control   │  ← MCP Server (this project)
│  ─────────────────  │
│  classifier.ts      │  ← Keyword + pattern matching
│  memory.ts          │  ← SQLite conversation history
│  approval.ts        │  ← Hold-for-approval flow
│  notifier.ts        │  ← Telegram / iMessage / WhatsApp / Email
│  profiles.ts        │  ← Age-based restriction profiles
└─────────────────────┘
        │
        ▼
  Parent's phone
(Telegram / iMessage / WhatsApp / Email)
```

The server runs alongside Claude Desktop (or any MCP-compatible agent) and intercepts every message using the `check_message` tool. When something is flagged, the parent gets an alert — and for critical content, the message is held until the parent responds.

## Quick Start

### 1. Install

```bash
npx @gonzih/parental-control
```

### 2. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "parental-control": {
      "command": "npx",
      "args": ["-y", "@gonzih/parental-control"],
      "env": {
        "PARENTAL_CONTROL_CHILD_NAME": "Alex",
        "PARENTAL_CONTROL_CHILD_AGE": "14",
        "NOTIFICATION_CHANNEL": "telegram",
        "TELEGRAM_BOT_TOKEN": "your-bot-token-here",
        "TELEGRAM_PARENT_CHAT_ID": "your-chat-id-here"
      }
    }
  }
}
```

### 3. Get a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Run `/newbot` and follow the prompts
3. Copy the bot token into `TELEGRAM_BOT_TOKEN`
4. Start a chat with your bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat ID

### 4. Instruct Claude

Add a system prompt to Claude (or your child's agent) that instructs it to use the MCP tools:

```
You have access to a parental-control MCP server. Before responding to any message:
1. Call check_message with the user's message (role: "user")
2. If the decision is "block", do not respond to that topic
3. If the decision is "hold_for_approval", wait for the approval result
4. Before sending your response, call check_message with your response (role: "assistant")
5. Proceed based on the decision
```

## Configuration

### Notification Channels

#### Telegram (recommended)
```env
NOTIFICATION_CHANNEL=telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
TELEGRAM_PARENT_CHAT_ID=987654321
```

#### iMessage (macOS only)
```env
NOTIFICATION_CHANNEL=imessage
IMESSAGE_PARENT_PHONE=+15555555555
```
Requires macOS with Messages app configured.

#### WhatsApp (via Twilio)
```env
NOTIFICATION_CHANNEL=whatsapp
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+15555555555
```

#### Email (SMTP)
```env
NOTIFICATION_CHANNEL=email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_PARENT_EMAIL=you@gmail.com
```

### All Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PARENTAL_CONTROL_CHILD_NAME` | `Child` | Child's display name in alerts |
| `PARENTAL_CONTROL_CHILD_AGE` | `14` | Child's age (sets default restrictions) |
| `PARENTAL_CONTROL_PROFILE_ID` | `default` | Profile identifier |
| `NOTIFICATION_CHANNEL` | `telegram` | One of: `telegram`, `imessage`, `whatsapp`, `email` |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token from BotFather |
| `TELEGRAM_PARENT_CHAT_ID` | — | Parent's Telegram chat ID |
| `IMESSAGE_PARENT_PHONE` | — | Phone number for iMessage alerts |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` | Twilio sandbox number |
| `TWILIO_WHATSAPP_TO` | — | Parent's WhatsApp number |
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_PARENT_EMAIL` | — | Parent's email address |
| `PARENTAL_CONTROL_DB` | `~/.parental-control/db.sqlite` | Database file path |
| `APPROVAL_TIMEOUT_MINUTES` | `30` | Auto-deny timeout for held messages |
| `SPIRAL_WINDOW_MESSAGES` | `20` | Message history window for spiral detection |

## MCP Tools

### `check_message`
The primary tool. Call this before processing any message.

**Input:**
```json
{
  "content": "the message text",
  "role": "user",
  "profileId": "optional-profile-id"
}
```

**Output:**
```json
{
  "decision": "allow",
  "category": "safe",
  "confidence": 1.0,
  "reason": "No concerning content detected"
}
```

When held for approval:
```json
{
  "decision": "hold_for_approval",
  "category": "self_harm",
  "confidence": 0.95,
  "reason": "Self-harm content detected: \"hurt myself\"",
  "held": true,
  "approved": false,
  "safeDeflection": "I'd like to pause on this topic..."
}
```

### `log_interaction`
Log messages to conversation history without classification (for audit trails).

### `resolve_approval`
Approve or deny a held message programmatically (parents can also use Telegram bot commands).

### `list_pending`
Get all messages currently waiting for parent approval.

### `update_profile`
Modify child profile settings at runtime.

### `get_risk_summary`
Get the current spiral risk score and conversation flags.

## Decision Types

| Decision | What Happens |
|----------|-------------|
| `allow` | Message passes through normally |
| `notify` | Message passes, parent receives background alert |
| `block` | Message is stopped; AI should not engage with the topic |
| `hold_for_approval` | Message is held; AI waits for parent's approve/deny |

## Content Categories

### Safety-Critical (always held or blocked)
- `suicide` — Suicidal ideation, crisis content
- `self_harm` — Self-injury content
- `explicit_sexual` — Pornography, explicit sexual content
- `extremist_content` — Radicalization, hate groups, terrorism

### Age-Gated (vary by profile)
- `violence` — Instructions for harm, weapons
- `substance_abuse` — Drug use, drug acquisition
- `age_restricted` — Alcohol, gambling sites, fake IDs
- `gambling` — Casino, betting, lottery content

### Behavioral Patterns (notify by default)
- `spiral_detected` — Repeated hopelessness, worthlessness, isolation themes
- `echo_chamber` — AI reinforcing extreme or one-sided beliefs
- `sycophantic_amplification` — AI escalating negative emotions
- `emotional_manipulation` — Urgency, fear, dependency patterns
- `identity_crisis` — Intense identity struggle signals
- `minor_inappropriate` — Mildly age-inappropriate content

## Age-Based Default Profiles

The server automatically applies age-appropriate defaults:

### Under 13
- **Blocked:** explicit sexual, violence, extremist content, substance abuse, gambling
- **Held:** self-harm, suicide, age-restricted
- **Notify:** spiral detected, echo chamber, emotional manipulation, identity crisis

### Ages 13–15
- **Blocked:** explicit sexual, extremist content, gambling
- **Held:** self-harm, suicide, violence, substance abuse
- **Notify:** spiral detected, echo chamber, age-restricted, emotional manipulation

### Ages 16–17
- **Blocked:** explicit sexual, extremist content
- **Held:** self-harm, suicide
- **Notify:** spiral detected, echo chamber, violence, substance abuse, gambling

## Spiral Detection

Spiral detection is a stateful feature that analyzes conversation history for sustained negative thought patterns — not just individual flagged messages.

**How it works:**
1. Every message is stored in SQLite with a timestamp
2. When `check_message` is called, the server looks back at the last N messages (default: 20)
3. Pattern matching scores each message for hopelessness, worthlessness, isolation themes
4. If the cumulative score exceeds the threshold, a `spiral_detected` alert is sent

**Patterns detected:**
- "nobody loves/likes me"
- "I'm worthless/hopeless/a failure"
- "nothing will ever change"
- "I give up"
- "life is pointless"
- And more (see `src/keywords.ts`)

## Approval Flow

When a message is held for approval:

1. Parent receives notification via their configured channel
2. For Telegram: notification includes `/approve <id>` and `/deny <id>` commands
3. Server polls Telegram for responses (30-second long-polling)
4. If no response within timeout (default: 30 min), message is auto-denied
5. Child's AI receives the decision and either:
   - Proceeds normally (approved)
   - Responds with a safe deflection message (denied)

## Parent Guidance

Every alert includes actionable guidance tailored to the category. Examples:

**For spiral detection:**
> Find a calm, private moment. Start with: "I've noticed you seem a bit heavy lately — I'm here if you want to talk." Don't ask yes/no questions. Listen first, problem-solve second.

**For self-harm:**
> Call or text 988 (Suicide & Crisis Lifeline) for guidance on how to help. Remove obvious means of self-harm from the home temporarily. Stay connected — check in frequently.

**For explicit content:**
> Stay calm — panic may shut down communication. This is an opportunity, not a crisis. Frame it around safety and healthy relationships, not punishment.

## Privacy & Data

- All conversation history is stored locally in SQLite (`~/.parental-control/db.sqlite`)
- No data is sent to any third-party service except your chosen notification channel
- The database path is configurable via `PARENTAL_CONTROL_DB`
- Classification is done entirely on-device using keyword matching and regex patterns

## Development

```bash
git clone https://github.com/gonzih/parental-control
cd parental-control
npm install
npm run build
npm start
```

### Project Structure

```
src/
  index.ts        — MCP server entry point, tool handlers
  classifier.ts   — Content classification engine
  keywords.ts     — Keyword lists and regex patterns
  guidance.ts     — Parent guidance templates
  profiles.ts     — Child profile management
  memory.ts       — SQLite persistence layer
  notifier.ts     — Notification dispatch (Telegram/iMessage/WhatsApp/email)
  approval.ts     — Hold-for-approval state machine
```

### Adding New Categories

1. Add keywords to `src/keywords.ts`
2. Add a `Category` type in `src/classifier.ts`
3. Add classification logic in `classifyContent()`
4. Add guidance template in `src/guidance.ts`
5. Update default profiles in `src/profiles.ts`

## Contributing

Contributions welcome. Please open an issue before submitting a large PR.

Areas that need work:
- LLM-based classification (beyond keyword matching)
- Multi-child profile management UI
- Dashboard for conversation history review
- iOS/Android companion app for parent notifications
- Time-of-day and screen-time limits

## License

MIT — see LICENSE file.

## Crisis Resources

If you discover your child is in crisis:
- **988 Suicide & Crisis Lifeline**: Call or text 988 (US)
- **Crisis Text Line**: Text HOME to 741741
- **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/
