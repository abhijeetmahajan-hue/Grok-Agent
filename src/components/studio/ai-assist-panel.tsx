"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiAssistResponse, ParseField } from "@/lib/grok/types";

interface AiAssistPanelProps {
  pattern: string;
  fields: ParseField[];
  logs: string;
  onPatternChange: (pattern: string) => void;
  onFieldsChange: (fields: ParseField[]) => void;
}

export function AiAssistPanel({
  pattern,
  fields,
  logs,
  onPatternChange,
  onFieldsChange,
}: AiAssistPanelProps) {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAssistResponse | null>(null);

  async function run(mode: "generate" | "improve" | "explain" | "map") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          pattern,
          fields,
          sampleLogs: logs,
          context,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI assist failed");
      const assist = data as AiAssistResponse;
      setResult(assist);
      if (assist.pattern) onPatternChange(assist.pattern);
      if (assist.fields?.length) onFieldsChange(assist.fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assist failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="studio-panel space-y-4">
      <div>
        <h2 className="font-heading text-xl tracking-tight">4. AI assist</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add extra context (log source, vendor, field naming rules). Works offline with
          heuristics, or with{" "}
          <code className="font-mono text-xs">OPENAI_API_KEY</code> for richer suggestions.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai-context">Advanced context</Label>
        <Textarea
          id="ai-context"
          className="min-h-24"
          placeholder="Example: These are AWS ALB logs. Prefer snake_case. status must be INT. Keep timestamp as TIMESTAMP_ISO8601."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={loading} onClick={() => run("generate")}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Generate pattern
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => run("improve")}
        >
          Improve mapping
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => run("explain")}
        >
          Explain pattern
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => run("map")}
        >
          Suggest field map
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-3 rounded-lg border border-border/70 bg-background/50 p-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{result.provider}</Badge>
            <span className="text-xs text-muted-foreground">suggestion ready</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.message}</p>
          {result.mappingUpdates?.length ? (
            <ul className="space-y-1 text-sm">
              {result.mappingUpdates.map((update) => (
                <li key={`${update.field}-${update.suggestion}`}>
                  <strong>{update.field}</strong>:{" "}
                  <code className="font-mono text-xs">{update.suggestion}</code>
                  <span className="text-muted-foreground"> — {update.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
