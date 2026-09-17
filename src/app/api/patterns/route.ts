import { NextResponse } from "next/server";
import { COMMON_GROK_TYPES } from "@/lib/grok/constants";

export async function GET() {
  return NextResponse.json({
    types: COMMON_GROK_TYPES,
    examples: [
      {
        name: "Nginx access",
        pattern:
          '%{IPORHOST:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:url} HTTP/%{NUMBER:http_version}" %{INT:status} %{INT:bytes}',
        sample:
          '203.0.113.10 - - [16/Sep/2026:11:00:01 +0000] "GET /api/health HTTP/1.1" 200 512',
      },
      {
        name: "App JSON-ish line",
        pattern:
          "%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} \\[%{DATA:service}\\] %{GREEDYDATA:message}",
        sample:
          "2026-09-16T11:00:01.120Z INFO [billing] invoice created for customer_42",
      },
    ],
  });
}
