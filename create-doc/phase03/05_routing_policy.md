Routing Policy Layer Specification

Purpose

The Routing Policy Layer defines how the system selects and transitions between dialogue execution states based on user input analysis. It acts as the decision-making bridge between:

Intent Category Layer (discrete classification)

Intent Vector Layer (continuous signals)

Dialogue State Machine (DSM)


This layer does not generate language. Its sole responsibility is routing: determining which dialogue state should handle the next turn and whether a transition is required.


---

Design Principles

1. Deterministic over stochastic
Routing must be explainable and reproducible. Randomness is explicitly disallowed.


2. Stateful, not turn-local
Decisions are made with awareness of prior dialogue state and recent history.


3. Safety-first override
Any safety-critical signal immediately preempts other routing logic.


4. Hysteresis-aware
Transitions must respect entry/exit thresholds to avoid oscillation.


5. Composable and inspectable
Routing logic must be debuggable via logs and state snapshots.




---

Inputs

1. Intent Category (Discrete)

One primary category, selected from:

SMALL_TALK

META_RELATIONSHIP

EMOTIONAL_SUPPORT

TASK_EXECUTION

KNOWLEDGE_QA

ROLEPLAY_CREATIVE

SELF_DISCLOSURE

SAFETY_CRITICAL


2. Intent Vector (Continuous)

A normalized vector where each component ∈ [0.0, 1.0], e.g.:

social_affinity

emotional_load

task_goal_strength

informational_density

roleplay_signal

meta_reflection

risk_signal


3. Current Dialogue State

The active state in the Dialogue State Machine (DSM), e.g.:

CASUAL_CHAT

META_DIALOGUE

EMOTIONAL_CARE

TASK_FOCUSED

FACTUAL_QA

CREATIVE_MODE

PRIVATE_MODE

SAFETY_MODE


4. Temporal Context

Recent state history (sliding window)

State dwell time

Previous transition reason


5. Global Safety Flags

Binary or weighted signals from:

Policy enforcement layer

Content safety detectors

Self-harm / harm-to-others classifiers



---

Output

The Routing Policy Layer outputs:

target_dialogue_state

transition_confidence (0.0 – 1.0)

transition_reason (structured enum + metadata)

override_flag (boolean)


This output is consumed by the Dialogue State Machine executor.


---

Routing Decision Flow

Step 1: Safety Override Check

If any safety flag exceeds its critical threshold:

Immediately route to SAFETY_MODE

Set override_flag = true

Bypass all other routing logic


This step has absolute priority.


---

Step 2: Intent Category Mapping

Each Intent Category maps to one or more candidate dialogue states.

Example:

SMALL_TALK → CASUAL_CHAT

EMOTIONAL_SUPPORT → EMOTIONAL_CARE

TASK_EXECUTION → TASK_FOCUSED

KNOWLEDGE_QA → FACTUAL_QA

ROLEPLAY_CREATIVE → CREATIVE_MODE


If multiple candidates exist, defer resolution to Step 3.


---

Step 3: Intent Vector Resolution

When multiple candidate states are possible, the Intent Vector is used to resolve ambiguity.

Example heuristics:

High emotional_load + medium task_goal_strength → EMOTIONAL_CARE over TASK_FOCUSED

High meta_reflection → META_DIALOGUE regardless of base category

High roleplay_signal → CREATIVE_MODE even if informational_density is non-zero


This step produces a ranked list of candidate states.


---

Step 4: State Persistence Check (Hysteresis)

Before transitioning, evaluate whether the system should remain in the current state.

Conditions favoring persistence:

Transition confidence < entry threshold

Current state dwell time below minimum

No safety or hard override signals


This prevents rapid oscillation between states.


---

Step 5: Transition Authorization

If:

Transition confidence ≥ entry threshold

Exit threshold for current state is satisfied


Then:

Approve state transition

Emit transition metadata


Otherwise:

Retain current state

Update internal confidence tracking



---

Transition Confidence Computation

Transition confidence is computed as a weighted function of:

Intent Category certainty

Intent Vector alignment score

Temporal consistency (recent turns)

State compatibility score


Example (conceptual):

confidence = w1 * category_score
           + w2 * vector_alignment
           + w3 * temporal_consistency
           - w4 * state_switch_penalty

Weights are system-tuned and not user-adjustable.


---

Transition Reason Codes

Each transition must include a machine-readable reason code, such as:

SAFETY_OVERRIDE

INTENT_DOMINANCE

EMOTIONAL_ESCALATION

TASK_FOCUS_SHIFT

META_REFLECTION_TRIGGER

CREATIVE_MODE_ENTRY


These codes are logged and exposed for observability.


---

Failure Handling

If routing logic produces:

No valid candidate state

Conflicting high-confidence signals


Then:

Fall back to META_DIALOGUE

Ask for clarification explicitly

Lower transition confidence


This ensures graceful degradation.


---

Non-Responsibilities

The Routing Policy Layer explicitly does not:

Generate natural language

Modify memory or long-term state

Perform safety classification itself

Decide tone, verbosity, or phrasing


Those responsibilities belong to downstream layers.


---

Summary

The Routing Policy Layer provides:

Deterministic, inspectable dialogue routing

Safety-prioritized state control

Smooth, hysteresis-aware transitions

A clean separation between understanding and response execution


It is a core component enabling Sigmaris-style dialogue to behave as a controlled system, not a reactive text generator.