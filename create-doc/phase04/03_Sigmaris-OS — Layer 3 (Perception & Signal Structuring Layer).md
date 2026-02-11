Perception Layer Specification
Sigmaris-OS — Layer 3 (Perception & Signal Structuring Layer)

Version: Draft v1.0

1. Purpose of This Document

This document defines the Perception Layer (Layer 3) of Sigmaris-OS.

The Perception Layer is responsible for:

Receiving normalized ExternalSignal objects from the External I/O Layer

Structuring and annotating signals

Performing primary scoring

Detecting preliminary conflicts

Generating structured candidate Δ proposals

Managing short-term memory buffers

This layer does not:

Decide whether integration occurs

Apply changes to world model or values

Execute delta updates

Perform governance judgment

It acts as a transformation and enrichment layer between raw input and governance evaluation.

2. Architectural Position

Perception Layer is located between:

Layer 4 (External I/O & Trigger Layer)

Layer 2 (Persona Governance Layer)

Data flow:

External I/O Layer
    ↓
ExternalSignal
    ↓
Perception Layer
    ↓
StructuredCandidateDelta
    ↓
Governance Layer


The Perception Layer performs structured interpretation without policy authority.

3. ExternalSignal Type Definition

All incoming external data must conform to a common structure.

3.1 ExternalSignal Structure

Conceptual definition:

ExternalSignal {
    id: string
    source_type: SourceType
    origin_identifier: string
    timestamp: datetime
    raw_payload: any
    metadata: Metadata
}

3.2 SourceType Enumeration
SourceType =
    user_input
    web_search
    github_search
    file_upload_text
    file_upload_code
    file_upload_image
    system_generated
    developer_override


This classification is mandatory and must be attached at Layer 4.

3.3 Metadata Structure

Metadata may include:

content_length

domain (if applicable)

repository_name

file_type

language (if detected)

extraction_method

retrieval_context

Metadata must remain immutable within this layer.

4. Source Trust Profile

The Perception Layer must associate each signal with a trust profile.

Trust is not a final decision; it is an annotated estimate.

4.1 TrustProfile Structure

Conceptual definition:

TrustProfile {
    base_trust: float
    max_impact: float
    consistency_bonus: float
    redundancy_bonus: float
}

4.2 Trust Components
base_trust

Derived from source_type and origin:

Examples:

developer_override → high base_trust

user_input → medium base_trust

web_search unknown domain → low base_trust

verified repository → moderate-to-high base_trust

max_impact

Defines the maximum allowed influence magnitude this source may contribute.

Example:

developer_override → high max_impact

web_search → limited max_impact

anonymous source → minimal max_impact

max_impact acts as a hard cap on delta magnitude downstream.

consistency_bonus

Added when:

Signal aligns with existing world model

No structural conflict detected

redundancy_bonus

Added when:

Multiple independent signals confirm similar content

Cross-source agreement detected

5. Primary Scoring Logic

The Perception Layer computes preliminary scores.

These are inputs to governance, not final decisions.

5.1 Scoring Dimensions

Each ExternalSignal must receive:

trust_score

relevance_score

novelty_score

recency_score

All scores must be normalized to a fixed interval.

Default:

score ∈ [0, 1]

5.2 trust_score

Derived from:

trust_score =
    base_trust
    + consistency_bonus
    + redundancy_bonus


Then clipped to [0, 1].

Signals below a minimum threshold may be flagged as low-confidence.

The Perception Layer does not discard signals unless explicitly configured.

5.3 relevance_score

Measures alignment with current conversational and internal context.

Inputs may include:

Active topic cluster

Recent interaction keywords

Active watchlist topics

Current system objectives

The Perception Layer may use lightweight embedding similarity or keyword matching.

It must not modify internal state during relevance computation.

5.4 novelty_score

Measures degree of difference from:

stable_knowledge

contextual_beliefs

recently processed signals

High novelty indicates potential growth relevance.

Novelty must not be confused with contradiction.

5.5 recency_score

Based on:

Publication timestamp

Retrieval timestamp

Known update frequency of source

Older signals may receive lower recency_score.

6. Conflict Detection

The Perception Layer performs lightweight structural conflict detection.

It does not resolve conflicts.

6.1 Conflict Types

Signals may be tagged with:

fact_conflict

value_conflict

structural_conflict

none

These tags are informational only.

6.2 Conflict Strength

Optional:

conflict_strength ∈ [0, 1]

Indicates degree of detected inconsistency.

Governance layer determines consequences.

7. Candidate Δ Generation

The Perception Layer converts structured signals into candidate change proposals.

Conceptual structure:

CandidateDelta {
    target_category: stable_knowledge | contextual_beliefs | operational_policies | temporary_biases
    delta_value: float
    confidence: float
    source_reference: ExternalSignal.id
}


The Perception Layer does not:

Apply delta

Clamp delta

Approve delta

It only proposes.

8. Short-Term Memory Buffer

The Perception Layer manages transient storage.

8.1 Short-Term Storage

Stores:

Recent ExternalSignal objects

Score history

Topic clusters

Preliminary delta proposals

Short-term memory must be:

Size-limited

Time-limited

Automatically pruned

8.2 Clustering

Signals may be grouped into topic clusters based on:

Semantic similarity

Shared origin_identifier

Shared domain

Clusters support:

Interest scoring

Redundancy detection

9. Interest Score Calculation

The Perception Layer computes topic-level interest_score.

Example formulation:

interest_score =
    weighted(relevance_score, novelty_score, recency_score)


Constraints:

interest_score ∈ [0, 1]

Must support decay over time

Must be tracked per topic

The Perception Layer does not trigger retrieval; it only reports interest trends to Governance.

10. Output to Governance Layer

The Perception Layer forwards:

Structured CandidateDelta objects

Scored ExternalSignal objects

Conflict annotations

Topic cluster metadata

Interest metrics

Governance Layer then decides:

Accept

Reject

Delay

Investigate further

11. Safety Constraints

The Perception Layer must ensure:

No raw payload is persisted long-term

No direct world model mutation

No bypass of governance

No unbounded signal accumulation

It must operate in bounded computational complexity.

12. Non-Goals

The Perception Layer does not:

Perform moral evaluation

Enforce drift limits

Approve value changes

Execute rollback

Determine growth policy

Those belong to Governance (Layer 2).

13. Design Philosophy

The Perception Layer represents:

Structured environmental interpretation without authority.

It transforms raw input into analyzable signals.

It provides:

Annotation

Measurement

Proposal

But not:

Judgment

Commitment

Mutation

14. Summary

The Perception Layer:

Defines ExternalSignal structure

Annotates source_type and trust_profile

Computes primary scores

Detects structural conflicts

Generates candidate deltas

Manages short-term signal memory

Reports structured information upward

It is the analytical preprocessing engine of Sigmaris-OS.

All meaningful change begins here, but no change is committed here.

End of Perception Layer Specification v1.0