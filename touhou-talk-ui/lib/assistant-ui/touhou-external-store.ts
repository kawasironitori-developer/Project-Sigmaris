"use client";

import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
  ThreadMessage,
  ThreadMessageLike,
  ThreadUserMessagePart,
} from "@assistant-ui/react";

export type TalkUiMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
  speakerId?: string;
  attachments?: CompleteAttachment[];
  meta?: Record<string, unknown> | null;
};

export function talkMessageToThreadMessageLike(
  m: TalkUiMessage,
): ThreadMessageLike {
  return {
    id: m.id,
    role: m.role === "ai" ? "assistant" : "user",
    content: m.content,
    ...(m.attachments ? { attachments: m.attachments } : undefined),
    ...(m.meta ? { metadata: { custom: m.meta } } : undefined),
  };
}

export function extractTextFromThreadMessageContent(
  content: ThreadMessage["content"],
): string {
  if (typeof content === "string") return content;
  const parts = content as readonly ThreadUserMessagePart[];
  return parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export class TouhouUploadAttachmentAdapter implements AttachmentAdapter {
  accept = "*/*";

  async add(state: { file: File }): Promise<PendingAttachment> {
    const file = state.file;
    const type: PendingAttachment["type"] =
      file.type?.startsWith("image/") ? "image" : file.type?.startsWith("text/") ? "document" : "file";

    return {
      id: crypto.randomUUID(),
      type,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async remove(_attachment: PendingAttachment | CompleteAttachment): Promise<void> {
    // noop (browser GC handles object URLs created by the UI)
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    return {
      ...attachment,
      status: { type: "complete" },
      content: [],
    };
  }
}

