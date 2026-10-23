# Previous prototype: ideas and cautions

Reviewed: 2026-10-03. Local reference: `/Users/jacopominniti/Desktop/temp/noctua-prev`.

This was a read-only inspection of selected source files. The prototype was not installed, run, benchmarked, or comprehensively audited. Findings below describe inspected code; correctness and actual learning outcomes have not been verified.

## What exists in the inspected code

The prototype has a Python CLI using Typer and Pydantic AI, MCP tools for vault access and search, a txtai-based retrieval index, Markdown learning items, a FastAPI chat endpoint, and a Next.js frontend. It is a reference for product ideas, not the technical foundation selected for this repository.

| Idea worth considering | Source within the prototype | Relevance to the new design |
| --- | --- | --- |
| Study guides with guiding questions, source order, and selected exercises | `noctua/agents/guide.py` | Useful preparation if tailored to the learner and kept actionable |
| Progressive hints and feedback on reasoning | `noctua/agents/recall_agent.py` | A starting point for tutoring behavior; the policy needs evidence and revision |
| Learning activities attached to notes | `noctua/core/learning_parser.py` | Potentially useful for knowledge portability; format and state ownership are open |
| Memory review with explicit ratings and scheduling state | `noctua/core/flashcard.py` | Supports the flashcard requirement; implementation is not validated |
| Retrieval with heading metadata | `noctua/rag/engine.py` | A starting idea for source navigation, requiring stronger source identity |
| Showing a diff before inserting generated content | `noctua/cli/make.py`, particularly `_insert_with_approval` | Useful for preserving student control over note changes |

## Mismatches and risks to avoid carrying forward

| Observation in the code | Consequence for the new design |
| --- | --- |
| `noctua/agents/flashcard_agent.py` includes a `note_creator_agent` instructed to create a complete structured note from sources; `noctua/cli/make.py` exposes a note-generation command. | This conflicts with the confirmed collaborative-note direction. Reuse source preparation ideas, not the complete-note workflow. |
| The exercise reviewer in `noctua/agents/recall_agent.py` has an absolute “never provide the direct answer” prompt and only correct/continue statuses. | A prompt alone is not a complete pedagogical policy. Discuss how to support missing prerequisites and end unproductive hint loops while preserving reasoning. |
| `noctua/core/flashcard.py` labels its custom scheduler FSRS v4.5. | A label is not conformance evidence. Do not copy or claim the scheduler is correct without reviewing and validating it. |
| Learning items embed JSON state in Markdown, and recall code rewrites files; `noctua/utils/fs.py` also stores aggregate memory/exercise scores in frontmatter. | Decide which information belongs in notes versus durable app storage. Scalar scores should not imply that deep understanding has been measured. |
| Retrieval chunk IDs in `noctua/rag/engine.py` use `file_path.name` plus a chunk index. | Equal basenames in different folders can share IDs. New provenance needs unambiguous document and revision identity. |
| The inspected ingestion loop skips PDFs and comments that they should be passed as binary attachments. | This does not provide a persistent, page/figure-aware textbook ingestion system. Resource processing needs its own design. |
| The basic `write_note` helper in `noctua/utils/fs.py` directly calls `write_text` on the supplied vault path, without a version check or atomic replacement in that helper. | New writes need conflict detection and recovery, and vault containment must be enforced in code. |
| The inspected `backend/main.py` chat request contains a message and source toggles, with no conversation history field; frontend messages in `frontend/src/app/page.tsx` are React state. | The inspected route does not supply durable study-session continuity. New session records must be designed independently of the visible chat transcript. |

These observations are reasons to investigate the new boundaries, not a complete bug list for the old project. No source code or dependencies were copied into Noctua.

## First implementation follow-through (2026-10-03)

The new experiment keeps the chat/navigation/tools layout, source selection, card definitions, and practice/feedback ideas. It uses maintained FSRS rather than the old formulas, stable scope/path/revision identities rather than basename IDs, durable app records rather than review-time Markdown rewrites, Pi study tools rather than unrestricted coding tools, and checked tag writes rather than a general write-note helper. Legacy card definitions can be imported without trusting their old scheduler JSON. See [implementation.md](implementation.md). Full-note generation and the absolute never-answer tutoring rule were not inherited. The previous repository remains unchanged.
