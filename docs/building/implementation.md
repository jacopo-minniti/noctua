# First experimental implementation

Composer/reasoning check (2026-10-10): user requested slightly rounder message-box corners and verification of model reasoning levels. Composer radius increases from 13 to 18 pixels. Read-only local Ollama metadata for the installed Qwen 3.8 MLX model reports `thinking.values=[false,"low","medium","xhigh"]`, default `medium`; High is not advertised. Existing exact capability parsing, supported-level selection and wire mapping already preserve this sparse set; no invented High option is added. Existing synthetic tests cover this exact set plus boolean/always-on thinking. Ollama's official thinking documentation describes `/api/show` as the discovery source: https://github.com/ollama/ollama/blob/main/docs/capabilities/thinking.mdx.

Fluid PDF zoom (2026-10-10): following the user's report of blank flashes, zoom immediately scales the existing page bitmap, text and highlights together. Resolution redraws wait briefly for the gesture to settle and render into detached canvas/text buffers; completed buffers replace the visible content together. The previous page stays visible during redraw, retaining its matching page/revision identity. This avoids clearing the visible canvas or hiding an already-rendered page on every zoom event.

PDF gestures and citation context (2026-10-10): confirmed user direction adds trackpad pinch zoom through Chromium's Ctrl-wheel gesture events, while ordinary two-finger scrolling continues to pan/read. Horizontal page scrolling is contained beneath the stationary page/zoom toolbar. Cited passage appears only when opening a source from a citation, study evidence or saved quotation; ordinary attachment/document opens show the full source. Revision warnings and historical fallback remain intact.

Continuous PDF reading (2026-10-10): confirmed user direction replaces the single-page reader with a vertically scrolling page stack. Nearby pages render lazily; distant page canvases/text layers unmount while dimension placeholders preserve scrolling. Every rendered page retains its own revision, page identity, selection layer and highlight rectangles. Page controls now scroll within the document and track the visible page. Removed the hidden loading paragraph that reserved blank space below the controls, and made the controls compact without wrapping. Original PDF margins remain part of the document rendering.

Viewer chrome (2026-10-10): confirmed user direction names the open Sources tab after the document (PDF filename with ellipsis for long names), and replaces the stacked PDF/image heading, actions, view toggles and revision row with a thin toolbar. Original/reload/context controls retain accessible names and tooltips; revision information remains in the viewer tooltip and changed/missing-source warnings remain visible. Page and zoom controls sit immediately above the PDF rather than below the previous large metadata block.

Composer file drop (2026-10-10): confirmed user direction adds native PDF/image drag-and-drop to the message box, with a drop indicator. Preload resolves dropped File objects using Electron webUtils; the backend validates bounded attachment paths and reuses the same file copying, size/type limits, indexing and source provenance as the file picker. Dropping stages preview cards without sending a message or modifying the original files. Markdown/text drops use the same supported attachment path.

Attachment/message refinement (2026-10-10): the user requested shorter PDF crops, learner message metadata/actions outside the colored content bubble, and square image attachment previews with a zoomable tab. PNG, JPEG, GIF and WebP attachments now use the same scoped copy/index/source access as PDFs; their indexed text explicitly identifies unextracted image content rather than inventing visual descriptions. Preview clicks open images in the main Sources tab, with zoom/reset and scrolling; PDF clicks continue opening the right sidebar. Image pixels are local display assets, not model vision input or assessment evidence. Existing Markdown/PDF retrieval behavior remains intact.

PDF attachment previews (2026-10-10): confirmed user direction replaces title-only PDF context with a first-page thumbnail card in the composer and saved learner messages. Both open the PDF reader in the right sidebar, moving Sources there if needed. Sending clears attached resources from composer context; a failed send restores them. Attachments remain indexed for subsequent chat retrieval and saved message source snapshots remain durable. Thumbnails use the existing bounded source-bytes action and require the saved revision; unavailable or changed files retain a clickable fallback card. No derived preview is persisted as learning evidence.

Sidebar divider refinement (2026-10-10): at the user's request, hovering the separators beside the main workspace no longer colors their full height. The resize cursor, dragging feedback and keyboard focus indicator remain available.

Updated: 2026-10-04. Implements D10 and the accepted connected-v1 refinements in D15. This checkpoint describes software behavior, not a validated learning intervention.

## Run and configure

Use Node 22.19+ and npm. `npm ci` installs the locked dependencies; `npm run dev` builds the Electron main/preload and opens the renderer with hot reload. `npm run build` produces `out/`; `npm start` opens that build. `npm run package` creates an unsigned application directory in `release/` for the current platform. Signing, installers, and updates are not configured.

Connect a Markdown/Obsidian folder from the sidebar. Set a chat model in Settings and choose it in the composer. API keys are app-managed; reuse of existing Pi credentials is a separate opt-in. A local OpenAI-compatible tool-capable server defaults to `http://127.0.0.1:11434/v1`, with discovery and manual model IDs. Noctua does not install or download chat models.

Vector retrieval uses local Ollama's `/api/embed` endpoint, default model `nomic-embed-text`. Install that model separately if wanted (`ollama pull nomic-embed-text`) and refresh the index. Missing/offline embeddings leave a working lexical index and an explicit coverage/fallback status. Selecting local processing never activates a remote embedding fallback.

The Settings panel displays the data directory. `NOCTUA_DATA_DIR` can point development/tests at a disposable profile. Never use personal vaults, keys, or study histories as test fixtures.

## Workspace and context

- **Left:** current vault, chats, new chat, concept map and settings; study activities live in the right desk. Reopening a chat restores its transcript and associated attachments/activities.
- **Center:** streamed Pi chat, source chips/citations, input attachments, model picker, reasoning effort, `/` study tools, and `@` concept and vault file selection.
- **Right:** Sources, Cards, Practice and Notes (bits, changes, guides). Activities are independently usable; there is no fixed session sequence.

The workspace stays within the window: the transcript and study desk content scroll independently while the composer and desk tabs remain visible. Columns and composer controls adapt to smaller widths, with a native minimum window of 900 × 600. Streaming follows the transcript's bottom without moving the surrounding workspace; scrolling up pauses following, returning near the bottom resumes it, and sending a new question or opening a chat resumes following. The sidebar can scroll when its controls exceed the available height. Drag the edges between the chat and either sidebar to resize it; focused edges also support Left/Right arrow keys. Each sidebar has its own collapse button. Navigation collapses to a 64-pixel icon rail with chat, new-chat, vault, settings, and expand controls; only the study desk disappears fully and uses a small button in the top-right chat corner to reopen. Flashcards and Practice use the right study desk; the interactive concept map is a center workspace tab opened from navigation; its Concept list button opens the concept/rank list as an overlay. Opening and closing animate the column widths and opacity, respect reduced-motion preferences, and disable interactions with collapsed content. Widths and visibility are remembered locally, automatically constrained on smaller windows, and restored when space returns. Closing a sidebar keeps its mounted activity state.

The model can combine the user's request, selected note passages, retrieved vault passages, and attached sources. It can create cards/exercises through validated tools so outputs appear as durable activities. Inputs are not required to be source-only: a learner can ask about a topic or supply a combination. Material lacking a source remains visibly uncited; the harness does not invent citations.

Selection and initial retrieval are bounded to twelve passages; longer notes need targeted search rather than assuming every page fits in context. General chat streams and can be stopped, including during preparatory embedding retrieval. Model failures remain visible in the transcript.

The chat-composer footer captions, study-desk slogan/footer, and Sources explanatory tip (including its container and spacing) are removed following the user’s 2026-10-03 UI cleanup requests.

The composer preserves typed/pasted Markdown exactly, including indentation and trailing newlines, and renders formatting directly in the editable text using CodeMirror. Completed emphasis, headings, links, and code are styled in place; complete single/double-dollar formulas and tables render in the same editor. Click a formula/table to edit its source; leaving it restores rendering. Enter sends, Shift+Enter inserts a newline, and undo/redo and plain-text Markdown copying remain available. There is no separate preview panel or eye toggle. Note creation/editing is handled by explicit study tools with durable model-origin change history.

Sources open in the right desk reader, keeping chat and activity drafts available. Full Markdown notes render headings, tables, code, math, scoped local raster images, and links to indexed vault notes (including wiki links). A cited heading is scrolled into view. Full source reads the current file without adding the whole note to model context; Cited passage retains the exact saved evidence. Changed or missing originals are identified, with saved passages shown first for changed files. Markdown/text reader limit is 2 MiB; PDFs up to 40 MiB render original pages with selectable text, navigation and zoom. Selection can be added to chat, kept as a bit or saved as a revision/page highlight. Obsidian plugins, transclusions and OCR are not reproduced; extracted model context can still lose equation/figure structure.

Open source in Obsidian uses a backend-constructed, encoded open URI for the trusted vault file and cited heading. Attached originals use the system viewer. See [Obsidian URI documentation](https://obsidian.md/help/uri). The containing vault must be registered in Obsidian.

## Source ingestion and RAG

Vault indexing recognizes `.md`, `.txt`, and `.pdf`, ignoring hidden directories, symlinks, and oversized files. Attachments are copied into the app data directory and scoped to their chat. The first limit is 40 MB per source.

Markdown passages retain headings and line ranges. Text-based PDF passages retain file page numbers. A source ID includes vault/chat scope, relative path, revision, and passage location. The index caches extracted text and normalized vectors separately from study records. Unchanged files reuse their cached representation; changed files replace only derived content. Search combines lexical ranking and cosine similarity, with visible lexical fallback when vectors are absent.

Messages, cards, and exercises save source snapshots. A reference opens the saved text and identifies the source revision/location. It checks whether the original changed or disappeared. A saved historical passage can be explicitly reused; it is not silently presented as current text. Citation IDs must come from real retrieved/read passages, although this does not prove every model claim is entailed by its cited text.

External edits are debounced and recached in the background. If native watching fails, lightweight periodic file-stat checks trigger updates. **Chunk & cache notes** explicitly refreshes everything; unchanged passages retain matching vectors. Remaining limits include OCR, model figure interpretation, reliable extracted equations, printed-page mapping and large-vault benchmarks. The original page reader is separate from text-only retrieval.

## Flashcards

The model prepares bounded card sets from requested topics and available sources. Each saved card has front/back, concept association when available, source snapshots, a content hash, and FSRS state. Exact duplicate prompts within a concept are rejected; semantic duplicates are not resolved.

Manual cards can be created, edited, or archived without a model. Cards → **Import CSV / add batch** also accepts UTF-8 CSV/TSV files or pasted delimited text, with a preview, configurable separator/header/columns, optional concept and exact question/answer duplicate skipping. Quoted fields preserve separators, newlines, Markdown and LaTeX. Invalid records reject the entire batch; imports are bounded to 5 MB and 10,000 cards, retain import provenance and start new FSRS schedules. Select individual cards or Select all, then **Delete selected**; **Undo deletion** restores the latest batch with its schedules. Deletion hides/suspends cards, keeps reviews and definitions, and prevents stale reviews. Original vault files are untouched; legacy reindexing keeps archived cards suspended. Legacy `Question : Answer #flashcard` and multiline `#flashcard` / `---` definitions are imported from Markdown. Old embedded scheduler JSON is not trusted. Review state stays in durable app records instead of rewriting notes after every review.

Review requires a learner attempt before reveal as an interaction convention. The app cannot observe whether retrieval really happened. After reveal, Again/Hard/Good/Easy ratings update `ts-fsrs` 5.4.2 with retention 0.9, fuzz off, and default parameters. Keyboard Space reveals and 1–4 rate. Duplicate stale review submissions are rejected using expected repetitions.

Each event retains before/after state, timestamp, rating, scheduler configuration/version, and card-content version. Editing the prompt/answer starts a new schedule; past events remain. A concept's recall display averages modeled retrievability over reviewed active cards, alongside reviewed/total coverage. It is neither a full-topic memory score nor understanding evidence.

## Exercises and feedback

Creation stores the prompt, exercise kind (`knowledge`, `comprehension`, `application`, or `transfer`), hints, solution, evaluation criteria, concept association, and sources. A model's task classification is a proposal, not evidence of level or transfer.

The learner writes an answer and can request hints, check reasoning, or explicitly reveal the solution. Draft answers persist when leaving the input. Hint count and solution reveal persist across restarts and repeated attempts; closing an exercise does not reset assistance. The learner can report outside help too. The app cannot detect undisclosed external help.

Checking uses a separate bounded Pi session and records provisional feedback with correct/partial/incorrect/ungraded status. The learner can correct the outcome; assessment revisions retain the previous judgment. Solutions remain hidden in the interface until requested, while feedback addresses the attempted reasoning. A prompt alone cannot guarantee model grading or generated-task correctness; real STEM examples need review.

## Concepts and rank tags

The exact five tags and their definitions are in [learner-model.md](learner-model.md). Whole notes are concepts; notes over approximately 3,500 characters or explicitly ranked subsections also expose heading-level units. Text/PDF documents have whole-document concepts. This is a first granularity rule, not a complete learning-inventory editor.

New units have no rank (**unassessed**). Existing frontmatter rank tags, standalone rank tags, heading tags, and Noctua markers can initialize the rank. The learner can set any rank and inspect recall counts and exercise evidence. Automated code only suggests ranks:

The earlier fixed card/two-question promotion rules are superseded. Current evidence uses facet/criterion coverage, content versions, dates, task families, contexts, recorded help and uncertainty, described in [learner-model.md](learner-model.md). Tags remain learner-controlled. Desired depth and prerequisite gaps guide useful practice without a forced ladder or automatic unlocking. All inference thresholds are unvalidated heuristics.

Changing a tag in the app records a durable learner event. Writing it to a Markdown note is a separate action: inspect the full preview, then save. The backend verifies the revision, saves an original backup under `note-backups/`, and atomically replaces the file. A conflicting external edit rejects the write. Other notes/sections are not rewritten. PDF/text concepts cannot receive Markdown tag writes.

## Durable storage and exports

SQLite stores chats, study artifacts, attempts, help, reviews, rank history, and settings separately from document/chunk/vector cache. Pi JSONL files retain conversation/tool history. Cache rebuilds preserve study records and saved source evidence.

Settings exports either a full study JSON record/session backup or portable card/exercise Markdown. Credentials are excluded. JSON restore/import is not yet implemented; back up the actual app data directory, vault, and originals as well. Durable document IDs distinguish entity identity from path and revision. Existing-note renames can be reconciled conservatively by unique content signatures; `noctua-id` frontmatter supplies portable identity when available, and newly approved notes include it. Copies do not alias live originals. Ambiguous rename/split/merge cases still need manual reconciliation.

## Validation and remaining work

Commands:

```sh
npm run typecheck
npm test
npm run format:check
npm run test:desktop
npm run build
npm run package
```

Core tests cover SQLite persistence/rollback, FSRS transitions, content-version evidence, ranking gates, scoped source IDs, symlink/traversal rejection, cache invalidation, vector caching/fallback, legacy import, tool validation, encrypted credentials, help continuity, and conflict-checked tag writes. The desktop test uses a real Electron window and Pi SDK with a synthetic local provider and sources, including a two-page PDF. It checks indexing, tool-created activities, keyboard review, provisional feedback, assistance, restart continuity, tag preview/write, and export. Workspace regression coverage also checks 900 × 600 and 1080 × 720 windows, 125% zoom, long streamed responses, paused following while reading earlier text, following a new question, and showing/hiding either sidebar without moving outer containers, mouse and keyboard sidebar resizing, remembered layout after reload, in-sidebar close controls with animated collapse, preserved practice drafts, and disabled review shortcuts while the study desk is closed.

Verification on 2026-10-03, macOS arm64: type checking, 18 core tests, formatting, production build, and unsigned packaging passed. The native integration flow passed in both the production and Vite development renderer, and against the packaged `release/mac-arm64/Noctua.app`. All fixtures/provider replies were synthetic; no personal vault was indexed. Windows/Linux packaging and signed distribution have not been verified.

The desktop script also accepts `NOCTUA_TEST_EXECUTABLE` to check a packaged application, and `ELECTRON_RENDERER_URL` to exercise a running Vite renderer. These are test/development controls, not product settings.

Automated tests do not establish real-provider compatibility, model task quality, grading reliability, or learning benefit. Real-model and personal study trials are the next source of useful evidence. Typed relationships, task-family records, original PDF pages and background recaching are now implemented in D15. Other open work includes richer selected-scope editing, trustworthy transfer assessment, OCR and model figure/equation fidelity, large-vault performance, migrations, backup restore, and signed cross-platform distribution.

Source/composer refinement verification on 2026-10-03: typecheck, all 18 core tests, formatting, production build, and native desktop integration passed. Native coverage includes full-note math/tables/local images/wiki links, cited heading visibility, intercepted Obsidian URI handoff, current versus historical evidence, PDF page text, compact preview layout, and exact saved formatted input. Obsidian itself was not launched by the synthetic test. Earlier packaging checks predate this refinement; no new package was produced for this change.

In-place composer verification on 2026-10-03: typecheck, 18 core tests, formatting, build, and native desktop integration passed. Native checks cover completed syntax rendered in the editable box, real clipboard paste, click-to-edit formula source, undo, compact layout, and exact stored Markdown. This supersedes the separate live-preview interaction above.

## Provider and composer refinement — 2026-10-03

The workspace title/WORKSPACE/Early experiment header is removed. The right desk can still be reopened from a small corner control. The empty composer is shorter and grows with content up to its own scroll limit. `/` opens a searchable Flashcards/Exercises menu; Enter/Tab or mouse selects a removable colored chip. This is an explicit request for the existing bounded creation tool, not another model tool privilege. Without a chip the tutor can still choose the tool from the learner’s request. The chip is consumed on send. `@` searches indexed vault titles/paths, adds bounded source context, and displays one colored file chip per document; duplicate selection does not duplicate passages. Chips do not mean the whole file fits in model context.

Reasoning effort sits beside the model picker. Choices come from Pi’s model capability mapping; models without adjustable reasoning show a disabled control. The selection is saved and passed into tutor/checking sessions. The picker no longer cuts its results off at 80 models. On launch, window focus, idle five-minute intervals, and explicit refresh, Noctua refreshes authenticated provider catalogs through Pi and scans the local server. Provider scans are bounded to eight seconds and keep cached catalogs on failure. Cache entries contain model metadata, not credentials or inference payloads. Native synthetic tests disable remote catalog requests.

ChatGPT subscription research: OpenAI’s [official Electron integration guide](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt) documents dynamic OAuth client registration, browser consent with PKCE/state/nonce, verified identity and granted ChatGPT plan scope, protected refreshable credentials, account-specific model listing, and Responses API streaming. Identity sign-in alone does not grant plan usage. The initial research-only step is superseded by the direct sign-in implementation below. An API key remains a separate billing/authentication route. The integration preserves the study-tool allowlist and main-process credential boundary.

Provider/composer verification on 2026-10-03: typecheck, 18 core tests, formatting, production build, and native desktop integration passed. New native checks cover header removal, compact input growth, unsupported reasoning disabled, mouse/keyboard slash tool selection, vault search/chips, and dynamic local discovery on focus. Remote provider scans and real ChatGPT accounts were not exercised by synthetic tests.

## Direct ChatGPT sign-in — 2026-10-03

Settings → Providers (previously Models) has **Sign in with ChatGPT**. It invokes Pi’s built-in OpenAI OAuth flow from Noctua, opens the system browser, and handles the loopback return automatically. A redirect-link fallback, reopen-browser button, cancel/retry, and disconnect are available in the same panel. No separately launched Pi CLI is required. On success, OpenAI subscription models become available; the learner chooses the model/effort in the composer. An app-installation UUID remains stable across sign-ins.

Default credentials belong to Noctua: the SDK’s serialized credential-store contract saves the full OAuth credential through OS encryption in app data and persists refreshed tokens through the same store. If encryption is unavailable, login works only for the current app process. Existing Pi-store reuse remains an explicit opt-in; in that mode sign-in/refresh/disconnect operate on the selected shared Pi credential store. Neither access nor refresh tokens enter renderer snapshots, logs, or study exports. Browser opening is restricted to the SDK’s HTTPS OpenAI authorization host. Sign-in cancels after five minutes or on app shutdown. Model work/settings changes wait until sign-in finishes or is cancelled. Saved OpenAI API keys are retained separately; entering a key switches back to API mode without deleting the subscription credential.

The SDK completes authentication and token exchange; Noctua does not implement its own OAuth protocol. Subscription eligibility/model entitlement still depends on the account and provider response.

## Conversation tabs and Add to chat — 2026-10-03

Use **+** in the chat tab strip to open a separate chat within the current left-side conversation. Tabs have separate model history, drafts, source/excerpt context, slash-tool intent, and right-desk source/activity selections. Double-click a tab name to rename it. Closing retains the tab; **Closed tabs** reopens it. Deleting the left-side conversation removes its grouped tab histories while preserving learning records.

Highlight displayed text in a flashcard front/revealed answer, exercise prompt, full or cited Markdown note, or PDF page. The initial destination dialog was replaced on 2026-10-04 by direct **Add to Chat 1 / Chat 2 / …** buttons beside the selection, plus a new-chat button. The selected tab receives a removable colored reference chip; click it to inspect the quote. Sending consumes those chips and saves the excerpt/provenance with the message. Up to twelve excerpt chips may be queued per tab, separately from the existing source-passage limit. No automatic message or vault write is triggered. Saved excerpts preserve source evidence across reindexing; PDF selection retains page numbers. The initial extracted-text reader is superseded by the original-page reader in the connected v1 implementation below.

Drafts and desk preferences use renderer-local storage; reference/history records use SQLite and are included in full-study exports. Existing conversations become first tabs without migrating their messages or Pi sessions. Selecting rendered text captures its displayed representation; exact Markdown/LaTeX round-tripping of source selections remains future work.

Verification for direct sign-in and tabs: `npm run typecheck`, `npm test` (23 tests), `npm run format:check`, `npm run build`, and `npm run test:desktop` passed. Storage tests check tab grouping, restart continuity, immutable excerpt snapshots after cache replacement, scope rejection, and whole-conversation cleanup. Native tests use synthetic resources and the real Pi SDK: sign-in browser startup/cancel/retry/callback cleanup; isolated tabs and drafts; inline renaming; selected Markdown/card/PDF transfers; queued excerpts surviving an actual application restart; message/model context delivery; and close/reopen. Existing scrolling, resizing, source integrity, review/help, exports, and composer checks also passed. The native test intercepts browser opening and does not authenticate a real account; real subscription entitlement/token exchange remains unverified. Synthetic screenshots were visually inspected, including the tab strip and message reference chips.

## Direct selection actions and source context — 2026-10-04

Highlighting now displays **Add to Chat 1 / Chat 2 / …** directly above the selected text, with **+ New chat**. Buttons overlay the content rather than taking up reading space or opening a destination screen. The toolbar tracks scrolling and stays within the window; if there is no room above, it appears below. Clicking a reference chip still lets you inspect the exact quote and the included source context.

Quotes now include a bounded surrounding-text snapshot, source location and revision, with a source-ID pointer for additional reading. The tutor can request neighboring indexed passages through the existing bounded `read_source` tool. Current Markdown/PDF context is verified against the displayed revision; saved-passage fallback is labeled. Flashcard context includes the question and only includes answer content when selecting from the revealed answer. Exercise context includes the prompt without hidden hints or solutions. Context stays separate from the learner’s exact selection and does not count as an independent answer. Real-question quality and richer PDF/math selection mapping remain unverified.

Verification on 2026-10-04: typecheck, 25 tests, formatting, production build, and native desktop integration passed. New checks cover nearby direct toolbar placement without a destination modal, direct new-tab creation from a selection, contextual excerpts surviving restart and reaching the real SDK prompt, source-window revision/page/repeated-text handling, hidden card/exercise content exclusion, and same-document neighbor reads with unrelated attachments rejected. The floating toolbar screenshot was visually inspected. These tests use synthetic materials/models and do not establish real tutoring quality or an optimal window size.

## Family model picker — 2026-10-04

The composer picker opens on hover or click. The first popup contains compact family chips only; no model space is reserved. Hover/focus/selection opens a separate small model flyout to the right. Qwen and GPT appear first when available; other connected families remain accessible. Search was removed by user follow-up; ready models appear alongside GPT-5.6+ catalog entries; unconnected GPT entries are labeled and lead to Settings. The compact Providers action also opens Settings. Active ChatGPT subscription catalogs expose only numeric GPT versions at least 5.6; a previously selected excluded model requires a new explicit selection. Unit checks cover version boundaries and family grouping; native integration checks hover discovery, absence of search/reserved model space, compact popup width, right-hand flyout geometry, and pointer movement into the model menu.

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


## Connected study ecosystem — 2026-10-04

The user explicitly authorized the accepted v1 proposal and eleven refinements (D15). The following are implemented experimental behavior, not proof of learning effectiveness:

- The map opens from left navigation as a workspace tab. It supports drag/pan/zoom, search, focused neighborhoods/list view, typed sourced links, manual concept/facet/depth editing, proposed-link acceptance/rejection, evidence inspection, and opening linked sources/cards/exercises. A node can be staged in chat; `@` searches concepts and files. Node position/layout does not imply a learning prerequisite or score.
- Manual quick capture saves learner text or source quotations into the bits inbox. Manual guides/goals connect concepts, actual resources and saved practice. Capture can start card authoring or a targeted note proposal without generating a finished learning note. These operations work without a model; placement advice is optional.
- Cards physically flip between question and revealed answer, retain FSRS/history and can be written/edited manually. Optional placement advice uses the selected organizer model. Generation consults scope, desired depth and relevant recorded evidence.
- The practice canvas supports Markdown/math, saved drafts, open/short-answer/choice/numeric tasks, hints, separate approach advice and provisional reasoning evaluation. Feedback includes criterion-specific exact answer spans when valid; ambiguous spans are not guessed. Answer-key checks work without a model, check the first answer line and leave the subsequent explanation unassessed. Help/resources stay visible and durable. Practice results resurface tasks through a separate inspectable provisional schedule.
- Guided study and **Build notes as I study** are independently opt-in per chat. The tutor can focus a saved activity/resource on the right with a reason and exact source quote. Rating the requested cards/submitting the requested task, or choosing **Done · continue chat**, sends an application completion event and resumes the tutor once. Dismissal supplies no evidence. Continuations cannot start another automatic focus loop; failed returns are retryable.
- Note building can collect proposed additions/corrections from the learner's actual explanations, questions, reflections or selected quotations. The Changes panel lets the learner edit, select and accept a group. D16 additionally permits the tutor to create/edit notes directly through vault-scoped tools, recording model authorship. Both routes preflight revision/containment conflicts, back up files, write and recache. Accepted passages connect to their selected concepts as source provenance, without awarding understanding. New notes carry a portable ID and retain valid custom frontmatter. Undo restores a grouped file and its derived links only if no later file edit conflicts. Multi-file writes include rollback/recovery records but are not an operating-system transaction against every concurrent external editor. Closing waits for accepted writes and recaching before closing durable storage.
- **Settings → Models** exposes separate organizer/evaluator model choices; unspecified roles use the chosen tutor model. An unavailable selected role fails visibly and does not switch provider. Role sessions have only the tool needed for placement/advice/evaluation.
- **Settings → Knowledge** enables web search through reviewed Pi Web Access 0.35.0's Exa MCP backend. It is off by default, uses external search queries, and does not load the package's other extension capabilities or change models. Search results carry URLs rather than invented vault citations. Direct HTTPS PDF/Markdown/text links can be explicitly imported into app-managed chat resources; web results do not write the vault automatically.
- Pi's provider/session/compaction/streaming/cancellation facilities are reused. Bounded study context combines goals, graph, sources, evidence, pending notes, recent practice and provisional durable continuity. Exact role prompts live in `study-prompts.ts`, with boundaries enforced in application services and tool validation.

PDF.js 6.4.299 is pinned for both extraction and visible pages; the older vulnerable engine is not used by the application. The [maintainer advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j) was inspected and the installation audit reported zero vulnerabilities after the update. This is dependency verification, not a claim that arbitrary documents are perfectly handled.

Verification on 2026-10-04, macOS arm64: `npm run typecheck`, `npm test` (74 tests across 10 files), `npm run format:check`, `npm run build`, and `npm run test:desktop` passed with synthetic resources and a local mock provider through the real Pi SDK. Native coverage includes map editing/chat mentions, bits and accepted note-to-concept links, grouped acceptance/undo, original PDF rendering/selections/highlights, numeric answer checking with reasoning, and automatic one-time tutor continuation using the actual saved attempt. Existing layout, model/OAuth, Markdown, flashcard, feedback, restart and export checks remain covered. Unit tests additionally check rename continuity, vector reuse, copied/replaced identities, facet revisions, scoped evidence, conditional undo, watcher fallback and close-during-write persistence. Synthetic map/PDF/practice screenshots were visually inspected. Live Exa availability, actual account inference and real-model grading were not exercised; the new ecosystem has not been repackaged or tested on Windows/Linux.

Remaining work includes real-model grading/task quality and search availability trials, calibrated learner inference, richer source/equation/figure ingestion, split/merge and moved-vault reconciliation, scalable retrieval benchmarks, full backup restore, and signed cross-platform distribution. Large graph views deliberately show bounded neighborhoods rather than every concept at once. No personal vault, private history or paid model was used in development checks.

## Workspace visual cleanup — 2026-10-04

Confirmed user direction: remove the empty-chat explanatory paragraph (“Read, question, practice, revisit…”), remove the study-desk title/slogan, and place Concept map above New conversation with the same filled button styling. Keep the study-desk close control in a compact header. A screenshot follow-up identifies the collapsed-navigation chat tab overlapping the macOS window controls; inset the tab strip and remove the rail border through those controls. This is a targeted presentation change; concept-map opening and chat behavior stay as implemented.

Verification: typecheck, 74 core tests, formatting check, production build and native desktop integration passed. Inspected the synthetic welcome and collapsed-rail screenshots for button styling, removed text and tab spacing. Native window controls are absent from captured web-content screenshots; their clearance is based on the configured window-control position and tab inset.

## Wider study-desk resizing — 2026-10-04

Confirmed user refinement: allow the right divider to move farther left. Remove the study desk’s fixed 600-pixel maximum; its maximum now follows available window space while reserving the existing 300-pixel chat minimum and navigation width. Saved larger widths continue to adapt to smaller windows. This supersedes the earlier 600-pixel cap; the navigation cap remains 360 pixels.

Verification: typecheck, 74 core tests, formatting, production build and native desktop integration passed. The native resize check drags the desk beyond 600 pixels to the available-space limit, verifies 300 pixels remain for chat, then checks shrink/restore behavior on a smaller window.

## Profile and empty conversations — 2026-10-04

Confirmed user direction: do not save untouched “New conversation” placeholders; add a Profile settings tab with background, custom instructions and a photo shown in chat; move the study-desk activity buttons higher.

Implemented choice: new chats/tabs are temporary in memory, hidden from conversation history and exports until there is actual work. Repeated new-conversation clicks reuse an untouched placeholder. Messages, attachments, selected excerpts and saved study artifacts retain their conversation and required parent; typed drafts retain their identity so existing local draft restoration works. Clearing an otherwise empty draft makes it temporary again. On opening existing databases, default-titled placeholders without messages, source documents, associated study records, a saved draft, a session or used children become temporary. Renamed open chats and any actual history are preserved. The later closed-tab refinement below discards empty closed tabs even after renaming.

Profile text is saved in app settings and included in the next tutor, organizer and evaluator session as learner-provided context/preferences, separate from assessed evidence and subject to existing application boundaries. Optional photos are cropped to a 256-pixel square, saved locally as bounded PNG data, and shown beside user messages; photos are omitted from model prompts. The backend accepts only bounded raster data with matching PNG/JPEG/WebP signatures. Removing a photo and saving returns to the default avatar. The right header is reduced to 28 pixels, with its close control raised, superseding the earlier 52-pixel cleanup header.

Alternatives: hiding persisted empty rows alone would keep accumulating placeholders; deleting chats based only on title would risk losing real work. Profile inference from chat history and sending an avatar to the model are outside this request. Profile context is self-reported, not a learning assessment.

Verification: typecheck, production build, formatting, 79 core tests and native desktop integration passed. Core coverage includes untouched-chat restart, clearing/reopening drafts, legacy placeholder cleanup, used-parent/source preservation, transaction rollback and profile image validation. Native coverage exercises the Profile editor/upload/save, restart persistence, the chat avatar, actual Pi requests carrying custom instructions without the image, empty-history behavior and raised activity buttons. Inspected profile and chat screenshots using synthetic data. Real-model personalization quality remains unverified.

## Framed workspace, visible activity and direct note tools — 2026-10-04

Confirmed user direction: remove the right-desk Concepts tab; offer a concept list in an overlay from the Concept map tab. Use the existing muted navigation color for the surrounding frame/top tabs, rounded paper workspaces and active/hovered study tabs, while inactive study buttons remain white. This replaces the earlier placement of the concept list in the study desk. The searchable overlay starts with compact concept rows and current tags; expanding a row reveals rank/evidence inspection and previewed learner tag writes.

Confirmed note-write refinement: the model should be free to create and modify notes as tools. This supersedes the earlier review-only vault-write restriction and prohibition on model-created notes. Implemented create_note/edit_note operate only on Markdown in the connected vault, allow ordinary subfolders, require reading an existing note and its current revision, and use the existing shared backup/conditional-undo service. Exact replacements must be unique; creation cannot overwrite an existing file. Outside-vault paths and symbolic target files are rejected; creation uses ordinary folders. Assessment tags in Markdown or YAML and note identities are preserved, and new-note frontmatter retains custom metadata. Writes record model origin and appliedBy=model in the saved-change history. Proposed grouped review still exists when requested; the model cannot apply unrelated pending proposals. These writes add no assessment evidence.

Chat replies now retain a bounded activity record with elapsed time and collapsed tool/thinking entries. Each row has a relevant icon, running/completed/error state and expandable input/result or provider-exposed reasoning. Thinking is displayed only when the model/provider supplies it; no unavailable private reasoning is invented. Tool details omit private solutions/hints/card backs, credentials and opaque reasoning signatures. Records survive restart with the assistant message; this is a display projection rather than a raw provider-payload archive. Streaming, stopping and failures preserve actual status.

Alternatives: retaining duplicate right-sidebar concepts would conflict with the requested cleanup; fake reasoning or a prompt-only tool list would not show actual model activity; broad coding/filesystem tools would exceed the requested note editing. The layout preserves independent resizing and collapsed navigation. Real-provider reasoning availability and quality remain provider-specific.

Verification for this refinement: `npm run typecheck`, `npm test` (83 tests), `npm run format:check`, `npm run build`, and the native desktop integration script all passed. Native checks exercise the compact concept overlay, collapsed/expandable actual Pi tool and provider-reasoning events, persistence/restart, frame resizing, and direct model note creation/editing with undo using synthetic resources. Core tests cover containment, revision conflicts, model provenance, learning-tag/identity protection, frontmatter preservation, backups and bounded activity details. Visual inspection covered the full frame, collapsed navigation, activity expansion and concept overlay. Live-provider reasoning availability remains unverified.

## Clickable desk controls and study chips — 2026-10-04

The follow-up fixes the reopen button's placement over the draggable title region: it now belongs to the common tab bar, and both desk controls explicitly use Electron's no-drag region. Reopening is also available while viewing the concept map. Sources/Cards/Practice/Notes are separate fully rounded, outlined chips with spacing below; active/hovered chips retain the frame color. Below a 340-pixel desk width, icons sit above labels to keep all names visible. This supersedes the connected white tab shape.

Verification: typecheck, 83 core tests, formatting, build and native desktop integration passed. Native checks assert the no-drag regions on the hide/reopen controls, rounded chip shape and spacing, preserved desk state through close/reopen, and reopening from the concept map. Inspected full-size and compact workspace screenshots using synthetic data.

The next same-day refinement caps each chip at 92 pixels as the desk expands, while allowing shrinking at compact widths. The expanded navigation toggle is raised to align with the conversation tabs' vertical center. This replaces the full-width stretching behavior; compact navigation retains its separate position below the native window controls.

Verification: typecheck, 83 core tests, formatting, build and native desktop integration passed. Native checks assert chip widths after expansion beyond 600 pixels and navigation-toggle/tab center alignment within one pixel. Inspected the expanded-desk and compact-workspace screenshots.

The following 2026-10-04 screenshot refinement centers the compact chip group above the expanded desk, using balanced left/right toolbar insets from 440 pixels. Smaller desks retain room for the close button and all four chip labels.

Verification: typecheck, 83 core tests, formatting, build and native desktop integration passed. Native coverage checks the chip group's center against the expanded desk within one pixel, together with the existing width and compact-layout checks. Inspected the expanded-desk screenshot.

## Closed empty tabs and chat quotations — 2026-10-04

Confirmed follow-up: closing an empty chat tab must discard it immediately, including renamed placeholders. Drafts, messages, source documents, selected passages, saved study records and existing Pi sessions count as work and remain reopenable. Startup removes previously saved empty closed entries. An empty first tab can be removed by moving its sibling group to a remaining tab without changing message IDs, attachment scopes or histories; closing also clears the discarded tab’s local workspace state. This refines the earlier blanket “closing keeps history” behavior; a title alone no longer retains a closed tab.

Confirmed follow-up: highlighting saved text in the main chat offers the same floating **Add to Chat 1 / Chat 2 / …** and **+ New chat** actions as source readers. Both learner and assistant messages are supported. The backend checks sibling-tab access and retains the original message identity/role, nearby text and available citations as a durable quotation. Transfers stage context without sending automatically and do not establish independent understanding. Responses become selectable after completion, stop or error saves the message.

Alternatives: retaining closed empty records would continue cluttering the menu; deleting by title alone would lose real work; dropping an empty root without regrouping would orphan its siblings. Chat replies are distinguished from authoritative source content and new learner answers.

## Right-aligned learner messages — 2026-10-04

Confirmed follow-up: place the learner’s avatar and messages on the right, using a compact rounded bubble. The bubble uses the existing soft green palette, sizes to the content and wraps within the available chat width. Message text, quotes, Markdown/math and profile photos keep their existing behavior.

Verification for these follow-ups: `npm run typecheck`, `npm test` (85 tests), `npm run format:check`, `npm run build`, and the native desktop integration script passed. Core coverage checks immediate empty/renamed-tab removal, legacy cleanup, regrouping and restart, preserved drafts/messages/attachments/quotations, sibling-only message access, trusted speaker context and immutable reference snapshots. Native coverage checks empty-tab menu/local-state cleanup, main-chat learner/assistant selection and the actual Pi request carrying quoted context, existing source-selection/reopen behavior, and the user bubble/avatar geometry. Inspected the synthetic message-bubble screenshot; local building-document link targets exist. This verifies app behavior, not live-model tutoring quality.

## Providers, default models and background naming — 2026-10-04

Confirmed user direction: rename the connections tab to **Providers** and add a separate **Models** tab for model defaults. Models contains main chat, chat naming, placement/organization and exercise evaluation. Existing main/role choices persist; unspecified auxiliary roles explicitly inherit the main chat model. Provider login, API keys, local endpoints, catalog refresh and opt-in web search remain under Providers. Model selections show connection availability and retain unavailable saved choices rather than silently switching providers.

A new chat receives a concise model-generated name after its first question, using an independent in-memory Pi session alongside the tutor response. Naming receives at most 3,000 characters of the first question, no profile/vault/study context and no tools. It has a 128-token model limit and 15-second cancellation boundary, starts only once per new tab, and stores only bounded title/status metadata. A first-question title remains on failure; the tooltip exposes the failed automatic name. Manual names (including legacy custom names), deleted tabs and the latest tab metadata are protected when a delayed result arrives. Provider reconfiguration cancels naming; shutdown prevents new jobs, cancels existing jobs and waits before closing storage. Interrupted pending names become failed on restart without silently retrying.

Alternatives: waiting for naming would delay study; sharing the tutor session would mix metadata work with study history; switching providers after a naming failure would conflict with explicit role routing. Real-account model entitlement and real-model title quality remain provider-dependent.

## Message header, connected GPT entries and compact composer — 2026-10-04

Confirmed follow-ups: place selected tags alongside “You” and the timestamp in the same user-message header; remove the source-tag row beneath messages; make the composer shorter and narrower. The composer now caps its surrounding width at 760 pixels (previously 940) and uses a 38-pixel empty editor minimum, growing for longer drafts. Inline citations and stored source snapshots remain available; removing the footer chips does not remove citation evidence.

After connecting GPT, show the eligible catalog through the configured OpenAI provider without per-model activation. The previous menu mixed ready models with unconnected legacy OpenAI Codex entries, including duplicates that requested another connection. Shared picker logic now shows connected entries and prefers a ready modern OpenAI entry for duplicate model IDs; before a connection, one entry per eligible GPT model can lead to Providers. Both composer and default selectors use this policy. Read the installed Pi SDK’s OpenAI/legacy provider definitions and runtime auth implementation: readiness is provider-wide. This is not a grant of unavailable model entitlement and does not copy credentials across provider protocols.

Verification for these refinements: `npm run typecheck`, `npm test` (91 tests), `npm run format:check`, `npm run build`, and native desktop integration passed. Core coverage checks independent naming while tutoring completes, explicit role routing, one-time naming, manual rename/deletion protection, unavailable models without fallback, shutdown and interrupted-name restart, and provider-wide GPT availability after one OAuth connection. Native checks exercise the Providers/Models split, saving separate defaults, an actual tool-free Pi naming request bounded to 128 tokens, naming persistence, tags and speaker/time sharing one row, removed footer chips and the compact growing composer. Inspected the model-defaults and tagged-message screenshots with synthetic resources; local building-document links resolve. Live account entitlement and real-model title quality remain unverified.

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

## Saved GPT connection during discovery — 2026-10-14

Fixed startup/focus/periodic model discovery incorrectly marking an existing subscription unavailable and opening Settings on send. New Pi runtimes now restore their cached catalog and authentication availability offline before selecting authenticated providers for network refresh. Settings saves and repeated scans retain the selected GPT-6 Luna entry and its existing provider connection. A regression using synthetic saved credentials and the real SDK reproduces the old failure and checks the correction; this does not claim live-account entitlement.

## LaTeX output delimiters — 2026-10-14

Rendered Markdown, including streamed and saved model replies, supports `$…$` and `\(…\)` inline math, plus `$$…$$` and `\[…\]` display math. Backslash syntax is parsed directly, including multiline expressions, while code/escaped examples stay literal. Stored/copied/quoted content and source offsets are preserved; existing messages gain support when rendered. The editable composer retains its existing dollar-math decorations.
