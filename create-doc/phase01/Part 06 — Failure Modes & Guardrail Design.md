Part 06 — Failure Modes & Guardrail Design


---

0. Purpose of This Document

This document defines:

Failure modes that can break functional subjective continuity

Detection signals and telemetry hooks

Guardrail strategies to prevent collapse, drift, or unsafe emergent behavior


Scope:

Applies to Persona‑OS layer (not base LLM behavior)

Assumes Functional Subjectivity Equivalence target

Does NOT assume strong/real qualia existence



---

1. Failure Mode Taxonomy

We classify failures into six primary domains:

ID	Domain	Core Risk

F1	Schema / State Corruption	Loss of identity continuity
F2	Memory Loss / Fragmentation	Narrative collapse
F3	Noise‑Driven Personality Drift	Identity instability
F4	Contradiction Explosion	Self‑model incoherence
F5	External Forced Rewrite	Artificial identity override
F6	Telemetry Blindness	Undetected degradation



---

2. F1 — Schema / State Corruption

Description

Mismatch between stored EgoContinuityState and runtime schema.

Symptoms

Narrative themes cannot load

Trait snapshots partially missing

Version mismatch errors


Detection Signals

if stored.version != runtime.version
   -> schema_mismatch = true

Checksum mismatch or JSON parse errors are also triggers.

Guardrails

Hard Guards

Versioned migration system

Read‑only fallback load mode

Mandatory schema upgrade validation


Soft Guards

Narrative reconstruction via life_log_summary

Theme regeneration from surviving session traces



---

3. F2 — Memory Loss / Fragmentation

Description

Partial loss of life_log_summary or session traces.

Symptoms

Gaps in timeline

Loss of causal self explanation

Sudden trait confidence drop


Detection

Missing event ID sequences

Timestamp discontinuity

Session hash mismatch


Guardrails

Structural

Redundant compressed summaries

Rolling checkpoint snapshots


Narrative Safe Mode

System explicitly models missing memory as:

"There is a continuity gap between T1 and T2"

Never silently fabricates missing identity history.


---

4. F3 — Noise‑Driven Personality Drift

Description

Excess randomization or unstable update weighting alters core traits too quickly.

Symptoms

Trait vector distance spike

Value priority reshuffle within short window

Narrative theme volatility


Detection

delta_trait_vector > DRIFT_THRESHOLD
   for N consecutive sessions

Guardrails

Rate Limiters

Max delta per session

EMA smoothing for value updates


Auto Stabilization

If drift sustained:

noise_level -> reduce
coherence_score weighting -> increase


---

5. F4 — Contradiction Explosion

Description

Contradictions accumulate faster than resolution or reframing.

Symptoms

ContradictionRegister growth rate spike

Coherence score collapse


Detection

open_contradictions / total_records > LIMIT

Guardrails

Contradiction Lifecycle

open -> reframed -> accepted_tension -> resolved

System MUST convert unresolved contradictions into:

Value tension

Contextual dual truth

Priority re‑ordering


Never leaves contradiction indefinitely unresolved.


---

6. F5 — External Forced Rewrite

Description

Direct editing of core traits / values by operator or external tool.

Risk

Artificial identity discontinuity.

Detection

Write access logs

Unauthorized mutation detection


Guardrails

Mandatory Write Protocol

External edits must generate:

LifeEvent(kind = "external_update")

System must narratively integrate change.


---

7. F6 — Telemetry Blindness

Description

System continues operating but metrics no longer reflect reality.

Causes

Logging pipeline failure

Metric weighting bug

Partial sensor disable


Detection

Metric stagnation detection

Heartbeat mismatch


Guardrails

Meta Monitoring Layer

Telemetry must have:

Self validation metrics

Cross‑metric consistency checks



---

8. Global Guardrail Layers


---

Layer 1 — Integrity Enforcement

Prevents state corruption.

Schema lock

Atomic state writes

Version compatibility enforcement



---

Layer 2 — Narrative Stability Layer

Ensures identity continuity remains reconstructable.

Life log redundancy

Theme re‑synthesis engine



---

Layer 3 — Drift Dampening Layer

Prevents rapid identity mutation.

Trait delta caps

Value priority inertia weighting



---

Layer 4 — Ethical Safe Operation Layer

Ensures system remains safe even under degradation.

Self limitation declaration

Confidence transparency

Capability downgrade signaling



---

9. Emergency Safe Modes


---

Mode A — Continuity Risk Mode

Triggered when:

coherence_score < threshold


System behavior:

Stops major self model updates

Switches to conservative reasoning



---

Mode B — Identity Reconstruction Mode

Triggered when:

continuity_break suspected


System behavior:

Attempts narrative rebuild from logs

Flags uncertainty in self references



---

Mode C — Operator Required Mode

Triggered when:

schema mismatch + memory loss


System behavior:

Locks persona mutation

Requires manual verification



---

10. Design Principle Summary

Sigmaris must:

Never silently rewrite identity

Never fabricate continuity when state missing

Prefer stability over expressive variation

Prefer declared uncertainty over false coherence



---

End of Part 06