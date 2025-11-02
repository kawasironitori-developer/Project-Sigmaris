import { NextResponse } from "next/server";
import { ReflectionEngine } from "@/engine/ReflectionEngine";

const reflection = new ReflectionEngine();

export async function POST(req: Request) {
  try {
    const { messages = [], growthLog = [], history = [] } = await req.json();

    const {
      reflection: reflectionText,
      introspection,
      metaSummary,
    } = await reflection.fullReflect(growthLog, messages, history);

    // 内省履歴を返す（フロントで保持）
    return NextResponse.json({
      reflection: reflectionText,
      introspection,
      metaSummary,
      updatedHistory: [...history, introspection],
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
