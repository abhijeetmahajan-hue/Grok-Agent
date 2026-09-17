"use client";

import { Loader2, Play, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ParseField, ParseResponse } from "@/lib/grok/types";

interface LogTesterProps {
  pattern: string;
  fields: ParseField[];
  logs: string;
  onLogsChange: (logs: string) => void;
}

export function LogTester({
  pattern,
  fields,
  logs,
  onLogsChange,
}: LogTesterProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);

  async function runParse() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, logs, fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Parse failed");
      setResult(data as ParseResponse);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    onLogsChange(await file.text());
  }

  return (
    <section className="studio-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl tracking-tight">2. Sample logs</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste or upload logs, then test your Grok pattern and inspect extracted fields.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".log,.txt,.json"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            Upload logs
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || !pattern.trim() || !logs.trim()}
            onClick={runParse}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Test parse
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sample-logs">Log lines</Label>
        <Textarea
          id="sample-logs"
          className="min-h-36 font-mono text-sm"
          placeholder={'203.0.113.10 - - [16/Sep/2026:11:00:01 +0000] "GET /api/health HTTP/1.1" 200 512'}
          value={logs}
          onChange={(e) => onLogsChange(e.target.value)}
        />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{result.matched}/{result.total} matched</Badge>
            <Badge variant={result.failed ? "destructive" : "outline"}>
              {result.failed} failed
            </Badge>
            {result.extractedFieldNames.map((name) => (
              <Badge key={name} variant="outline">
                {name}
              </Badge>
            ))}
          </div>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {result.results.map((row) => (
              <div
                key={row.line}
                className="rounded-lg border border-border/70 bg-background/60 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={row.matched ? "secondary" : "destructive"}>
                    line {row.line}
                  </Badge>
                  {!row.matched ? (
                    <span className="text-xs text-destructive">{row.error}</span>
                  ) : null}
                  {row.missingFields?.length ? (
                    <span className="text-xs text-amber-700">
                      missing: {row.missingFields.join(", ")}
                    </span>
                  ) : null}
                </div>
                <pre className="mb-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
                  {row.raw}
                </pre>
                {row.fields ? (
                  <pre className="overflow-x-auto rounded-md bg-foreground/[0.04] p-2 font-mono text-xs">
                    {JSON.stringify(row.fields, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
