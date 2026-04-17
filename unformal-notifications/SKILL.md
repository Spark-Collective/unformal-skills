---
name: unformal-notifications
description: Get real-time desktop notifications and in-session alerts when someone completes an Unformal Pulse. Use when the user wants to know about new responses, check their Unformal inbox, or set up notifications for a Pulse they are running. Pairs with `unformal-api` for creating Pulses.
license: MIT
metadata:
  author: Spark Collective
  version: "1.0.0"
  website: https://unformal.ai
allowed-tools: Bash
---

# Unformal Notifications

Get notified in real-time when someone completes a conversation on one of your Unformal Pulses — via native desktop notifications and an inbox directory Claude Code can read on demand.

## When to use this skill

Trigger on any of these:
- "any new Unformal responses?"
- "check my Unformal"
- "who completed the [pulse name]?"
- "summarize today's responses"
- "set up notifications for my Pulse"
- "did anyone finish the survey?"

## Setup (one-time)

```bash
# 1. Install the listener script
mkdir -p ~/bin
curl -fsS https://unformal.ai/unformal-listen.sh > ~/bin/unformal-listen
chmod +x ~/bin/unformal-listen

# 2. Export your API key (get one at https://unformal.ai/studio/settings)
export UNFORMAL_API_KEY=unf_xxx

# 3. Find your Pulse ID
unformal-listen

# 4. Start listening in a spare terminal tab
unformal-listen <pulse_id>
```

Leave the listener running in a tab. Every time someone completes a conversation:
- A native macOS notification pops up (Linux: `notify-send` if installed)
- The event JSON is saved to `~/.unformal/inbox/<timestamp>.json`

## Usage patterns

### Pattern 1: Summarize new responses on demand

When the user asks about new responses, check if the listener is running first:

```bash
# Does the inbox exist and have new files?
ls -t ~/.unformal/inbox/*.json 2>/dev/null | head -10
```

If yes, summarize the newest events:

```bash
ls -t ~/.unformal/inbox/*.json 2>/dev/null | head -5 | while read f; do
  cat "$f" | jq -r '{
    completedAt: .completedAt,
    summary: (.echo.summary // .summary // "no summary"),
    sentiment: .echo.sentimentScore,
    quotes: (.echo.keyQuotes // [] | .[0:2])
  }'
done
```

Then present to the user as a clean digest (3-5 bullets, most recent first).

### Pattern 2: Fall back to the API (no listener running)

If `~/.unformal/inbox/` doesn't exist or is empty, query the API directly:

```bash
# Responses completed in the last hour (unix ms)
SINCE=$(node -e "console.log(Date.now() - 3600000)")
curl -fsS "https://unformal.ai/api/v1/pulses/<pulse_id>/conversations?completedSince=$SINCE" \
  -H "Authorization: Bearer $UNFORMAL_API_KEY" | \
  jq '[.data[] | select(.status=="completed")] | sort_by(.completedAt) | reverse'
```

For "any new responses since last check", use a marker file:

```bash
LAST=$(cat ~/.unformal/last-seen 2>/dev/null || echo 0)
curl -fsS "https://unformal.ai/api/v1/pulses/<pulse_id>/conversations?completedSince=$LAST" \
  -H "Authorization: Bearer $UNFORMAL_API_KEY"
date +%s%3N > ~/.unformal/last-seen
```

### Pattern 3: Clear processed events

After Claude has summarized and the user has acted on events, archive them:

```bash
mkdir -p ~/.unformal/processed
mv ~/.unformal/inbox/*.json ~/.unformal/processed/ 2>/dev/null || true
```

### Pattern 4: Act on new responses

For each event in the inbox, Claude can:
- Flag hot leads (high sentiment + specific keywords) and draft follow-ups
- Detect patterns across multiple completions and propose a Resonance-style summary
- Save interesting quotes to a notes file the user can reference later
- Trigger other skills (e.g. draft a Slack message, update a CRM, etc.)

## Inbox event shape

Each file in `~/.unformal/inbox/` is a JSON object from the SSE stream:

```json
{
  "conversationId": "k17abc...",
  "pulseId": "k97xyz...",
  "echo": {
    "fields": {"budget_range": "$10k-20k", "timeline": "Q3"},
    "summary": "Strong fit. Mid-size agency ready to pilot.",
    "keyQuotes": ["We spend 3 hours weekly on status reports"],
    "sentimentScore": 7
  },
  "completedAt": "2026-04-17T10:32:01Z",
  "metadata": {
    "duration": 240,
    "messageCount": 12
  }
}
```

## Related skills

- `unformal-api` — create and manage Pulses. Use first if the user doesn't have a Pulse running yet.

## Links

- Listener source: https://unformal.ai/unformal-listen.sh
- SSE stream endpoint docs: https://unformal.ai/agents
- API key: https://unformal.ai/studio/settings
