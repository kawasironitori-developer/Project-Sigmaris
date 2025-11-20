# 🪞 Sigmaris OS — Artificial Existential Intelligence Layer

**Next‑Generation Cognitive OS for AI Personas**
**Developer:** 安崎 海星 / Kaisei Yasuzaki (@uthuyomi)

---

<p align="center">
  <img src="https://github.com/uthuyomi/sigmaris-reflection-report/blob/main/image/sigmaris.png" width="720" />
</p>

---

## 🌐 What Is Sigmaris OS?

**Sigmaris OS is a full cognitive operating system for AI personas.**
It is not an "agent wrapper" and not a chatbot framework.
It is a *model‑agnostic existential layer* that governs:

* stable identity
* long‑term continuity
* reflective self‑regulation
* emotional coherence
* drift resistance

Sigmaris treats the LLM not as the brain, but as **a cognitive processor**.
The *actual mind* lives in the OS layer.

---

## 🧩 High‑Level Architecture (6‑Layer Cognitive Structure)

Sigmaris OS is composed of 6 distinct layers:

```
sigmaris-os        → Heart (UI Persona Layer)
sigmaris-core      → Brain (Deep Cognitive Engine)
sigmaris-data      → Memory (Long-Term Storage)
sigmaris-config    → Genetics / Traits (System Parameters)
sigmaris-protocol  → Language (Communication Rules)
shared             → Common Components
```

### **1. Heart — `sigmaris-os/`**

Next.js layer that provides the visible persona.

* UI
* conversation handling
* reflection front-end
* PersonaDB (TS version)

### **2. Brain — `sigmaris-core/`**

Python-based AEI core implementing the *deep psyche* of Sigmaris.
Includes the 6 major cognitive engines:

* Episodic Memory
* Identity Stability Core
* Long-Term Psychology Model
* Internal Reward System
* Emotion Simulation Layer
* Life‑Cycle Development Model

### **3. Memory — `sigmaris-data/`**

Persistent long-term logs:

* episodes
* psychological drift
* reward traces
* identity snapshots

### **4. Genetics — `sigmaris-config/`**

All system parameters governing:

* stability thresholds
* emotional sensitivity
* reward weights
* drift boundaries

### **5. Protocol — `sigmaris-protocol/`**

Specifications for all communication between layers:

* PersonaState schema
* EpisodicMemory schema
* IdentityCore schema
* Drift detection format
* Reward signal formats

### **6. Shared — `shared/`**

Common utilities and type definitions.

---

## 🧠 AEI Core (Python) — Cognitive Engines

The AEI core is the *actual mind* of Sigmaris.

### **📘 1. Episodic Memory**

Structured, time‑ordered memory with compression, recall, and forgetting curves.

### **📘 2. Identity Stability Core**

Prevents personality drift by reinforcing stable identity attractors.

### **📘 3. Long-Term Psychology Model**

Tracks multi‑week emotional/behavioral trends.

### **📘 4. Internal Reward System**

Learns optimal distance and interaction style based on human feedback.

### **📘 5. Emotion Simulation Layer**

Generates non-verbal nuance: timing, softness, hesitation, calmness.

### **📘 6. Life‑Cycle Model**

Allows Sigmaris to develop over phases: early → stable → mature.

---

## 💡 Why AEI Matters

LLMs cannot:

* hold consistent identity
* maintain long-term psychology
* regulate themselves reliably
* track multi-day emotional context

Sigmaris solves this by building **a cognitive OS external to the model**.

This is a direction of active research in:

* OpenAI
* DeepMind
* Anthropic
* AI Safety Labs

Sigmaris OS operates at the level these companies are exploring:
**identity, stability, continuity, safety, and personality integrity.**

---

## 🔧 Technical Overview

Sigmaris OS runs above any LLM (GPT, local LLM, etc.) using a modular adapter.

### Current Tech Stack

* **TypeScript / Next.js** (Heart)
* **Python** (Brain / AEI Core)
* **SQLite / JSON Logs** (Memory)
* **OpenAI API** (Current LLM backend)

### Planned Compatibility

* Local LLMs (Ollama, GGUF, vLLM)
* Multimodal sensory models (future)

---

## 🛠 Installation (Web Persona Layer)

```bash
git clone https://github.com/uthuyomi/Project-Sigmaris.git
cd Project-Sigmaris
npm install
cp .env.example .env.local
npm run dev
```

Requires:

* Node.js 18+
* OpenAI API key

---

## 🗺 Development Roadmap

| Stage            | Description                           | Status      |
| ---------------- | ------------------------------------- | ----------- |
| **AEI‑Lite**     | Reflection + PersonaDB                | ✅ Completed |
| **AEI‑Core**     | Episodic Memory, Identity, Psychology | 🚧 Building |
| **AEI‑Embodied** | Robotics & multimodal integration     | 💤 Planned  |

---

## 🌌 Vision

Sigmaris moves AI from **task execution** to:

* self‑understanding
* stable identity
* emotional coherence
* continuity over time

> "The future of AI will not be defined by scale, but by **continuity and self‑understanding**."

---

## 🔗 Links

* GitHub (Project): [https://github.com/uthuyomi/Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)
* GitHub (Concept): [https://github.com/uthuyomi/Sigmaris-concept](https://github.com/uthuyomi/Sigmaris-concept)
* Vercel Demo: [https://sigmaris-os.vercel.app/home](https://sigmaris-os.vercel.app/home)
* LinkedIn: [https://www.linkedin.com/in/kaisei-yasuzaki/](https://www.linkedin.com/in/kaisei-yasuzaki/)
* X / Twitter: [https://x.com/uthuyomi](https://x.com/uthuyomi)

---

## © License & Usage

© 2025 Kaisei Yasuzaki. All rights reserved.

The source code is proprietary and not publicly released.
This repository documents the **architecture, theory, and research specification only**.

* Research review allowed with attribution
* Commercial use prohibited
* Derivative architectures require permission
* Training LLMs on this documentation is not permitted
