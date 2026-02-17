export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import "server-only";

import { supabaseServer, requireUserId } from "@/lib/supabase-server";

function coreBaseUrl() {
  const raw =
    process.env.SIGMARIS_CORE_URL ||
    process.env.PERSONA_OS_LOCAL_URL ||
    process.env.PERSONA_OS_URL ||
    "http://127.0.0.1:8000";
  return String(raw).replace(/\/+$/, "");
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!attachmentId) {
    return NextResponse.json({ error: "Missing attachmentId" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  await requireUserId();

  let accessToken: string | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  } catch {
    accessToken = null;
  }

  const base = coreBaseUrl();
  const upstream = await fetch(
    `${base}/io/attachment/${encodeURIComponent(attachmentId)}`,
    {
      method: "GET",
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
    },
  );

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "Failed to load attachment", detail },
      { status: upstream.status },
    );
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const fileName = upstream.headers.get("x-sigmaris-file-name") ?? "attachment";
  const contentDisposition =
    upstream.headers.get("content-disposition") ??
    (download
      ? `attachment; filename="${fileName.replaceAll("\"", "")}"`
      : `inline; filename="${fileName.replaceAll("\"", "")}"`);

  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, no-store",
    },
  });
}

