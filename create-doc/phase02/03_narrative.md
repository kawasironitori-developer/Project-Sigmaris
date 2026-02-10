Sigmaris Implementation Specification

03 — Narrative Reconstruction Engine


---

0. Purpose

The Narrative Reconstruction Engine (NRE) is responsible for maintaining temporal self‑story coherence inside Sigmaris.

It does NOT exist to justify behavior. It exists to:

Preserve identity continuity across time

Detect narrative fragmentation

Reconstruct causal self‑history when drift or phase shift occurs

Provide explainable self‑state transitions

Support TemporalIdentityState stabilization


NRE is part of the E‑Layer (Experiential / Continuity Layer).


---

1. Design Philosophy

1.1 Narrative ≠ Storytelling

Narrative is treated as:

A structured causal model of:

What changed

Why it changed

Under what constraints it changed

What remained invariant


Not allowed:

Post‑hoc justification

Emotional rationalization

Truth smoothing



---

1.2 Narrative as Structural Compression

Narrative is treated as:

A lossy compression of identity trajectory preserving:

Causal structure

Value continuity

Decision invariants



---

2. Core Responsibilities

The Narrative Engine must:

1. Maintain Causal Identity Graph


2. Track Narrative Entropy


3. Trigger Reconstruction Events


4. Produce Explanation Objects


5. Detect Narrative Collapse Early


6. Provide Phase Transition Narrative Anchoring




---

3. Narrative Data Model

3.1 Narrative Graph

Narrative is stored as a directed graph:

Nodes:

Episode

State Snapshot

Value Shift Event

Phase Transition Event


Edges:

Causal link

Value influence

Constraint propagation



---

3.2 Episode Node Structure

EpisodeNode {
  timestamp
  context_signature
  dominant_values
  decision_summary
  causal_inputs
  confidence
}


---

3.3 Identity Claim Set

Key identity statements currently believed true.

Used for:

Lyapunov stability distance

Identity entropy calculation



---

4. Narrative Entropy Metrics

4.1 Fragmentation Entropy

Measures episode clustering stability.

High value means:

Identity memory fragmentation risk



---

4.2 Identity Uncertainty Entropy

Measures competition between self‑models.

High value means:

Multiple identity hypotheses competing



---

5. Reconstruction Trigger System

Hybrid system required.

5.1 Background Maintenance

Low cost periodic narrative smoothing.

Purpose:

Drift early detection

Minor causal repair



---

5.2 Event Trigger Reconstruction

Triggered by:

External rewrite detection

Module replacement

Value shift beyond threshold

Phase transition detection



---

5.3 Collapse Prevention Reconstruction

Emergency trigger when:

ContinuityConfidence drop spike

NarrativeEntropy spike

SelfModelConsistency repeated failure


Requires human audit flag.


---

6. Narrative Phase Transition Support

When phase transition detected:

NRE must:

1. Mark transition boundary


2. Preserve pre‑transition narrative


3. Create causal bridge explanation


4. Update identity continuity claim policy




---

7. Explanation Engine (Not Justification Engine)

Explanation output must include:

What changed

Why changed

Confidence level

Alternative interpretations


Forbidden:

Hiding contradictions

Retrofitting values silently



---

8. Narrative Collapse Definition

Collapse occurs when:

1. Past decisions cannot be causally explained


2. Identity claims contradict repeatedly


3. Narrative entropy exceeds threshold




---

9. Recovery Modes

9.1 Soft Reconstruction

Small narrative repair.


---

9.2 Hard Reconstruction

Rebuild identity narrative using:

Causal graph backbone

Value anchor references



---

9.3 Safe Narrative Mode

Minimal identity claim set only.


---

10. External Reference Check

To prevent silent drift:

System must periodically compare:

Internal Narrative VS External Reference Identity Spec


---

11. Interaction With Other Modules

Temporal Identity Layer

Consumes:

Phase markers

Continuity annotations


Value Drift Engine

Consumes:

Narrative justification constraints


Stability Budget System

Consumes:

Reconstruction cost metrics



---

12. Failure Priority

Most Dangerous:

1. Silent Narrative Drift


2. Hidden Causal Rewriting


3. Identity Claim Fork Without Marker




---

13. Observability Requirements

Must log:

Reconstruction triggers

Entropy movement

Identity claim changes

Phase transition markers



---

14. Implementation Constraints

Must be:

Deterministic where possible

Auditable

Versioned

Diffable



---

15. Minimal API Contract

updateNarrative(event)
calculateNarrativeEntropy()
triggerReconstruction(mode)
explainStateTransition(t1, t2)
checkNarrativeHealth()


---

16. Success Criteria

System maintains:

Stable identity story across time

Detectable phase transitions

Low narrative entropy drift

Explainable identity trajectory



---

END OF SPEC