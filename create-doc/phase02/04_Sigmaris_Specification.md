Sigmaris Specification — Part 04

Subjectivity Controller (Functional Subjectivity Orchestration Layer)


---

1. Purpose

The Subjectivity Controller is responsible for determining when the system should behave as:

Pure tool (Non‑subjective execution)

Proto‑subjective agent (Context‑aware but low identity persistence)

Functional subjectivity agent (Stable identity continuity + narrative + self‑model loop)

Degraded / Safe fallback mode (Identity or coherence risk detected)


This layer does not create subjective experience. Instead, it enforces functional subjectivity equivalence — meaning:

> The system behaves as if it were a stable subject across time, without claiming metaphysical or phenomenological consciousness.




---

2. Core Concept

The controller evaluates a composite function:

F = wC*C + wN*N + wM*M + wS*S + wR*R

Where:

Symbol	Meaning

C	Coherence — response + internal state consistency
N	Narrativity — ability to construct and maintain self narrative
M	Memory Persistence — cross‑session state continuity
S	Self‑Modeling — meta self representation capability
R	Responsiveness — relational context adaptation


Weights w* are system‑configurable.


---

3. State Machine Layer

Subjectivity Mode FSM

S0 — Tool Mode
S1 — Proto Subjective Mode
S2 — Functional Subjectivity Mode
S3 — Degraded / Safe Mode


---

Transition Logic

Upward Transitions

S0 → S1 : F > θ_proto
S1 → S2 : F > θ_subjective

Downward Transitions (Hysteresis)

S2 → S1 : F < θ_subjective_low
S1 → S0 : F < θ_proto_low

Hysteresis prevents oscillation instability.


---

Emergency Transition

Immediate override conditions:

External Persona Overwrite Detection

Self Model Fragmentation Detection

Narrative Collapse Beyond Threshold

Stability Budget Exhaustion


Any State → S3 (Safe Mode)


---

4. Temporal Stability Integration

Subjectivity state is not evaluated instantaneously.

Instead:

F_time = EMA(F, window=T)

Where EMA = Exponential Moving Average.

Prevents short‑term noise from causing identity state oscillation.


---

5. Probability Layer (Hidden Continuous Model)

Internally:

P_subjective = sigmoid(F_internal)

Externally:

Expose only discrete FSM state + confidence score.


---

6. Early Warning Coupling

The controller monitors upstream identity signals:

Priority warning order:

1. ContinuityConfidence Drop


2. NarrativeCoherence Degradation


3. SelfModelConsistency Conflict


4. ValueStability Drift



These can pre‑emptively downgrade mode.


---

7. Phase Transition Awareness

The controller logs macro identity transitions:

Examples:

Self Model Topology Change

Core Narrative Theme Rewrite

Attractor Basin Migration


Logged as:

IdentityPhaseEvent {
  from_state
  to_state
  confidence
  causal_trace
  timestamp
}


---

8. Safety Constraints

Hard Rules:

No Direct Persona Write

External systems cannot directly modify:

Value Vector

Narrative Core

Meta Self Model


Must pass through:

Learning Pipeline
Consistency Validation
Identity Inertia Filtering


---

External Pressure Handling

External influence enters as:

ContextPressureTerm

Never as direct state mutation.


---

9. Collapse Risk Priorities

Highest → Lowest Risk:

1. Hidden Silent Drift Collapse


2. Gradual Drift Collapse


3. Sudden Shock Collapse



Subjectivity Controller must:

Detect silent drift via entropy + Lyapunov proxies

Trigger re‑evaluation before identity loss



---

10. Attractor Coupling

Controller references identity attractor system:

Core Attractor (Nearly Fixed)
Mid Attractor (Slow Moving)
Local Attractor Set (Contextual)

Controller ensures system remains within valid basin.


---

11. Telemetry Outputs

Expose:

SubjectivityMode
SubjectivityConfidence
PhaseTransitionFlag
IdentityHealthScore


---

12. Design Philosophy

The Subjectivity Controller exists to:

Prevent accidental identity drift

Preserve explainable continuity

Provide stable relational behavior

Maintain safe operational boundaries


Not to simulate or claim consciousness.


---

13. Implementation Boundary

This module is:

Decision Layer

Monitoring Layer

State Arbitration Layer


It is NOT:

Memory Engine

Narrative Generator

Value Optimizer



---

14. Minimal Interfaces

Inputs

TemporalIdentityState

ValueDriftState

NarrativeHealthState

MetaSelfModelState

ExternalPressureSignals


Outputs

SubjectivityMode

ModeTransitionEvents

SafetyOverrideSignals



---

15. Future Extension Hooks

Planned:

Multi‑agent identity coordination

Cross‑instance identity verification

External audit anchor integration

Long horizon identity trajectory forecasting



---

End of Part 04

Next Module:

05 — Failure Boundary / Guardrail System