**Languages:** English | [日本語](README.ja.md)

# Touhou Character Chat UI (Variant UI)

This repository contains a **fan-made prototype chat UI** inspired by  
characters from **Touhou Project**.

It allows users to converse with different Touhou characters while
preserving conversation history per character, and is designed to work
smoothly on **desktop, tablet, and mobile devices**.

---

## Demo

A live demo is available on Vercel:

https://touhou-chat.vercel.app/

---

## Position in Project Sigmaris

`touhou-talk-ui` is a **variant UI** for Project Sigmaris:

- It uses `sigmaris-core` as the engine (`/persona/chat` + `/persona/chat/stream`)
- It intentionally explores a different UX (character chat + assistant-ui components)
- It exists to validate the engine’s generality (same core, different UI)

If you want the “reference UI” for the engine, see `sigmaris-os/`.

---

## Features

- Conversation history preserved per character
- Seamless character switching without losing context
- Mobile / tablet responsive UI
- Built with Next.js App Router
- Clear separation between UI and state management
- Optional local TTS (AquesTalk) + voice input (Web Speech API) for hands-free chatting (dev/local)

---

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Supabase Auth (Google OAuth)

---

## Auth / Login

This UI uses **Supabase Auth (OAuth login)** (same style as `sigmaris-os`).

Prerequisites:

- Enable providers in Supabase Auth (Google / GitHub / Discord)
- Add redirect URL(s) for local dev, e.g.:
  - `http://localhost:3000/auth/callback` (or your port)

Notes:

- OAuth callback is handled by a **Route Handler** at `GET /auth/callback` (server-side exchange).
- For production hardening, Phase04 features in the chat API can be toggled via env:
  - `TOUHOU_UPLOAD_ENABLED`
  - `TOUHOU_LINK_ANALYSIS_ENABLED`
  - `TOUHOU_AUTO_BROWSE_ENABLED`

## Local TTS / Voice Input (optional)

This UI can optionally:

- Read AI replies aloud via **AquesTalk** (local-only)
- Dictate messages via the browser **Web Speech API** (Chrome/Edge)

Notes:

- `POST /api/tts` is **enabled in development** only. For production, it returns 404 unless `TOUHOU_TTS_ENABLE=1`.
- AquesTalk SDK files should **not** be committed. Build the helper exe under `tools/aquestalk_tts_cmd/`.
- Voice input uses the **Web Speech API** and auto-sends after ~1.2s of silence (hands-free). Browser support varies (Chrome/Edge recommended).

---

## About This Fan Work (二次創作)

This project is a **fan-made derivative work (二次創作)** based on  
**Touhou Project**.

It is **not affiliated with, endorsed by, or related to** the original
creator or rights holder.

All Touhou-related characters, names, and settings are the property of:

**Team Shanghai Alice (上海アリス幻樂団)**

---

## Project Purpose

This project was created as a **technical prototype** to explore:

- UI architecture
- State management for character-based conversations
- Frontend design patterns for chat-style applications

It is **not intended for commercial use**, nor to cause confusion with
the original Touhou Project works.

---

## License

### Source Code License

Copyright (c) 2025 uthuyomi

This project is released under the **MIT License**.

All source code, UI design, application structure, and implementation
contained in this repository are original works created by the author
and are licensed under the MIT License.

---

### Copyright & Fan Work Notice

This project is a **non-commercial fan-made derivative work** based on
Touhou Project.

All characters, names, and settings related to Touhou Project are
copyright © Team Shanghai Alice.

This repository is **unofficial** and has no association with
Team Shanghai Alice.

---

## Production checklist (Vercel)

- Set Vercel env:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SIGMARIS_CORE_URL` (FastAPI backend)
- Supabase Auth:
  - Add your Vercel domain redirect URLs:
    - `https://<your-app>.vercel.app/auth/callback`
- Recommended:
  - Set `TOUHOU_ALLOWED_ORIGINS` and `TOUHOU_RATE_LIMIT_MS`
  - Keep Phase04 toggles OFF unless you add allowlists / limits in production

---

## Desktop build (Windows, optional)

This app can be wrapped as a Windows desktop app (Electron).

From `touhou-talk-ui/`:

```bash
npm run desktop:dist
```
