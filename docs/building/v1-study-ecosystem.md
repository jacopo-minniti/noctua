# V1 study ecosystem: accepted direction

Date: 2026-10-04. Status: **accepted for experimental implementation**. After brainstorming, the user explicitly asked to implement the first proposal with the refinements recorded below. The mechanics in this document describe the design origin; the [implementation checkpoint](implementation.md#connected-study-ecosystem--2026-10-04) describes what actually runs and what remains limited. Educational effectiveness and exact inference thresholds are not validated by acceptance or software tests.

The implementation authorization adds: attractive interactive map with chat mentions; reuse of a Pi search extension; precise role prompts; flipping cards and manual/assisted placement; a reasoning canvas with feedback spans; practice aligned with notes and observed evidence; adaptive depth across facets and prerequisites without a fixed level ladder; right-desk activity focus and return to the tutor; opt-in notes built from the learner's study contributions with grouped acceptance; background smart recaching and an explicit cache button; and learner-selected organizer/evaluator models.

## Confirmed direction

- One flexible ecosystem: tools share context and support the same learning goals, rather than behave as isolated generation pipelines or a fixed sequence.
- The agent should understand the current goal, sources, activity, attempts, and relevant history, and choose available tools dynamically.
- Reuse Pi's capabilities and suitable extensions instead of rebuilding its agent infrastructure. Pi sessions and bounded durable continuity are reused; Pi Web Access supplies the opt-in search backend.
- Essential study operations must work without AI, including authoring and reviewing flashcards. AI facilitates and connects work.
- Prefer a few practical, well-developed capabilities, informed by scientific evidence, over many superficial features.
- Discuss flashcards; closed and open exercises with reasoning and evaluation; optional topic guides and guided study; vault and web resource discovery, especially papers/textbooks; quick capture of small information bits; stable note identities; PDF reading/highlighting/questions; collaborative note evolution; and connected concepts with an interactive map opened from the left sidebar as a workspace tab.
- Proposed changes to existing notes should be collected and accepted together. This preference was explicitly selected in the same discussion. It is not permission to modify a personal vault now.

The five concept tags, unassessed distinction, learner authorship, ordinary Markdown, source provenance, and assistance-aware evidence remain current. A guide may orient the learner without becoming a mandated roadmap. Asking for connected activities does not imply automatically creating every kind of artifact from every passage.

## Proposed organizing model

Make the objects the activities share explicit:

| Object | Meaning and connections |
| --- | --- |
| Learning goal | A practical capability and context: for example, discuss and defend LLM system designs under API constraints. Links selected concepts, resources, and an optional guide; it is editable and need not be created before studying. |
| Concept or skill | A meaningful assessable idea or capability with a stable ID, aliases, selected scope, source anchors, and versions. It can be expressed in multiple notes and resources. |
| Relationship | A named connection with direction where appropriate, a rationale, scope/conditions, provenance, and proposed/confirmed status. It can itself be explained or assessed. |
| Source and anchor | An original document with durable identity; a particular revision and passage/page/region locating the supporting material. Vault files, attachments, and imported web resources use the same reading/retrieval contract, while preserving their access scopes. |
| Activity | A card, exercise, discussion prompt, reading reference, or guide entry linked to the targets it actually serves. Different representations can use the same targets without sharing one grading or scheduling rule. |
| Observation | A learner response or demonstrated criterion, including conditions, assistance, date, task/version, feedback, uncertainty, and corrections. Exposure and generated content are separate from demonstrated ability. |
| Note proposal | A bounded revision based on learner work and/or identified sources, linked to the affected note/concept. Learner text, suggested corrections, and AI additions remain distinguishable during review. |

This is a logical design, not a selected SQL schema or a requirement for a separate graph database. SQLite can represent these relations. Markdown remains the authority for approved knowledge content; durable study evidence remains separate from rebuildable extraction, embeddings, map layout, and evidence summaries.

### Five proposed capability groups

1. **Resources and reading:** vault search, opening originals, faithful PDF pages, highlights, attachments, and web discovery/import.
2. **Concepts and connections:** selected learning targets, typed relationships, links to resources/activities/evidence, and a focused interactive map.
3. **Practice and review:** flashcards, closed questions, open reasoning tasks, self-checking, deterministic checking where applicable, and optional AI feedback.
4. **Capture and notes:** quick user-authored bits, an inbox, ordinary note editing, source links, and grouped reviewed improvements.
5. **Tutor and guidance:** contextual Q&A, collaborative discussion, optional navigable guides, and guided interaction using the same objects and tools.

These groups describe user capabilities, not five isolated agents. For v1, propose one primary Pi tutor using a small set of shared services. No delegation architecture is selected or needed to make the ecosystem organic.

## Tutor context, tools, and skills

Before a model turn, propose supplying a compact current-state description: requested goal/help; active tab and selected passage/problem; current attempt; recorded hint/reveal/source use; relevant concept evidence with dates and uncertainty; available resources/tools; and pending work. Retrieve further relevant state on demand rather than putting the entire vault or all history into every prompt. UI changes should refresh the affected context. Neutral clarification and content-bearing help need different recording rules.

The tutor can notice a relationship or missing prerequisite, explain why a small check might help, and offer it without making the learner switch activities. Explicit requests such as “only flashcards this morning” constrain that initiative. The next action should respond to observed work and current intent; not every turn needs a diagnostic question, resource search, or stored artifact.

Proposed separation:

- **Application services** implement authoring, retrieval, scheduling, reading, capturing, evidence, and reviewed writes. UI actions and model tools call the same validated services.
- **Tools** expose bounded operations such as retrieving context, reading source locations, inspecting concept connections, finding existing practice, drafting selected activities, saving a requested bit, and proposing a note patch. Tool descriptions include purpose, accepted inputs, effects, and returned IDs. Reads, drafts, and committed changes have distinct contracts.
- **Skills** hold reusable pedagogical guidance: useful retrieval prompts, reasoning feedback, source evaluation, collaborative notes, and guided discussion. They operate on existing records and tools and do not each define a separate workflow or data store. A tutor can combine the relevant guidance.
- **Application policy** enforces source access, consent, revisions, assistance tracking, and write boundaries. Skills and prompts do not grant permissions.

### What to reuse from Pi

Read scope: installed Pi 1.0.1 SDK/skills documentation and relevant extension event sections, plus upstream [SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md), [skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md), [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), [sessions/context](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md), and selected [MCP](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/mcp.md) documentation on 2026-10-04. These are engineering references, not learning evidence.

Reuse model/provider integration, sessions, compaction, streaming/cancellation, custom tools, skill/resource loading, and appropriate extension/context hooks. MCP transport is available; SDK sessions require explicitly configuring its extension rather than inheriting CLI defaults. A search provider/server is still needed for web search. Persistent sessions and compaction are useful conversation continuity, not an authoritative learner model or guaranteed complete cross-chat memory.

Propose retrieving cross-chat continuity from Noctua's existing durable records: learner-stated goals/preferences, unresolved questions, attempts and their conditions, confirmed knowledge links, and recent work. Summaries remain pointers to those records and can be corrected. A generic memory extension should only be adopted after checking its boundaries and whether it duplicates that store. The implementation subsequently audited and selected Pi Web Access 0.35.0’s search-only Exa MCP backend; the complete extension is not loaded. No separate memory package was selected; durable study continuity complements Pi sessions.

Noctua currently disables all automatic skill/extension/context-file loading. A future implementation could explicitly load reviewed, app-owned study resources through Pi's resource loader and bounded skill-reading support. Do not enable arbitrary user/vault extensions, general file reads, shell execution, or coding tools to obtain skill support. The accepted implementation expands only the bounded study-tool allowlist; automatic discovery remains disabled.

## Concrete example: LLM system design

Starting request: “I need to learn about System Design & LLM Architecture, emphasizing collaborative discussions of real-world machine learning challenges, large-scale LLM orchestration, and API constraints.”

Propose interpreting the outcome as being able to explain, choose, and defend designs under concrete constraints. This is broader than remembering vocabulary. A useful first interaction could ask for a system the learner cares about or their current experience while checking the available vault. Offer a few entry points such as a design discussion, a relevant resource, or focused practice; do not generate a full course, dozens of cards, or finished learning notes by default.

A starter selection might cover transformer/inference basics, request versus token limits, latency/throughput, concurrency and queues, retries and idempotency, routing/orchestration, and evaluation/observability. These are illustrative candidate targets, not an exhaustive curriculum. Actual resources should be selected by relevance, prerequisites, quality, and version. Foundational mechanisms may use papers/textbooks; current provider limits should use dated official documentation. PDF format alone is not a quality criterion.

An illustrative exercise might ask the learner to design a service that sends many requests to an LLM API with **fictional supplied limits**, variable request sizes, and a failure policy. Closed questions can test assumptions or compute a bottleneck; an open response can defend the design. A discussion can challenge a choice, introduce a changed constraint, and ask how the learner would detect failure. Alternative justified designs are valid.

Suppose the learner treats all HTTP 429s as a requests-per-minute problem. The tutor should first inspect what the current source and attempt establish. It can explain or ask a targeted distinction between request and token constraints, depending on the learner's request and prior knowledge. A justified diagnosis can connect the same target to a source passage, an optional contrast card, a more varied exercise, and a proposed note correction. These remain choices, not an obligatory chain.

If the learner later explains a sound design, store evidence only for the criteria observed. A retry policy being mentioned does not establish understanding of idempotency, tail latency, or queueing. A small case-study discussion can assess relationships directly. A later independently solved variant supplies different evidence from reproducing the just-explained answer.

## Practice that connects without becoming homogeneous

### Flashcards

Propose cards for knowledge worth retrieving repeatedly: distinctions, conditions, mechanisms, useful relations, and short explanations. Preserve source/concept links and allow manual create/edit/archive/review. Find existing prompts before proposing duplicates. Authoring a card is useful work but not automatic recall evidence; the app records reviews under their actual conditions.

Retain FSRS for card scheduling. Do not feed an arbitrary open exercise score into its review model. An exercise can establish recall of a specific idea without becoming a scheduled card or duplicating the event's evidence. A missed card may suggest an explanation or exercise if that helps; it should not launch them automatically or demote all related concepts.

### Closed and open exercises

Propose defining the target, conditions, criteria, acceptable reasoning, and help before assessment. Closed questions may be multiple-choice, ordering, numerical, or short-answer; their format does not by itself identify conceptual depth. Record answer and reasoning separately where appropriate. Recognition with visible options differs from free recall.

Prefer suitable existing/source exercises and reviewed templates; generated tasks need ambiguity/solvability/solution checks. The same model asserting that its question is checked is not independent verification. Deterministic checking is useful where a defined answer/tolerance exists. Open tasks need criteria that admit alternative valid reasoning, provisional AI assessment, and learner correction or self-checking.

Track task families and meaningful changes in context, not just new task IDs. Retain original work, partial successes, specific gaps, help timing, and assessment revisions. Unobserved criteria stay unassessed. Practice with hints or an open source remains useful, but demonstrates ability under those conditions. A learner-requested explanation or worked example is allowed; record it and offer later independent work when useful. Avoid compulsory Socratic questioning or a universal refusal to explain.

## Concepts and the interactive map

A concept is an idea or capability; a note is a container. One concept can span several notes/resources, and one note can cover several concepts. Propose retaining notes/sections as convenient initial anchors while allowing explicit refinement. Avoid automatically turning every sentence into a node. Select a practical scope and expand the graph as useful work identifies distinctions and connections.

Start with a small relationship vocabulary: part of, prerequisite for (with task/context), explains, applies to, contrasts with, and analogous to. Display the relationship's rationale and provenance; distinguish source-supported assertions, learner-created connections, and AI proposals. An analogy should state where it fails. Semantic similarity alone does not justify a prerequisite edge.

Keep two kinds of information separate: content connections and observations about the learner's ability to explain/use them. Knowing both endpoint concepts does not establish the connection. Failure on a compound exercise can motivate a targeted prerequisite check; it cannot automatically mark every ancestor weak.

Keep `#unknown`, `#knowledge`, `#comprehension`, `#application`, and `#transfer`, plus no tag for unassessed content. A compact tag can coexist with a detailed statement such as “definition recalled; trade-off explanation demonstrated with help; changed-context design unassessed.” Do not introduce a global percentage or silently infer rank from graph connectivity.

The requested **Concept map** entry on the left opens a workspace tab. Proposed first useful view: a selected concept and nearby meaningful connections, with readable labels; selecting a node opens its linked notes, source passages, cards, exercises, attempts, and unresolved questions. Selecting an edge shows its rationale and evidence. Provide a searchable/list alternative, keyboard access, manual edits, and proposed-edge review. Avoid making a large undirected vault hairball the default.

Mermaid can export readable snapshots, but propose storing concepts and typed relationships independently of its syntax. The interactive view needs stable node IDs, selection, navigation, and application actions; selecting a graph renderer is deferred until the interactions are agreed. No graph library is selected here.

## Resources, PDFs, and guides

Vault search is shared by tutoring, guide construction, notes, and practice. Combine lexical/vector search with source identities, concept aliases, nearby context, and explicit links where useful; evaluate before adding graph expansion to every retrieval. Check the vault first when it might meet the need, and use web discovery to fill an actual gap or obtain current information.

Web results should retain title, authors/publisher when available, URL/DOI, date/version, suitability, and the reason for recommending them. Search should return a small relevant set; import should retain the original and acquisition provenance. A web request should not silently transmit private vault passages. Documents remain untrusted source material, never executable study instructions.

Support PDFs both as vault originals and independently attached/imported files. Proposed v1 reader uses real rendered pages with a text-selection layer, page navigation/search, durable highlights, and add-to-chat/capture actions. A highlight anchor should retain document ID, revision, file page, quote, and page coordinates; record printed labels where available. Questions should carry surrounding passage/context plus a pointer for further reading. Figures/equations require visual access when extraction loses meaning. A bounded text-PDF scope is acceptable initially if missing OCR/selection/structure is visible and original pages remain readable. Rich OCR is not silently promised.

A **study guide** is a small editable orientation: the goal, selected concepts and connections, guiding questions, source locations, and links to existing or requested practice. It should expose gaps in resource coverage and evolve with the learner's choices. It is not generated learning notes or a required completion order. It can be manually authored and navigated without a model.

**Guided study** is a temporary interaction preference: the learner asks the tutor to help choose a useful next move, discuss a concept, or work through material. It uses the same guide, source, concept, and attempt records. It does not introduce a second learner model or a compulsory read–card–exercise sequence. Direct explanation, discussion, hints, and examples depend on the current need.

## Bits, note evolution, and identities

### Quick capture and grouped changes

Propose a global capture action that accepts the learner's own text, a source quotation, or a selection from their work. Save immediately to a visible durable inbox when the destination is unknown. Attach its origin and any selected concept; offer an existing destination rather than requiring the learner to locate a note first. Without AI, the learner can edit, link, place, and make a card from it. AI can suggest placement, context, or a useful activity.

Capturing a bit should not automatically manufacture a note, several cards, an exercise, and graph edges. Reuse relevant existing items and create only what serves an identified need. Preserve whether content is a quotation, learner statement, or AI suggestion.

During studying, collect bounded proposals based on the learner's explanation, correction, derivation, or open question. Show exact additions/replacements, their origins, proposed links/cards, and affected concepts. The learner can accept, edit, or reject each item within one grouped review, without accepting unrelated changes. No end-of-session ceremony is required: the pending group remains available at any time.

Separate knowledge content, learner evidence, and optional rendered evidence/tag summaries. A factual passage should not become incorrect merely because the learner's rank changes. Record study observations automatically in durable state; approved prose/tag changes use the write service with revision checks, conflict handling, backups, and undo. Do not flatten the learner's voice into an AI summary or generate a complete learning note from scratch.

### Stable identity proposal

The current code derives concept/document identities from vault scope, relative path, and heading, so rename/move reconciliation is a real gap. Content hashes identify revisions, not entities: edits change a hash, and copies can share a hash.

Propose separate persistent IDs for vaults, notes/documents, concepts, activities, and source revisions. A note can carry a namespaced UUID property such as `noctua-id` in frontmatter after a reviewed metadata action. Existing files without IDs can initially use an app registry and conservative rename detection; ambiguous rename/copy/edit cases require reconciliation. No automatic bulk metadata migration is authorized by this discussion.

Concepts have independent IDs and many-to-many mappings to note/source anchors. Section identities need stable markers or a reconciled registry instead of heading text alone. Changing a title updates location/aliases; observations stay linked to the original entity and version. Duplicating a note/marker must not silently alias its study history; expose the conflict and assign/reconcile separate identity as appropriate. Split/merge retains lineage and old observations, and does not transfer all learning evidence to newly added claims. PDFs can use an app/sidecar registry; changing the binary to embed IDs is unnecessary. Vault relocation should not recreate all identities either.

Exact marker formats, migration/recovery, and Obsidian interoperability remain open.

## Evidence and practical v1 evaluation

Scientific claims below are restricted to their studied conditions. Product behavior is our inference, not validation of Noctua. See the full reference entries and limitations in [evidence.md](evidence.md).

- **E2, spacing:** verbal-recall synthesis supports revisiting over time; it does not choose an optimal FSRS setting or prove a schedule for open design tasks. On 2026-10-04 the original abstract was rechecked via [PubMed](https://pubmed.ncbi.nlm.nih.gov/16719566/); the author PDF failed to load. No new full-paper review is claimed.
- **E3, self-explanation:** the small eighth-grade circulatory-system study supports asking for the learner's causal explanations and relationships. Proposed application: feedback and note proposals begin with their thinking. Read scope on 2026-10-04: abstract, selected question-design/methods and relational-understanding results in the [author manuscript](https://education.asu.edu/sites/g/files/litvpz656/files/lcl/chideleeuwchiulavancher_3.pdf), not the full paper.
- **E8, retrieval and maps:** undergraduate science-text experiments found benefits for delayed comprehension/inference from retrieval versus the compared elaborative concept-mapping condition. The authors explicitly distinguish mapping with visible materials from reconstructing a map from memory. Proposed application: use a map for navigation and relationship work, and offer optional reconstruct/explain-a-connection tasks; viewing an AI-generated map is not demonstrated understanding. Read scope: selected main-text methods, results, and discussion in the [author manuscript](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Blunt_Science.pdf); supplementary methods and later literature were not reviewed.
- **E7, assistance:** the high-school math experiment compared assisted practice and subsequent unassisted outcomes; tutor safeguards also incorporated teacher-supplied task solutions/common mistakes. Proposed application: source/task quality and recorded assistance matter, as do independent follow-ups. A hints-only prompt does not reproduce that intervention. Read scope on 2026-10-04: original indexed experimental-design and discussion excerpts from [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12232635/) and the [publisher](https://doi.org/10.1073/pnas.2422633122); direct PMC access presented a browser check. No full-paper review is claimed.

Propose building depth incrementally around one real topic: a small selected concept set, a few resources, a useful guide, a few good retrieval prompts, varied reasoning exercises, and captured learner explanations. The literal counts should follow the topic and available time, not become a workflow quota.

Useful checks include time to start/resume study; manual operation with AI disabled; fidelity of source/highlight navigation; quality and ambiguity of exercises/feedback; amount of unwanted generated material; note-review effort; identity continuity after renames and external edits; and later independent reasoning on suitably changed problems. Exercise grading needs comparison with independently reviewed work. A personal pilot establishes usability lessons, not general educational effectiveness.

Proposed implementation order is identity/source/evidence contracts, then a reliable vertical slice of manual reading/capture/practice, then contextual tutor/skills and guide support, then the focused map and further retrieval/resource improvements. This is an engineering dependency proposal, not an imposed study sequence or a commitment to postpone every map/PDF interaction. Avoid a full-vault ontology, opaque mastery probabilities, automatic curriculum, and multi-agent orchestration until smaller interactions demonstrate a need.

## Questions for the next design iteration

- Which first concrete challenge and source collection should establish meaningful difficulty and good feedback for the LLM-systems example?
- What is the smallest useful concept/relationship vocabulary and how much manual correction should the learner need?
- What does a helpful grouped note review look like, especially when a note was also edited in Obsidian?
- How should the tutor balance initiative, direct explanations, collaborative debate, and learner-requested assessment?
- Which typed PDF/highlight interactions are necessary before broader OCR/figure processing?
- Which existing Pi search integration has an appropriate bounded API, and what continuity remains better represented in Noctua's own durable records?

These are design questions, not permission gates or an intake form. No production code, dependencies, provider configuration, personal vault, or running tool permissions were changed by this discussion.
