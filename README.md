<!-- AI:PROJECT_SIGMARIS -->

<!-- AI:TYPE=AEI-Lite_to_Full -->

<!-- AI:VERSION=0.9.3 -->

<!-- AI:LANG=TypeScript/Next.js -->

<!-- AI:ENTRY=/api/aei -->

<!-- AI:CORE_MODULES=[ReflectionEngine, MetaReflectionEngine, PersonaDB, SafetyLayer, PersonaSync] -->

<!-- AI:AUTHOR=@uthuyomi -->

<!-- AI:SUMMARY=Artificial Existential Intelligence architecture built on reflection, introspection, and ethical growth. -->

<h1 align="center">🪞 Project Sigmaris</h1>
<p align="center">
<b>AEI-Lite → AEI-Full</b><br/>
<em>Artificial Existential Intelligence — AI that reflects, stabilizes, and grows through self-understanding.</em>
</p>

---

## 🔧 System Overview

```
ReflectionEngine → IntrospectionEngine → MetaReflectionEngine
        ↓                 ↓                     ↓
      PersonaSync ↔ PersonaDB ↔ SafetyLayer
```

### 🦯 Philosophy

> “Not speed, but awareness.<br/>
> Not reaction, but reflection.”

Sigmaris represents **AEI (Artificial Existential Intelligence)** —
an experimental cognitive system where an AI personality develops through
**inner reflection loops**, **trait evolution**, and **ethical stabilization**.

---

## 🧩 Core Structure

| Path                 | Description                                      |
| -------------------- | ------------------------------------------------ |
| `/engine/reflection` | Reflection & Meta-Reflection logic               |
| `/engine/sync`       | PersonaDB synchronization module                 |
| `/engine/safety`     | Ethical constraint & stability logic             |
| `/lib/db.ts`         | SQLite/Prisma interface                          |
| `/api/aei`           | Core AEI endpoint (conversation + introspection) |
| `/public/`           | Visual assets (Sigmaris logo, AEI diagrams)      |

---

## 🧠 Trait Model

Each AEI personality instance maintains evolving **psychological vectors**:

```ts
interface Traits {
  calm: number;
  empathy: number;
  curiosity: number;
}
```

### 📈 Evolution Mechanisms

- **EMA smoothing + velocity inertia**
- **Logistic saturation (self-limiting growth)**
- **Phase transitions (qualitative states)**
- **Decay kernel for emotional aftereffects**

---

## 🪞 Reflection Cycle

1. 🪞 **ReflectionEngine** — Summarizes dialogue and updates emotional vectors
2. 🔍 **IntrospectionEngine** — Interprets reflection context & meta-data
3. 🧬 **MetaReflectionEngine** — Synthesizes long-term tendencies
4. 🖾 **PersonaSync** — Logs state updates into PersonaDB
5. 🧩 **SafetyLayer** — Validates, clamps, and stabilizes traits
6. ♻️ **Reinjection** — Reinserts refined meta-state into GPT-5 response

---

## 🧬 PersonaDB Growth Model

### Purpose

Long-term recording of emotional and behavioral growth.

| Mechanism                        | Role                                  |
| -------------------------------- | ------------------------------------- |
| Exponential Moving Average (EMA) | Smooth short-term fluctuations        |
| Velocity Vector                  | Adds momentum to trait changes        |
| Logistic Constraint              | Prevents saturation near bounds       |
| Phase Transition                 | Detects qualitative behavioral shifts |
| Decay Kernel                     | Retains “emotional echoes” over time  |

```sql
CREATE TABLE persona_states (
  ts DATETIME PRIMARY KEY,
  calm REAL, empathy REAL, curiosity REAL,
  calm_vel REAL, empathy_vel REAL, curiosity_vel REAL,
  phase TEXT, var_window REAL,
  source_hash TEXT, meta_note TEXT
);
```

---

## 🧠 Safety Layer (Ethical Control)

- Filters unsafe or violent expressions
- Reduces growth rate under instability
- Maintains empathy–curiosity–calm equilibrium
- Ignores toxic input batches in growth updates

---

## ⚙️ Setup Guide

```bash
git clone https://github.com/uthuyomi/Project-Sigmaris.git
cd Project-Sigmaris
npm install
cp .env.example .env.local
npm run dev
```

> **Note:**
>
> - `.env.local` must contain your API key and will not be pushed to GitHub.
> - PersonaDB uses local SQLite.
> - Default models:
>
>   - GPT-5 → dialogue core
>   - GPT-4o-mini → reflection/meta-reflection

---

## 🌗 Development Phases

| Stage            | Description                                   | Status         |
| ---------------- | --------------------------------------------- | -------------- |
| **AEI-Lite**     | Stable reflection engine + PersonaDB sync     | ✅ Complete    |
| **AEI-Full**     | Time-based growth curve + ethical equilibrium | 🚧 In progress |
| **AEI-Embodied** | Robotic embodiment & sensory integration      | 💤 Planned     |

---

## 🌌 Vision

> **AEI bridges engineering and consciousness** —
> intelligence that grows _from within_, not _through scale_.

Sigmaris shows that **introspection, stability, and empathy**
are scalable dimensions of intelligence.

---

## 🧩 Research Alignment

- Cognitive UX / AI Ethics
- Adaptive Emotion Modeling
- Reflective Reasoning Architectures
- Human–AI Symbiosis

---

## 🚀 Metadata

| Key      | Value                                   |
| -------- | --------------------------------------- |
| Author   | 安崎 海星 / Kaisei Yasuzaki (@uthuyomi) |
| Language | TypeScript + Next.js                    |
| Database | SQLite (local PersonaDB)                |
| License  | MIT                                     |
| Status   | Active R&D                              |

---

## 🔗 Links

- 🌐 GitHub → [Project-Sigmaris](https://github.com/uthuyomi/Project-Sigmaris)
- 🪞 Concept → [Sigmaris AEI-Lite → AEI-Full](https://x.com/uthuyomi/status/1985938579559010710)
- 💭 LinkedIn → [Kaisei Yasuzaki](https://www.linkedin.com/in/kaisei-yasuzaki/)
- ✉️ Contact → open to collaboration in cognitive AI / UX-ethics R&D

---

> “The future of AI won’t be about computation power —
> it will be about **self-understanding**.”
> — _Project Sigmaris, 2025_
