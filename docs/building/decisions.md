# Decisions, questions, and continuation notes

Updated: 2026-10-04. Current checkpoint: a working first experiment; connected v1 study ecosystem implementation.

## Confirmed user decisions

| ID | Decision | Basis and implications |
| --- | --- | --- |
| D01 | Prioritize deep understanding and an honest view of the learner's level, initially in STEM. | Initial request and clarification on 2026-10-03. Efficiency matters; speed alone is insufficient. |
| D02 | Reduce preparation and administration so effective study happens consistently. | The user's main friction is enacting the process when organizing it takes too much time. |
| D03 | AI is a tutor that preserves thinking. Build notes with the learner rather than generate complete notes from scratch. | Explicit initial direction. The later 2026-10-04 D16 instruction permits direct model note creation/editing; preserve authorship and independent-learning evidence. |
| D04 | Build Electron with a Markdown/Obsidian folder, a custom Pi harness, and local/API models. | Explicit initial direction. A separate personal Pi extension has not been supplied. |
| D05 | Design iteratively and keep behavior, rationale, and scientific references in repository memory. | Initial direction. The original documentation-only phase ended when implementation was explicitly requested in D10. |
| D06 | Support independently useful activities the learner can combine and revisit freely. Presets may come later. | User clarification on 2026-10-03 retires P01's fixed study-loop organizing proposal. |
| D07 | All selected vault content, including source material, belongs to the intended internalized knowledge/skill inventory. | User's “copy of your brain” principle and explicit scope clarification. Storage is not evidence of learning. |
| D09 | Represent each concept with `#unknown`, `#knowledge`, `#comprehension`, `#application`, or `#transfer`. A concept can be a note or part of a large note. | Latest user choice on 2026-10-03. Definitions are in [learner-model.md](learner-model.md). This supersedes D08's two headline scores. Untested content remains unassessed; the chosen `#unknown` means evidence of a substantial gap. |
| D10 | Implement a super experimental first version now: model-facing vault RAG/vector caching, Q&A, flashcards, exercises, Pi model selection, chat with navigation on the left and tools on the right. | Explicit implementation request on 2026-10-03 because discussion alone makes usefulness hard to judge. Activities can draw from the request, selected notes, attached resources, or a combination. Flashcard evidence should influence `#knowledge`. |
| D11 | Develop v1 study logic as a connected, flexible ecosystem with a context-aware tutor and deliberate reuse of Pi features/extensions. | Explicit brainstorming request on 2026-10-04. Tools are available to agent initiative and explicit learner choices. Reuse does not authorize loading arbitrary extensions or adding coding tools. |
| D12 | Essential tools must be useful without AI; prefer a few practical capabilities developed deeply over many superficial ones. | Explicit 2026-10-04 direction, including manual flashcard authoring/review. AI facilitates shared operations rather than being their only entry point. |
| D13 | Discuss quick bits, stable identities across note renames, PDF highlighting/questions, evolving collaborative notes, and a connected interactive concept map opened from the left sidebar as a tab. | Explicit desired capabilities on 2026-10-04, alongside guides, guided study, vault/web discovery, cards, and closed/open reasoning exercises. The later D15 request authorizes the experimental implementation; detailed learning heuristics remain provisional. |
| D14 | Collect proposed changes to existing notes and let the learner accept them together. | Explicit answer to the design-preference question on 2026-10-04. Supports gradual note evolution and learner authorship. D16 later authorizes direct model writes alongside optional grouped review. |
| D15 | Implement the accepted connected v1 proposal with interactive maps/practice, adaptive depth and prerequisites, right-desk return, opt-in collaborative note building, smart RAG recaching, and user-selected organizer/evaluator models. | Explicit “implement this first proposal” plus eleven refinements on 2026-10-04. No forced level progression. The original review-only note-write restriction is superseded by D16. |
| D16 | Let the model directly create and modify notes with tools, move the concept list into a map overlay, display expandable timed tool/reasoning activity, and frame the workspace with the existing navigation color and rounded paper surfaces. | Explicit 2026-10-04 four-part request with reference screenshots. Supersedes the earlier review-only note-write restriction and strict ban on model-created notes; preserve learner contributions, source/version integrity, model authorship and recovery. |

## Workspace iteration (2026-10-03)

The user reported that resizing could make components disappear and streaming answers could move the entire workspace out of view. This authorizes a targeted layout/scrolling correction within D10, without expanding the learning-feature scope.

Implemented experimental choice: bound the grid row and columns to the viewport, let the transcript and tools scroll independently, adapt compact spacing and wrap composer controls, and lower the native minimum from 1080 × 720 to 900 × 600. Replace per-update `scrollIntoView` with transcript-only scrolling that pauses when the learner reads earlier text. Retaining the larger fixed minimum would not address zoom or content-driven overflow; automatically hiding navigation/tools was avoided to preserve access. More extreme window sizes and cross-platform window-manager behavior remain unverified.

On 2026-10-03 the user also explicitly requested mouse resizing and closing for both sidebars. Implemented with pointer-captured draggable separators, keyboard arrow adjustments, independent close buttons inside each sidebar and header buttons to reopen them, and local width/visibility preferences. Widths are constrained to reserve 300 pixels for chat, with sidebar minimums of 160/240 pixels and maximums of 360/600 pixels. Window resizing temporarily constrains preferred widths instead of discarding them; hidden panels remain mounted to preserve activity state. Automatic collapse and a third-party layout library were alternatives; explicit controls and a small renderer-only component keep this iteration targeted. A follow-up user instruction places close buttons inside the actual sidebars and requests closing animations; the implementation animates column widths and opacity for opening/closing, respects reduced motion, and exposes only reopen controls in the chat header. The user’s screenshot follow-up initially moved navigation reopening to the left edge of the chat header. A later clarification supersedes full navigation hiding: collapse to an interactive 64-pixel icon rail, with expansion on the rail itself, and remove the duplicated study-activity navigation from the left. Flashcards, Practice, and Concepts belong in the right study desk. Its reopening remains on the right of the chat header. Fully hidden study-desk content is inert and hidden flashcard shortcuts are disabled. Extreme zoom beyond the tested 125% remains unverified.

## Superseded direction

| ID | Previous direction | Reason and retained value |
| --- | --- | --- |
| D08 | Two visible score categories: remembering and understanding. | Superseded by D09 on 2026-10-03. Keep the distinction between recall and deeper capability, the importance of relevant memory, and inspectable activity evidence. Earlier numeric formulas remain proposals, not implemented scores. A failed retrieval is not adopted as proof of absent conceptual knowledge. |
| P01 | Organize around a repeatable study loop. | Retired following D06. Continuity stays useful; a prescribed sequence does not organize the current app. |

## Implemented experimental engineering choices

These are reversible implementation decisions made to realize D10 and D15, not additional user-confirmed product requirements.

| ID | Choice, date, and reason | Alternatives and remaining uncertainty |
| --- | --- | --- |
| T01 | 2026-10-03: Electron/TypeScript/React with built-in SQLite. Keep learning contracts and logic separate from UI/providers; split durable records from derived cache. | Renderer and database libraries were open. JSON-record tables make the experiment small; migrations, large-vault performance, and a more relational schema need review. This resolves SQLite's provisional R09 for this implementation. |
| T02 | 2026-10-03: embed Pi 1.0.1 with custom tutor instructions and a checked study-tool allowlist. Disable coding tools and automatic resource/extension loading. | A subprocess or separate personal extension could be integrated later. The user's extension location/revision is still unknown. Provider/tool compatibility requires real-model trials. |
| T03 | 2026-10-03: local Ollama vector cache plus lexical retrieval; bounded source identities with snapshots; Markdown/text and page-aware PDF text first. | A remote embedding service, ANN database, OCR, or richer parser could follow. Avoid silent remote processing and do not pretend text extraction preserves figures/equations. |
| T04 | 2026-10-03: maintained `ts-fsrs` 5.4.2, default parameters, retention 0.9, fuzz disabled; record review/content/scheduler versions. | Do not copy the prototype's unverified scheduler. Defaults are engineering choices, not an optimal scientific prescription. Personal fitting and Anki interoperability remain open. |
| T05 | 2026-10-03: learner-controlled tags with inspectable recall/exercise evidence and deterministic candidate ranks. Never auto-promote, demote, or write vault tags. | An LLM-assigned tag or calibrated probabilistic model requires more validation. Current thresholds are arbitrary starting heuristics; task IDs do not establish task-family diversity or far transfer. |
| T06 | 2026-10-04: shared StudyService records/tools, bounded interactive SVG map, revision-linked facets/criteria, and practical resurfacing separate from FSRS. | Prefer existing React/SVG over another graph dependency; neighborhood limits keep the view usable. Reject fixed task-count promotion and ladder unlocking. Heuristics need real-user validation. |
| T07 | 2026-10-04: reviewed Pi Web Access 0.35.0 Exa MCP backend, explicitly enabled; reuse Pi sessions plus bounded durable studyMemory for continuity. | Loading the entire extension would expose unnecessary browser/download/credential capabilities. Generic memory extensions would duplicate authoritative learning records. External availability and live quality remain unverified. |
| T08 | 2026-10-04: durable noteIdentity UUIDs, optional portable noctua-id, conservative unique fingerprint rename matching, smart recaching/watch fallback, faithful PDF.js 6.4.299 pages. | Avoid bulk modifying the vault to add IDs. Ambiguous splits/merges and moved-vault reconciliation are deferred; extracted figures/equations remain limited. Patched dependency selected after maintainer advisory review. |
| T09 | 2026-10-04: opt-in note building creates pending learner-grounded patches; grouped learner acceptance is the only general note write. Separate selected organizer/evaluator models and one-time tutor desk return. | Automatic writes would conflict with D14/authorship. Rollback/conditional undo preserve recoverability; concurrent external edits and provider failures remain explicit conflicts/errors. |

## Proposals and unresolved design

| ID | Proposal | Current status |
| --- | --- | --- |
| P02 | Task-grounded evidence for recall, explanation, derivation, application, transfer, boundaries, and calibration. | Partly represented by current reviews/attempts and exercise kinds. Richer rubrics and validity are open. These dimensions support D09; they are not extra required headline scores. |
| P03 | Keep Markdown authoritative; preserve durable observations independently of rebuildable indexes. | Implemented in T01/T03. Portable definitions and full JSON export exist; restore, identity reconciliation, and broader interoperability remain open. |
| P04 | Adapt support to current need, prior knowledge, and actual attempts. | Tutor prompt, exercise hints, feedback, and explicit solution reveal provide a first interaction. No universally validated hint policy is claimed. |
| P05 | Stable learning units, typed connections, and durable observations; card recall forecasts and an inspectable understanding model. | Whole-note/section units and durable evidence exist. The earlier numeric `M`/`U` proposal is not implemented. Typed connections, task families and criterion/facet evidence now have an experimental implementation; calibrated understanding remains open. |
| P06 | Shared goals, concepts/skills, typed relationships, source anchors, activities, observations, and grouped note proposals underlying five practical capability groups. | Proposed 2026-10-04 in [v1-study-ecosystem.md](v1-study-ecosystem.md). Accepted by D15 and implemented in the bounded form recorded in the checkpoint; standalone Pi skills and richer reconciliation remain open. |

## Open questions

| ID | Question | Current checkpoint |
| --- | --- | --- |
| Q01 | Which actual STEM materials and study attempts should anchor the pilot? | Initial capabilities are selected; next use the app on a small real topic to expose friction and weak feedback. |
| Q02 | What help is useful when stuck, missing prerequisites, requesting a solution, or reviewing an attempt? | First policy allows explanation, graduated exercise hints, and learner-requested reveal. Evaluate support and later independent work. |
| Q03 | What note enhancement preserves authorship and useful learning? | Grouped learner acceptance is chosen (D14). Content/origin review, conflict-checked patches and conditional file-batch undo are implemented; real-use authorship and friction remain open. |
| Q04 | What export/import and storage formats best preserve activities and history? | SQLite + Pi sessions + JSON/Markdown export implemented. Restore UI, Anki interchange, and recovery workflows remain open. |
| Q05 | Where is the personal Pi extension, and what contract should Noctua use? | Upstream SDK custom harness implemented; do not assume a separate extension was integrated. |
| Q06 | How reliable are generated exercises, feedback, and inferred ranks? | AI feedback is visibly provisional/correctable. Compare with independently checked work before trusting level suggestions. |
| Q07 | Which OCR, figure, equation, and page fidelity is essential? | Original PDF pages and highlights now work; OCR and model interpretation of rich textbook figures/equations remain unsupported. |
| Q08 | Will writing happen in Obsidian, Noctua, or both? | Obsidian/external edits remain expected. Manual refresh, background recaching and conflict-checked tag/grouped note writes exist. Full editing/split-merge reconciliation remain open. |
| Q09 | Which personal scheduling settings and Anki interoperability are useful? | FSRS is the first scheduler. Review workload caps, tuning, and interchange remain open. |
| Q10 | Which capability should improve next after pilot use? | Flashcards/exercises/Q&A implemented first. Presets and fixed plans remain deferred. |
| Q11 | How should concept selection, section boundaries, duplicates, rename/move, split/merge, and relationships work? | Automatic note/heading units are a first approximation. Fine scope selection and reconciliation are not solved. |
| Q12 | Which observations justify each rank, and how should current memory affect earlier deeper evidence? | T05 gives inspectable heuristic suggestions. No automatic demotion or validated mastery model. |
| Q13 | How can note/chapter/topic summaries preserve missing coverage and untested connections? | No broad mastery aggregation implemented. Avoid averaging a few cards into a whole-topic claim. |

Questions are a backlog, not an intake form or a reason to block authorized implementation.

## What exists now

- Product memory, scientific starting bibliography E1–E11, and a read-only review of the old prototype.
- A native three-column Electron workspace with durable chat, model picker/settings, attached sources, and source citations.
- Scoped vault ingestion, vector caching, hybrid retrieval, visible fallback, and originals/revision-aware references.
- FSRS flashcards, manual editing, legacy card-definition import, durable reviews, and experimental knowledge evidence.
- Source-grounded exercise creation, saved answers, hint/reveal tracking, provisional AI feedback, and learner corrections.
- Exact user-selected concept rank vocabulary, unassessed status, learner-controlled changes, and previewed backed-up Markdown tag writes.
- Interactive concept tab, quick bits, editable guides/goals, grouped learner-reviewed notes, original PDF highlights, role models and opt-in Pi search.
- Adaptive criterion/facet evidence and practice resurfacing, preserving current tags and help conditions.
- Core and native desktop tests using synthetic materials and a mock provider. These establish behavior, not scientific effectiveness or real-model quality.

## Next work

The 2026-10-04 [v1 study ecosystem](v1-study-ecosystem.md) discussion was followed by explicit implementation authorization in D15. Use the implemented shared capabilities against the user's System Design & LLM Architecture example, inspecting actual practice and note-building rather than adding isolated pipelines or a fixed curriculum. Pedagogical validity and the most practical subset remain uncertain.

Use the current experiment to study a small real topic. Inspect how easily a question, useful card set, and meaningful exercise can be prepared and revisited. Check citations, generated-task correctness, feedback quality, and whether rank evidence matches later unaided work. Revise the interaction and evidence model from those observations. Read consequential learning papers in full before treating the bibliography as a validated tutoring policy.

Do not revive a fixed session roadmap or the superseded two-score interface by default. Continue from D09/D10/D15 and the [implementation checkpoint](implementation.md).

## Composition and source access — 2026-10-03

Confirmed user direction: preserve typed/pasted Markdown with real-time rendering and single/double-dollar LaTeX; open vault sources in Obsidian at their cited heading; offer full rendered sources in the right desk. This replaces the saved-passage-only popup and system-viewer handoff for vault notes.

The initial separate live preview was superseded by the user’s same-day clarification that rendering must replace the text in place. Implemented choice: CodeMirror decorations keep raw Markdown authoritative while displaying completed syntax and math directly in the editor; clicking rendered math/tables reveals their editable source. This preserves exact paste/send/copy text and undo rather than round-tripping through a rich-text document. The reader shows current full documents separately from saved citation evidence and defaults to historical evidence when an original has changed. Read-only note rendering includes scoped images/wiki links. PDF initially used extracted text; T08 supersedes that reader with original pages and selectable text. Full Obsidian plugin/embedding compatibility remains open. Native tests intercept Obsidian launches to validate the constructed note/heading URI without touching a personal vault; actual Obsidian navigation still needs a real-vault trial.

## Model controls and composer commands — 2026-10-03

Confirmed user direction: research ChatGPT/Codex subscription access, add reasoning effort beside the model picker, scan available providers when the app opens, shorten the empty composer and let it grow, replace the activity dropdown with `/` tools and colored chips, support searchable `@` vault files, and remove the workspace title header shown in the screenshot.

Implemented experimental choices: SDK capability-based effort levels; authenticated-provider/local scans on startup/focus and idle five-minute intervals with bounded requests and cached fallback; searchable cursor-aware composer menus with keyboard/mouse selection; up to three initial passages per mentioned file within the twelve-passage context limit; existing model-initiated study tools remain enabled. These commands select context/tool intent, without inventing a fixed study sequence. The prior activity dropdown and workspace header are superseded. Direct ChatGPT browser sign-in was subsequently authorized and implemented below; research and the existing opt-in Pi subscription connection are documented in the implementation checkpoint. Real provider account access, model entitlement, and reasoning quality need real-account verification.

## Direct provider sign-in — 2026-10-03

The user explicitly requests easy sign-in from Noctua, including a shortcut to Pi’s flow. Implemented: use the existing Pi SDK OpenAI subscription login directly from Settings, rather than launch a separate terminal/CLI. This supersedes the research-only status above. Noctua handles progress, browser return, manual redirect fallback, cancellation, retry, and disconnect. Credentials are app-owned and encrypted by default; explicitly enabled shared Pi storage continues to use Pi’s locked store. This avoids duplicating OAuth code or adding coding-agent tools. Live account sign-in and paid inference remain unverified by synthetic tests.

## Conversation tabs and selected passages — 2026-10-03

Confirmed user direction: multiple chat tabs inside a conversation, each with distinct context and right-desk activities; selected flashcard, PDF, and Markdown passages can be explicitly added to a chosen tab.

Implemented experimental choice: retain the existing conversation record as the first tab and group additional chat/session records beneath it. This preserves existing histories without rewriting Pi sessions. Each tab retains its draft, selected sources/excerpts, tool intent, desk view, current source, review/reveal, and exercise selection. The study library remains available across tabs, while model history and automatic attachment retrieval remain tab-specific. Closing a tab keeps its history and offers reopening; deleting a conversation removes all its tab histories while retaining study artifacts/evidence. Double-clicking a tab name allows renaming.

Selections are explicit context chips, consumed on the next send and saved with that message. The destination chooser may reopen a closed tab or create a new one. Source/activity identities and labels are resolved in the main process; selected text is a learner-supplied quotation, not verified citation entailment or independent learning evidence. Source snapshots survive cache replacement. PDF selections retain file page numbers; T08 later adds faithful visible pages and normalized highlight rectangles. Browser selection captures displayed text, so visual math/table selections may not preserve original Markdown/LaTeX syntax. OCR and semantic equation/figure extraction remain open.

## Direct selection toolbar and contextual excerpts — 2026-10-04

Confirmed user direction replaces the destination dialog with numbered chat buttons immediately above a highlight. Implemented experimental choice: a viewport-clamped floating toolbar anchored to the selected text, rendered above surrounding content, with a new-tab action. It moves with scrolling, preserves the selection while clicking, and offers closed sibling tabs as reopen destinations. A below-selection placement is used only when there is insufficient room above. Existing quote inspection remains available from a chip; adding no longer opens a dialog.

For context, use both a bounded source window and a usable source-ID pointer for additional reading. Research read: Anthropic’s full [Contextual Retrieval engineering article](https://www.anthropic.com/engineering/contextual-retrieval), and LlamaIndex’s [sentence-window parser implementation](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/sentence_window.py), plus its search-indexed sentence-window tutorial (the old documentation URL failed direct fetching). Anthropic describes adding document-specific context to isolated chunks and recommends evaluation; LlamaIndex retains original text separately from surrounding sentences. These inform our design inference, not evidence that this exact Noctua window is optimal. No learning-effectiveness claim or retrieval-performance gain is adopted.

Noctua stores exact quotes separately from up to about 3,200 characters of original surrounding text, heading/page/line location, and revision. Use exact or formatting-normalized matching near the selected block location; unmatched formatting uses a labeled location fallback. Current source text is used only when its revision matches the displayed revision; otherwise clearly retain saved passage context. When possible, the source pointer is relocated to the selected indexed block/page. Cards include their question and visible answer-side context when that side is selected; exercise context excludes hidden hints/solutions. Activity source links remain available. `read_source(surrounding=true)` expands to neighboring indexed passages of the same document and revision, including explicitly transferred sibling attachment sources, without granting unrelated attachment access.

Alternatives: quote-only loses meaning; pointer-only makes every simple question depend on successful tool use; whole-document inclusion can overwhelm smaller models; generated summaries add latency and introduce interpretation. The hybrid is a bounded first choice, with a character window rather than language-specific sentence splitting to retain Markdown/LaTeX and PDF extraction. Exact math/table selection mapping, OCR, source updates after transfer, and quality evaluation on real questions remain open.

## Model family picker — 2026-10-04

Confirmed user direction: restrict connected ChatGPT model options to GPT-5.6 and newer, and use a hover family menu with individual models to its right. Implemented numeric major/minor filtering of OpenAI catalog IDs only while the subscription connection is active; other providers/local models retain their available catalogs. The runtime rejects a previously selected model that is no longer in the eligible list rather than silently switching provider. Family classification uses model identities across providers, preserving Qwen/GPT and other available families; a flat catalog was superseded. Focus/click navigation, Escape, and a short pointer-exit delay supplement hover. The same-day user refinement removes search and supersedes the reserved two-column layout: the first popup contains compact family chips only, and hovering a chip opens a separate small model flyout to its right. The popup is positioned with room for that flyout within the viewport. Future unknown naming schemes may require classifier updates; no model entitlements are invented.

2026-10-04 picker follow-up: shrink the family popup/model flyout and center the flyout vertically beside the hovered chip, clamping only when needed to stay on screen. Restore GPT-5.6+ catalog entries even when authentication is unavailable; the previous ready-only display hid their family and removed the connection entry point. These entries explicitly show “Connect in Settings” rather than imply successful authentication. Native checks cover restored GPT visibility, compact dimensions, and center alignment.

## Orange interface accent — 2026-10-04

The user supplied an orange reference screenshot for the whole-program accent. Interpretation: adopt warm orange (#ff9f0a) for primary actions, selected navigation/tabs/models, focus, links, and source/context chips while retaining the light paper surfaces. Dark orange text and dark text on filled orange controls preserve readability. Semantic learning-rank, review, feedback, and connection-status colors remain distinct; the logo remains unchanged. This supersedes the muted green/teal interface accent.

## Complete accent and minimalist controls — 2026-10-04

User follow-up supersedes the partial accent treatment: convert remaining green/teal tints throughout interface text, borders, surfaces, status/activity controls to warm orange/neutral shades while retaining luminance and distinct non-green semantic colors. The icon artwork is unchanged. Model families/models are plain compact list rows, superseding family chips. Reasoning uses a compact hover/click popup with a discrete slider, clickable level labels, and keyboard support; only the chosen model's supported efforts are offered. A single-level model disables adjustment. Changes commit on slider release/keyboard action rather than reconfiguring on every drag movement. Native integration mounts the production slider with synthetic capabilities to test hover, keyboard changes, label choice, and Escape separately from real provider entitlement.

## Restore green palette and center reasoning — 2026-10-04

The user explicitly reverses the orange theme: restore the original muted green/teal palette, including surfaces, borders, text, and semantic activity colors. Orange theme directions above are superseded. Recover original colors from the previous packaged stylesheet without reverting the current layout or features. Keep minimalist model lists and the supported-effort slider; center its popup horizontally above its actual trigger. Native verification checks popup/trigger center alignment.

## Qwen/local reasoning correction — 2026-10-04

User correction: Qwen has reasoning; the previous unconditional local `reasoning: false` was incorrect. Read the actual Ollama model's thinking capability/values using `/api/show` and expose only supported controls. Read-only verification of the user's local server confirmed thinking support and Off/Low/Medium/Xhigh, with Medium as server default. Preserve explicit learner effort choice rather than silently changing an existing Off setting. Unknown OpenAI-compatible local servers are labeled “Server default”, avoiding a false claim that the model cannot reason. Cache normalized capabilities separately from durable history; no real inference was requested during this inspection.

References read: [Ollama thinking capability documentation](https://github.com/ollama/ollama/blob/main/docs/capabilities/thinking.mdx) and [OpenAI compatibility documentation](https://github.com/ollama/ollama/blob/main/docs/api/openai-compatibility.mdx). Engineering inference: metadata-driven exact values avoid inventing uniform effort levels across Qwen versions. Native synthetic checks verify the discovered slider and actual SDK requests for Xhigh and Off. Real-model response quality remains unverified.

## Workspace visual cleanup — 2026-10-04

Confirmed user direction: remove the empty-chat explanatory paragraph (“Read, question, practice, revisit…”), remove the study-desk title/slogan, and place Concept map above New conversation with the same filled button styling. Keep the study-desk close control in a compact header. A screenshot follow-up identifies the collapsed-navigation chat tab overlapping the macOS window controls; inset the tab strip and remove the rail border through those controls. This is a targeted presentation change; concept-map opening and chat behavior stay as implemented.

## Wider study-desk resizing — 2026-10-04

Confirmed user refinement: allow the right divider to move farther left. Remove the study desk’s fixed 600-pixel maximum; its maximum now follows available window space while reserving the existing 300-pixel chat minimum and navigation width. Saved larger widths continue to adapt to smaller windows. This supersedes the earlier 600-pixel cap; the navigation cap remains 360 pixels.

## Profile and empty conversations — 2026-10-04

Confirmed user direction: do not save untouched “New conversation” placeholders; add a Profile settings tab with background, custom instructions and a photo shown in chat; move the study-desk activity buttons higher.

Implemented choice: new chats/tabs are temporary in memory, hidden from conversation history and exports until there is actual work. Repeated new-conversation clicks reuse an untouched placeholder. Messages, attachments, selected excerpts and saved study artifacts retain their conversation and required parent; typed drafts retain their identity so existing local draft restoration works. Clearing an otherwise empty draft makes it temporary again. On opening existing databases, default-titled placeholders without messages, source documents, associated study records, a saved draft, a session or used children become temporary. Renamed open chats and any actual history are preserved. The later closed-tab refinement below discards empty closed tabs even after renaming.

Profile text is saved in app settings and included in the next tutor, organizer and evaluator session as learner-provided context/preferences, separate from assessed evidence and subject to existing application boundaries. Optional photos are cropped to a 256-pixel square, saved locally as bounded PNG data, and shown beside user messages; photos are omitted from model prompts. The backend accepts only bounded raster data with matching PNG/JPEG/WebP signatures. Removing a photo and saving returns to the default avatar. The right header is reduced to 28 pixels, with its close control raised, superseding the earlier 52-pixel cleanup header.

Alternatives: hiding persisted empty rows alone would keep accumulating placeholders; deleting chats based only on title would risk losing real work. Profile inference from chat history and sending an avatar to the model are outside this request. Profile context is self-reported, not a learning assessment.

## Framed workspace, visible activity and direct note tools — 2026-10-04

Confirmed user direction: remove the right-desk Concepts tab; offer a concept list in an overlay from the Concept map tab. Use the existing muted navigation color for the surrounding frame/top tabs, rounded paper workspaces and active/hovered study tabs, while inactive study buttons remain white. This replaces the earlier placement of the concept list in the study desk. The searchable overlay starts with compact concept rows and current tags; expanding a row reveals rank/evidence inspection and previewed learner tag writes.

Confirmed note-write refinement: the model should be free to create and modify notes as tools. This supersedes the earlier review-only vault-write restriction and prohibition on model-created notes. Implemented create_note/edit_note operate only on Markdown in the connected vault, allow ordinary subfolders, require reading an existing note and its current revision, and use the existing shared backup/conditional-undo service. Exact replacements must be unique; creation cannot overwrite an existing file. Outside-vault paths and symbolic target files are rejected; creation uses ordinary folders. Assessment tags in Markdown or YAML and note identities are preserved, and new-note frontmatter retains custom metadata. Writes record model origin and appliedBy=model in the saved-change history. Proposed grouped review still exists when requested; the model cannot apply unrelated pending proposals. These writes add no assessment evidence.

Chat replies now retain a bounded activity record with elapsed time and collapsed tool/thinking entries. Each row has a relevant icon, running/completed/error state and expandable input/result or provider-exposed reasoning. Thinking is displayed only when the model/provider supplies it; no unavailable private reasoning is invented. Tool details omit private solutions/hints/card backs, credentials and opaque reasoning signatures. Records survive restart with the assistant message; this is a display projection rather than a raw provider-payload archive. Streaming, stopping and failures preserve actual status.

Alternatives: retaining duplicate right-sidebar concepts would conflict with the requested cleanup; fake reasoning or a prompt-only tool list would not show actual model activity; broad coding/filesystem tools would exceed the requested note editing. The layout preserves independent resizing and collapsed navigation. Real-provider reasoning availability and quality remain provider-specific.

## Clickable desk controls and study chips — 2026-10-04

Confirmed follow-up: the framed workspace's top-right reopen button does not respond to clicks, and Sources/Cards/Practice/Notes should look like separate chips. Place the reopen control in the common tab bar so it is available from chat and the map, and explicitly exclude both desk controls from Electron's draggable window region. Fully round and outline the study chips, with frame-colored active/hovered states and visible spacing above the paper surface. Compact desk widths use icon-over-label chips to preserve all four names. This supersedes the connected white tab shape; the frame palette and saved desk widths remain current.

Further 2026-10-04 refinement: the user likes the chips but requests smaller widths as the desk expands, and alignment of the left navigation toggle with the chat tabs. Implemented presentation choice: chips stop growing at 92 pixels and can shrink in compact layouts; raise the expanded-navigation toggle to the tabs' vertical center. This supersedes chips stretching across the entire desk toolbar.

The following screenshot refinement centers the compact chip group over the expanded desk. Balanced toolbar insets center it on the paper panel when space allows; narrow desks reserve the close control's space while keeping every chip accessible.

## Closed empty tabs and chat quotations — 2026-10-04

Confirmed follow-up: closing an empty chat tab must discard it immediately, including renamed placeholders. Drafts, messages, source documents, selected passages, saved study records and existing Pi sessions count as work and remain reopenable. Startup removes previously saved empty closed entries. An empty first tab can be removed by moving its sibling group to a remaining tab without changing message IDs, attachment scopes or histories; closing also clears the discarded tab’s local workspace state. This refines the earlier blanket “closing keeps history” behavior; a title alone no longer retains a closed tab.

Confirmed follow-up: highlighting saved text in the main chat offers the same floating **Add to Chat 1 / Chat 2 / …** and **+ New chat** actions as source readers. Both learner and assistant messages are supported. The backend checks sibling-tab access and retains the original message identity/role, nearby text and available citations as a durable quotation. Transfers stage context without sending automatically and do not establish independent understanding. Responses become selectable after completion, stop or error saves the message.

Alternatives: retaining closed empty records would continue cluttering the menu; deleting by title alone would lose real work; dropping an empty root without regrouping would orphan its siblings. Chat replies are distinguished from authoritative source content and new learner answers.

## Right-aligned learner messages — 2026-10-04

Confirmed follow-up: place the learner’s avatar and messages on the right, using a compact rounded bubble. The bubble uses the existing soft green palette, sizes to the content and wraps within the available chat width. Message text, quotes, Markdown/math and profile photos keep their existing behavior.

## Providers, default models and background naming — 2026-10-04

Confirmed user direction: rename the connections tab to **Providers** and add a separate **Models** tab for model defaults. Models contains main chat, chat naming, placement/organization and exercise evaluation. Existing main/role choices persist; unspecified auxiliary roles explicitly inherit the main chat model. Provider login, API keys, local endpoints, catalog refresh and opt-in web search remain under Providers. Model selections show connection availability and retain unavailable saved choices rather than silently switching providers.

A new chat receives a concise model-generated name after its first question, using an independent in-memory Pi session alongside the tutor response. Naming receives at most 3,000 characters of the first question, no profile/vault/study context and no tools. It has a 128-token model limit and 15-second cancellation boundary, starts only once per new tab, and stores only bounded title/status metadata. A first-question title remains on failure; the tooltip exposes the failed automatic name. Manual names (including legacy custom names), deleted tabs and the latest tab metadata are protected when a delayed result arrives. Provider reconfiguration cancels naming; shutdown prevents new jobs, cancels existing jobs and waits before closing storage. Interrupted pending names become failed on restart without silently retrying.

Alternatives: waiting for naming would delay study; sharing the tutor session would mix metadata work with study history; switching providers after a naming failure would conflict with explicit role routing. Real-account model entitlement and real-model title quality remain provider-dependent.

## Message header, connected GPT entries and compact composer — 2026-10-04

Confirmed follow-ups: place selected tags alongside “You” and the timestamp in the same user-message header; remove the source-tag row beneath messages; make the composer shorter and narrower. The composer now caps its surrounding width at 760 pixels (previously 940) and uses a 38-pixel empty editor minimum, growing for longer drafts. Inline citations and stored source snapshots remain available; removing the footer chips does not remove citation evidence.

After connecting GPT, show the eligible catalog through the configured OpenAI provider without per-model activation. The previous menu mixed ready models with unconnected legacy OpenAI Codex entries, including duplicates that requested another connection. Shared picker logic now shows connected entries and prefers a ready modern OpenAI entry for duplicate model IDs; before a connection, one entry per eligible GPT model can lead to Providers. Both composer and default selectors use this policy. Read the installed Pi SDK’s OpenAI/legacy provider definitions and runtime auth implementation: readiness is provider-wide. This is not a grant of unavailable model entitlement and does not copy credentials across provider protocols.

## Vault cache deletion — 2026-10-07

The user requested a simple Settings action to delete a folder/vault's caches. Settings → Knowledge now offers **Delete vault cache** for the connected folder. It deletes only that scope's derived documents, passages, vectors, file-stat metadata and indexing timestamp, retaining original files, durable study records, note identities and historical source snapshots. Active tutoring or indexing blocks deletion. Automatic watching stays paused for that vault across restarts until **Chunk & cache notes** rebuilds the index and resumes updates. Immediate automatic rebuilding was avoided because it would undo the requested deletion. Other vaults and chat attachment caches are unaffected; this is logical cache deletion, not SQLite file compaction.

## Movable study tabs — 2026-10-07

Confirmed user direction: replace the always-visible Sources/Cards/Practice/Notes button row with ordinary tabs. A new right-pane tab shows a chooser; selecting an activity converts the tab. The main **+** opens the same chooser, including Chat. Activity tabs can be dragged between the right pane and the main tab strip beside chats, with keyboard-accessible move buttons as an alternative. The panes select activities independently. Closing an activity removes its tab without deleting study records; a right pane with no activities returns to a chooser. Moving the last right-pane activity into main hides the empty pane for more room. Existing chat and concept-map tabs stay in main. This supersedes the earlier fixed activity buttons and right-pane-only placement.

Implemented experimental choice: one tab per activity kind per chat, with pane placement, open tabs and selected activities saved in renderer preferences. Choosing an already-open activity focuses or moves that tab rather than creating a competing copy. Activity surfaces remain mounted and move through CSS grid placement, preserving editors, review state, PDF state and scroll positions. Their existing conversation IDs, attachment scopes and study operations are unchanged. Hidden card panels do not receive review hotkeys. Source reading has its own Sources tab, returning to the originating activity on close. Tutor handoffs open/focus their actual activity tab and retain the existing explicit completion/resume behavior. Saved layout preferences are cleared for discarded/deleted chat tabs and are not part of the study export. A duplicate-instance docking library was avoided to keep state ownership explicit; arbitrary duplicate activity instances and moving chat/map tabs remain outside this iteration.

### Translucent tab and chooser controls — 2026-10-07

The user requested a softer translucent treatment for the new buttons. Chat/study/map tabs and activity chooser buttons now use semi-transparent sage/white gradients, backdrop blur, subtle highlight borders and small shadows. Active tabs remain more distinct, with gentle hover feedback and visible keyboard focus. Motion and transparency preferences have CSS fallbacks. This supersedes the opaque tab/chooser fills; docking and study behavior are unchanged.

### Simpler owl and subtitle-only welcome — 2026-10-07

The user requested only the welcome subtitle and a slightly simpler version of the existing owl using image generation. Removed the large “Make room for understanding” headline, keeping the owl and “LESS SETUP. MORE DEPTH.” subtitle. The built-in image generator edited the original owl into `logo-simple.png`, preserving the perched pose, teal/gold palette and circular outline while replacing circuit tracery and tiny feather facets with larger shapes. All renderer logo placements use the new transparent asset; `logo.png` remains the original reference.

### Empty-chat simplification — 2026-10-07

User follow-up removes “LESS SETUP. MORE DEPTH.” as well, superseding the subtitle-only welcome. The central empty-chat action buttons now share the chooser's translucent gradient, blur, border, hover and focus styling, including reduced-motion and reduced-transparency fallbacks. The simpler owl remains. Tests were not rerun, as explicitly requested.

### Welcome headline restored — 2026-10-07

The user requests the earlier large serif headline style again, with the new wording “A place to understand”. The welcome displays “A place to” followed by italic “understand.” in the original type, colors and spacing. This supersedes removal of the headline; the all-caps subtitle stays removed, and the simplified owl and translucent action buttons remain. Tests were not rerun, following the user's existing instruction.

## Message copy and reply forks — 2026-10-09

Confirmed user direction: copy Markdown from both learner messages and bot replies, and fork a bot reply into another chat. Saved message footers now expose **Copy Markdown**; assistant replies additionally expose **Fork to new chat**. Copy uses the saved raw Markdown rather than rendered text. Fork creates a sibling chat with the entire saved reply staged as a durable quotation, preserving its message identity, authorship and accessible source snapshots. It opens the destination for a follow-up without automatically sending anything. This is a message-centered fork, not a clone of the full conversation or its Pi session. It creates no learning evidence and duplicates no reviews or attempts.

The backend derives the reply from a trusted saved message ID and creates the chat/reference transactionally. Sending an already-persisted quote includes a bounded text placeholder in IPC; existing saved-reference resolution restores its complete immutable text. This avoids truncating long forked replies at the ordinary excerpt-input limit. Clipboard failures and fork errors remain visible. Validation: TypeScript and formatting checks; tests were not rerun under the user's earlier instruction.

## Model concept-creation ID correction — 2026-10-09

The user reported repeated “This concept is outside the current vault or chat” errors from save_concept. Inspection found that model-invented IDs for new concepts were interpreted as existing record IDs. The model-facing tool now documents that creation omits id and returns the stable app ID. A supplied ID absent from storage is treated as a creation label rather than an update target; the shared service still generates the actual UUID. Creation first reuses a unique active same-title concept within the inferred source/vault scope, avoiding duplicate concepts on retries. Ambiguous title matches require choosing an existing ID. IDs that actually exist in another scope or are archived still fail; mixed source scopes still fail. This correction is restricted to the model tool; manual update semantics are unchanged. Typecheck and formatting validation only; tests were not rerun under the user's existing instruction.

### Icon-only message actions — 2026-10-09

User refinement: Copy and Fork message buttons show only their icons in compact square controls. Tooltips and accessible names retain the action descriptions. Behavior is unchanged; tests were not rerun under the existing instruction.

## CSV flashcards and batch library actions — 2026-10-14

Confirmed user direction: import flashcards from CSV with configurable separators and related options, review imported cards normally, remove cards from previous iterations, and make batch addition/deletion easy.

Implemented experimental choice: Cards → **Import CSV / add batch** accepts UTF-8 CSV/TSV files or pasted delimited text. It guesses common separators and recognizable question/answer headers for files; the learner controls separator (including a custom character), header handling, question/answer columns, optional concept and exact-pair duplicate skipping. A question/answer preview precedes saving. Quoted separators/newlines and doubled quotes are supported; Markdown/LaTeX and backslashes remain literal. Invalid/missing/oversized fields reject the complete batch instead of silently dropping cards. Limits are 5 MB of input and 10,000 cards. The main process parses and validates independently of the renderer and saves transactionally. Imported cards have new FSRS schedules and retain filename, record number, file hash and import date; CSV is learner-supplied content, not verified source grounding or assessment evidence.

The library has per-card selection, Select all and Delete selected; single-card deletion uses the same operation. Deletion suspends cards and hides them from review/evidence, retaining definitions and immutable reviews. Undo deletion restores the latest batch with its schedules. Archived cards reject stale review requests, and legacy Markdown reindexing preserves their suspension. Hard deletion was avoided to protect review history; no vault files are modified. Undo is a current-panel action rather than a general archived-library browser. CSV imports do not transfer foreign scheduler state, HTML formatting, or semantic duplicate detection.

One-time authorized cleanup removed the 132 active vault-imported cards in the existing local profile from the active library. A private definition recovery copy was saved under the profile's `card-backups/`; reviews and vault originals remain. This was a local data action, not an application migration that would clear other users' cards on startup. New Markdown card definitions can still be discovered during indexing.

Validation: `npm run typecheck`, all 101 tests across 16 files via `npm test`, `npm run format:check`, and `npm run build` passed. The native desktop smoke check passed with synthetic resources and the real Pi SDK, including CSV file input/header and separator detection, reversed column mapping, preview, duplicate skipping, restart persistence, FSRS review, batch delete/undo and pasted batches. Native execution required an unsandboxed retry because the sandbox blocked the mock loopback server.

## Saved GPT connection lost during model scans — 2026-10-14

The user reports GPT-6 Luna repeatedly opening Settings before a message can send, despite working after Settings is saved. Reproduced with a synthetic saved OpenAI subscription and the real Pi ModelRuntime: `refreshOnCreate: false` leaves the new runtime's authentication availability snapshot empty. Startup/focus/periodic scans selected network-refresh providers before any credential-status refresh, passing an empty provider list and publishing GPT entries with `ready: false`. Ordinary Settings saves used a full offline refresh and recovered readiness until the next scan.

Correction: every new runtime first performs a network-disabled catalog/auth-availability refresh after app credentials and explicit API keys are restored. Network discovery then selects only providers whose authentication is configured. No provider/model substitution or credential copying occurs; actual disconnected providers stay unavailable. The regression test first failed on the prior code and now covers startup, Settings saves, and repeated scans with the exact `openai/gpt-6-luna` choice and synthetic encrypted credentials. Live-account inference was not needed or performed.

Validation: all 102 automated tests, type checking, formatting and production build passed. Native Electron smoke checks passed after retrying outside the sandbox to allow the synthetic loopback server. No live provider inference or credential edits were performed.

## Backslash LaTeX delimiters in rendered output — 2026-10-14

Confirmed user direction: render model-output LaTeX using both dollar delimiters (`$…$`, `$$…$$`) and backslash delimiters (`\(…\)`, `\[…\]`). The shared Markdown renderer now adds a Micromark/Remark syntax extension before Markdown removes punctuation escapes. Parentheses select inline KaTeX; brackets select display KaTeX, including multiline expressions. Existing dollar parsing remains. Code fences, inline code and escaped delimiter examples remain literal. Incomplete streaming formulas fall back to normal Markdown until closed. Parsing preserves original message/vault text, character offsets and line positions; copy, quotations, stored history and exports retain the original delimiter syntax.

This is a rendering change rather than a prompt policy or content migration. A global string replacement was avoided because it would also modify code examples and risk source anchors. The shared renderer serves chat and read-only study/source surfaces; the editable composer's existing dollar-math decorations are outside this output-focused request.

Validation: type checking, all 107 tests in 17 files, formatting and production build passed. The native desktop smoke check passed with a synthetic Pi model reply containing all four delimiter forms; it verifies inline/display counts, literal code, unchanged saved reply text and rendering after reload. Inspected the resulting desktop screenshot. Unit cases cover multiline matrices, CRLF, quoted/list math, source line anchors and every incomplete streaming prefix of a display expression.
