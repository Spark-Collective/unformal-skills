---
name: unformal-api
description: Create and manage conversational Pulses via the Unformal API. Replace forms with AI-powered conversations. Send someone a link, an AI agent has the conversation, you get structured insights back. Use when you need to collect information from someone through conversation instead of forms.
license: MIT
metadata:
  author: Spark Collective
  version: "1.2.0"
  website: https://unformal.ai
allowed-tools: Bash
---

# Unformal API

Create AI-powered conversational flows (Pulses) that replace forms, surveys, and intake emails. Send someone a link — an AI agent has a real conversation with them and extracts structured data.

## Setup

1. Sign up via API (no browser needed):
```bash
curl -X POST "https://unformal.ai/api/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'
```
2. Check your email for a 6-digit verification code
3. Verify:
```bash
curl -X POST "https://unformal.ai/api/v1/verify" \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com", "code": "123456"}'
```
4. Your API key (from step 1) is now active

Or: visit [unformal.ai/studio/settings](https://unformal.ai/studio/settings) to create an API key manually.

**Base URL:** `https://unformal.ai/api/v1`

**Auth:** `Authorization: Bearer unf_YOUR_KEY` on every request.

## Quick Start

### Create a Pulse and get a shareable link

```bash
curl -X POST "https://unformal.ai/api/v1/pulses" \
  -H "Authorization: Bearer unf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intention": "Understand what a new client needs before our first meeting"}'
```

Response:
```json
{
  "data": {
    "id": "pls_abc123",
    "url": "https://unformal.ai/p/your-slug",
    "slug": "your-slug",
    "status": "active"
  }
}
```

Send the URL to anyone. The AI conducts the conversation. You get structured data back.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /signup | Create account (no auth required) |
| POST | /verify | Verify email (no auth required) |
| POST | /pulses | Create a Pulse |
| GET | /pulses | List all Pulses |
| GET | /pulses/:id | Get Pulse details |
| PATCH | /pulses/:id | Update Pulse config (all creation fields supported) |
| DELETE | /pulses/:id | Archive a Pulse |
| POST | /pulses/:id/publish | Publish a Pulse |
| GET | /pulses/:id/conversations | List conversations |
| GET | /conversations/:id | Full conversation + Echo |
| GET | /pulses/:id/resonance | Aggregate insights across all conversations: themes, consensus, per-question stats (NPS, sliders, rankings, option counts), open-ended highlights, featured quotes |
| GET | /pulses/:id/analytics | Completion rate, avg duration, field fill rates, sentiment, abandonment |
| GET | /pulses/:id/export?format=csv|json | Export conversations |
| GET | /usage | Credit balance + stats |

## Create Pulse — Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `intention` | string | Yes | — | What the AI should learn from the respondent |
| `name` | string | | — | Display name for the Pulse |
| `slug` | string | | auto | Custom URL slug (lowercase, numbers, hyphens, 2-80 chars) |
| `context` | string | | — | Background info for the AI (not shown to respondent) |
| `persona` | string | | — | Custom AI personality/voice. The AI adopts this character during conversations. |
| `mode` | string | | `interview` | `interview` (guided Q&A) or `extract` (brain dump first, then fill gaps) |
| `tone` | string | | `conversational` | `conversational`, `formal`, `coaching`, `casual`, `custom` |
| `maxDurationMin` | number | | 5 | Max duration: 2, 5, 10, 15 |
| `maxQuestions` | number | | 8 | Max questions: 3, 5, 8, 12, 20 |
| `maxResponses` | number | | — | Auto-close after N responses. Leave empty for unlimited. |
| `completionPriority` | string | | `balanced` | `balanced` (smart), `coverage` (thorough, 90%+ fields), `speed` (closes at maxQuestions) |
| `linkType` | string | | `multi` | `multi` (unlimited responses) or `single` (one response only) |
| `model` | string | | `claude-sonnet` | `claude-sonnet`, `gpt-4o`, `gemini` |
| `outputFields` | array | | auto | Custom extraction fields: `[{name, type, description}]`. Types: string, number, boolean, array. Auto-generated from intention if omitted. |
| `topics` | array | | — | Theme guidance for the AI (array of strings) |
| `welcomeTitle` | string | | — | Custom title on the welcome screen |
| `welcomeDescription` | string | | — | Custom description on the welcome screen |
| `dictationEnabled` | boolean | | true | Allow voice dictation |
| `showInsights` | boolean | | false | Show respondent a summary when done |
| `insightExchange` | boolean | | false | Respondents see anonymized group insights after completing (needs 3+ conversations) |
| `allowResearch` | boolean | | false | AI can search web during conversation, costs 2x credits |
| `webhookUrl` | string | | — | URL to POST results on completion |
| `notifyEmail` | string | | — | Email to notify on completion |
| `completionRedirect` | string | | — | Custom redirect URL after conversation completion |
| `themeMode` | string | | `system` | `system`, `light`, or `dark` — conversation UI theme |

### Modes

**Interview (default):** Guided conversation. The AI asks one question at a time, adapting follow-ups. Best for discovery, qualification, deep interviews.

**Extract:** Brain dump first. The respondent writes everything upfront. The AI asks only about gaps. Best for intake forms, bug reports, data collection.

### Example: Minimal
```json
{"intention": "Qualify this lead for our enterprise plan"}
```

### Example: Full
```json
{
  "intention": "Understand what motivates each team member and where they need support",
  "context": "We're a 15-person startup. This is our quarterly team check-in.",
  "persona": "You are a warm, empathetic coach who asks thoughtful follow-ups. Use first names. Be encouraging but probe deeper when someone gives a surface-level answer.",
  "mode": "interview",
  "tone": "coaching",
  "maxQuestions": 10,
  "completionPriority": "coverage",
  "outputFields": [
    {"name": "motivation", "type": "string", "description": "What currently motivates this person"},
    {"name": "blockers", "type": "array", "description": "Things preventing them from doing their best work"},
    {"name": "support_needed", "type": "string", "description": "What support they need from leadership"},
    {"name": "energy_level", "type": "number", "description": "Self-reported energy/morale 1-10"}
  ],
  "showInsights": true,
  "webhookUrl": "https://your-app.com/webhooks/unformal"
}
```

### Example: Extract mode with persona
```json
{
  "intention": "Screen startup founders applying for pre-seed investment",
  "persona": "You are a sharp, funny VC intern who has seen 10,000 bad pitch decks. Roast gently, find the diamonds.",
  "mode": "extract",
  "tone": "custom",
  "maxQuestions": 10,
  "allowResearch": true,
  "completionPriority": "coverage",
  "outputFields": [
    {"name": "company_name", "type": "string", "description": "Startup name"},
    {"name": "one_liner", "type": "string", "description": "One-sentence description"},
    {"name": "traction", "type": "string", "description": "Users, revenue, or proof of demand"},
    {"name": "pitch_score", "type": "number", "description": "AI-assigned score 1-10"}
  ]
}
```

## Update Pulse — PATCH /pulses/:id

All creation fields are patchable. Send only the fields you want to change.

```bash
curl -X PATCH "https://unformal.ai/api/v1/pulses/PULSE_ID" \
  -H "Authorization: Bearer unf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"maxQuestions": 12, "outputFields": [{"name": "score", "type": "number", "description": "Lead score"}]}'
```

## Retrieving raw responses

Three ways to pull individual respondents' answers.

### 1. List with echoes (fast, no transcripts)
```bash
curl "https://unformal.ai/api/v1/pulses/PULSE_ID/conversations" \
  -H "Authorization: Bearer unf_YOUR_KEY"
```
Returns `[{id, status, echo, metadata, completedAt, createdAt}]`. Good for scanning who completed and what structured fields were extracted. No transcripts.

### 2. Single conversation with full transcript
```bash
curl "https://unformal.ai/api/v1/conversations/CONV_ID" \
  -H "Authorization: Bearer unf_YOUR_KEY"
```
Returns everything: `transcript` (every AI message + user reply, including `responseData` for structured answers like slider values, multi-select picks, ranking orders) and `echo` (extracted structured fields + key quotes + summary).

### 3. Bulk export — everything for all conversations
```bash
curl "https://unformal.ai/api/v1/pulses/PULSE_ID/export?format=json" \
  -H "Authorization: Bearer unf_YOUR_KEY" \
  -o all-responses.json
```
Returns `{pulse, conversations: [...with transcript and echo...], exportedAt, total}`. Use `format=csv` for a flat tabular dump of echo fields.

### Transcript shape

Each transcript message has:
```json
{
  "role": "user" | "assistant",
  "content": "...",
  "timestamp": 1776343572188,
  "uiHint": { "type": "slider", "config": {...} },     // on assistant msgs with structured questions
  "responseData": { "type": "slider", "data": {"value": 8} }  // on user msgs that answered a structured question
}
```

`responseData.type` matches the `ui_hint` type: `slider`, `quick_options`, `multi_select`, `ranking`, `image_select`. The `data` shape:
- `slider` → `{value: number}`
- `quick_options` → `{selected: string}` (single)
- `multi_select` / `image_select` → `{selected: string[]}`
- `ranking` → `{order: string[]}` (first element = most valued)

## Echo — Structured Output

When a conversation completes, the AI extracts structured data:

```json
{
  "echo": {
    "fields": {
      "budget_range": "$50k-100k",
      "timeline": "Q3 2026",
      "current_tools": ["Salesforce", "HubSpot"]
    },
    "summary": "Strong fit. Budget aligned, timeline Q3.",
    "keyQuotes": ["We spend 3 hours daily on data entry"],
    "subtext": "Enthusiastic but hesitant about buy-in.",
    "sentimentScore": 7
  }
}
```

## Resonance — Aggregate Insights

Once a Pulse has 3+ completed conversations, Unformal synthesizes an aggregate view:

```bash
curl "https://unformal.ai/api/v1/pulses/PULSE_ID/resonance" \
  -H "Authorization: Bearer unf_YOUR_KEY"
```

Response (abridged):
```json
{
  "data": {
    "available": true,
    "totalConversations": 14,
    "autoSummary": "WAT has successfully built a highly valued founder community...",
    "themes": [{"theme": "Community value", "frequency": 12, "sentiment": "positive"}],
    "consensusPoints": ["Free coworking space is the most valued beta offering"],
    "divergencePoints": ["Views split on event format — founder stories vs workshops"],
    "recommendedActions": ["Hire a community manager", "Add call booths"],
    "sentimentDistribution": {"positive": 64, "neutral": 29, "negative": 7},
    "questionAggregates": [
      {
        "questionIndex": 10,
        "question": "How likely are you to recommend WAT?",
        "type": "slider",
        "stats": {
          "n": 14, "mean": 7.9, "median": 8, "min": 5, "max": 10,
          "distribution": [{"bucket": "1-2", "count": 0}, ...],
          "nps": {"score": 14, "promoters": 5, "passives": 6, "detractors": 3}
        }
      },
      {
        "questionIndex": 3,
        "question": "Which WAT channels are you part of?",
        "type": "multi_select",
        "stats": {"n": 10, "options": [{"label": "WAT Connect", "count": 10, "percentage": 100}, ...]}
      },
      {
        "questionIndex": 4,
        "question": "Rank these offerings from most to least valuable:",
        "type": "ranking",
        "stats": {"n": 12, "items": [{"label": "Free coworking space", "avgRank": 1.92, "topCount": 5}, ...]}
      }
    ],
    "openEndedHighlights": [
      {
        "fieldName": "pain_point",
        "label": "Pain Point",
        "description": "The single thing they wish were 10x better",
        "values": ["Community management gap", "More call booths", ...]
      }
    ],
    "featuredQuotes": ["a community is built around people, if they're not connecting it's not working", ...]
  }
}
```

If < 3 conversations completed, returns `{"available": false, "reason": "..."}`.

### Question aggregate shapes

- `slider` — `{n, mean, median, min, max, distribution[], nps?}`. NPS is auto-detected when a 1-10 (or 0-10) slider question contains "recommend" or similar.
- `ranking` — `{n, items: [{label, avgRank, topCount, rankCounts[]}]}`. Lower `avgRank` = more valued.
- `multi_select` / `quick_options` — `{n, options: [{label, count, percentage, shareOfPicks}]}`
- `image_select` — same as multi_select, plus `images: [{label, url}]`

## Analytics — Completion and Engagement

```bash
curl "https://unformal.ai/api/v1/pulses/PULSE_ID/analytics" \
  -H "Authorization: Bearer unf_YOUR_KEY"
```

Returns `completionRate`, `avgDuration`, `avgFieldCoverage` (how much of the structured output was filled on average), `avgSentiment`, `avgMessageCount`, `avgResponseLength`, per-field `fieldFillRates`, `abandonmentRate` and `commonAbandonmentPoint` (which question tends to cause drop-off).

## Webhooks

Set `webhookUrl` on a Pulse to receive Echo data on completion:

```json
{
  "event": "conversation.completed",
  "conversationId": "conv_123",
  "pulseId": "pls_456",
  "echo": {"fields": {...}, "summary": "...", "keyQuotes": [...], "sentimentScore": 7},
  "completedAt": "2026-03-29T10:00:00Z"
}
```

Signed with `X-Unformal-Signature` (HMAC-SHA256).

## Common Patterns

### Agent creates intake for each new lead
```
1. POST /pulses with intention for the specific lead
2. Send the URL to the lead
3. Wait for webhook with Echo data
4. Update CRM with structured qualification data
```

### Batch research across users
```
1. POST /pulses with linkType "multi"
2. Send same URL to many users
3. GET /pulses/:id/conversations for all responses
```

### One-off intake for a specific person
```
1. POST /pulses with linkType "single"
2. Send the URL to that one person
3. Link becomes inactive after they respond
```

## CLI (Alternative to API)

```bash
npx unformal init --key unf_YOUR_KEY
npx unformal create --intention "Qualify leads" --mode interview --research
npx unformal list
npx unformal get PULSE_ID
npx unformal update PULSE_ID --fields "score:number:Lead score 1-10"
npx unformal conversations PULSE_ID    # Summary table of all conversations
npx unformal conversation CONV_ID      # One conversation: full transcript, structured answers, echo
npx unformal export PULSE_ID --format json --output all.json   # All raw responses in one file
npx unformal resonance PULSE_ID        # Aggregate insights (themes, NPS, per-question stats, quotes)
npx unformal analytics PULSE_ID        # Completion rate, duration, field coverage
npx unformal usage
```

## Credits

- 50 free conversations on signup
- Each conversation costs 1 credit (2 with `allowResearch`)
- Buy more at unformal.ai/studio/settings

## Full Documentation

- API Reference: https://unformal.ai/docs/api
- Integration Guide: https://unformal.ai/integrate
- llms.txt: https://unformal.ai/llms.txt
