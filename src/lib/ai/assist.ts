import type { AiAssistRequest, AiAssistResponse, ParseField } from "../grok/types";
import { fieldsToPatternSkeleton } from "../grok/constants";
import { extractFieldsFromPattern } from "../grok/engine";

function inferGrokType(name: string, sampleValue?: string): string {
  const n = name.toLowerCase();
  const v = (sampleValue || "").trim();

  if (/ip|addr/.test(n) || /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return "IP";
  if (/time|date|ts|timestamp/.test(n) || /\d{4}-\d{2}-\d{2}/.test(v))
    return "TIMESTAMP_ISO8601";
  if (/status|code|port|pid|bytes|size|length|count/.test(n) || /^\d+$/.test(v))
    return "INT";
  if (/method|verb/.test(n)) return "WORD";
  if (/url|uri|path/.test(n) || v.startsWith("/")) return "URIPATHPARAM";
  if (/level|severity/.test(n)) return "LOGLEVEL";
  if (/uuid|id/.test(n) && /[0-9a-f-]{36}/i.test(v)) return "UUID";
  if (/user|login|auth/.test(n)) return "USERNAME";
  if (/host|server/.test(n)) return "HOSTNAME";
  if (/agent|ua|message|msg|raw/.test(n)) return "GREEDYDATA";
  if (v.includes(" ") || v.length > 40) return "GREEDYDATA";
  return "DATA";
}

function tokenizeSample(line: string): string[] {
  const tokens: string[] = [];
  const re = /"[^"]*"|'[^']*'|\[[^\]]*\]|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

function escapeLiteral(token: string): string {
  return token.replace(/([\\.^$|()[\]{}*+?])/g, "\\$1");
}

function generatePatternFromFieldsAndLogs(
  fields: ParseField[],
  sampleLogs: string,
): { pattern: string; message: string; fields: ParseField[] } {
  const firstLine =
    sampleLogs
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) || "";

  if (!fields.length && !firstLine) {
    return {
      pattern: "%{GREEDYDATA:message}",
      message:
        "No fields or sample logs provided. Started with a catch-all message field.",
      fields: [
        {
          id: "message",
          name: "message",
          grokType: "GREEDYDATA",
          description: "Full log line",
        },
      ],
    };
  }

  if (!firstLine) {
    const pattern = fieldsToPatternSkeleton(fields);
    return {
      pattern,
      message:
        "Built a space-separated skeleton from your fields. Adjust literals to match real log delimiters.",
      fields,
    };
  }

  const tokens = tokenizeSample(firstLine);
  const enriched: ParseField[] =
    fields.length > 0
      ? fields.map((field, index) => ({
          ...field,
          grokType:
            field.grokType ||
            inferGrokType(field.name, tokens[index]?.replace(/^["'\[]|["'\]]$/g, "")),
        }))
      : tokens.map((token, index) => {
          const clean = token.replace(/^["'\[]|["'\]]$/g, "");
          const name =
            inferGrokType(`field_${index}`, clean) === "IP"
              ? `ip_${index}`
              : inferGrokType(`field_${index}`, clean) === "TIMESTAMP_ISO8601"
                ? "timestamp"
                : inferGrokType(`field_${index}`, clean) === "INT"
                  ? `num_${index}`
                  : `field_${index}`;
          const grokType = inferGrokType(name, clean);
          return {
            id: `auto_${index}`,
            name: name === `field_${index}` ? `field_${index + 1}` : name,
            grokType,
            description: `Inferred from sample token: ${clean.slice(0, 48)}`,
          };
        });

  const parts: string[] = [];
  const used = new Set<number>();

  function pushFieldCapture(field: ParseField, token?: string) {
    const type = field.grokType || "DATA";
    if (token?.startsWith('"') && token.endsWith('"')) {
      parts.push(`"%{${type}:${field.name}}"`);
    } else if (token?.startsWith("[") && token.endsWith("]")) {
      parts.push(`\\[%{${type}:${field.name}}\\]`);
    } else {
      parts.push(`%{${type}:${field.name}}`);
    }
  }

  function matchFieldForToken(token: string, clean: string): ParseField | undefined {
    return enriched.find((f, idx) => {
      if (used.has(idx)) return false;
      const type = f.grokType || inferGrokType(f.name, clean);
      if (type === "IP" && /^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return true;
      if (
        type === "TIMESTAMP_ISO8601" &&
        (/\d{4}-\d{2}-\d{2}/.test(clean) || token.startsWith("["))
      )
        return true;
      if ((type === "WORD" || type === "LOGLEVEL") && /^[A-Za-z]{3,}$/.test(clean)) {
        if (type === "LOGLEVEL") {
          return /INFO|WARN|ERROR|DEBUG|TRACE|FATAL/i.test(clean);
        }
        return /^[A-Z]{3,}$/.test(clean);
      }
      if (type === "INT" && /^\d+$/.test(clean)) return true;
      if (type === "URIPATHPARAM" && clean.startsWith("/")) return true;
      return false;
    });
  }

  if (fields.length > 0) {
    let tokenIndex = 0;
    while (tokenIndex < tokens.length) {
      const remainingFields = enriched.filter((_, idx) => !used.has(idx));
      const greedy = remainingFields.find((f) => f.grokType === "GREEDYDATA");
      if (greedy && remainingFields.length === 1) {
        pushFieldCapture(greedy);
        used.add(enriched.indexOf(greedy));
        break;
      }

      const token = tokens[tokenIndex];
      const clean = token.replace(/^["'\[]|["'\]]$/g, "");
      const field =
        matchFieldForToken(token, clean) ||
        (tokenIndex < enriched.length && !used.has(tokenIndex)
          ? enriched[tokenIndex]
          : undefined);

      if (field) {
        used.add(enriched.indexOf(field));
        if (field.grokType === "GREEDYDATA") {
          pushFieldCapture(field);
          break;
        }
        pushFieldCapture(field, token);
      } else {
        parts.push(escapeLiteral(token));
      }
      tokenIndex += 1;
    }

    enriched.forEach((field, idx) => {
      if (!used.has(idx)) {
        pushFieldCapture(field);
      }
    });
  } else {
    for (let i = 0; i < tokens.length; i++) {
      const field = enriched[i];
      if (field.grokType === "GREEDYDATA") {
        pushFieldCapture(field);
        break;
      }
      pushFieldCapture(field, tokens[i]);
    }
  }

  return {
    pattern: parts.join(" "),
    message:
      "Heuristic pattern drafted from your fields and first sample line. Test it, then refine literals and field types.",
    fields: enriched,
  };
}

function improvePattern(req: AiAssistRequest): AiAssistResponse {
  const pattern = req.pattern?.trim() || "";
  const fields = req.fields || [];
  const analysisFields = extractFieldsFromPattern(pattern);
  const mappingUpdates = [];

  for (const field of fields) {
    const found = analysisFields.find(
      (f) => f.name.toLowerCase() === field.name.toLowerCase(),
    );
    if (!found) {
      mappingUpdates.push({
        field: field.name,
        suggestion: `%{${field.grokType || "DATA"}:${field.name}}`,
        reason: "Desired field is missing from the pattern",
      });
    } else if (field.grokType && found.grokType !== field.grokType) {
      mappingUpdates.push({
        field: field.name,
        suggestion: `%{${field.grokType}:${field.name}}`,
        reason: `Pattern uses ${found.grokType}; your field list expects ${field.grokType}`,
      });
    }
  }

  let nextPattern = pattern;
  if (!nextPattern && fields.length) {
    nextPattern = fieldsToPatternSkeleton(fields);
  }
  if (req.sampleLogs?.trim() && (!pattern || mappingUpdates.length > 2)) {
    const generated = generatePatternFromFieldsAndLogs(fields, req.sampleLogs);
    nextPattern = generated.pattern;
  }

  return {
    provider: "heuristic",
    message:
      mappingUpdates.length > 0
        ? "Found mapping gaps and proposed updates. Apply suggestions, then re-test against sample logs."
        : "Pattern looks aligned with your fields. Use Test Sample Logs to verify edge cases.",
    pattern: nextPattern,
    fields,
    mappingUpdates,
  };
}

function explainPattern(req: AiAssistRequest): AiAssistResponse {
  const pattern = req.pattern?.trim() || "";
  if (!pattern) {
    return {
      provider: "heuristic",
      message: "Paste a Grok pattern to get an explanation of each capture.",
    };
  }
  const fields = extractFieldsFromPattern(pattern);
  const lines = fields.map(
    (f, i) =>
      `${i + 1}. \`${f.rawToken}\` → field **${f.name}** using type **${f.grokType}**${f.cast ? ` (cast ${f.cast})` : ""}`,
  );
  return {
    provider: "heuristic",
    message:
      lines.length > 0
        ? `This pattern extracts ${fields.length} field(s):\n\n${lines.join("\n")}`
        : "This pattern has no named captures. Add `:field_name` to store values.",
    pattern,
    fields: fields.map((f) => ({
      id: f.name,
      name: f.name,
      grokType: f.grokType,
      description: f.notes,
    })),
  };
}

export async function runHeuristicAssist(
  req: AiAssistRequest,
): Promise<AiAssistResponse> {
  switch (req.mode) {
    case "generate": {
      const generated = generatePatternFromFieldsAndLogs(
        req.fields || [],
        req.sampleLogs || "",
      );
      return {
        provider: "heuristic",
        message: generated.message,
        pattern: generated.pattern,
        fields: generated.fields,
      };
    }
    case "improve":
    case "map":
      return improvePattern(req);
    case "explain":
      return explainPattern(req);
    default:
      return {
        provider: "heuristic",
        message: "Unknown assist mode.",
      };
  }
}

function buildPrompt(req: AiAssistRequest): string {
  return [
    "You are a Grok (Logstash-style) parser assistant.",
    "Return concise, practical help for writing or updating a Grok pattern.",
    "Prefer named captures. Escape regex literals carefully.",
    "",
    `Mode: ${req.mode}`,
    req.context ? `Extra context:\n${req.context}` : "",
    req.pattern ? `Current pattern:\n${req.pattern}` : "",
    req.fields?.length
      ? `Desired fields (JSON):\n${JSON.stringify(req.fields, null, 2)}`
      : "",
    req.sampleLogs ? `Sample logs:\n${req.sampleLogs.slice(0, 4000)}` : "",
    "",
    "Respond with JSON only:",
    '{"message":"string","pattern":"optional grok pattern","fields":[{"id":"","name":"","grokType":"","description":""}],"mappingUpdates":[{"field":"","suggestion":"","reason":""}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runAiAssist(
  req: AiAssistRequest,
): Promise<AiAssistResponse> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  const baseUrl =
    process.env.OPENAI_BASE_URL ||
    process.env.AI_BASE_URL ||
    "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return runHeuristicAssist(req);
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You help users write Grok log parsers. Always answer with valid JSON.",
          },
          { role: "user", content: buildPrompt(req) },
        ],
      }),
    });

    if (!response.ok) {
      const heuristic = await runHeuristicAssist(req);
      return {
        ...heuristic,
        message: `AI provider error (${response.status}). Fell back to local heuristic assist.\n\n${heuristic.message}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as Partial<AiAssistResponse>;
    return {
      provider: "openai",
      message: parsed.message || "AI suggestion ready.",
      pattern: parsed.pattern,
      fields: parsed.fields,
      mappingUpdates: parsed.mappingUpdates,
    };
  } catch {
    const heuristic = await runHeuristicAssist(req);
    return {
      ...heuristic,
      message: `AI request failed. Using local heuristic assist.\n\n${heuristic.message}`,
    };
  }
}
