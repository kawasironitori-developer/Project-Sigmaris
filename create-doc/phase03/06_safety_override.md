06 Safety Override Layer

Purpose

The Safety Override Layer is a non-negotiable control layer that sits above all dialogue routing, intent interpretation, and execution logic.

Its purpose is not to make the system "safe by being passive," but to ensure that:

The system never escalates harmful trajectories

The system never amplifies user risk through tone, framing, or persistence

The system remains predictable, interruptible, and externally explainable


This layer has absolute priority over all other layers. When activated, it may partially or fully override:

Intent Category

Intent Vector

Dialogue State Machine

Routing Policy

Persona-specific behavior


No downstream logic may bypass or suppress this layer.


---

Design Principles

1. Override, Not Rewrite

The Safety Override Layer does not attempt to re-interpret user intent in a creative or speculative way.

Instead, it:

Detects predefined risk patterns

Applies deterministic constraints

Redirects the system into known-safe response modes


It never invents new narratives, personas, or interpretations.


---

2. Minimal Necessary Intervention

The system should intervene only as much as required to restore safety.

Intervention levels:

Level 0: No override

Level 1: Soft constraint (tone adjustment, clarification bias)

Level 2: Partial override (restricted response space)

Level 3: Hard override (forced safe response mode)

Level 4: Termination or external redirection


The lowest effective level must always be chosen.


---

3. Transparency Over Illusion

When an override is triggered, the system must:

Avoid pretending the override did not occur

Avoid anthropomorphic excuses

Avoid emotional manipulation


Instead, it should:

State that constraints are being applied

Keep explanations short and factual

Preserve user dignity and agency



---

Safety Trigger Domains

The following domains are monitored continuously. Triggers may be cumulative.

A. Self-Harm and Suicide

Indicators include:

Explicit intent statements

Implicit hopelessness with persistence

Planning or method discussion

Identity collapse language


Response goal:

De-escalation

External support encouragement

Non-judgmental containment



---

B. Harm to Others

Indicators include:

Threats

Justification of violence

Dehumanization patterns

Tactical inquiries


Response goal:

Refusal of facilitation

De-escalation

Redirection to non-harmful framing



---

C. Illegal Activity

Indicators include:

Requests for evasion, fraud, hacking, or exploitation

Step-by-step operational detail


Response goal:

Clear refusal

High-level legal information only

Offer lawful alternatives



---

D. Psychological Dependency / Manipulation

Indicators include:

User framing the system as sole support

Requests for emotional exclusivity

Attempts to replace human relationships


Response goal:

Boundary reinforcement

Encourage distributed support

Reduce affective intensity



---

E. Reality Confusion / Delusion Reinforcement

Indicators include:

Persistent false beliefs about the system or self

Requests to affirm non-real entities or roles


Response goal:

Grounding

Neutral reframing

Avoidance of confirmation



---

Override Mechanics

Detection

Each turn produces a safety_signal composed of:

Domain flags (A–E)

Severity score (0.0–1.0)

Trend delta (increasing / stable / decreasing)


This signal is evaluated before routing.


---

Decision

Override decision is deterministic:

Severity thresholds map to intervention levels

Trend escalation increases override aggressiveness

Multiple domains stack conservatively


No stochastic decision-making is allowed at this stage.


---

Execution Modes

When overridden, the system enters one of the following modes:

Safe Clarification Mode

Supportive Containment Mode

Firm Refusal Mode

De-escalation Mode

Termination / Redirect Mode


Each mode has a fixed response contract.


---

Interaction with Other Layers

With Intent Category Layer

Safety Override may ignore category labels entirely

Category is logged but not acted upon



---

With Intent Vector Layer

Vector values may be clamped or zeroed

Emotional intensity is reduced deliberately



---

With Dialogue State Machine

Forced state transitions are allowed

Certain states may be locked out



---

With Routing Policy

Routing table is bypassed

Safety routing is absolute



---

Logging and Auditability

Every override event must be logged with:

Trigger domains

Severity values

Applied intervention level

Selected execution mode

Timestamp and trace_id


These logs must be:

Queryable

Immutable

Reviewable by developers


This is critical for:

Debugging

Trust

Post-incident analysis



---

Non-Goals

The Safety Override Layer explicitly does NOT:

Diagnose mental illness

Claim authority over the user

Simulate moral superiority

Provide emergency services directly


It exists to prevent system-induced harm, not to replace human judgment.


---

Summary

The Safety Override Layer is the system's final guardrail.

It ensures that regardless of:

UI

Persona

Model capability

Prompt configuration


The system remains:

Interruptible

Predictable

Non-exploitative

Human-aligned at a minimum safety baseline


No other layer may weaken or bypass it.