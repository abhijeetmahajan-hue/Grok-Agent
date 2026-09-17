export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { runAiAssist } from "@/lib/ai/assist";

const bodySchema = z.object({
  mode: z.enum(["generate", "improve", "explain", "map"]),
  sampleLogs: z.string().optional(),
  pattern: z.string().optional(),
  context: z.string().optional(),
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
    const result = await runAiAssist(body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid request" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI assist failed" },
      { status: 500 },
    );
  }
}
