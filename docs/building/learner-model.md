# A learner model grounded in the vault

Updated: 2026-10-04. Selected vault content is the learning inventory (`D07`, `R18`). The current user-selected representation is five concept tags (`D09`, `R20`), superseding the earlier two headline scores. The first implementation is experimental: rank tags, evidence summaries, and candidate thresholds are not a validated assessment system.

The accepted [v1 study ecosystem](v1-study-ecosystem.md) now has independently identified concepts, typed relationships, source snapshots, goals, task families and criteria with recorded help conditions. This refines P05 without reinstating numeric headline scores. Graph proximity, reading, generated maps, authored notes, and assisted completion are not independent understanding. The implementations and thresholds below remain experimental.

## Current concept ranks

A concept can be an entire note or a section within a large note. All selected content, including source material, can be a learning target. The user chose:

| Tag | User's meaning | Evidence to seek |
| --- | --- | --- |
| `#unknown` | The learner currently seems to miss most of the idea | Relevant attempts showing substantial gaps, interpreted in context |
| `#knowledge` | The learner is pretty good at recalling things around the concept | Varied retrieval, including delayed flashcard reviews |
| `#comprehension` | The learner understands the most important ideas | Independent explanation, justification, reconstruction, and handling of central assumptions |
| `#application` | The learner can apply the concept and solve various questions/exercises | Independent method choice and justified solutions to varied appropriate problems |
| `#transfer` | The learner deeply and flexibly uses the concept in very different settings | Independent work with meaningfully changed contexts, representations, or uses |

These are practical labels for Noctua, not a claim that a scientific taxonomy or a single ranking can measure every skill. A concept may have strong and weak facets. Keep the underlying attempts, help, dates, and coverage visible.

**Unassessed is separate from `#unknown`.** Indexing a file supplies content, not learning evidence. The first app leaves new concepts without a tag unless an existing explicit rank is imported. A learner can choose any tag; the system does not automatically promote or demote them.

## Implemented evidence baseline

The first app exposes whole-note concepts and sections in large or explicitly ranked notes, plus whole PDF/text documents. It associates cards and exercises with concepts when supplied. Source anchors distinguish path, scope, and content revision; the learner inventory is not yet a complete split/merge or scope editor.

Flashcard reviews use versioned FSRS state. For a concept, show reviewed/total active cards, eligible review count, and mean modeled retrievability of reviewed cards. No reviewed cards means no estimate, not zero. Editing a card starts a new schedule; old reviews remain but do not support the new content's current summary. This measures the sampled cards, not every claim in the concept.

Evidence is summarized per declared facet and criterion, with dates, task families, contexts, source/content versions, observed gaps, assistance and uncertainty. Broad candidates require independent, current, recent criterion observations covering all declared facets at the proposed level; delayed observations separated by at least 24 hours and more than one task family are required. Application and transfer also need varied declared contexts; transfer needs a description of what changed. The current recent-evidence window is 90 days. These are **unvalidated engineering heuristics**, not a mastery scale, test-count requirement or university-course progression rule. The earlier “two exercises at each successive kind” rule is retired.

Any level can be observed directly without first completing all lower tags. One advanced success or two narrow questions does not advance recommended depth. Desired depth comes from the learner's goal and concept preference; orientation may be sufficient. Readiness considers current tags, relevant candidate evidence, coverage and accepted prerequisite links, while leaving advanced tasks manually available. A prerequisite edge is not a lock, and no score propagates automatically to neighboring concepts or to both ends of an assessed relationship.

Flashcard recall contributes sampled knowledge observations, separately from reasoning. Concept facets have content fingerprints; tasks/cards retain their intended facet version. Renaming/redefining a facet keeps historical observations but prevents them from assessing a changed meaning. Repeated near-identical family observations do not manufacture broader coverage. [E11](evidence.md#e11-transfer-across-contexts) motivates recording the changes between learning and assessment; it does not validate Noctua's classifier.

Model feedback is provisional, with criterion results and exact answer excerpts when available. Invalid/ambiguous spans are omitted rather than guessed. Learner overrides preserve assessment history and clear incompatible criterion judgments. Closed numeric/choice/short-answer keys check the answer only; the reasoning criteria remain unobserved. Notes and self-selected tags supply scope and the learner's stated view, not independent success. Hints, advice, reported resources/outside help and revealed solutions remain part of the conditions across restarts.

Exercise resurfacing is separate from FSRS: independent correct work currently returns after 3, 7, 14 or 30 days based on distinct successful dates; supported/partial/incorrect work after one day; ungraded work after six hours. Regrading recomputes from saved attempts rather than counting another attempt. Changed task content keeps old work and resets the current practice schedule. These intervals are provisional software policies, not empirically fitted prescriptions.

A tag change is a durable learner event. Writing it into a note is a separate previewed action with revision checks and backup. A rank records the learner's current judgment; it should not erase earlier evidence or conceal memory gaps. Recall can support `#knowledge`; higher ranks need relevant reasoning evidence. There is no global forgetting formula or automatic rank decay.

## Earlier numeric proposals and future refinements

The following records P05's earlier representation/scoring discussion and unresolved refinements. D09 supersedes its two-headline-score interface. The numeric `M`/`U` formulas and proposed topic aggregation below are **not implemented**; task families, criterion rubrics and typed links now have the bounded v1 form above. Earlier suggestions must not be treated as instructions to restore the previous interface. They preserve questions useful for improving the current tags and evidence model.

## The vault as a learning inventory

The user's principle is that the vault should be a copy of the learner's brain: information and skills represented there should also be internalized. Selected source material counts too, including books, quotations, passages, and attachments. Do not exclude it from learning targets merely because the learner did not write it.

Interpret this as a goal to track the relationship between selected knowledge and demonstrated capability. A file's presence, a written note, or a visible link is not proof of internalization. Newly selected content starts unassessed, distinct from the current `#unknown` rank. Scope selection must remain explicit; how it is applied to a whole book or part of one is open.

## Learnable units within content

Propose attaching evidence to stable learning units smaller than a note or chapter. Each unit should describe an assessable claim or capability, anchored to its source, rather than automatically treating every sentence as a separate flashcard.

| Example unit | Possible remembering target | Possible understanding target |
| --- | --- | --- |
| Eigenvector and eigenvalue | Recall or reconstruct the definition | Explain its geometric meaning and handle an edge case |
| Finding eigenvalues of a small matrix | Retrieve the relevant relation and essential procedure | Choose and justify the method, then execute it |
| Diagonalization | Recall the central condition | Explain why independent eigenvectors matter and diagnose when the method fails |
| Relation between eigenvectors and diagonalization | Retrieve the relationship | Use it to explain a derivation or solve a changed problem |

These are illustrative targets, not a selected course or exhaustive mathematical specification.

A source can contain many units, and a unit can appear in several sources. Different prompts can test the same unit. Propose AI-assisted extraction and alignment of candidate units, with visible source anchors and a way to correct, merge, split, or reject them. The learner should not have to manually label every sentence. Exact formats and when mappings become authoritative remain open.

## Earlier two-score proposal, richer evidence underneath

| Visible score | Proposed meaning | Primary evidence |
| --- | --- | --- |
| Remembering (`M`) | Estimated ability to retrieve essential selected knowledge under specified cues; recall forecasts may change with time | Independent retrieval attempts, with review history and prompt conditions |
| Understanding (`U`) | Demonstrated ability to explain, justify, select, apply, or connect that knowledge at a defined task level | Criterion-based assessment of reasoning and performance on appropriate tasks |

Understanding requires access to relevant knowledge, but a single failed retrieval does not establish that conceptual competence is absent. Reconstructing a result independently differs from needing the answer supplied. [E10](evidence.md#e10-availability-and-accessibility) supports caution about diagnosing knowledge from a retrieval failure; extending that distinction to our conceptual assessment is a design inference.

Remembering and understanding are also not mutually exclusive learning mechanisms: retrieval can support conceptual learning. [E8](evidence.md#e8-retrieval-and-conceptual-learning) motivates letting an activity contribute to either score according to what it actually tests.

The earlier interface proposed two headline scores with inspectable coverage, facets, source/task scope, dates, help, uncertainty, and supporting attempts. The metadata remains useful for the current five tags; the two headline scores are superseded.

## An event contributes evidence, not a whole-topic grade

| Event | Candidate update |
| --- | --- |
| Correctly answer a definition card before revealing the answer | Remembering evidence for that definition; no automatic credit for transfer or application |
| Explain why a method works from memory | Remembering evidence for the retrieved ideas and understanding evidence for the specific explanation criteria |
| Solve a new exercise with justified steps | Evidence for the criteria and constituent skills actually observed; possibly both scores |
| Reach an answer after a hint | Preserve the initial attempt and subsequent help separately; do not record the final answer as an unaided success |
| Fail a multi-skill problem | Update demonstrated failing criteria where identifiable; do not mark every prerequisite as weak |
| Read a chapter or save a note | Record exposure and selected learning targets; do not award understanding automatically |
| Explain or use a connection between two topics | Evidence for that relationship and the particular constituent criteria observed |

An exercise mentioning five topics does not necessarily assess all five. Ask for a targeted follow-up only if diagnosis is useful to the learner, rather than forcing a sequence of checks. Assessment remains compatible with independently chosen activities (`D06`).

## Proposed memory baseline

1. Associate recall prompts with their learning targets and keep prompt identity/version stable.
2. Record the independent response or self-rating before reveal, time, cues, and relevant exposure. A hinted or just-revealed response is not an ordinary independent recall observation.
3. Evaluate a maintained, versioned scheduler such as FSRS for card-level recall forecasts and review timing. Its retrievability is a modeled probability of recall for that card, not a measure of conceptual depth. [FSRS technical documentation](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS).
4. Summarize distinct tested recall targets within a unit, with target coverage visible. Rephrased duplicate cards must not gain additional topic weight.

A candidate summary for fully covered targets is `M = 100 × sum(weight_j × recall_estimate_j) / sum(weight_j)`. Fix weights by the selected learning objectives, not the number of reviews or cards. If targets are missing, show the assessed portion and coverage rather than silently treating unknown targets as either zero or fully remembered. A card-level forecast does not automatically generalize to every way of retrieving or reconstructing the idea.

FSRS is now selected for the first app through `ts-fsrs` 5.4.2 (T04); broader memory-score aggregation remains a proposal. Unstructured exercise outcomes should not be fed into its card-review model without defining compatible observations. Valid retrieval evidence from exercises can still be stored and used in a later learner-model update.

## Proposed understanding baseline

Start with an inspectable evidence index rather than claiming to have a calibrated probability of deep understanding.

1. Give each unit a small applicable rubric. Candidate facets are explanation/justification, method selection or derivation, application, and transfer/connections/boundaries. Select the facets appropriate to that unit; an isolated fact and a complex skill need different criteria.
2. Define criteria and task level before assessing the answer. Store the task's sources, expected reasoning, permissible alternative solutions, and rubric version.
3. Assess observed criteria as met (`1`), partly met (`0.5`), not met (`0`), or uncertain/unobserved. Preserve the student's work and the reason for each judgment. The partial-credit mapping is a provisional design choice.
4. For unaided evidence, use the work produced before content-bearing hints, source consultation, or answer reveal. Assisted work remains useful teaching and conditional evidence; it is not silently relabeled independent. Distinguish neutral task clarification from help that supplies required knowledge.
5. Group comparable variants into task families. A proposed baseline uses the most recent eligible result per family for each facet, retaining the full history. Repeating the same exercise or changing only its numbers should not create many independent confirmations.
6. For each facet, average those eligible family results. Combine facet values using predefined weights: `U = 100 × sum(weight_f × facet_result_f) / sum(weight_f)`.

Show a full unit score only when the required facets have observations. Otherwise show a partial result with missing facets explicit. A single result is limited evidence even when its normalized value is high. Dates, task diversity, delayed checks, and assessor reliability must be visible; these formulas do not provide statistical confidence intervals.

This baseline is intentionally simple and revisable. Family definitions, comparable difficulty levels, weights, recency windows, and the amount of evidence needed remain open. It is a criterion-based index, not the probability that the learner understands every part of a topic. For old evidence, show when understanding was last demonstrated and that confirmation is needed; do not invent a universal forgetting curve for understanding.

## How understanding depends on memory

Propose representing dependencies explicitly at the task/criterion level. An independent application task requires the relevant ideas to be available through retrieval or reconstruction. Store which knowledge was actually used, which was supplied, and whether the student could proceed without it.

If a learner cannot continue because a required relation is unavailable, record an availability gap and the affected criterion. If they retrieve the relation but misuse it, record a reasoning/application gap. If they independently derive the forgotten expression from core principles, that can be positive evidence for reconstruction and reasoning under that task's criteria.

Do not initially compute understanding by multiplying a whole-topic memory average by a reasoning index, or enforce `U <= M` between scores measuring different tasks and meanings. Such arithmetic can penalize unneeded details and double-count the same event. A lower memory forecast can instead flag that previously demonstrated understanding needs a current check on the relevant dependencies.

A later forecast of independent understanding could use relevant recall state, prior reasoning evidence, task difficulty, help, and elapsed time as inputs. Knowledge tracing is a precedent for updating estimates of component skills from performance ([E9](evidence.md#e9-knowledge-tracing)); it does not give us a ready-made general STEM understanding model. If a future joint probability model enforces a memory dependency, define matching events and test its calibration before displaying its probabilities.

## Connections between topics

Represent typed relationships such as prerequisite, derives from, applies to, or analogy. Keep a content graph separate from evidence that the learner understands each relationship. A Markdown link or model-proposed edge says something about the content; it does not establish an internalized connection.

For example, evidence that the student knows an eigenvector definition and knows a diagonalization condition does not establish that they can explain the relationship. A question requiring them to justify the change of basis can supply direct evidence for that connection. Do not automatically raise or lower all neighboring scores when one node changes.

The graph can help select a useful exercise or diagnosis when requested: distinguish a missing prerequisite from difficulty applying the main concept, and identify connections that have not been demonstrated. Assessments can address relationships directly; how their evidence is included in topic summaries remains open.

## Aggregation and coverage

Keep scores at the smallest meaningful unit, then summarize at note, chapter, and topic level using a stable selected scope. Two cards in a large chapter should not imply that the chapter is covered. Neither repeated reviews nor extra duplicate units should change the content's weight.

A proposed display is `Remembering: assessed estimate + target coverage` and `Understanding: evidence index + facet coverage + last demonstrated`. A complete broad-topic score needs a defined aggregation policy. Unknown units and untested connections must remain visible; a mean over only tested units must be labeled as such.

Changing the selected content scope may change coverage and summaries even without new learning. Changing the content, splitting a unit, or altering a rubric must preserve old observations and explicitly determine whether they still apply. Renaming a file should not erase history; adding a new claim should not inherit mastery from the rest of the note.

## Suggested storage and model boundary

SQLite now stores durable study records separately from cache (T01). The richer conceptual records below remain a proposed target design; not every field or relationship is implemented:

| Record | Essential purpose |
| --- | --- |
| Learning units and source anchors | Stable identity, selected scope, content version, and target definition |
| Relationships | Typed content connections, provenance, and confirmation status |
| Activities and criteria | Units tested, task family/level, expected reasoning, sources, and rubric version |
| Attempts and help events | Student work, timing, initial conditions, and what support was provided |
| Criterion assessments | Outcome, reasoning, assessor/version, uncertainty, corrections, and evidence links |
| Recall reviews | Prompt version, independent rating/outcome, timing, and scheduler configuration |
| Derived score snapshots | Recomputable summaries labeled with scoring/model version and evidence scope |

The AI can propose mappings and criterion assessments. Application code should validate them and compute score updates deterministically from versioned records. Allow corrections without losing the original event. An LLM should not directly write an unexplained “understanding: 87” to a note.

Separate durable observations from rebuildable indexes and score snapshots. Preserve the vault as the knowledge store; the learner model records evidence about its selected content, not a second editable copy of that content. An Obsidian display or Markdown summary export can come later without making copied score fields authoritative.

## Evaluation before trusting the numbers

Use a small selected content set with varied recall prompts and defensible task criteria. Compare model assessments with independently reviewed student work, and inspect whether apparently strong scores hold up on later unaided, suitably changed tasks.

For memory forecasts, evaluate agreement between predicted recall and later observations. For the initial understanding index, test whether its bands correspond to later performance and whether it detects specific gaps. With sufficient data, a probabilistic model can be compared with this baseline; a complex model should earn its complexity through better predictions and diagnosis.

The first pilot should also check ambiguous grading, alternative valid solutions, stale source mappings, correlated repeated attempts, and incorrect graph edges. Store evidence now so algorithms can improve without rewriting the learner's history.
