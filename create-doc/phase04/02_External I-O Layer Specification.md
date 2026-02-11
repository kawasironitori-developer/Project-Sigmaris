External I/O Layer Specification
Sigmaris-OS — Layer 4 (I/O & Trigger Layer)

Version: Draft v1.0

1. Purpose of This Document

This document defines the External I/O Layer of Sigmaris-OS.

The External I/O Layer is responsible for:

Controlled interaction with external information sources

Web search operations

GitHub repository exploration

Trigger mode management

Cooldown enforcement

Safe signal forwarding to the Perception Layer

This layer does not:

Interpret semantic meaning

Modify world model state

Apply value or trait changes

Make governance decisions

It acts strictly as a boundary controller and structured data provider.

2. Architectural Position

External I/O Layer corresponds to:

Layer 4 in the Sigmaris-OS layered architecture.

It sits between:

Touhou-Talk-UI (external interaction surface)

Perception & Memory Processing Layer (Layer 3)

Data flow:

UI / System Trigger
    ↓
External I/O Layer
    ↓
Structured ExternalSignal
    ↓
Layer 3 (Perception)

3. Design Principles

The External I/O Layer must satisfy:

Deterministic behavior

Rate-limited external access

Mode-based activation control

Structured output format

No internal state mutation

All external responses must be normalized into a common ExternalSignal format.

4. Web Search API — Abstract Interface
4.1 Objective

Provide a controlled interface for performing web-based information retrieval.

The implementation may use:

Official search APIs

Internal proxy search engines

Custom indexing services

The interface must remain implementation-agnostic.

4.2 Abstract Interface Definition

Example conceptual interface:

interface WebSearchProvider {
    search(query: string, options: SearchOptions): WebSearchResult[]
}

SearchOptions may include:

max_results

language

recency_filter

safe_search_level

domain_restriction

4.3 WebSearchResult Structure

Every result must contain:

title

snippet

url

domain

timestamp (if available)

source_type = "web_search"

raw_content (optional, truncated)

metadata

Raw content must be truncated to a configurable size limit.

The I/O layer must not store full documents permanently.

4.4 Error Handling

The WebSearchProvider must:

Handle timeouts

Handle rate limits

Return structured error states

Avoid propagating raw API errors to upper layers

All failures must be returned as structured failure objects.

5. GitHub Search API — Abstract Interface
5.1 Objective

Provide structured repository and code search capability.

The interface must support:

Repository search

File search

Code search

Metadata extraction

5.2 Abstract Interface Definition

Conceptual interface:

interface GitHubSearchProvider {
    searchRepositories(query: string, options: RepoSearchOptions): RepositoryResult[]
    searchCode(query: string, options: CodeSearchOptions): CodeResult[]
}

5.3 RepositoryResult Structure

Each repository result must include:

name

owner

description

stars

language

last_updated

repository_url

source_type = "github_search"

Optional:

README excerpt (truncated)

file tree summary (limited depth)

5.4 CodeResult Structure

Each code result must include:

file_path

repository

language

snippet (truncated)

repository_url

source_type = "github_search"

The I/O layer must not perform semantic code analysis.

It only retrieves and formats.

6. Trigger Mode Management

The External I/O Layer must support four trigger modes:

Mode A — Explicit User Request

Characteristics:

Triggered directly by user instruction

Highest priority

May bypass cooldown under strict limits

Intended for integrity-critical retrieval

Example:

User explicitly requests web or GitHub lookup.

Mode B — Growth-Oriented Retrieval

Characteristics:

Triggered by Governance Layer

Used to validate or expand world model knowledge

Lower priority than Mode A

Subject to cooldown

Mode C — Interest-Based Autonomous Retrieval

Characteristics:

Triggered by sustained high interest_score

Exploratory behavior

Strictly cooldown-controlled

Can be suppressed by overfocus_flag

Mode D — Watchlist Maintenance

Characteristics:

Low-priority monitoring

Used for tracking specific repositories or topics

Executed only when system load allows

7. Mode Priority Rules

If multiple trigger conditions are satisfied in the same evaluation cycle:

Priority order:

Mode A > Mode B > Mode C > Mode D


Rules:

Only one mode may execute per cycle

Lower-priority modes are deferred to next cycle

Mode A may preempt all others

The I/O Layer must not execute multiple modes concurrently unless explicitly configured.

8. Cooldown Control

Cooldown prevents excessive external access.

8.1 Cooldown Scope

Two possible scopes:

per_mode

global

Default configuration:

cooldown_scope = global


Meaning:

After any external operation, all modes enter cooldown.

8.2 Cooldown Parameters

Cooldown configuration must include:

cooldown_duration

max_requests_per_window

max_parallel_requests

Cooldown must be enforced before initiating external calls.

8.3 Cooldown Override

Mode A may override cooldown only if:

Integrity-critical

Explicitly requested

Within absolute hard rate limit

No other mode may bypass cooldown.

9. Output Format to Perception Layer

All results must be normalized into a common structure:

ExternalSignal {
    source_type
    origin_identifier
    timestamp
    raw_payload
    metadata
}


The I/O Layer must not:

Score signals

Classify conflicts

Evaluate trust

Convert to delta candidates

It forwards structured signals only.

10. Safety Constraints

The External I/O Layer must enforce:

Domain blacklists

Maximum content length

Rate limiting

Input sanitization

File size limits

API key isolation

It must prevent:

Unbounded crawling

Recursive search loops

External-trigger amplification

11. Non-Goals

This layer does not:

Modify world model

Perform semantic integration

Evaluate value alignment

Decide on growth

Store long-term knowledge

Analyze AST semantics (belongs to parsing subsystem)

It only collects and forwards.

12. Design Philosophy

The External I/O Layer represents:

Controlled environmental sensing, not open internet absorption.

It behaves like a regulated sensor array:

It can observe.

It cannot decide.

It cannot change internal state.

Decision authority belongs strictly to Governance Layer (Layer 2).

13. Summary

The External I/O Layer:

Abstracts Web and GitHub retrieval

Enforces trigger discipline

Enforces cooldown control

Normalizes external signals

Prevents uncontrolled ingestion

Maintains strict architectural boundaries

This specification defines the external boundary of Sigmaris-OS.

It ensures that all external knowledge integration remains policy-governed, rate-limited, and structurally safe.

End of External I/O Layer Specification v1.0