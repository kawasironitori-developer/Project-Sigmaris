08. Observability Layer

Purpose

This document defines the Observability Layer of the Sigmaris Dialogue Control System.

The goal of this layer is to make the internal dialogue control process externally visible, inspectable, and auditable without exposing raw chain-of-thought or unsafe internal reasoning.

Observability is treated as a first-class system requirement, not a debugging convenience.

Sigmaris is designed under the assumption that:

Long-running dialogue systems inevitably drift

Hidden internal state is a safety and reliability risk

Trust is established through measurable behavior, not claims of intelligence


This layer enables operators, developers, and advanced users to understand what the system is doing, why it responded the way it did, and how its internal state evolves over time.


---

Design Principles

1. No Chain-of-Thought Exposure

Internal reasoning tokens are never logged or surfaced

Observability relies on structured summaries, not raw cognition



2. Deterministic, Structured Telemetry

All observable signals must be machine-readable

Metrics must be comparable across time and sessions



3. Layer-Boundary Visibility

Each major processing layer emits its own observability signals

Signals are composable but independently meaningful



4. Low Intrusiveness

Observability must not significantly alter response behavior

No feedback loops that bias generation unless explicitly configured



5. User-Respecting Transparency

Signals describe system state, not user psychology

No inferred mental states about the user are exposed





---

Observable Signal Categories

1. Intent Classification Signals

Emitted after Intent Category Layer and Intent Vector Layer.

Example fields:

intent.category.primary

intent.category.secondary

intent.vector (normalized float vector)

intent.confidence (0.0–1.0)


Usage:

Detect intent ambiguity

Audit misclassification patterns

Correlate intent with downstream failures



---

2. Dialogue State Signals

Emitted by the Dialogue State Machine (FSM).

Example fields:

dialogue.state.current

dialogue.state.previous

dialogue.transition.reason

dialogue.state.stability


Usage:

Track conversation regime shifts

Detect oscillation or state-lock conditions

Validate FSM design assumptions



---

3. Routing & Policy Signals

Emitted by the Routing Policy Layer.

Example fields:

routing.strategy

routing.constraints_applied

routing.priority_level

routing.override_reason (if any)


Usage:

Explain why a specific response style was chosen

Debug policy conflicts

Verify safety precedence behavior



---

4. Safety & Override Signals

Emitted by the Safety Override Layer.

Example fields:

safety.level (none / caution / restricted / blocked)

safety.trigger.type

safety.action.taken

safety.fallback_used


Usage:

Audit safety interventions

Ensure consistent handling of sensitive topics

Support compliance and post-incident review



---

5. Temporal & Stability Metrics

Integrated with Sigmaris Phase02 systems.

Example fields:

identity.inertia

stability.budget.remaining

phase.transition.detected (boolean)

drift.velocity


Usage:

Monitor long-term persona stability

Detect silent drift patterns

Trigger maintenance or recalibration



---

Telemetry Summary Object

All observability signals are aggregated into a Telemetry Summary Object returned alongside (or stored with) each response.

Example structure (conceptual):

telemetry.intent

telemetry.dialogue_state

telemetry.routing

telemetry.safety

telemetry.stability


This object is:

Stored server-side for time-series analysis

Optionally exposed to dashboards or advanced UIs

Never shown verbatim to casual end-users by default



---

Storage & Time-Series Considerations

Telemetry snapshots are stored per turn

Indexed by:

user_id

session_id

timestamp

persona_version



Recommended storage backends:

SQL (for relational inspection)

Time-series DB or columnar storage (for trend analysis)


Retention policies should be configurable.


---

Visualization Guidelines

Observability is most effective when visualized.

Recommended views:

Intent distribution over time

Dialogue state timelines

Safety intervention frequency

Stability budget decay curves


Visualizations must:

Avoid anthropomorphic framing

Emphasize system behavior, not intelligence



---

Failure & Debugging Use Cases

The Observability Layer enables:

Post-mortem analysis of incorrect responses

Detection of misrouted conversations

Identification of overactive safety triggers

Long-term drift diagnosis


This allows Sigmaris to be operated as a maintainable system, not a black box.


---

Non-Goals

The Observability Layer explicitly does NOT:

Explain internal chain-of-thought

Provide psychological profiling of users

Justify responses in human-like introspective language


It exists to make the system operationally legible, not emotionally persuasive.


---

Summary

The Observability Layer completes the Sigmaris dialogue architecture by ensuring that:

Every response is traceable

Every internal decision is inspectable

Long-term behavior is measurable


Without observability, dialogue control degrades into guesswork.

With it, Sigmaris becomes an engineered, governable dialogue system.