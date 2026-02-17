# ADR-004: IR is Serializable JSON, Not a File Format

**Status:** Accepted
**Date:** 2026-02-16

## Context

Should we have a canonical intermediate file format (like LibreOffice's ODP) between parsing and rendering?

## Decision

The IR (Intermediate Representation) is a serializable in-memory JSON structure. It is NOT a file format and NOT a normalization layer.

## Rationale

- We only read OOXML — no need to normalize across input formats
- A file format creates spec maintenance, versioning, and lossy normalization overhead
- JSON IR gives us: caching (IndexedDB), worker transfer (postMessage), server-side pre-parsing, testability (golden fixtures), and devtools inspection
- The IR preserves everything from the source OOXML, including unsupported elements (UnsupportedIR with raw XML) — nothing is lost at parse time

## Consequences

- Parse PPTX once → IR → cache in IndexedDB → skip re-parsing on reload
- Workers parse in background, postMessage the IR to main thread
- Future PDF export walks the IR, not the source PPTX
- No intermediate file format to version or maintain
