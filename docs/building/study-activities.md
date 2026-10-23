# Independently useful study activities

Status: activity-first direction confirmed (`D06`, `R17`, `D11`–`D14`); first subset implemented under `D10`. Broader interactions remain proposals. Updated: 2026-10-04.

Noctua should help with the particular part of studying that the learner needs now. A person may mostly read a book and review a few cards, spend most of their time on exercises, or return to a specific idea after an interruption. The learner chooses the mix, order, and duration of activities.

The earlier session-loop proposal (`P01`) has been retired. The current priority is to design useful individual capabilities. Optional presets may combine them later once their behavior is better understood.

The user now requests an organic ecosystem, manual operation of essential tools, and optional guides/guided study. Proposed shared targets, source anchors, evidence, and grouped note changes are developed in [v1-study-ecosystem.md](v1-study-ecosystem.md). A guide can be a navigable orientation; guided study can be an interaction preference. Neither is a compulsory session lifecycle. The requested concept map is a new left-navigation workspace tab; this does not move all existing right-desk activities into the left sidebar.

## First implemented subset

The [current app](implementation.md) offers Q&A grounded in selected/retrieved sources, source-linked flashcard creation and FSRS review, and exercises with saved answers, hints, explicit solution reveal, and provisional correctable feedback. These share a chat workspace with independent right-side tools. Sources and activities can be revisited after switching or restarting; no session plan is required. The right desk also offers read-only full Markdown source viewing and direct Obsidian handoff, with saved citation evidence kept distinct from current files. The accepted v1 adds a manual/assisted bits inbox, grouped learner-approved note patches, flexible guides/goals, original PDF page highlighting, interactive concept links, a Markdown/math reasoning canvas, and focused tutor desk handoffs. D16 additionally authorizes direct vault-scoped note creation/editing by the model, with model authorship and recovery. Presets remain outside the implemented scope.

## Candidate capabilities

These describe the broader design space. Some have a first implementation above; each should retain the learning work appropriate to it.

| Current need | Possible Noctua support | Learner's contribution |
| --- | --- | --- |
| Understand a resource | Help interpret a selected passage, equation, derivation, or figure; explain at an appropriate level and link to supporting material | Inspect, ask questions, reason about the explanation, and connect it to what they know |
| Explore or check understanding | Propose questions, comparisons, predictions, or counterexamples tied to the current idea | Answer and explain their reasoning; evaluate feedback |
| Practice through exercises | Find suitable source exercises or propose checked problems; offer feedback and help on the current attempt | Choose an activity, attempt a solution, and revise their reasoning |
| Review with flashcards | Present due cards or help prepare useful cards from selected material | Retrieve an answer, judge the review, and evaluate proposed cards |
| Build or improve a note | Work from the student's explanation, derivation, sketch, or existing note; suggest corrections, links, and citations | Construct and validate the meaning of the note |
| Return to specific work | Restore the relevant passage, question, attempt, or unresolved point | Choose what to revisit and continue the work they care about |

Questions might serve exploration, diagnosis, retrieval, or transfer; an exercise might serve practice rather than assessment. Their exact evidential value and deeper interactions still need design and evaluation, even though the initial presentation now exists.

## Shared context and continuity

Propose retaining relevant source locations, learner attempts, feedback, meaningful help, and unresolved questions with the material or activity they concern. The student should be able to return to a particular point, not only resume the last chronological step.

For example, someone working on exercises could reopen the relevant textbook derivation, ask about one step, and return to their original attempt. They could also choose to read further or review cards. These are illustrative combinations, not a recommended sequence.

Carrying context should reduce repeated setup and explanation. It should not imply that the model automatically sets the next goal, launches an assessment, or changes activities whenever it detects a possible gap. How the learner requests help and how suggestions appear are still open.

## Proposed tutoring behavior

- Respond to the current resource, question, or attempt and the kind of help requested. Direct explanation can be appropriate when trying to understand a source; exercise feedback needs attention to the student's own reasoning.
- Adapt support to prior knowledge and actual attempts. Keep the learner's next cognitive action clear without forcing every interaction into a questioning sequence.
- Record meaningful help when interpreting performance. A solution reconstructed after guidance should not count as an independent solution.
- Keep source access and learner control available. A lookup, explanation, or exercise need not trigger an entire learning workflow.

The exact boundary between hints, instruction, worked examples, and solution review remains **open (`Q02`)**. [E4](evidence.md#e4-worked-examples-and-prior-knowledge) motivates discussing adequate support; [E7](evidence.md#e7-ai-assistance-and-independent-learning) motivates checking independent outcomes. Neither supplies a universal policy.

## Learning evidence across activities

Current records retain source snapshots, card-content versions/reviews, exercise criteria, student answers, outcomes, help, dates, and assessment corrections. Evidence accumulates across separate activities without a fixed session plan. It supports the chosen five concept tags; criterion/facet versioning, task-family/context coverage and typed relationship evidence now refine this in [learner-model.md](learner-model.md).

Reading a passage or requesting an explanation should not by itself imply demonstrated understanding. When the learner does produce an answer, explanation, or solution, the app can retain what that work establishes and what remains untested. The candidate dimensions are described in [vision.md](vision.md).

Retrieval, explanation, feedback, and delayed assessment have scientific starting points in [E1, E3, E5, and E6](evidence.md). Those references concern learning mechanisms; they do not validate this activity organization or require a particular sequence.

## Optional presets later

The user sees presets as a possible later way to combine useful capabilities. Their contents, timing, degree of automation, and user controls have not been chosen. First establish how individual activities help; then discuss whether particular combinations reduce effort. Presets should remain optional and preserve the ability to switch or return to specific work.

## First pilot after implementation

Try one concrete need, such as understanding a textbook derivation or creating exercises from a note. Inspect the starting material, selected context, model behavior, learner work, and what survives switching/restarting. Evaluate usefulness and later independent performance before expanding scope or adding presets.

Composer shortcuts (2026-10-03): `/flashcards` and `/exercises` select explicit tool intent via removable chips; `@` selects indexed vault material. The learner still chooses the current question and sources, and the tutor may use the same bounded creation tools without a chip when asked. No activity dropdown or fixed study sequence is required.

Conversation tabs (2026-10-03, refined 2026-10-04): the learner can keep distinct questions and contexts in sibling tabs, retaining each tab’s draft and right-desk activity position. Selecting a passage in the main chat, a card, exercise prompt, rendered note, or extracted PDF page offers **Add to chat** with an explicit destination choice or new tab. The quote is staged for the learner’s next question; transferring it does not rate a card, submit an exercise, or count as independent understanding. Closing an empty tab discards it; drafts and saved work remain available for reopening. Chat quotations retain their original speaker and message context, so copied assistant text is not learner-authored evidence.

2026-10-04 refinement: direct numbered chat buttons float above highlights, replacing the destination dialog. Transferred quotes carry original surrounding context and source location, and the tutor can request adjacent passages if necessary. The learner still controls the destination and next question; selecting exercise text does not reveal its hidden hints/solution, and reading help must not be treated as independent understanding.

## Framed workspace, visible activity and direct note tools — 2026-10-04

Confirmed user direction: remove the right-desk Concepts tab; offer a concept list in an overlay from the Concept map tab. Use the existing muted navigation color for the surrounding frame/top tabs, rounded paper workspaces and active/hovered study tabs, while inactive study buttons remain white. This replaces the earlier placement of the concept list in the study desk. The searchable overlay starts with compact concept rows and current tags; expanding a row reveals rank/evidence inspection and previewed learner tag writes.

Confirmed note-write refinement: the model should be free to create and modify notes as tools. This supersedes the earlier review-only vault-write restriction and prohibition on model-created notes. Implemented create_note/edit_note operate only on Markdown in the connected vault, allow ordinary subfolders, require reading an existing note and its current revision, and use the existing shared backup/conditional-undo service. Exact replacements must be unique; creation cannot overwrite an existing file. Outside-vault paths and symbolic target files are rejected; creation uses ordinary folders. Assessment tags in Markdown or YAML and note identities are preserved, and new-note frontmatter retains custom metadata. Writes record model origin and appliedBy=model in the saved-change history. Proposed grouped review still exists when requested; the model cannot apply unrelated pending proposals. These writes add no assessment evidence.

Chat replies now retain a bounded activity record with elapsed time and collapsed tool/thinking entries. Each row has a relevant icon, running/completed/error state and expandable input/result or provider-exposed reasoning. Thinking is displayed only when the model/provider supplies it; no unavailable private reasoning is invented. Tool details omit private solutions/hints/card backs, credentials and opaque reasoning signatures. Records survive restart with the assistant message; this is a display projection rather than a raw provider-payload archive. Streaming, stopping and failures preserve actual status.

Alternatives: retaining duplicate right-sidebar concepts would conflict with the requested cleanup; fake reasoning or a prompt-only tool list would not show actual model activity; broad coding/filesystem tools would exceed the requested note editing. The layout preserves independent resizing and collapsed navigation. Real-provider reasoning availability and quality remain provider-specific.
