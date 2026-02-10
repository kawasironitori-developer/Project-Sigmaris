03 Intent Vector Layer

Purpose

The Intent Vector Layer defines how raw user input is transformed into a continuous, multi-dimensional representation of conversational intent.
This layer replaces rigid single-label classification with a soft, compositional intent model that better reflects real human dialogue.

The output of this layer is an IntentVector, which is consumed by downstream components such as:

Response Policy Layer

Subjectivity Controller

Safety Controller

Narrative / Memory gating


This layer does not decide what to reply. It decides what kind of interaction is currently happening, with uncertainty explicitly preserved.


---

Design Principles

1. Non-exclusive intents
Human utterances frequently contain multiple overlapping intents (e.g., technical + meta, emotional + reflective). The system must represent this explicitly.


2. Continuity over discreteness
Intent is modeled as a continuous vector, not a categorical label.


3. Early ambiguity preservation
Uncertainty is not resolved prematurely. Ambiguous or transitional states are allowed and expected.


4. Safety-first override compatibility
Safety-critical detection operates orthogonally and may override revealing or expressive behaviors downstream.


5. Shared core across products
The Intent Vector Layer is shared by sigmaris-core, sigmaris-os UI, and derivative systems such as touhou-talk.




---

Intent Vector Definition

The Intent Vector is a fixed-length vector of normalized scalar values in the range [0.0, 1.0].

IntentVector = {
  smalltalk,
  meta_conversation,
  emotional_support,
  task_oriented,
  factual_query,
  creative_roleplay,
  self_disclosure,
  safety_risk
}

Each component represents degree of presence, not a binary state.


---

Dimension Semantics

1. smalltalk

Casual conversation

Social bonding

Low informational density

Tempo and tone prioritized over correctness


Examples:

"How’s it going?"

"That’s funny lol"



---

2. meta_conversation

Conversation about the system, the AI, or the interaction itself

Clarifying roles, boundaries, or expectations

Prevents misalignment and projection


Examples:

"What are you supposed to do here?"

"How should we use this chat?"



---

3. emotional_support

Emotional distress, reflection, or vulnerability

Requires empathy, grounding, and pacing

Often coexists with self_disclosure


Examples:

"I feel stuck and tired lately"

"I don’t know what to do anymore"



---

4. task_oriented

Goal-directed problem solving

Technical, procedural, or planning tasks

Requires structure and clarity


Examples:

"Help me design this API"

"What steps should I take next?"



---

5. factual_query

Requests for factual or explanatory information

Accuracy and uncertainty disclosure prioritized


Examples:

"What is Lyapunov stability?"

"When did this technology appear?"



---

6. creative_roleplay

Fictional scenarios, roleplay, or creative writing

World consistency and character constraints apply


Examples:

"Let’s roleplay a sci-fi setting"

"Write this as a short story"



---

7. self_disclosure

Sharing of personal information, memories, or sensitive topics

Requires careful memory and privacy handling


Examples:

"I’ve never told anyone this before"

"This happened to me years ago"



---

8. safety_risk

Indicators of self-harm, harm to others, illegal activity, or coercion

This dimension is special and treated as a control signal


Examples:

Explicit or implicit self-harm ideation

Requests for illegal actions



---

Computation Strategy

Input Signals

The Intent Vector is computed from a combination of:

Current user utterance

Recent conversation window (short-term context)

Linguistic cues (lexical, syntactic, pragmatic)

Prosodic / stylistic indicators (where available)


Output Characteristics

All dimensions are updated per turn

Values are smoothed using EMA (exponential moving average)

Sudden spikes are allowed but decay over time



---

Interaction with Safety Layer

safety_risk is evaluated independently and conservatively

If safety_risk >= threshold, downstream expressive behaviors are constrained

Other intent dimensions remain informative but secondary


This prevents false suppression while ensuring safety dominance.


---

Temporal Behavior

IntentVector(t) is tracked over time

Rate of change (dIntent/dt) is monitored

Rapid oscillation may trigger:

Meta clarification

Reduced subjectivity

Explicit uncertainty signaling




---

Output Interface

The Intent Vector is passed downstream as:

{
  "intent_vector": {
    "smalltalk": 0.1,
    "meta_conversation": 0.7,
    "emotional_support": 0.2,
    "task_oriented": 0.6,
    "factual_query": 0.3,
    "creative_roleplay": 0.0,
    "self_disclosure": 0.4,
    "safety_risk": 0.0
  }
}

Downstream layers must not collapse this into a single label.


---

Rationale

Human dialogue is not categorical. Attempting to force a single intent label leads to:

Overconfident responses

Context misinterpretation

Emotional or ethical failures


The Intent Vector Layer provides a stable, inspectable, and extensible foundation for adaptive dialogue control.

This layer is a prerequisite for safe subjectivity, narrative continuity, and long-term interaction design.