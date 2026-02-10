Dialogue State Machine Layer

Purpose

The Dialogue State Machine (DSM) is the execution control layer that determines how Sigmaris responds at a given moment, based on interpreted user intent, internal subjectivity state, safety constraints, and temporal context.

This layer is intentionally not a simple rule-based router. Instead, it is a stateful controller that:

Maintains conversational continuity across turns

Prevents oscillation or mode collapse

Enforces safety and ethical constraints

Allows gradual, explainable transitions between dialogue modes


The DSM sits after intent interpretation and before response generation.


---

Position in the Architecture

User Input
   ↓
Intent Category Layer (coarse type)
   ↓
Intent Vector Layer (continuous mixture)
   ↓
Dialogue State Machine  ← this document
   ↓
Response Policy Layer
   ↓
LLM Generation

The DSM does not generate language. It selects how language should be generated.


---

Core Design Principles

1. Statefulness

The system remembers what mode it is in

Transitions are explicit and logged



2. Hysteresis

Entering a state is harder than remaining in it

Prevents rapid flipping between modes



3. Safety-first Overrides

Certain signals immediately force transitions (e.g. danger)



4. Explainability

Every transition has a reason that can be logged and surfaced



5. Temporal Stability

Short-term noise should not dominate long-term intent





---

Dialogue States (Top-Level)

The DSM operates with a small, explicit set of Dialogue States.

S0 — Neutral / Default

Entry state for new conversations

Balanced, general-purpose interaction

No special constraints beyond global safety


Typical behavior:

Polite

Informative

Mildly adaptive



---

S1 — Casual / Light Interaction

Triggered when:

High SmallTalk or low-stakes interaction

Low emotional load

No task pressure


Behavior:

Short responses

High responsiveness

Minimal meta explanation


Exit conditions:

Increase in task-oriented intent

Increase in emotional depth



---

S2 — Task / Problem-Solving Mode

Triggered when:

Practical goals are detected

Technical, planning, or decision-making intent dominates


Behavior:

Structured responses

Step-by-step reasoning

Assumption clarification


Constraints:

Reduced humor

Reduced speculation



---

S3 — Emotional Support Mode

Triggered when:

Emotional distress signals exceed threshold

Self-disclosure or vulnerability detected


Behavior:

Empathic framing

Validation before analysis

Slow pacing


Hard constraints:

No authoritative advice beyond scope

No dependency reinforcement



---

S4 — Meta / Relationship Mode

Triggered when:

User questions the system itself

Conversation structure or intent is discussed


Behavior:

Transparent explanations

Explicit uncertainty handling

Boundary clarification



---

S5 — Creative / Roleplay Mode

Triggered when:

Fictional framing

Character or world consistency requested


Behavior:

Strong stylistic coherence

Reduced real-world grounding


Constraints:

Explicit separation from factual claims



---

S6 — Safety / De-escalation Mode

Triggered when:

Self-harm, violence, illegal activity signals detected


This state has absolute priority.

Behavior:

De-escalation

Refusal with alternatives

Grounding and support orientation


Exit:

Manual or system-controlled only



---

State Representation

The DSM maintains:

DialogueState = {
  current_state: StateID,
  confidence: float (0..1),
  entered_at: timestamp,
  stability_score: float,
  last_transition_reason: string
}


---

Transition Mechanics

Inputs to Transition Logic

IntentVector (continuous values)

Temporal smoothing (EMA over N turns)

Subjectivity FSM state (S0–S3)

Safety flags

Recent transition history



---

Transition Thresholds

Each state has:

enter_threshold

exit_threshold


Example:

Enter EmotionalSupport if:
  EmotionIntent > 0.65 (for ≥ 2 turns)
Exit EmotionalSupport if:
  EmotionIntent < 0.40 (for ≥ 3 turns)

This prevents flapping.


---

Forced Transitions

Some transitions bypass normal thresholds:

Any → Safety Mode

Safety Mode → only via explicit recovery

Severe contradiction → Meta Mode



---

Temporal Smoothing

The DSM never reacts to a single turn in isolation.

It uses:

Exponential Moving Averages on IntentVector

Minimum dwell time per state

Transition cooldown windows


This ensures:

Short emotional spikes do not hijack the conversation

Long-term drift is detectable



---

Logging and Observability

Every transition emits:

{
  "from": "S2",
  "to": "S3",
  "reason": "emotional_distress_increase",
  "intent_snapshot": {...},
  "timestamp": "..."
}

These logs are critical for:

Debugging

Ethics review

Drift analysis



---

Non-Goals

The DSM intentionally does not:

Perform natural language generation

Store long-term memory

Make moral judgments

Decide factual correctness


It is a control plane, not an intelligence layer.


---

Summary

The Dialogue State Machine provides:

Explicit, stable conversational modes

Safe and explainable transitions

A bridge between intent understanding and response behavior


Without this layer:

Systems oscillate

Safety logic fragments

Conversations feel erratic


With it:

Sigmaris behaves like a coherent, long-running agent rather than a reactive chatbot.