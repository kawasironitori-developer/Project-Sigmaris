import { NextResponse } from "next/server";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

const reflection = new ReflectionEngine();

export async function POST(req: Request) {
  try {
    const { messages = [], growthLog = [] } = await req.json();

    const summary = reflection.reflect(growthLog, messages);

    return NextResponse.json({
      reflection: summary,
      success: true,
    });
  } catch (err: any) {
    console.error("[ReflectAPI Error]", err);
    return NextResponse.json({
      reflection: "……うまく振り返れなかったみたい。",
      error: err.message || String(err),
    });
  }
}
