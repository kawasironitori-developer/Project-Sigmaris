UI / API Connection Specification (A-plan)
Sigmaris Core (FastAPI) ↔ UI Clients (sigmaris-os, touhou-talk-ui)

Version: Draft v1.1

1. Purpose of This Document

This document defines the UI/API connection contract for **A-plan**:

- **FastAPI (sigmaris_core)** is the single authoritative backend.
- **sigmaris-os** and **touhou-talk-ui** are UI clients.

This spec focuses on the minimum stable contract to implement and operate safely on the public internet.
It does not mandate UI architecture (direct-to-core vs BFF proxy), as long as the contract and security invariants are preserved.

This document defines the contract between:

- Sigmaris Core (FastAPI / Persona OS runtime)
- UI clients (sigmaris-os, touhou-talk-ui)

It specifies:

- Authentication model (public deployment)
- Endpoints and request/response schemas
- Streaming (SSE) event semantics
- Compatibility rules for meta blocks
- Attachment handling constraints (metadata only in chat)

2. System Role Separation

2.1 Sigmaris Core (FastAPI)

Responsibilities:

- Execute memory selection, identity continuity, drift engines, state machines, telemetry, and safety gating
- Perform external I/O operations (web/github/file/image) when enabled (Phase04+)
- Produce chat responses and a structured `meta` block (observability / routing / safety)
- Persist server-side state when configured (Supabase via service role key, or other backends)

Non-responsibilities:

- Render UI
- Trust UI-provided `user_id` as identity

2.2 UI Clients (sigmaris-os / touhou-talk-ui)

Responsibilities:

- Render chat UX
- Acquire an auth token (e.g., Supabase access token) for the logged-in user
- Send user text and optional request hints to Sigmaris Core
- Display core response content and optionally visualize `meta`

Non-responsibilities:

- Make governance decisions
- Mutate kernel state directly
- Auto-apply code diffs or side effects without explicit user approval

3. Deployment & Authentication (Public Internet)

If Sigmaris Core is deployed publicly (Fly.io etc.), **all write-capable endpoints must require authentication**.

3.1 Auth header

All authenticated requests MUST include:

- `Authorization: Bearer <ACCESS_TOKEN>`

Where `<ACCESS_TOKEN>` is a user-scoped JWT issued by the auth provider (e.g., Supabase).

3.2 Identity source of truth

The server MUST derive the effective `user_id` from the validated token (e.g., `auth.uid()`).

The server MUST treat any `user_id` in the request body as:

- Ignored (preferred), or
- A debug-only echo field (never authoritative)

This prevents client-side impersonation.

3.3 Optional BFF proxy

UI clients may call Sigmaris Core either:

- Directly from the browser (requires correct CORS and token forwarding), or
- Via a Next.js Route Handler (BFF) that forwards the `Authorization` header to core

In both cases, the BFF MUST NOT mint identities by accepting `user_id` from the client.

4. Core Chat API (Minimum Contract)

All communication occurs via HTTP JSON endpoints.

Primary endpoints:

- `POST /persona/chat`
- `POST /persona/chat/stream` (SSE)

4.1 Request schema (ChatRequest)

The request body MUST be JSON with at least `message`.
Additional fields are optional hints.

ChatRequest {
  message: string

  // optional continuity key chosen by UI (stable per chat thread)
  // if omitted, server may generate a new session_id
  session_id?: string

  // optional routing hint (server may ignore)
  channel?: "talk" | "vscode" | "analysis"

  // optional: character/persona injection (best-effort; safe to ignore)
  character_id?: string
  persona_system?: string

  // optional generation knobs (best-effort; server may clamp)
  gen?: {
    temperature?: number
    max_tokens?: number
    [k: string]: any
  }

  // optional external signals
  reward_signal?: number
  affect_signal?: { [k: string]: number }

  // optional: UI may provide last-known baseline for continuity
  trait_baseline?: { calm: number; empathy: number; curiosity: number }

  // optional: attachment references (metadata only in chat)
  attachments?: AttachmentMeta[]
}

AttachmentMeta {
  file_name: string
  mime_type: string
  size: number
  attachment_id?: string  // set when uploaded separately
}

4.2 Response schema (ChatResponse)

ChatResponse {
  reply: string

  // meta MUST be non-null in core responses (can be minimal)
  meta: object
}

4.3 Stable `meta` contract (minimum keys)

`meta` is observability data. The server MAY add fields over time, but SHOULD keep these stable:

- `meta.trace_id: string`
- `meta.meta_version: number`
- `meta.engine_version: string`
- `meta.build_sha: string`
- `meta.config_hash: string`
- `meta.dialogue_state: string`
- `meta.telemetry: { C: number; N: number; M: number; S: number; R: number }`
- `meta.safety: { flag: string|null; risk_score: number; total_risk: number; override: boolean; categories?: object; reasons?: any }`
- `meta.global_state: { state: string; prev_state?: string|null; reasons?: any; meta?: any }`
- `meta.meta_v1: object` (a compact stable summary block)

UI clients MUST treat unknown meta fields as optional and ignore them safely.

4.4 Streaming endpoint (SSE)

`POST /persona/chat/stream`

Response is `text/event-stream` and emits events:

- `event: start` → `data: { trace_id, session_id }`
- `event: delta` → `data: { text }`
- `event: done`  → `data: { reply, meta }`
- `event: error` → `data: { error, trace_id }`

The final `done` event MUST contain the same `meta` shape as non-streaming.

5. Channel Semantics (Routing Hint)

`channel` is a non-privileged hint. It MUST NOT grant extra permissions.

Recommended interpretation:

- `talk`: normal conversational response
- `vscode`: structured, code-friendly output (may include meta hints for diff/plan) but MUST NOT apply changes automatically
- `analysis`: structured output mode (server may return more machine-readable content)

If `channel` is omitted, default to `talk`.

6. Attachments & External Content

6.1 No raw file bytes inside chat messages

Chat endpoints MUST NOT require raw file upload in the same request.
They only accept `attachments` metadata and/or attachment references (`attachment_id`).

6.2 Separate upload endpoints (Phase04+)

If files/images are supported, define separate endpoints such as:

- `POST /io/upload` (multipart) → returns `{ attachment_id }`
- `POST /io/parse` (JSON with `attachment_id`) → returns structured parsed content

Parsed outputs MUST be bounded, structured, and confidence-aware (see Phase04 docs 07/08).

7. Operator / Override API (Existing)

For administrative interventions:

- `POST /persona/operator/override`

This endpoint MUST be protected by an operator key header:

- `x-sigmaris-operator-key: <OPERATOR_KEY>`

UI clients SHOULD NOT call this directly from browsers; route via a trusted server/BFF.

8. VSCode Work Mode (Optional / Future)

If you implement a VSCode work loop, prefer explicit dedicated endpoints (not overloaded chat meta):

- `POST /vscode/session/start`
- `POST /vscode/files`
- `POST /vscode/plan`
- `POST /vscode/diff`
- `POST /vscode/permission/approve|reject`
- `POST /vscode/commit`

All endpoints MUST require user auth, and additionally MUST require explicit approval for apply/commit transitions.

9. Errors

9.1 JSON error

ErrorResponse {
  error: { code: string; message: string }
}

Do not return stack traces to clients.

9.2 Streaming error

On streaming failures, emit `event: error` with a short message and trace id.

10. Security Invariants (Non-Negotiable)

- Client-provided `user_id` is never authoritative (token-derived only)
- Channel cannot escalate privilege
- No raw memory dump endpoints
- No direct kernel modification endpoints
- External I/O results must be normalized and gated (Perception/Governance) before influencing durable state
- UI must never auto-apply diffs or side effects without explicit user approval

11. Summary

This contract makes Sigmaris Core the single backend for both UIs while remaining safe for public deployment:

- Two core endpoints: `/persona/chat` and `/persona/chat/stream`
- Token-derived identity and strong auth invariants
- Stable `meta` for observability across both UIs
- Clear separation for uploads/parsing (Phase04+) and operator overrides

End of UI / API Connection Specification (A-plan) v1.1
