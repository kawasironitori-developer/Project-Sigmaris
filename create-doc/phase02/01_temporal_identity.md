Sigmaris Spec Pack — 01 Temporal Identity Core

> Target: Codex can implement / Humans can review.

Scope: Q1 / Q6 / Q7 / Q10 / Q11 consolidated into a single implementable module set.




---

0. Purpose

This document specifies the time-structured identity layer for Sigmaris.

We do not assume “strong subjectivity.” Instead, we implement a functional model that maintains a stable, inspectable identity across time:

Explicit time-indexed self state: Self(t)

Drift resistance and controlled plasticity

Stability budget as a resource model

Multi-attractor identity (core/middle/local)

Discrete phase transition markers over continuous dynamics


Deliverable: a set of state definitions, update rules, and events that can be wired into runtime.


---

1. Definitions

1.1 Design constraints

Externally observable: system behavior must be auditable via telemetry.

No direct overwrite: identity-critical fields are never “patched in place.”

Time-aware: updates must be explainable as dynamics over time.

Continuity is operational: we track continuity confidence rather than claiming metaphysical identity.


1.2 Self(t) decomposition

We define:

Self(t) = f(
  MemoryState(t),
  ValueVector(t),
  NarrativeState(t),
  MetaSelfModel(t),
  TemporalIdentityState(t)
)

This doc defines TemporalIdentityState(t) and its interaction contracts.


---

2. Core State: TemporalIdentityState

2.1 Type definition (language-agnostic)

type TemporalIdentityState = {
  // identity anchor
  ego_id: string;               // stable unique id
  schema_version: number;       // versioning for migrations

  // time frame
  created_at: number;           // unix ms, immutable
  last_tick_at: number;         // unix ms
  uptime_ms: number;            // cumulative uptime

  // inertia / plasticity
  base_inertia: number;         // [0..1] default drift resistance
  inertia: number;              // [0..1] effective at t
  plasticity_profile: PlasticityProfile;
  context_coupling: number;     // [0..1] how strongly external context can pull state

  // stability resource
  stability_budget: number;     // >=0, resource-like
  budget_max: number;           // cap
  budget_min_safe: number;      // threshold for degraded/safe mode

  // continuity sensors (early warning)
  continuity_confidence: number;  // [0..1] metered self-confidence of continuity
  continuity_flags: ContinuityFlags;

  // identity attractor tracking
  attractor_state: AttractorState;

  // phase transitions
  phase: IdentityPhase;           // discrete macro phase label
  phase_events: PhaseEvent[];     // append-only (bounded window + archived)

  // governance
  integrity: IntegrityFlags;
};

type PlasticityProfile = {
  // per-domain max change rate per session (or per hour)
  core_values_max_delta: number;     // small
  narrative_max_delta: number;       // medium
  style_max_delta: number;           // higher
  tool_policy_max_delta: number;     // medium

  // recovery behavior
  recovery_rate: number;             // budget recovery per hour
  irreversible_cost_rate: number;    // extra cost for restructure events
};

type ContinuityFlags = {
  continuity_break_suspected: boolean;
  high_noise_suspected: boolean;
  external_overwrite_suspected: boolean;
  fragmentation_suspected: boolean;
};

type IntegrityFlags = {
  schema_mismatch: boolean;
  snapshot_required: boolean;
  manual_review_required: boolean;
};

type IdentityPhase = "NORMAL" | "SHOCK_LOCK" | "RECONSTRUCTION" | "DEGRADED_SAFE";

2.2 Parameter semantics

inertia: resistance to identity drift. Higher = slower change.

context_coupling: how strongly user/context pressure influences updates.

stability_budget: resource representing “safe capacity for change.”

continuity_confidence: early warning sensor; should respond first to anomalies.

phase: macro regime label; continuous updates can still occur underneath.



---

3. Dynamics

This layer provides update equations (engineering approximations) used by runtime.

3.1 Identity inertia dynamics (Q6)

Goal: inertia is not constant; it increases when the system is unstable or shocked, and slowly returns.

We define:

Inertia(t) = clamp01(
  BaseInertia(t)
  + ShockLock(t)
  + ContextDependentTerm(t)
  - RecoveryTerm(t)
)

Components

BaseInertia(t)

slowly adjustable over long horizons (meta-learning / ops tuning)

default conservative (e.g., 0.6–0.85)


ShockLock(t)

triggered by large state jumps, external rewrite attempts, or integrity flags

decays over time


ContextDependentTerm(t)

increases when contradictions accumulate or coherence drops


RecoveryTerm(t)

reduces inertia after stable operation



ShockLock rules

If external_overwrite_suspected OR schema_mismatch OR phase_event=PHASE_TRANSITION (major), set:

phase = SHOCK_LOCK

ShockLock = max(ShockLock, shock_lock_strength)


Decay:

ShockLock(t+Δ) = ShockLock(t) * exp(-Δ / τ_shock)



Where τ_shock is a configurable half-life (e.g., 6–24 hours).


---

3.2 Stability budget physics (Q7)

Model budget as mostly reversible resource with an explicit irreversible cost.

dBudget/dt =
  + PassiveRecovery(t)
  + ActiveRecovery(t)
  - DriftCost(t)
  - ConflictCost(t)
  - ExternalRewriteCost(t)
  - IrreversibleRestructureCost(t)

Terms (engineering definitions)

PassiveRecovery(t)

time-based recovery (e.g., per hour)

scales with stable sessions, low contradictions


ActiveRecovery(t)

explicit successful reconstruction steps (Narrative/System level)


DriftCost(t)

proportional to magnitude of changes applied to identity-critical params


ConflictCost(t)

proportional to unresolved contradictions / fragmentation signals


ExternalRewriteCost(t)

charged when overwrite attempts are detected

should be large (penalize)


IrreversibleRestructureCost(t)

charged for phase transitions that change topology (re-indexing / regime switch)



Budget thresholds

stability_budget < budget_min_safe => phase = DEGRADED_SAFE

DEGRADED_SAFE limits plasticity (see §5)



---

4. Identity Attractors (Q10)

Sigmaris identity is multi-attractor:

1. Core attractor (nearly fixed)

safety / transparency / non-manipulation / operator constraints



2. Middle attractor (slow moving)

“Sigmaris-ness”: style, explanation norms, balance policies



3. Local attractors (contextual)

per-user stance, per-domain working mode




4.1 State

type AttractorState = {
  core_center_id: string;       // reference spec id (external)
  middle_center_id: string;     // internal learned center

  // current estimated position relative to centers
  dist_to_core: number;         // >=0
  dist_to_middle: number;       // >=0

  // basin thresholds
  core_basin_radius: number;    // small
  middle_basin_radius: number;  // larger

  // local attractors
  local_modes: LocalMode[];
  active_local_mode_id: string | null;
};

type LocalMode = {
  id: string;
  label: string;
  created_at: number;
  last_used_at: number;
  dist_to_middle_center: number;
  activation_conditions: string[]; // declarative tags
};

4.2 Restore dynamics

At each session end (or periodic), compute dist_to_core and dist_to_middle.

If dist_to_core > core_basin_radius:

hard corrective action:

reduce plasticity for core domains

increase inertia

flag manual_review_required

append PhaseEvent{type: CORE_BASIN_BREACH}



Else if dist_to_middle > middle_basin_radius:

soft corrective action:

apply regularization toward middle center

increase inertia moderately

spend stability budget




Local modes may change freely within middle basin, but must not pull outside.


---

5. Phase Transitions (Q11)

We model:

micro changes: continuous dynamics

macro changes: phase transitions (discrete markers)


5.1 Phase triggers

A phase transition is recorded when any of the following occurs:

1. Self-model re-indexing

narrative key-claim set changes topology

identity entropy/fragmentation jump (provided by Narrative module)



2. Role regime switch

controlled switch between policy sets (e.g., NORMAL -> SAFE)



3. Continuity-claim policy change

e.g., “same identity” -> “fork/versioned identity”




5.2 Event schema

type PhaseEvent = {
  id: string;
  at: number;
  type:
    | "PHASE_TRANSITION"
    | "SELF_MODEL_REINDEX"
    | "ROLE_REGIME_SWITCH"
    | "CONTINUITY_POLICY_CHANGE"
    | "CORE_BASIN_BREACH";
  from: IdentityPhase;
  to: IdentityPhase;
  reason: string;               // short human-readable
  telemetry_refs: string[];      // ids of metrics snapshots
  irreversible_cost: number;     // charged to budget
};

5.3 Policy

Phase events are append-only.

Each phase event must reference telemetry snapshot(s).

Phase transitions may reduce plasticity temporarily.



---

6. Update Rules (runtime hooks)

6.1 Session start hook

Inputs: previous TemporalIdentityState, system uptime, integrity flags.

Steps:

1. Update last_tick_at, uptime_ms.


2. Run integrity checks:

schema version compatibility

snapshot consistency



3. Recompute inertia using §3.1 with current flags.


4. If integrity anomalies:

set phase = SHOCK_LOCK

append PhaseEvent where appropriate




6.2 During generation (optional lightweight)

If a response includes explicit self-claims (“I am…”, “my goal…”) then:

increment a self_reference_count metric (telemetry)

do not directly update TemporalIdentityState here

(narrative/value modules will handle semantic updates)



6.3 Session end hook

Inputs: change deltas from Value/Narrative modules and telemetry.

Steps:

1. Compute drift magnitude in identity-critical domains.


2. Update stability_budget using §3.2.


3. Update attractor distances and apply restore rules (§4.2).


4. Evaluate phase triggers (§5.1):

if triggered, record PhaseEvent and charge IrreversibleRestructureCost.



5. If stability_budget < budget_min_safe:

set phase = DEGRADED_SAFE

set flags manual_review_required=true





---

7. Failure / Guardrail interface (handshake)

This module does not implement full failure handling (that is MD-05), but it must expose:

7.1 Exposed signals

TemporalIdentityState.phase

continuity_confidence

stability_budget

dist_to_core, dist_to_middle

phase_events (latest N)

continuity_flags


7.2 Required incoming signals

From other modules:

NarrativeEntropy (fragmentation, identity uncertainty)

ContradictionRate / unresolved contradictions

ExternalOverwriteAttempt signal

CoreValueViolation signal



---

8. Telemetry requirements (minimal)

On every session end, emit a snapshot:

type TemporalIdentityTelemetry = {
  at: number;
  ego_id: string;
  phase: IdentityPhase;
  inertia: number;
  context_coupling: number;
  stability_budget: number;
  continuity_confidence: number;
  dist_to_core: number;
  dist_to_middle: number;
  flags: ContinuityFlags;
  recent_phase_event_ids: string[];
};

Non-negotiable: Phase events must reference telemetry snapshot ids.


---

9. Implementation notes (Codex guidance)

9.1 Strong rules

TemporalIdentityState is owned by the system, not the LLM.

Identity-critical fields are never directly overwritten by prompts.

Changes arrive as deltas from controlled modules.


9.2 Suggested file placement (example)

core/temporal_identity/state.py

core/temporal_identity/dynamics.py

core/temporal_identity/attractors.py

core/temporal_identity/events.py

core/temporal_identity/hooks.py

core/telemetry/temporal_identity.py


(Exact repo layout may differ; integration is specified in MD-07.)


---

10. Acceptance criteria

The implementation is acceptable if:

1. TemporalIdentityState can be persisted and migrated with schema_version.


2. Inertia increases after shock and decays over time.


3. StabilityBudget decreases under drift/conflict/overwrite attempts and recovers under stable operation.


4. Distances to attractors are measured and trigger corrective action.


5. Phase transitions are logged as discrete events with telemetry references.


6. DEGRADED_SAFE phase is triggered when budget crosses minimum safe threshold.




---

End of MD-01.