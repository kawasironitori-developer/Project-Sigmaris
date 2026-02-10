# Touhou Character Chat UI (Prototype)

This repository contains a **fan-made prototype chat UI** inspired by  
characters from **Touhou Project**.

It allows users to converse with different Touhou characters while
preserving conversation history per character, and is designed to work
smoothly on **desktop, tablet, and mobile devices**.

---

## Demo

A live demo is available on Vercel:

https://touhou-talk.vercel.app/

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

This UI uses **Supabase Auth (Google login)** (same style as `sigmaris-os`).

Prerequisites:

- Enable Google provider in Supabase Auth
- Add redirect URL(s) for local dev, e.g.:
  - `http://localhost:3000/auth/callback` (or your port)

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
