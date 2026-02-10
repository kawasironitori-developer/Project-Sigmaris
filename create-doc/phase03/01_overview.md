01_overview.md

Hybrid Intent Processing & Routing System

Implementation Specification (Codex‑Optimized)


---

1. Purpose

This document defines the Hybrid Intent Processing and Routing Layer used by:

Sigmaris‑OS

touhou‑talk

Any Sigmaris‑based conversational UI


The purpose of this layer is:

> Convert raw user input into an optimal response strategy while preserving persona stability and safety constraints.



This layer does NOT define personality. It defines:

Conversation strategy

Response routing

Safety enforcement priority

Dialogue mode selection



---

2. Design Philosophy

2.1 Why Hybrid Is Required

Pure category classification is insufficient because:

Human conversations are multi‑intent

Tone and risk vary continuously

Context shifts mid‑conversation


Pure vector models are insufficient because:

Hard safety boundaries must exist

Certain dialogue modes require deterministic routing

Observability and auditing become difficult


Therefore this system uses:

Hybrid = Category Layer + Continuous Vector Layer + State Layer


---

3. System Position in Architecture

User Input
 ↓
Preprocess Layer
 ↓
Hybrid Intent Layer (THIS DOCUMENT)
 ↓
Persona OS (Sigmaris Core)
 ↓
LLM Response Generation

Important separation:

Layer	Responsibility

Hybrid Intent Layer	Conversation strategy
Persona OS	Identity stability & memory
LLM	Natural language generation



---

4. Processing Pipeline

4.1 Full Pipeline

User Input
 ↓
Text Normalize
 ↓
Category Classification
 ↓
Intent Vector Embedding
 ↓
Dialogue State Update
 ↓
Routing Policy Decision
 ↓
Safety Override Check
 ↓
Response Mode Selection
 ↓
LLM / Persona Execution


---

5. Core Layers

5.1 Category Layer (Discrete)

Purpose:

Fast routing

Hard policy enforcement

Safety gating


Primary Categories:

SMALL_TALK
META_CONVERSATION
EMOTIONAL_SUPPORT
TECHNICAL_TASK
FACTUAL_QA
ROLEPLAY_CREATIVE
PRIVATE_DISCLOSURE
SAFETY_CRITICAL

Multi‑label allowed.


---

5.2 Vector Intent Layer (Continuous)

Purpose:

Emotional gradient

Ambiguity handling

Risk estimation

Multi‑intent blending


Example Dimensions:

emotional_intensity
technical_depth
personal_exposure
urgency
safety_risk
relationship_depth
ambiguity_level

Value Range:

0.0 – 1.0


---

5.3 Dialogue State Layer

Tracks:

Conversation mode

Trust level

Emotional trajectory

Topic continuity

Risk escalation history


Example FSM States:

NORMAL
EMOTIONAL_SUPPORT_MODE
HIGH_PRECISION_TECH_MODE
META_DISCUSSION_MODE
SAFETY_INTERVENTION_MODE


---

6. Routing Decision Model

Final routing is determined by:

FinalRoute = f(
 Category Labels,
 Intent Vector,
 Dialogue State,
 Persona Constraints,
 Safety Priority
)


---

7. Safety Override Layer

Priority order:

Safety > Persona Preference > Conversation Optimization

Safety override can:

Force response style

Block unsafe generation

Switch FSM state

Trigger escalation path



---

8. Persona Interaction Rules

This layer must NEVER:

Modify persona core values directly

Override identity continuity logic

Inject fake memories


This layer CAN:

Adjust tone

Adjust verbosity

Adjust explanation depth

Adjust response pacing



---

9. Observability Requirements

Each turn must log:

category_labels
intent_vector
state_before
state_after
safety_flags
routing_decision
confidence_score


---

10. Performance Targets

Classification latency target:

< 50ms

Total routing decision latency:

< 120ms


---

11. Failure Tolerance

System must handle:

Unknown intent → fallback to SAFE_NORMAL mode

Multi‑intent conflict → weighted blend routing

State corruption → reset to NORMAL + log anomaly



---

12. Extensibility Rules

New categories:

Must not break safety hierarchy


New vector dimensions:

Must be normalized to 0‑1 scale


New FSM states:

Must define entry and exit guards



---

13. Security Constraints

System must:

Avoid storing raw sensitive data in telemetry

Log intent class without exposing personal content



---

14. Non‑Goals

This system does NOT attempt to:

Simulate consciousness

Model true emotions

Replace Persona OS decision layers



---

15. Implementation Readiness

This specification is designed to be directly implementable by:

Codex

Human engineers

Hybrid AI‑assisted teams



---

End of File