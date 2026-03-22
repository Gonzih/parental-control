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
┌──────────────────────────────────────┐
│  parental-control  (MCP Server)      │
│  ────────────────────────────────    │
│  policy.ts         ← YAML policy, hot-reload via chokidar
│  classifier.ts     ← Regex-first, LLM second-pass
│  privacy-router.ts ← PII detection, local/cloud routing
│  audit.ts          ← JSON Lines audit log
│  session-tracker.ts← Daily limits, curfew enforcement
│  memory.ts         ← SQLite conversation history
│  approval.ts       ← Hold-for-approval flow
│  notifier.ts       ← Telegram / iMessage / WhatsApp / Email
│  profiles.ts       ← Age-based restriction profiles
└──────────────────────────────────────┘
        │
        ▼
  Parent's phone                  Local Ollama (optional)
(Telegram / iMessage / ...)     http://localhost:11434
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

### Policy File (recommended)

The easiest way to configure the server is with a YAML policy file at `~/.parental-control/policy.yaml`. Copy the example to get started:

```bash
cp policy.yaml.example ~/.parental-control/policy.yaml
```

The server watches this file and hot-reloads it without a restart. You can also force a reload:

```bash
npx @gonzih/parental-control --reload-policy
```

See [`policy.yaml.example`](./policy.yaml.example) for all options.

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
| `ANTHROPIC_API_KEY` | — | API key for LLM second-pass classification (cloud) |
| `LOCAL_MODEL` | `llama3.2` | Ollama model name for local LLM classification |

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

## Out-of-Process Enforcement

Classification runs **entirely outside the child model's context**. Even if the child's AI session is jailbroken or manipulated, it cannot influence the safety decision:

1. **First pass — regex + keyword matching** (fast, zero cost, prompt-injection-proof)
   - Confidence > 0.8 → use result directly, no LLM needed
   - Confidence 0.4–0.8 → escalate to second pass
   - Confidence < 0.4 → allow but log

2. **Second pass — LLM classifier** (only for edge cases)
   - Routed to local Ollama or Anthropic API based on `inference_router` setting
   - A separate model from the child's conversation model

## Privacy Router

Control where LLM inference happens via `inference_router` in `policy.yaml`:

| Value | Behavior |
|-------|----------|
| `local` | All inference → Ollama at `http://localhost:11434` |
| `cloud` | All inference → Anthropic API |
| `auto` | PII/sensitive content → local, general → cloud |

PII detection (regex-based, never LLM-based) catches:
- Social Security numbers (`XXX-XX-XXXX`)
- Credit card numbers
- Phone numbers
- Email addresses
- Street addresses

## Audit Log

Every classification decision is written to `~/.parental-control/audit.log` in JSON Lines format:

```json
{"ts":"2026-03-21T10:00:00Z","category":"violence","action":"block","content_snippet":"first 100 chars...","tool":"check_message","session_id":"abc123"}
```

Generate a daily summary:

```bash
npx @gonzih/parental-control --audit-report
# or for a specific date:
npx @gonzih/parental-control --audit-report 2026-03-20
```

Output:
```
=== Audit Report for 2026-03-21 ===

Total events: 47

Actions:
  allow: 40
  notify: 4
  block: 2
  hold_for_approval: 1

Categories:
  safe: 40
  spiral_detected: 4
  violence: 2
  self_harm: 1
```

## Session Time Limits

Track daily usage in `~/.parental-control/usage.json`. When the daily limit is reached, all tool calls are blocked and the parent receives a notification:

> "Daily limit reached: Alex has used 120 minutes today."

Curfew hours are also enforced — no AI access between `curfew_start` and `curfew_end` (supports overnight curfews like 21:00–08:00).

## Privacy & Data

- All conversation history is stored locally in SQLite (`~/.parental-control/db.sqlite`)
- Audit log at `~/.parental-control/audit.log` (JSON Lines, parent-readable)
- Usage tracking at `~/.parental-control/usage.json`
- No data is sent to any third-party service except your chosen notification channel
- The database path is configurable via `PARENTAL_CONTROL_DB`
- With `inference_router: local`, all AI classification stays on-device via Ollama

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
  index.ts            — MCP server entry point, CLI flags, tool handlers
  policy.ts           — YAML policy loader with chokidar file watcher
  classifier.ts       — Two-pass: regex-first, LLM second-pass with confidence tiers
  privacy-router.ts   — PII detection (regex), local/cloud inference routing
  audit.ts            — JSON Lines audit log, daily report generator
  session-tracker.ts  — Daily usage tracking, curfew enforcement
  keywords.ts         — Keyword lists and regex patterns
  guidance.ts         — Parent guidance templates
  profiles.ts         — Age-based restriction profiles
  memory.ts           — SQLite persistence layer
  notifier.ts         — Notification dispatch (Telegram/iMessage/WhatsApp/email)
  approval.ts         — Hold-for-approval state machine
policy.yaml.example   — Annotated policy file template
```

### Adding New Categories

1. Add keywords to `src/keywords.ts`
2. Add the category to the `Category` union in `src/classifier.ts`
3. Add classification logic in `classifyWithRegex()`
4. Add a `categoryToDecision()` mapping entry
5. Add a guidance template in `src/guidance.ts`
6. Update default profiles in `src/profiles.ts`
7. Add the category key to `policy.yaml.example`

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
