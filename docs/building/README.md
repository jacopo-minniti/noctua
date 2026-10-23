# Building Noctua

Last updated: 2026-10-04. Phase: first experimental Electron implementation; connected v1 study ecosystem implementation.

This directory is the project's memory between chats. Read it before continuing work and reconcile it when direction changes.

## Current direction

Noctua helps a learner build deep understanding and know their level, initially in STEM. Useful individual activities come first: understanding a resource, asking questions, solving exercises, and reviewing flashcards. The learner can combine and revisit them freely. Optional presets may come later; a fixed session sequence or generated roadmap is not the organizing principle.

Selected vault content, including source material, is the learner's intended knowledge and skill inventory. The latest chosen representation is a tag per concept: `#unknown`, `#knowledge`, `#comprehension`, `#application`, or `#transfer`. A concept may be a whole note or a section. This supersedes the earlier two headline scores, while preserving the distinction between recall and deeper capabilities. Stored content, assisted success, and a tag are not proof of internalization.

The user explicitly requested implementation to learn from actual use. The first version has Electron, a chat-centered workspace, a bounded custom Pi harness, local/API model selection, Markdown/PDF/text retrieval with a local vector cache, FSRS flashcards, exercises, and learner-controlled concept tags. SQLite now holds both durable study records and separately rebuildable indexes. Exact stack choices and ranking heuristics are experimental engineering choices, not scientific validation or additional confirmed user requirements.

## Reading map

| Document | Purpose |
| --- | --- |
| [Implementation checkpoint](implementation.md) | What works now, how to run it, verification, and known limitations |
| [Vision](vision.md) | Objectives, learner needs, depth, and boundaries |
| [Requirements](requirements.md) | User direction, current scope, and proposed acceptance criteria |
| [Study activities](study-activities.md) | Independent capabilities, continuity, and future composition |
| [V1 study ecosystem discussion](v1-study-ecosystem.md) | Accepted v1 direction, shared ecosystem and implementation boundaries |
| [Learner model](learner-model.md) | Current five tags and evidence heuristics; earlier numeric proposals and future questions |
| [Evidence](evidence.md) | Scientific references, read scope, limitations, and design inferences |
| [Architecture](architecture.md) | Current technical stack, authority, source identities, and tool boundaries |
| [Prototype review](prototype-review.md) | Useful ideas and cautions from the old read-only code |
| [Decisions](decisions.md) | Confirmed decisions, engineering choices, superseded directions, and next work |

## Status vocabulary

- **Confirmed:** explicitly stated by the user; does not imply implementation or validation.
- **Provisional:** likely user direction pending details.
- **Proposed:** an assistant suggestion to discuss or evaluate.
- **Implemented, experimental:** current code behavior; may change after use.
- **Open:** unresolved; do not assume an answer.
- **Superseded:** previous direction retained for context, no longer authoritative.

Requirements use stable `R` identifiers, user decisions `D`, proposals `P`, questions `Q`, implementation choices `T`, and scientific references `E`. Acceptance criteria remain proposals unless accepted. Implementation tests verify software behavior, not educational effectiveness.

On 2026-10-04 the user requested brainstorming better study logic: contextual agent initiative, deliberate Pi reuse, connected tools, AI-independent core operations, quick capture, rename-safe identities, PDF interaction, collaborative note evolution, and a concept map opened from left navigation as a tab. They selected grouped acceptance of proposed note changes. The user then explicitly authorized implementing the proposal with adaptive depth, interactive practice/map, tutor desk continuity, opt-in note building, role model choices and smart recaching. The [v1 checkpoint](implementation.md#connected-study-ecosystem--2026-10-04) records the actual behavior and remaining limitations; underlying heuristics remain experimental.

## Maintaining this record

Update the relevant documents when objectives, behavior, or decisions change. Record the date, reason, alternatives, and uncertainty for material choices. Preserve a short explanation of superseded directions instead of leaving contradictory instructions. Keep scientific findings separate from our design inferences and from validation of this application.

Latest 2026-10-04 refinement: D16 authorizes vault-scoped direct note tools, moves the concept list into the map overlay, adds expandable timed activity/reasoning, and adopts a rounded workspace frame. See the latest checkpoint sections; earlier review-only note restrictions are superseded. Subsequent refinements discard empty closed tabs, add chat-message quotations and right-align learner message bubbles. Settings now separates Providers from Models, with independent background chat naming. Connected GPT entries share provider availability; message headers place tags alongside speaker/time, and reply footer tags are removed above the compact composer.
