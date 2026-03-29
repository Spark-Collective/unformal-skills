# Unformal Agent Skills

Official [Agent Skills](https://agentskills.io) for [Unformal](https://unformal.ai) — the conversation-first input platform.

## What is Unformal?

Replace forms with AI-powered conversations. Create a Pulse, share a link, an AI agent has a real conversation with the respondent, you get structured insights back.

## Available Skills

### `unformal-api`

Create and manage conversational Pulses via the Unformal REST API. 

**Install with ClawHub:**
```bash
npx clawhub install unformal-api
```

**Or copy the skill directory** into your agent's skills folder.

## Quick Start

```bash
# Sign up (no browser needed)
curl -X POST "https://unformal.ai/api/v1/signup" \
  -H "Content-Type: application/json" \
  -d '{"email": "your@email.com"}'

# Create a Pulse
curl -X POST "https://unformal.ai/api/v1/pulses" \
  -H "Authorization: Bearer unf_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intention": "Understand what a new client needs"}'

# → Returns shareable URL immediately
```

## Links

- **Product:** https://unformal.ai
- **API Docs:** https://unformal.ai/docs/api
- **ClawHub:** `npx clawhub install unformal-api`
- **Agent Skills Spec:** https://agentskills.io

## License

MIT
