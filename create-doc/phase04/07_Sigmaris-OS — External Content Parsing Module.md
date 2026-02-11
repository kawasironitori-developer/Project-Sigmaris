File Parsing Subsystem Specification
Sigmaris-OS — External Content Parsing Module

Version: Draft v1.0

1. Purpose of This Document

This document defines the File Parsing Subsystem of Sigmaris-OS.

The File Parsing Subsystem is responsible for:

Extracting structured content from uploaded or retrieved files

Detecting file type and language

Performing syntax-aware analysis for code files

Converting parsed results into normalized content representations

Forwarding structured results to the External I/O Layer

This subsystem does not:

Modify internal world model

Apply deltas

Perform governance decisions

Persist raw files long-term

Execute external code

It operates strictly as a content extraction and structuring module.

2. Architectural Position

The File Parsing Subsystem operates inside:

Layer 4 — External I/O & Trigger Layer

Data flow:

File Upload / GitHub Retrieval
    ↓
File Parsing Subsystem
    ↓
Normalized ParsedContent
    ↓
ExternalSignal
    ↓
Perception Layer


It transforms files into structured content suitable for Perception processing.

3. Design Principles

The subsystem must:

Be deterministic

Be format-aware

Be size-limited

Avoid executing untrusted code

Avoid storing raw file data

Provide structured, summarized output

It must not:

Interpret meaning semantically

Generate value deltas

Score trust or relevance

4. Supported File Types

The subsystem must support:

Plain text files (.txt)

Markdown files (.md)

Source code files (.js, .ts, .py, .java, etc.)

PDF documents (.pdf)

Additional formats may be added modularly.

5. Text Extraction
5.1 Scope

Applies to:

.txt files

Plain extracted text streams

Text-only content from other sources

5.2 Processing Steps

Encoding detection

Normalization (UTF-8 preferred)

Line segmentation

Token count estimation

Size limitation enforcement

5.3 Output Structure
ParsedTextContent {
    file_type: "text"
    content_summary: string
    raw_excerpt: string (truncated)
    token_estimate: int
    metadata
}


content_summary may be:

First N lines

Paragraph-based extraction

Keyword-highlighted segments

Raw content must be truncated to configurable limit.

6. Markdown Parsing
6.1 Scope

Applies to:

.md files

README files

Documentation content

6.2 Parsing Objectives

Extract headings hierarchy

Extract code blocks

Extract links

Extract plain text segments

Preserve document structure outline

6.3 Processing Steps

Parse Markdown into AST-like structure

Identify:

headings

paragraphs

lists

code blocks

blockquotes

Generate structured outline

6.4 Output Structure
ParsedMarkdownContent {
    file_type: "markdown"
    headings: [ { level, title } ]
    sections: [ { heading_ref, text_excerpt } ]
    code_blocks: [ { language, snippet } ]
    link_count: int
    metadata
}


Markdown must not be rendered into HTML for analysis purposes.

7. Code Parsing (AST & Language Detection)
7.1 Objectives

Detect programming language

Parse source code structure

Extract structural components

Avoid executing code

7.2 Language Detection

Language detection may use:

File extension

Shebang

Heuristic token analysis

Output:

detected_language: string
confidence: float

7.3 AST Parsing

Where supported, code should be parsed into Abstract Syntax Tree (AST).

Extractable structural elements include:

Imports

Functions

Classes

Methods

Variable declarations

Export statements

7.4 Code Structure Extraction

The subsystem should produce:

ParsedCodeContent {
    file_type: "code"
    language
    imports: [...]
    functions: [...]
    classes: [...]
    exports: [...]
    complexity_estimate: float
    snippet_preview: string
}


complexity_estimate may be based on:

Function count

Nesting depth

Line count

7.5 Safety Constraints

The subsystem must:

Never execute code

Never evaluate runtime expressions

Never follow import chains recursively without limits

Avoid dependency resolution loops

8. PDF Extraction
8.1 Scope

Applies to:

.pdf documents

Text-based PDFs only (image-based require OCR in separate subsystem)

8.2 Processing Steps

Extract text layer

Segment by page

Detect headings heuristically

Limit extraction size

8.3 Output Structure
ParsedPDFContent {
    file_type: "pdf"
    page_count: int
    extracted_text_excerpt: string
    heading_candidates: [...]
    metadata
}


Binary content must not be stored.

9. Normalized Output Interface

All parsing results must be convertible to:

ParsedContent {
    file_type
    structured_data
    excerpt
    metadata
}


Then wrapped into:

ExternalSignal {
    source_type = file_upload_*
    origin_identifier
    timestamp
    raw_payload = ParsedContent
    metadata
}


Parsing subsystem does not assign trust_score.

10. Size & Performance Limits

The subsystem must enforce:

Maximum file size

Maximum extracted characters

Maximum AST depth

Maximum PDF pages processed

Exceeding limits results in:

Truncated extraction

Structured warning flag

No unbounded parsing allowed.

11. Error Handling

Errors must return structured results:

ParseError {
    error_type
    file_type
    message
}


The system must never crash due to malformed input.

12. Security Constraints

The subsystem must prevent:

Code execution

Macro execution

Embedded script execution

Remote file loading

Arbitrary file access

All parsing must occur in sandboxed context.

13. Non-Goals

The File Parsing Subsystem does not:

Perform semantic reasoning

Modify world model

Apply governance logic

Score relevance

Evaluate value alignment

Perform LLM summarization

It extracts structure only.

14. Design Philosophy

The subsystem is:

A structural analyzer, not an interpreter.

It converts:

File → Structured Representation

It does not convert:

File → Knowledge → Value Change

That chain belongs to Perception and Governance.

15. Summary

The File Parsing Subsystem:

Extracts structured text

Parses Markdown hierarchy

Performs AST-based code analysis

Extracts text from PDFs

Enforces safety and size limits

Produces normalized ParsedContent

Wraps into ExternalSignal for Perception

It forms the structured input gateway for file-based environmental sensing.

No meaning is decided here.
Only structure is revealed.

End of File Parsing Subsystem Specification v1.0