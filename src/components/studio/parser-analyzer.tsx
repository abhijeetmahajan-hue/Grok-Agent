"use client";

import { Loader2, ScanSearch, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AnalyzeResponse, ParseField } from "@/lib/grok/types";

interface ParserAnalyzerProps {
  pattern: string;
  fields: ParseField[];
  onPatternChange: (pattern: string) => void;
  onApplyMapping: (updates: Array<{ from: string; to: string }>) => void;
  onAdoptFields: (fields: ParseField[]) => void;
}

export function ParserAnalyzer({
  pattern,
  fields,
  onPatternChange,
  onApplyMapping,
  onAdoptFields,
}: ParserAnalyzerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);

  async function analyze(nextPattern = pattern) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: nextPattern, fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analyze failed");
      setAnalysis(data as AnalyzeResponse);
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Analyze failed");
    } finally {
      setLoading(false);
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    let nextPattern = text.trim();
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      if (typeof json.pattern === "string") nextPattern = json.pattern;
      else if (typeof json.grok === "string") nextPattern = json.grok;
      else if (typeof json.filter === "string") nextPattern = json.filter;
    } catch {
      // plain pattern file
    }
    onPatternChange(nextPattern);
    await analyze(nextPattern);
  }

  function applyRenames() {
    if (!analysis?.mappingDiff?.renameHints.length) return;
    let next = pattern;
    const updates: Array<{ from: string; to: string }> = [];
    for (const hint of analysis.mappingDiff.renameHints) {
      const tokenRe = new RegExp(
        `(%\\{[A-Za-z0-9_]+):${hint.from}((?::[A-Za-z0-9_]+)?\\})`,
        "g",
      );
      next = next.replace(tokenRe, `$1:${hint.to}$2`);
      updates.push({ from: hint.from, to: hint.to });
    }
    onPatternChange(next);
    onApplyMapping(updates);
    void analyze(next);
  }

  function adoptDiscoveredFields() {
    if (!analysis?.fields.length) return;
    onAdoptFields(
      analysis.fields.map((field) => ({
        id: crypto.randomUUID(),
        name: field.suggestedMapping || field.name,
        grokType: field.grokType,
        description: field.notes || `From token ${field.rawToken}`,
        required: true,
      })),
    );
  }

  return (
    <section className="studio-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl tracking-tight">
            3. Analyze a predefined parser
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an existing Grok pattern to discover fields and improve mappings.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".grok,.txt,.json,.conf"
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
            Upload parser
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || !pattern.trim()}
            onClick={() => analyze()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ScanSearch className="size-4" />
            )}
            Analyze
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {analysis ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {analysis.fields.map((field) => (
              <Badge key={field.rawToken} variant="secondary">
                {field.name} · {field.grokType}
              </Badge>
            ))}
          </div>

          {analysis.suggestions.length ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {analysis.suggestions.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-teal-700">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {analysis.mappingDiff?.renameHints.length ? (
            <div className="space-y-2 rounded-lg border border-border/70 bg-background/50 p-3">
              <p className="text-sm font-medium">Mapping updates</p>
              <ul className="space-y-1 text-sm">
                {analysis.mappingDiff.renameHints.map((hint) => (
                  <li key={`${hint.from}-${hint.to}`}>
                    <code className="font-mono text-xs">{hint.from}</code>
                    {" → "}
                    <code className="font-mono text-xs">{hint.to}</code>
                    <span className="text-muted-foreground"> — {hint.reason}</span>
                  </li>
                ))}
              </ul>
              <Button type="button" size="sm" onClick={applyRenames}>
                Apply rename suggestions
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={adoptDiscoveredFields}>
              Load discovered fields
            </Button>
            {analysis.mappingDiff?.missingInPattern.length ? (
              <Badge variant="outline">
                missing: {analysis.mappingDiff.missingInPattern.join(", ")}
              </Badge>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border/80 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
          Upload a `.grok`, `.conf`, or JSON file with a `pattern` key to inspect mappings.
        </p>
      )}
    </section>
  );
}
