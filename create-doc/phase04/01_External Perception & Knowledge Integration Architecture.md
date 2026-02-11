Project Specification
External Perception & Knowledge Integration Architecture
(Sigmaris-OS × Touhou-Talk-UI Foundation Document)

Version: Draft v1.0 — Architecture Overview

1. Purpose of This Document

This document defines the architectural foundation for integrating:

Web-based information retrieval

GitHub repository exploration

File parsing (text, code, image)

into the Sigmaris Persona OS and Touhou-Talk-UI ecosystem.

The goal is not to add “search capability” as a feature, but to define a controlled, OS-level external perception and knowledge integration subsystem.

This specification establishes:

Layered architecture boundaries

Responsibility separation between systems

Data flow model

Safety and integrity principles

Explicit non-goals

This document does not define implementation details. It defines architectural structure and invariants.

2. System Overview

The system consists of two primary runtime domains:

sigmaris-os
→ Persona Operating System (core cognition and growth engine)

touhou-talk-ui
→ Interaction layer and user-facing interface

External knowledge integration must preserve:

Identity Continuity

Controlled Value Drift

Trait Stability

Kernel Integrity

All external information must pass through defined governance layers before influencing internal state.

3. Layered Architecture Model

The architecture follows a strict four-layer model within sigmaris-os.

Layer 1 — Core Identity & Value Kernel

This is the protected core of the Persona OS.

Responsibilities:

Store world model state

Store value and trait state

Execute delta updates

Maintain snapshots

Execute rollback operations

Properties:

Does not make policy decisions

Does not evaluate semantic meaning

Performs structural validation only (type/range checks)

Accepts change requests from Layer 2 only

Example Interface:

apply_delta(delta_request)
snapshot_state()
rollback_to(snapshot_id)


This layer behaves like a kernel: safe, deterministic, and non-deliberative.

Layer 2 — Persona Governance Layer

This layer is the decision-making authority.

Responsibilities:

Evaluate whether external signals may influence the system

Determine delta magnitude

Enforce drift limits

Detect abnormal drift

Trigger rollback if necessary

Maintain growth policy

Manage thresholds and weights

This layer translates perception into controlled internal evolution.

Layer 2 never directly modifies memory; it instructs Layer 1.

Layer 3 — Perception & Memory Processing Layer

This layer transforms raw external input into structured internal candidates.

Responsibilities:

Normalize external signals

Assign metadata (source_type, trust_profile, timestamps)

Compute primary scores (trust, relevance, novelty, recency)

Detect conflicts

Manage short-term memory buffer

Compute interest scores

Cluster topics

Output of this layer:

→ Candidate Δ (change proposals)
→ Structured signals suitable for governance review

Layer 3 does not approve integration.

Layer 4 — I/O & Trigger Layer

This is the outermost boundary of sigmaris-os.

Responsibilities:

Web search API calls

GitHub repository search

File parsing (text, markdown, source code)

Image parsing (OCR, metadata extraction)

Trigger mode evaluation

Cooldown enforcement

This layer does not interpret meaning.
It collects and forwards structured signals to Layer 3.

4. Separation of Responsibilities
sigmaris-os vs touhou-talk-ui
sigmaris-os

Role:

Cognitive engine

Growth control system

World model integrator

Value and trait stability manager

External perception processor

It must:

Remain deterministic under defined constraints

Never allow UI-driven direct state mutation

Never allow raw external data to bypass governance

It exposes controlled APIs to the UI layer.

touhou-talk-ui

Role:

Interaction interface

User message handling

File upload handling

Image upload handling

Channel routing (talk / vscode / others)

Display of responses and metadata

touhou-talk-ui:

Does not modify world model

Does not alter values or traits

Does not apply deltas

Sends structured input requests to sigmaris-os

Receives structured outputs and meta-information

UI may request:

Mode A (explicit retrieval)

File analysis

GitHub exploration

But final interpretation occurs inside sigmaris-os.

5. Data Flow Model

Below is the canonical data flow.

User Input / File / Image / Web Trigger
        ↓
Touhou-Talk-UI
        ↓
Sigmaris-OS Layer 4 (I/O & Trigger)
        ↓
Layer 3 (Perception & Scoring)
        ↓
Layer 2 (Governance Decision)
        ↓
Layer 1 (Kernel Execution)
        ↓
Updated Internal State
        ↓
Response Generation
        ↓
UI Rendering


Important invariants:

No direct external data reaches Layer 1.

All integration passes through governance.

All state changes are snapshot-capable.

6. External Signal Lifecycle

Every external signal must contain:

source_type

source_trust_profile

timestamp

origin_identifier

Signals are:

Filtered (noise removal)

Scored

Classified

Converted into candidate Δ

Evaluated by governance

Accepted or rejected

Rejected signals do not alter internal state.

7. Growth Philosophy

This architecture supports:

Controlled development

Structured environmental awareness

Drift-limited adaptation

Auditable evolution

It does not attempt:

Self-retraining

Autonomous worldview rewriting

Core value mutation without governance

The system evolves through bounded delta updates, not through uncontrolled absorption.

8. Non-Goals

The following are explicitly excluded:

Unlimited continuous web crawling

Raw external content injection into responses

Automatic modification of core identity

LLM weight retraining

Persistent raw conversation logging for memory emulation

Unbounded drift across time

External observation must be:

Intent-driven

Bounded

Policy-governed

9. Design Positioning

This architecture does not modify the intelligence of the underlying LLM.

Instead, it defines:

How the system interacts with the external world

How it changes

How change is controlled

How integrity is preserved

It transforms a static persona layer into:

A Developmental, Environment-Integrated Persona Operating System.

The LLM remains a probabilistic reasoning engine.
Sigmaris-OS becomes the structured cognitive governance layer around it.

10. Summary

This architecture establishes:

Strict layer separation

Kernel safety

Governance-based growth

External perception as structured input

UI isolation from internal mutation

Controlled, auditable development

This document serves as the architectural base for all subsequent subsystem specifications.

End of Architecture Overview Specification v1.0