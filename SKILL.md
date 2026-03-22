# parental-control MCP Skill

This skill teaches Claude how to use the `parental-control` MCP server in agent sessions.

## What It Is

The `parental-control` MCP server wraps Claude sessions used by children, providing:
- Real-time content classification
- Parent notifications (Telegram/iMessage/WhatsApp/email)
- Hold-for-approval flows for sensitive content
- Spiral detection across conversation history

## Setup

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "parental-control": {
      "command": "npx",
      "args": ["-y", "@gonzih/parental-control"],
      "env": {
        "PARENTAL_CONTROL_CHILD_NAME": "Alex",
        "PARENTAL_CONTROL_CHILD_AGE": "14",
        "TELEGRAM_BOT_TOKEN": "your-bot-token",
        "TELEGRAM_PARENT_CHAT_ID": "your-chat-id"
      }
    }
  }
}
```

## How to Use It In Agent Sessions

### Before sending any message to a child:
```
check_message(content="<message>", role="assistant")
```

If decision is `allow` or `notify` → send normally.
If decision is `hold_for_approval` → wait for parent approval.
If decision is `block` → use safeDeflection text instead.

### After receiving a message from a child:
```
check_message(content="<child message>", role="user")
log_interaction(role="user", content="<child message>")
```

### To see current risk status:
```
get_risk_summary()
```

### To check pending approvals (as parent):
```
list_pending()
resolve_approval(approvalId="<id>", decision="approve")
```

## Key Behaviors

- The server polls Telegram for `/approve` and `/deny` commands automatically
- Suicide/self-harm content is always held for approval regardless of age settings
- Spiral detection improves with more conversation history
- Default age-based restrictions apply automatically; customize via `update_profile`
