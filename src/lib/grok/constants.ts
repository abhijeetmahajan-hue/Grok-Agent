export const COMMON_GROK_TYPES = [
  "WORD",
  "DATA",
  "GREEDYDATA",
  "NUMBER",
  "INT",
  "BASE10NUM",
  "IP",
  "IPV4",
  "IPV6",
  "HOSTNAME",
  "IPORHOST",
  "TIMESTAMP_ISO8601",
  "HTTPDATE",
  "SYSLOGTIMESTAMP",
  "LOGLEVEL",
  "UUID",
  "URIPATH",
  "URIPATHPARAM",
  "URI",
  "QS",
  "USERNAME",
  "EMAILADDRESS",
  "MAC",
] as const;

export function fieldsToPatternSkeleton(
  fields: Array<{ name: string; grokType?: string }>,
): string {
  if (!fields.length) return "";
  return fields
    .map((field) => `%{${field.grokType || "DATA"}:${field.name}}`)
    .join(" ");
}
