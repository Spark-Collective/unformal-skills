---
name: unformal-api
description: Create and manage conversational Pulses via the Unformal API. Replace forms with AI-powered conversations. Send someone a link, an AI agent has the conversation, you get structured insights back. Use when you need to collect information from someone through conversation instead of forms.
license: MIT
metadata:
  author: Spark Collective
  version: "1.0.0"
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
| PATCH | /pulses/:id | Update Pulse config |
| DELETE | /pulses/:id | Archive a Pulse |
| POST | /pulses/:id/publish | Publish a Pulse |
| GET | /pulses/:id/conversations | List conversations |
| GET | /conversations/:id | Full conversation + Echo |
| GET | /usage | Credit balance + stats |

## Create Pulse — Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intention` | string | ✅ | What the AI should learn from the respondent |
| `context` | string | | Background info for the AI |
| `tone` | string | | `conversational` (default), `formal`, `coaching` |
| `maxDurationMin` | number | | 2, 5, 10, 15 (default: 5) |
| `maxQuestions` | number | | 3, 5, 8, 12, 20 (default: 8) |
| `linkType` | string | | `multi` (default) or `single` |
| `model` | string | | `claude-sonnet` (default), `gpt-4o`, `gemini` |
| `webhookUrl` | string | | URL to POST results on completion |
| `notifyEmail` | string | | Email to notify on completion |
| `showInsights` | boolean | | Show respondent insights (default: false) |
| `redirectUrl` | string | | Where to redirect after completion |

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

## Webhooks

Set `webhookUrl` on a Pulse to receive Echo data on completion. Signed with `X-Unformal-Signature` (HMAC-SHA256).

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

## Credits

- 50 free conversations on signup
- Each conversation costs 1 credit
- Buy more at unformal.ai/studio/settings

## Full Documentation

https://unformal.ai/docs/api
