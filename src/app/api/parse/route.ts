export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { parseLogs } from "@/lib/grok/engine";

const bodySchema = z.object({
  pattern: z.string().min(1, "Pattern is required"),
  logs: z.string().min(1, "Sample logs are required"),
  fields: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        grokType: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const body = bodySchema.parse(json);
    const result = parseLogs(body.pattern, body.logs, body.fields || []);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Parse failed" },
      { status: 500 },
    );
  }
}
