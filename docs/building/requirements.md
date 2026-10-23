# Initial requirements

Updated: 2026-10-04. The user has requested a first experiment and then implementation of the accepted connected v1 study logic. Current behavior is documented in [implementation.md](implementation.md); confirmed objectives, discussed future capabilities, and proposed acceptance criteria remain distinct.

## Confirmed and provisional direction

| ID | Status | Requirement |
| --- | --- | --- |
| R01 | Confirmed | Build an Electron desktop app named Noctua. |
| R02 | Confirmed | Prioritize deep understanding and awareness of the learner's level; use STEM as the initial focus without excluding other fields. |
| R03 | Confirmed | Help the student enact a useful study process consistently, reducing preparation and administrative time. |
| R04 | Confirmed | Preserve student thinking and learning; AI acts as a tutor. |
| R05 | Confirmed; refined by D16 | Preserve learner contributions while allowing the model to create and modify notes for the learner's current goal. Record model authorship; saved content is not evidence of independent understanding. The earlier prohibition on creating complete notes is superseded by the explicit 2026-10-04 note-tool request. |
| R06 | Confirmed | Connect to a folder of Markdown files for permanent knowledge storage; the user's intended folder is an Obsidian vault. |
| R07 | Confirmed | Use a personal custom extension of the Pi agent framework as the model harness. |
| R08 | Confirmed | Support both local and API models. |
| R09 | Provisional user direction; implemented choice T01 | SQLite now separates rebuildable document/vector caches from durable chats, attempts, reviews, and learning records. Recovery and migrations remain important. |
| R10 | Confirmed | Progressively document the app's behavior and scientific rationale in `docs/`. |
| R11 | Confirmed | Maintain `docs/building/` and a root `AGENTS.md` as project memory across chats. |
| R17 | Confirmed | Prioritize help with independently useful study activities. Let the learner combine reading, questions, exercises, and flashcards freely and revisit specific work. Optional presets are a possible later layer; a fixed session sequence or model-generated roadmap is not the current focus. |
| R18 | Confirmed | Treat selected vault information and skills as targets for internalization. Selected source material counts too, rather than only learner-authored notes. Stored content is not automatically evidence that it is learned. |
| R19 | Superseded interface; underlying distinction retained | The earlier two visible scores, remembering and understanding, are replaced by R20. Recall still differs from explanation, application, and transfer; valid assessment and relevant memory dependencies remain open. |
| R20 | Confirmed | Tag each concept with `#unknown`, `#knowledge`, `#comprehension`, `#application`, or `#transfer`. Concepts can be whole notes or parts of large notes. Flashcard evidence should influence knowledge; mere recall must not establish higher ranks. |
| R21 | Confirmed | Parse the vault and cache vector representations so the model can retrieve relevant context. |
| R22 | Confirmed | Implement Q&A, flashcards, and exercises first. Creation can use the learner's request, supplied resources, selected notes, or a combination. |
| R23 | Confirmed | Use a main chat with settings/previous chats on the left and tools on the right. Provide a model picker in the chat composer using Pi and local/API models. |
| R24 | Confirmed design direction | Tools share context and learning targets organically; a tutor understands current work and can choose tools dynamically. Learners can directly enter the same activities without a fixed sequence. |
| R25 | Confirmed design direction | Core study tools support manual use without AI, including flashcard creation/review. Prefer a few practical, carefully developed capabilities. |
| R26 | Confirmed design direction | Reuse Pi's built-in capabilities and suitable extensions, including desired memory/web-search support, without rebuilding agent infrastructure. Pi Web Access search-only backend and durable continuity complement upstream Pi sessions. |
| R27 | Confirmed; experimental v1 implementation | Quickly capture small bits through Noctua, place/link them in the vault, and connect useful practice without requiring navigation to the exact note first. |
| R28 | Confirmed; experimental v1 implementation | Keep note identities and associated durable study history stable across title/path changes. Exact metadata and reconciliation policy remain open. |
| R29 | Confirmed; experimental v1 implementation | Read imported/vault PDFs as resources, highlight passages, and ask contextual questions. Preserve originals and source/version/location fidelity. |
| R30 | Confirmed; refined by D16 | Refine notes collaboratively from learner work and reflections. Vault-scoped create_note/edit_note may save directly with revision checks, backups and undo; grouped proposed changes remain available when review is requested. General coding/filesystem writes remain disabled. |
| R31 | Confirmed; experimental v1 implementation | Connect concepts/skills to notes, sources, ranks/evidence, cards, and exercises. Provide a useful interactive map opened from the left sidebar as a workspace tab. Exact graph semantics/renderer remain open. |
| R32 | Confirmed; experimental v1 implementation | Offer flexible topic guides, guided concept study, relevant vault resources, and new web resources including papers/textbooks. These do not require a generated curriculum or fixed activity sequence. |

## Capability scope and checkpoint

Confirmed interests. The accepted v1 expands the first scope with connected guides, capture, graph and resource interactions:

| ID | Capability | Design questions |
| --- | --- | --- |
| R12 | Anki-like flashcards and scheduling | First implementation uses maintained FSRS, reveal/rate reviews, manual editing, and durable events. Workload policies, fitting, and Anki interoperability remain open. |
| R13 | Topic study guides | Editable manual/assisted guides link goals, concepts, questions, actual resources and saved practice without prescribing a sequence. Quality needs real use. |
| R14 | Exercises the learner answers | First implementation creates exercises with hints/criteria/solutions, saves answers, and provides correctable provisional feedback. Reliability and difficulty need real examples. |
| R15 | Resource gathering and processing | Markdown/text, faithful PDF pages, saved highlights, opt-in web search and explicit imports exist. OCR and model figure/equation interpretation remain open. |
| R16 | Retrievable references for information the model uses | Revision-aware passage/line/file-page snapshots and original-file access exist. Figure/region anchors and claim-entailment checking remain open. |

This list remains open to further ideas. The explicitly selected first experiment is R20–R23 with R12/R14/R16; it is not a commitment to copy Anki's implementation or implement every future capability.

R24–R32 were accepted for implementation in D15 on 2026-10-04, with adaptive requested depth, no fixed level ladder, precise facet/criterion evidence, guided right-desk return, optional notes-on-study, role model choices and smart RAG recaching. The [v1 study ecosystem](v1-study-ecosystem.md) records the design origin; [implementation.md](implementation.md#connected-study-ecosystem--2026-10-04) records actual behavior and limits.

## Proposed acceptance criteria

These make the direction concrete for discussion. They are not additional confirmed requirements.

| Applies to | Candidate behavior we could verify |
| --- | --- |
| R02, R04 | Show evidence for different abilities, including the attempt, help received, date, and task context. Keep assisted and independent performance distinct; leave untested abilities unassessed, separate from `#unknown`. |
| R18, R20 | Map selected content to assessable information, skills, and relationships. Link observations to the specific units and criteria they test; inspect source anchors and correct mappings or assessments. |
| R20 | Show ranks with evidence, missing coverage, dates, and assistance. Keep unassessed status distinct from `#unknown`. Duplicate cards and repeated variants should not inflate topic evidence. Memory gaps should prompt relevant checks instead of silently erasing deeper evidence. |
| R21, R22 | Reuse cached representations of unchanged content, invalidate changed revisions, keep attachment retrieval scoped to its chat, and visibly fall back when local embeddings are unavailable. Preserve activity evidence when rebuilding the cache. |
| R23 | Switch models in the composer, restore previous chats, and use the right-side tools without a fixed study sequence. Reject privileged requests outside the validated application interface. |
| R03, R17 | Return to a chosen passage, problem, question, or unfinished attempt with its relevant context available. Use an individual capability without first creating or reconstructing a session plan. |
| R17 | Support mostly reading with occasional flashcards, mostly exercises, and returning to a specific idea after switching activities. Do not require completion of other activities to use the requested help. |
| R04, R14 | Give feedback tied to the student's reasoning; adjust support when prerequisites are missing or difficulty is unproductive. Assess AI grading uncertainty and allow correction. |
| R05 | Preserve the student's explanation, solution, sketch, and existing note contribution. Distinguish model additions in saved-change history and allow inspection and undo. |
| R06 | Notes remain readable and editable outside Noctua. Preserve existing frontmatter, links, math, embeds, and attachments. Detect external edits before applying a conflicting change. |
| R08 | Make the model and processing destination clear. Local operation must not silently fall back to a remote provider. Non-AI source browsing and note access remain useful when a model is unavailable. |
| R09 | Rebuilding an index must not delete attempts, review history, or learner-authored content. Define backup/export for durable state separately from cache reset. |
| R12 | Separate scheduling from AI feedback. Record review events and scheduler version/configuration so state can be inspected and, where supported, recalculated. |
| R14 | Use source exercises where suitable. Check generated problems for ambiguity, solvability, and defensible feedback before using them as evidence of understanding. |
| R15 | Retain the original document and page/figure relationships. Inspect OCR and equation uncertainty; show source images when text extraction loses meaning. |
| R16 | A reference opens the correct source location. Distinguish quoted material, source-supported explanation, and model inference. Missing or stale support is visible. |

## Evaluation before expansion

Proposed first evaluation: choose one concrete activity on a real STEM topic, such as understanding a passage or working through an exercise. Compare the user's current approach with Noctua's support for that activity. Inspect preparation effort, quality of learner reasoning, usefulness of feedback, and later independent performance. Also check whether the learner can leave the activity, do something else, and return to a specific point. A personal pilot can expose interaction problems; it cannot establish general scientific effectiveness.

For feature proposals, ask what learning activity they enable, what friction they remove, what the student still has to do, and how their benefit could be checked. Scientific starting points are in [evidence](evidence.md); unresolved details are in [decisions](decisions.md).

## Confirmed source and composer refinement — 2026-10-03

- Preserve chat Markdown source while typing, pasting, and sending; render Markdown and `$...$` / `$$...$$` LaTeX immediately in the editable text itself, without a separate preview.
- Open vault originals through Obsidian, including the cited heading when present.
- Allow quick full-source reading with rendered Markdown in the right desk. Keep current file contents distinct from historical cited passages, and retain access to saved evidence when originals change or disappear.

Confirmed 2026-10-03 refinement: reasoning-effort control next to the model picker, startup provider model discovery, a compact growing composer, `/` tool selection with colored chips in place of the activity dropdown, searchable `@` vault file links, and removal of the workspace title header. Research the current ChatGPT subscription integration route separately from API-key access.

Confirmed follow-up on 2026-10-03: allow ChatGPT subscription sign-in directly from Noctua using Pi’s flow, without requiring a separate Pi session. Provide cancellation/retry and preserve provider credentials across restarts when protected storage is available.

Confirmed follow-up on 2026-10-03: each conversation can contain multiple chat tabs with separate model context and associated right-desk activity state. Selecting a passage in a flashcard, PDF, or rendered Obsidian Markdown source offers **Add to chat**, with an explicit choice of existing or new destination tab. Context transfer is a foundation for later extensions, not automatic sending or automatic activity switching.

Confirmed 2026-10-04 refinement: show direct **Add to Chat 1 / Chat 2 / …** actions immediately above highlighted text, overlaying surrounding content if necessary, without a separate destination screen. Transfers must include useful source context beyond the exact passage. Research surrounding-text windows versus source pointers with on-demand reading and choose an implementation suited to Noctua.

Confirmed 2026-10-04 model-picker refinement: after ChatGPT subscription connection, expose only GPT-5.6 and newer OpenAI models. Hovering the picker shows base families (initially Qwen and GPT); hovering or choosing a family reveals its individual models in a column to the right. Preserve keyboard/click access. Same-day follow-up removes search and requires a compact family-chip popup with no reserved model space; hovering a family opens a separate small menu to its right.

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

Confirmed 2026-10-04 follow-up: fix the top-right desk reopen control's click handling, including from the concept-map workspace. Make Sources/Cards/Practice/Notes separate rounded chips, with space between them and the paper surface, preserving the existing frame-colored active/hovered states and compact-width access.

Next same-day refinement: retain the chips but keep their widths compact when the desk expands; align the expanded left-navigation toggle with the chat tabs.

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

## Movable study tabs — 2026-10-07

Confirmed user direction: replace the always-visible Sources/Cards/Practice/Notes button row with ordinary tabs. A new right-pane tab shows a chooser; selecting an activity converts the tab. The main **+** opens the same chooser, including Chat. Activity tabs can be dragged between the right pane and the main tab strip beside chats, with keyboard-accessible move buttons as an alternative. The panes select activities independently. Closing an activity removes its tab without deleting study records; a right pane with no activities returns to a chooser. Moving the last right-pane activity into main hides the empty pane for more room. Existing chat and concept-map tabs stay in main. This supersedes the earlier fixed activity buttons and right-pane-only placement.

Implemented experimental choice: one tab per activity kind per chat, with pane placement, open tabs and selected activities saved in renderer preferences. Choosing an already-open activity focuses or moves that tab rather than creating a competing copy. Activity surfaces remain mounted and move through CSS grid placement, preserving editors, review state, PDF state and scroll positions. Their existing conversation IDs, attachment scopes and study operations are unchanged. Hidden card panels do not receive review hotkeys. Source reading has its own Sources tab, returning to the originating activity on close. Tutor handoffs open/focus their actual activity tab and retain the existing explicit completion/resume behavior. Saved layout preferences are cleared for discarded/deleted chat tabs and are not part of the study export. A duplicate-instance docking library was avoided to keep state ownership explicit; arbitrary duplicate activity instances and moving chat/map tabs remain outside this iteration.

## CSV flashcard library — 2026-10-14

Confirmed: import a CSV flashcard file with separator and related options; use the usual recall/review flow afterward; clear previous-iteration cards and offer convenient batch creation and deletion. Implemented: file/pasted-text preview, separator/header/column mapping, optional concept, exact-pair duplicate skipping, transactional new-card creation, library selection and reversible batch removal. Retain review history and provenance; importing content creates no learning evidence. Details and limits are in [the checkpoint](implementation.md#flashcards) and [the decision record](decisions.md#csv-flashcards-and-batch-library-actions--2026-10-14).

Confirmed output-rendering refinement (2026-10-14): accept `$…$` / `$$…$$` and `\(…\)` / `\[…\]` LaTeX in model replies, with inline/display semantics and original stored text retained. Implemented in the shared Markdown renderer; code examples remain literal.
