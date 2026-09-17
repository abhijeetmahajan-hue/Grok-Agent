# Grok Parser Agent

Simple studio for writing **Grok** log parsers. Define the fields you need, test against sample logs, analyze an existing parser, and optionally plug in AI for richer suggestions.

## Features

1. **Fields** — add or upload the fields you want to extract
2. **Sample logs** — paste/upload logs and see parse output
3. **Predefined parser** — upload an existing Grok pattern to review mappings and rename suggestions
4. **AI assist** — add advanced context; uses OpenAI-compatible APIs when configured, otherwise a local heuristic helper

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Optional AI setup

Copy `.env.example` to `.env.local` and set:

```bash
OPENAI_API_KEY=sk-...
# optional
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Without a key, Generate / Improve / Explain still work using the built-in heuristic assistant.

## Sample files

- `public/samples/fields.json`
- `public/samples/access.log`
- `public/samples/nginx.grok`

## API

- `POST /api/parse` — `{ pattern, logs, fields? }`
- `POST /api/analyze` — `{ pattern, fields? }`
- `POST /api/ai` — `{ mode: "generate"|"improve"|"explain"|"map", ... }`
- `GET /api/patterns` — common Grok types and examples
