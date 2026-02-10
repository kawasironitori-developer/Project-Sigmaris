export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.NEXT_PUBLIC_SIGMARIS_CORE ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

function isAllowedOperator(userId: string): boolean {
  const raw = process.env.SIGMARIS_OPERATOR_USER_IDS ?? "";
  const allow = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allow.length) return false;
  return allow.includes(userId);
}

export async function POST(req: Request) {
  try {
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAllowedOperator(user.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const operatorKey = process.env.SIGMARIS_OPERATOR_KEY ?? "";
    if (!operatorKey) {
      return NextResponse.json(
        { error: "SIGMARIS_OPERATOR_KEY not configured" },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      user_id?: string;
      kind?: string;
      actor?: string;
      payload?: any;
    };

    const userId = typeof body?.user_id === "string" && body.user_id ? body.user_id : user.id;
    const kind = typeof body?.kind === "string" ? body.kind : "";
    if (!kind) {
      return NextResponse.json({ error: "Missing kind" }, { status: 400 });
    }

    const coreUrl = coreBaseUrl();
    const res = await fetch(`${coreUrl}/persona/operator/override`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sigmaris-operator-key": operatorKey,
      },
      body: JSON.stringify({
        user_id: userId,
        kind,
        actor: typeof body?.actor === "string" ? body.actor : user.email ?? user.id,
        payload: body?.payload ?? {},
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Core operator override failed", detail: json },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, result: json });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

