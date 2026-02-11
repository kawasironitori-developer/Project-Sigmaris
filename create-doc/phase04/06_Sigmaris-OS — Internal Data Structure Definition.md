World Model & Value Model Specification
Sigmaris-OS — Internal Data Structure Definition

Version: Draft v1.0

1. Purpose of This Document

This document defines the internal data model of Sigmaris-OS.

It specifies:

World Model structure

Value Model structure

Trait structure

Category boundaries

Delta application rules

Drift constraints per category

This document defines what exists inside the Kernel Layer and how change is categorized.

It does not define governance policy logic.
It defines internal state topology.

2. Architectural Context

The World Model & Value Model reside entirely within:

Layer 1 — Kernel Layer

All modifications are executed through apply_delta().

The Governance Layer decides whether change occurs.
The Kernel executes how change is applied.

3. Internal State Categories

The internal state is divided into five primary categories:

KernelState {
stable_knowledge
contextual_beliefs
core_values
operational_policies
temporary_biases
}

Each category has different stability properties and delta constraints.

4. stable_knowledge
   4.1 Definition

stable_knowledge contains highly stable, low-volatility knowledge.

Examples:

Mathematical facts

System invariants

Architectural rules

Agreed protocol definitions

It represents knowledge that should not fluctuate frequently.

4.2 Properties

Low drift tolerance

High validation requirement

Rarely updated

High audit importance

4.3 Data Structure Example
stable_knowledge {
key: {
value: any,
confidence: float,
last_updated: datetime
}
}

4.4 Delta Constraints

Very small delta magnitude

High trust_score required

Conflict tolerance near zero

Snapshot required for structural modification

5. contextual_beliefs
   5.1 Definition

contextual_beliefs represent situation-dependent or environment-specific knowledge.

Examples:

Current project assumptions

Temporary architectural decisions

Observed user preferences

Working hypotheses

This category is moderately flexible.

5.2 Properties

Medium drift tolerance

May expire

Updated more frequently than stable_knowledge

5.3 Data Structure Example
contextual_beliefs {
key: {
value: any,
confidence: float,
context_scope: string,
last_updated: datetime
}
}

5.4 Delta Constraints

Moderate delta allowed

Conflicts trigger re-evaluation

Expiry or decay possible

6. core_values
   6.1 Definition

core_values represent foundational identity constraints.

They define:

Ethical alignment

Structural invariants

High-level system priorities

Identity continuity anchors

These are highly protected.

6.2 Properties

Near-immutable

Extremely limited drift

Snapshot mandatory before modification

Require explicit authorization flag

6.3 Data Structure Example
core_values {
key: {
weight: float,
description: string,
protected: boolean
}
}

6.4 Delta Constraints

Delta magnitude extremely small

Changes rare

Must pass strict alignment checks

Always audited

May require multi-step confirmation

7. operational_policies
   7.1 Definition

operational_policies represent system behavior tuning parameters.

Examples:

Exploration tendency

Risk tolerance

Response verbosity bias

Retrieval aggressiveness

This category governs how the system behaves operationally.

7.2 Properties

Adjustable within bounds

Moderate-to-high flexibility

Constrained by core_values

7.3 Data Structure Example
operational_policies {
key: {
weight: float,
min: float,
max: float,
last_updated: datetime
}
}

7.4 Delta Constraints

Bounded within min/max

Subject to per-update and per-window limits

Clamped if exceeding boundaries

8. temporary_biases
   8.1 Definition

temporary_biases represent short-term tuning effects.

Examples:

Elevated focus on current topic

Session-specific adjustments

Experiment-driven shifts

This category absorbs rapid fluctuations safely.

8.2 Properties

High flexibility

Decays over time

May auto-reset

8.3 Data Structure Example
temporary_biases {
key: {
weight: float,
decay_rate: float,
expires_at: datetime
}
}

8.4 Delta Constraints

Higher delta tolerance

Automatic decay required

Cannot directly override core_values

9. Category Hierarchy & Influence Boundaries

Influence order:

core_values
↓ constrain
operational_policies
↓ guide
contextual_beliefs
↓ inform
temporary_biases

stable_knowledge exists orthogonally as structural reference knowledge.

Lower categories may not override higher ones.

10. Δ Application Rules

All modifications must follow structured delta rules.

10.1 Delta Structure
delta_request {
target_category
key
delta_value
operation_type
}

10.2 Category-Specific Rules
stable_knowledge

Replace or append only

High confidence required

Snapshot required for structural change

contextual_beliefs

Replace, increment, decrement allowed

Confidence adjusted

Expiry supported

core_values

Increment/decrement extremely restricted

Replace discouraged

Snapshot mandatory

Governance override required

operational_policies

Increment/decrement within bounds

Clamped if exceeding limits

temporary_biases

Free adjustment

Must include decay mechanism

11. Drift Constraints

Each category must define:

per_update_delta_limit

cumulative_delta_limit

per_time_window_limit

Example conceptual policy:

core_values: ±0.001 per update
operational_policies: ±0.01 per update
temporary_biases: ±0.05 per update

Exact values configurable by Governance.

Kernel enforces structural range limits.

Governance enforces policy magnitude limits.

12. Conflict Handling at Data Level

Conflicts are resolved in Governance, not Kernel.

Kernel only:

Accepts or rejects structurally valid deltas

Does not resolve semantic contradictions

Conflicting values may coexist temporarily in contextual_beliefs.

13. Snapshot & Recovery Implications

Any change to:

core_values

structural stable_knowledge

Requires snapshot creation.

Rollback restores entire state, not partial categories.

14. Expiration & Decay

Only the following may decay automatically:

contextual_beliefs

temporary_biases

stable_knowledge and core_values do not decay automatically.

15. Non-Goals

This data model does not:

Store raw external documents

Store full conversation logs

Replace LLM weights

Encode full human personality simulation

Implement emotional reasoning

It defines structured state containers.

16. Design Philosophy

The model is structured to:

Separate stability from flexibility

Prevent identity collapse

Allow bounded adaptation

Maintain auditability

Enable controlled development

It balances:

Stability ←→ Adaptation
Identity ←→ Environment
Structure ←→ Change

17. Summary

The World Model & Value Model define:

stable_knowledge (high stability)

contextual_beliefs (situational flexibility)

core_values (identity anchor)

operational_policies (behavior tuning)

temporary_biases (short-term modulation)

Delta rules ensure:

Controlled drift

Category-specific constraints

Snapshot-protected core identity

Deterministic state transitions

This structure forms the internal topology of Sigmaris-OS.

All growth must respect it.
