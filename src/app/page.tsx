"use client";

import { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AiAssistPanel } from "@/components/studio/ai-assist-panel";
import { FieldEditor } from "@/components/studio/field-editor";
import { LogTester } from "@/components/studio/log-tester";
import { ParserAnalyzer } from "@/components/studio/parser-analyzer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ParseField } from "@/lib/grok/types";

const DEMO_FIELDS: ParseField[] = [
  {
    id: "1",
    name: "client_ip",
    grokType: "IP",
    description: "Client address",
  },
  {
    id: "2",
    name: "timestamp",
    grokType: "HTTPDATE",
    description: "Request time",
  },
  {
    id: "3",
    name: "method",
    grokType: "WORD",
    description: "HTTP method",
  },
  {
    id: "4",
    name: "url",
    grokType: "URIPATHPARAM",
    description: "Request path",
  },
  {
    id: "5",
    name: "status",
    grokType: "INT",
    description: "Status code",
  },
  {
    id: "6",
    name: "bytes",
    grokType: "INT",
    description: "Response size",
  },
];

const DEMO_PATTERN =
  '%{IPORHOST:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{URIPATHPARAM:url} HTTP/%{NUMBER:http_version}" %{INT:status} %{INT:bytes}';

const DEMO_LOGS = `203.0.113.10 - - [16/Sep/2026:11:00:01 +0000] "GET /api/health HTTP/1.1" 200 512
198.51.100.22 - alice [16/Sep/2026:11:00:02 +0000] "POST /v1/orders HTTP/1.1" 201 1048
192.0.2.8 - - [16/Sep/2026:11:00:03 +0000] "GET /missing HTTP/1.1" 404 87`;

export default function HomePage() {
  const [fields, setFields] = useState<ParseField[]>(DEMO_FIELDS);
  const [pattern, setPattern] = useState(DEMO_PATTERN);
  const [logs, setLogs] = useState(DEMO_LOGS);
  const [copied, setCopied] = useState(false);

  const fieldSummary = useMemo(
    () => fields.filter((f) => f.name.trim()).map((f) => f.name).join(", "),
    [fields],
  );

  async function copyPattern() {
    await navigator.clipboard.writeText(pattern);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 studio-backdrop" aria-hidden />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl animate-float-slow" aria-hidden />
      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 rounded-full bg-sky-300/25 blur-3xl animate-float-delayed" aria-hidden />

      <header className="relative border-b border-border/60 bg-background/55 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="font-heading text-2xl font-semibold tracking-tight text-teal-950 sm:text-3xl">
              Grok Parser Agent
            </p>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Write Grok parsers fast — define fields, test sample logs, analyze existing
              patterns, and add AI context when you need it.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setFields(DEMO_FIELDS);
              setPattern(DEMO_PATTERN);
              setLogs(DEMO_LOGS);
            }}
          >
            Load demo
          </Button>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="studio-panel space-y-3 animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl tracking-tight">Grok pattern</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your working pattern. {fieldSummary ? `Tracking: ${fieldSummary}.` : "Add fields below to guide mapping."}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copyPattern}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pattern">Pattern</Label>
            <Textarea
              id="pattern"
              className="min-h-28 font-mono text-sm"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              spellCheck={false}
            />
          </div>
        </section>

        <div className="animate-rise-delayed">
          <FieldEditor fields={fields} onChange={setFields} />
        </div>
        <LogTester
          pattern={pattern}
          fields={fields}
          logs={logs}
          onLogsChange={setLogs}
        />
        <ParserAnalyzer
          pattern={pattern}
          fields={fields}
          onPatternChange={setPattern}
          onApplyMapping={(updates) => {
            setFields((prev) =>
              prev.map((field) => {
                const hit = updates.find(
                  (u) => u.from.toLowerCase() === field.name.toLowerCase(),
                );
                return hit ? { ...field, name: hit.to } : field;
              }),
            );
          }}
          onAdoptFields={setFields}
        />
        <AiAssistPanel
          pattern={pattern}
          fields={fields}
          logs={logs}
          onPatternChange={setPattern}
          onFieldsChange={setFields}
        />
      </main>
    </div>
  );
}
