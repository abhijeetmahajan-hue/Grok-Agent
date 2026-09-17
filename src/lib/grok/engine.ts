import { loadDefaultSync, type GrokCollection } from "grok-js";
import type {
  AnalyzedField,
  AnalyzeResponse,
  ParseField,
  ParseLineResult,
  ParseResponse,
} from "./types";

export { COMMON_GROK_TYPES, fieldsToPatternSkeleton } from "./constants";

let collection: GrokCollection | null = null;

export function getGrokCollection(): GrokCollection {
  if (!collection) {
    collection = loadDefaultSync();
  }
  return collection;
}

const FIELD_TOKEN_RE =
  /%\{([A-Za-z0-9_]+)(?::([A-Za-z0-9_./-]+))?(?::([A-Za-z0-9_]+))?\}/g;

export function extractFieldsFromPattern(pattern: string): AnalyzedField[] {
  const fields: AnalyzedField[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const re = new RegExp(FIELD_TOKEN_RE.source, "g");
  while ((match = re.exec(pattern)) !== null) {
    const grokType = match[1];
    const name = match[2] || grokType.toLowerCase();
    const cast = match[3];
    if (seen.has(name)) continue;
    seen.add(name);
    fields.push({
      name,
      grokType,
      cast,
      rawToken: match[0],
      suggestedMapping: name,
      notes: cast ? `Cast as ${cast}` : undefined,
    });
  }
  return fields;
}

export function extractLiterals(pattern: string): string[] {
  const withoutFields = pattern.replace(FIELD_TOKEN_RE, "§");
  return withoutFields
    .split("§")
    .map((part) => part.replace(/\\(.)/g, "$1").trim())
    .filter((part) => part.length > 0);
}

export function parseLogs(
  pattern: string,
  logs: string,
  expectedFields: ParseField[] = [],
): ParseResponse {
  const lines = logs
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  const expectedNames = expectedFields.map((f) => f.name).filter(Boolean);
  const extractedFieldNames = extractFieldsFromPattern(pattern).map(
    (f) => f.name,
  );

  let grokPattern;
  try {
    grokPattern = getGrokCollection().createPattern(pattern);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Grok pattern";
    return {
      pattern,
      total: lines.length,
      matched: 0,
      failed: lines.length,
      extractedFieldNames,
      results: lines.map((raw, index) => ({
        line: index + 1,
        raw,
        matched: false,
        fields: null,
        error: message,
      })),
    };
  }

  const results: ParseLineResult[] = lines.map((raw, index) => {
    try {
      const parsed = grokPattern.parseSync(raw);
      if (!parsed) {
        return {
          line: index + 1,
          raw,
          matched: false,
          fields: null,
          error: "No match",
        };
      }

      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined || value === null) continue;
        fields[key] = String(value);
      }

      const present = Object.keys(fields);
      const missingFields = expectedNames.filter((name) => !(name in fields));
      const extraFields = present.filter(
        (name) => expectedNames.length > 0 && !expectedNames.includes(name),
      );

      return {
        line: index + 1,
        raw,
        matched: true,
        fields,
        missingFields,
        extraFields,
      };
    } catch (error) {
      return {
        line: index + 1,
        raw,
        matched: false,
        fields: null,
        error: error instanceof Error ? error.message : "Parse failed",
      };
    }
  });

  const matched = results.filter((r) => r.matched).length;
  return {
    pattern,
    total: results.length,
    matched,
    failed: results.length - matched,
    results,
    extractedFieldNames,
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const RENAME_HINTS: Array<[RegExp, string, string]> = [
  [/^(src|source)?ip(addr)?$/, "client_ip", "Common source IP naming"],
  [/^(dst|dest|destination)ip(addr)?$/, "dest_ip", "Common destination IP naming"],
  [/^(ts|time|datetime|date)$/, "timestamp", "Prefer timestamp"],
  [/^(http)?method$/, "method", "HTTP method"],
  [/^(status|statuscode|httpstatus|code)$/, "status", "HTTP status code"],
  [/^(uri|url|path|requesturi)$/, "url", "Request path / URL"],
  [/^(ua|useragent)$/, "user_agent", "User agent"],
  [/^(msg|message|logmessage)$/, "message", "Message body"],
];

export function analyzePattern(
  pattern: string,
  desiredFields: ParseField[] = [],
): AnalyzeResponse {
  const fields = extractFieldsFromPattern(pattern);
  const literals = extractLiterals(pattern);
  const suggestions: string[] = [];

  if (fields.length === 0) {
    suggestions.push(
      "No named captures found. Add fields like %{IP:client_ip} or %{WORD:method}.",
    );
  }

  if (pattern.includes("%{GREEDYDATA}") && !pattern.includes("%{GREEDYDATA:")) {
    suggestions.push(
      "Unnamed GREEDYDATA drops useful text. Prefer %{GREEDYDATA:message}.",
    );
  }

  if (pattern.includes("%{DATA}") && !/%\{DATA:[A-Za-z0-9_]+\}/.test(pattern)) {
    suggestions.push(
      "Prefer named DATA captures so values appear in the parse result.",
    );
  }

  const patternNames = fields.map((f) => f.name);
  const desiredNames = desiredFields.map((f) => f.name).filter(Boolean);
  const desiredNorm = new Map(
    desiredNames.map((name) => [normalizeName(name), name]),
  );
  const patternNorm = new Map(
    patternNames.map((name) => [normalizeName(name), name]),
  );

  const missingInPattern = desiredNames.filter(
    (name) => !patternNorm.has(normalizeName(name)),
  );
  const extraInPattern = patternNames.filter(
    (name) =>
      desiredNames.length > 0 && !desiredNorm.has(normalizeName(name)),
  );

  const renameHints: Array<{ from: string; to: string; reason: string }> = [];

  for (const field of fields) {
    for (const [re, target, reason] of RENAME_HINTS) {
      if (re.test(normalizeName(field.name)) && field.name !== target) {
        if (!patternNames.includes(target)) {
          renameHints.push({ from: field.name, to: target, reason });
          field.suggestedMapping = target;
        }
      }
    }

    const desiredMatch = desiredNorm.get(normalizeName(field.name));
    if (desiredMatch && desiredMatch !== field.name) {
      renameHints.push({
        from: field.name,
        to: desiredMatch,
        reason: "Matches a field from your field list (different casing/name)",
      });
      field.suggestedMapping = desiredMatch;
    }
  }

  if (missingInPattern.length) {
    suggestions.push(
      `Pattern is missing desired fields: ${missingInPattern.join(", ")}.`,
    );
  }
  if (extraInPattern.length && desiredNames.length) {
    suggestions.push(
      `Pattern has extra fields not in your list: ${extraInPattern.join(", ")}.`,
    );
  }
  if (renameHints.length) {
    suggestions.push(
      "Review rename hints to align mappings with your schema.",
    );
  }

  return {
    pattern,
    fields,
    literals,
    suggestions,
    mappingDiff: {
      missingInPattern,
      extraInPattern,
      renameHints,
    },
  };
}
