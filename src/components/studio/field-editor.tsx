"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMON_GROK_TYPES } from "@/lib/grok/constants";
import type { ParseField } from "@/lib/grok/types";

interface FieldEditorProps {
  fields: ParseField[];
  onChange: (fields: ParseField[]) => void;
}

function newField(): ParseField {
  return {
    id: crypto.randomUUID(),
    name: "",
    grokType: "DATA",
    description: "",
    required: true,
  };
}

export function FieldEditor({ fields, onChange }: FieldEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function update(id: string, patch: Partial<ParseField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function remove(id: string) {
    onChange(fields.filter((f) => f.id !== id));
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { fields?: unknown }).fields)
          ? (parsed as { fields: unknown[] }).fields
          : null;
      if (!list) throw new Error("Expected a JSON array of fields");
      const next: ParseField[] = list.map((item, index) => {
        const row = item as Record<string, unknown>;
        return {
          id: String(row.id || crypto.randomUUID()),
          name: String(row.name || row.field || `field_${index + 1}`),
          grokType: String(row.grokType || row.type || "DATA"),
          description: row.description ? String(row.description) : "",
          required: row.required !== false,
        };
      });
      onChange(next);
    } catch {
      // CSV/TSV: name,grokType,description
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const next: ParseField[] = lines
        .filter((line, i) => !(i === 0 && /name/i.test(line)))
        .map((line) => {
          const [name, grokType, description] = line.split(/[,|\t]/);
          return {
            id: crypto.randomUUID(),
            name: (name || "").trim(),
            grokType: (grokType || "DATA").trim(),
            description: (description || "").trim(),
            required: true,
          };
        })
        .filter((f) => f.name);
      onChange(next);
    }
  }

  return (
    <section className="studio-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl tracking-tight">1. Fields to parse</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            List the values you want extracted. Upload JSON/CSV or add them by hand.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,.txt"
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
            Upload fields
          </Button>
          <Button type="button" size="sm" onClick={() => onChange([...fields, newField()])}>
            <Plus className="size-4" />
            Add field
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
            No fields yet. Add `client_ip`, `timestamp`, `status`, or upload a schema file.
          </p>
        ) : (
          fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-border/70 bg-background/50 p-3 md:grid-cols-[1fr_10rem_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`name-${field.id}`}>Field name</Label>
                <Input
                  id={`name-${field.id}`}
                  placeholder={`field_${index + 1}`}
                  value={field.name}
                  onChange={(e) => update(field.id, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Grok type</Label>
                <Select
                  value={field.grokType}
                  onValueChange={(value) =>
                    update(field.id, { grokType: value || "DATA" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_GROK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`desc-${field.id}`}>Description</Label>
                <Input
                  id={`desc-${field.id}`}
                  placeholder="Optional note for AI context"
                  value={field.description || ""}
                  onChange={(e) =>
                    update(field.id, { description: e.target.value })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove field"
                  onClick={() => remove(field.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
