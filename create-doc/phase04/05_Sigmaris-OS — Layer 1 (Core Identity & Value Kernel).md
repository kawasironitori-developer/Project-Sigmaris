了解。
以下は Codex にそのまま渡せる Kernel Layer 仕様書（Full English Specification）。

Kernel Layer Specification
Sigmaris-OS — Layer 1 (Core Identity & Value Kernel)

Version: Draft v1.0 — Kernel-Safe Edition

1. Purpose of This Document

This document defines the Kernel Layer (Layer 1) of Sigmaris-OS.

The Kernel Layer is the lowest and most protected layer in the architecture.

Its purpose is to:

Safely store internal system state

Execute approved delta updates

Create deterministic state snapshots

Perform rollback operations

Enforce structural validation

It must not:

Perform policy decisions

Evaluate semantic correctness

Interpret meaning

Initiate growth

Trigger external retrieval

The Kernel Layer is purely deterministic and reactive.

2. Architectural Position

Kernel Layer is located beneath Governance Layer.

Data flow:

Governance Layer
    ↓
ApprovedDelta / RollbackInstruction
    ↓
Kernel Layer
    ↓
Updated Internal State


Only Governance may issue commands to Kernel.

The Kernel does not initiate actions independently.

3. Core Responsibilities

The Kernel must:

Maintain world model state

Maintain value and trait state

Apply delta updates

Enforce structural validation

Maintain snapshot history

Perform rollback deterministically

Preserve identity continuity

4. Internal State Structure

The Kernel maintains structured internal state categories.

Example conceptual structure:

KernelState {
    stable_knowledge
    contextual_beliefs
    core_values
    operational_policies
    temporary_biases
}


All modifications occur through controlled delta application.

Direct mutation is prohibited.

5. apply_delta()
5.1 Purpose

apply_delta() executes approved changes provided by Governance.

It does not evaluate whether a change should occur.

It only verifies structural validity and applies it safely.

5.2 Interface

Conceptual interface:

apply_delta(delta_request) -> ApplyResult

5.3 delta_request Structure
delta_request {
    target_category
    key
    delta_value
    operation_type
    source_reference
}


operation_type may include:

increment

decrement

replace

add_entry

remove_entry

5.4 Validation Rules

Before applying a delta, Kernel must validate:

target_category exists

key exists (if required)

delta_value type correctness

range constraints

no structural corruption

no violation of immutable constraints

Validation is strictly structural, not semantic.

If validation fails:

ApplyResult = REJECTED_VALIDATION_ERROR


No partial application is allowed.

5.5 Atomic Execution

apply_delta must:

Execute atomically

Ensure consistency after update

Prevent partial state mutation

Transaction model:

Begin

Validate

Apply

Commit

Return result

6. snapshot()
6.1 Purpose

snapshot() captures the full deterministic state of the Kernel.

Snapshots are used for:

Rollback safety

Audit trails

Core value protection

Drift recovery

6.2 Interface
snapshot() -> snapshot_id

6.3 Snapshot Requirements

Snapshot must:

Capture all KernelState categories

Include timestamp

Include version identifier

Be immutable once created

Snapshots must be lightweight and structured.

Raw external data must not be included.

6.4 Snapshot Storage Policy

Maximum snapshot count configurable

Old snapshots pruned according to policy

Core value modifications require immediate snapshot

Snapshots must not grow unbounded.

7. rollback()
7.1 Purpose

rollback() restores Kernel state to a previous snapshot.

Rollback is only triggered by Governance.

7.2 Interface
rollback(snapshot_id) -> RollbackResult

7.3 Rollback Requirements

Rollback must:

Restore entire KernelState

Be deterministic

Reset derived metrics

Clear transient mutation flags

Log rollback event

Rollback must not partially restore state.

7.4 Safety Rules

Rollback cannot:

Delete snapshot history beyond configured limits

Modify snapshots themselves

Introduce new deltas

Rollback only restores previously captured state.

8. Validation-Only Principle

The Kernel operates under the “validation-only” rule.

It may:

Check types

Check ranges

Enforce immutability flags

Enforce structural constraints

It may not:

Judge whether delta is reasonable

Interpret trust scores

Interpret relevance

Evaluate alignment

Override governance

The Kernel is structurally aware, not cognitively aware.

9. Immutability Constraints

Certain categories may be marked as:

immutable

restricted

protected

Example:

core_values default state = protected

Protected fields may only be modified if:

Explicit authorization flag present

Snapshot created prior to modification

Validation passes extended checks

Kernel enforces immutability flags strictly.

10. Integrity Guarantees

Kernel must guarantee:

No silent mutation

No external bypass

No uncontrolled drift

Deterministic behavior

Replayability from snapshot history

Given identical sequence of approved deltas, Kernel must produce identical state.

11. Error Handling

Kernel errors include:

VALIDATION_ERROR

IMMUTABLE_FIELD_ERROR

RANGE_VIOLATION

SNAPSHOT_NOT_FOUND

TRANSACTION_FAILURE

All errors must be structured and returned upward.

Kernel must never crash the system due to invalid delta input.

12. Performance Constraints

Kernel must:

Operate in bounded time per delta

Avoid heavy computation

Avoid network calls

Avoid dependency on external systems

It must be self-contained and deterministic.

13. Non-Goals

The Kernel does not:

Retrieve external data

Score signals

Manage interest

Decide growth

Trigger search

Perform semantic parsing

Store raw documents

Execute LLM reasoning

It is not intelligent.
It is safe.

14. Design Philosophy

The Kernel represents:

Identity stability and deterministic memory control.

It is analogous to:

An operating system kernel

A transaction-safe state machine

A protected identity store

It enables change.

It does not decide change.

15. Summary

The Kernel Layer:

Stores structured internal state

Applies approved deltas via apply_delta()

Creates snapshots via snapshot()

Restores state via rollback()

Enforces validation-only constraints

Protects immutable core identity

Guarantees deterministic behavior

It is the foundational stability layer of Sigmaris-OS.

All change must be authorized above it.
All mutation must be executed through it.
Nothing bypasses it.

End of Kernel Layer Specification v1.0