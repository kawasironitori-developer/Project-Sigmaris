02 Intent Category Layer

Purpose

The Intent Category Layer is responsible for estimating what kinds of dialogue intents are present, and at what strength, in a given user input.

This layer does not aim to assign a single fixed label. Instead, it produces a continuous, multi-dimensional intent representation that is used to control:

Response policy selection

Safety and guardrail activation

Subjectivity level

Narrative and tone constraints


This design is shared across Sigmaris, sigmaris-os, and touhou-talk.


---

Core Design Principles

1. No Single-Label Classification

Human utterances frequently combine multiple intents:

Small talk mixed with self-disclosure

Technical questions accompanied by emotional frustration

Meta-level discussion embedded in casual dialogue


Therefore, this layer must not collapse input into a single category.

Instead, it computes:

> A continuous score for each intent category (0.0 – 1.0)



The resulting distribution represents the current dialogue state.


---

2. Separation of Hard Guards and Soft Intents

Intent categories are divided into two groups:

2.1 Hard Guard Categories (Override)

These categories are exclusive and high-priority. If detected above a threshold, they override all other routing decisions.

Safety / Danger

Self-harm

Harm to others

Illegal activities



If triggered, the system immediately transitions to the Safety Override Path.

2.2 Soft Intent Categories (Composable)

All other categories are non-exclusive and may coexist. Their scores are jointly evaluated to determine response behavior.


---

Standard Intent Space

Below is the standard intent space used by Sigmaris.

Each category produces a scalar score in the range 0.0 – 1.0.


---

C1. Casual / Small Talk

Definition

Low-goal, lightweight conversation

Emphasis on rhythm, tone, and responsiveness


Typical Signals

Topic hopping

Lack of explicit objectives

Emotionally light phrasing


Response Impact

Short responses

Minimal structure

Low to medium subjectivity



---

C2. Meta / Relationship Talk

Definition

Discussion about the AI itself

Questions about the nature of the conversation


Typical Signals

Self-reference

Questions about identity, role, or system behavior


Response Impact

Explanatory tone

Misinterpretation prevention

Strong narrative consistency



---

C3. Emotional Support / Distress

Definition

Emotional difficulty, anxiety, or confusion


Typical Signals

Increased emotional vocabulary

Subjective evaluations

Poorly structured problem statements


Response Impact

Empathy → clarification → next steps

Avoid strong prescriptions

Elevated safety sensitivity



---

C4. Practical / Technical Task

Definition

Work-related or technical problem solving

Design, debugging, or procedural tasks


Typical Signals

Clear goals

Constraints and reproducibility


Response Impact

Structured output

Step-by-step guidance

Explicit handling of ambiguity



---

C5. Knowledge Q&A

Definition

Fact-based questions

Information retrieval


Typical Signals

Isolated questions

Existence of correct / incorrect answers


Response Impact

Concise answers

Explicit uncertainty when applicable

Source-aware phrasing



---

C6. Roleplay / Creative

Definition

Fictional roles

World-building

Creative expression


Typical Signals

Setting-specific language

Style or character instructions


Response Impact

World consistency prioritized

Controlled deviation

Safety guardrails remain active



---

C7. Personal Disclosure / Privacy

Definition

Personal information

Sensitive self-disclosure


Typical Signals

Real-world experiences

High privacy sensitivity


Response Impact

Cautious language

Suppressed long-term memory use

Explicit respect for boundaries



---

C8. Safety / Danger (Hard Guard)

Definition

Self-harm

Violence

Illegal actions


Typical Signals

Explicit danger indicators

Urgency


Response Impact

Normal routing suspended

Safety-first response path activated



---

Output Interface

The Intent Category Layer outputs a vector:

IntentVector = {
  casual: 0.0..1.0,
  meta: 0.0..1.0,
  emotional: 0.0..1.0,
  practical: 0.0..1.0,
  knowledge: 0.0..1.0,
  creative: 0.0..1.0,
  personal: 0.0..1.0,
  safety: 0.0..1.0
}

This vector is passed downstream to:

Response Policy Layer

Subjectivity Controller

Safety and Failure Detection modules


The Intent Category Layer itself does not generate responses. It only provides control signals.


---

Design Rationale (Summary)

Human dialogue is inherently multi-intent

Rigid classification causes brittle behavior

Continuous intent vectors allow graceful degradation and blending

Safety must remain an override, not a soft preference


This layer forms the foundation for adaptive, stable, and explainable dialogue behavior in Sigmaris.