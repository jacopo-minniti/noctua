# Working on Noctua

## Read first

- Read [the building index](docs/building/README.md), [vision](docs/building/vision.md), and [decisions and open questions](docs/building/decisions.md) at the start of a task.
- Read the relevant requirements, [study activities](docs/building/study-activities.md), evidence, architecture, and prototype review before changing those areas.
- These documents are the project's memory between chats. Current user instructions take precedence; reconcile the documents when direction changes.

## Product principles

- Optimize for deep understanding, durable learning, independent problem solving, and an honest view of the learner's level. STEM is the initial focus, not an exclusive restriction.
- Reduce preparation and administrative work so effective study can happen consistently. Preserve the student's reasoning, retrieval, explanations, and authorship.
- Support independently useful study activities that the learner can enter, combine, leave, and revisit freely. Prioritize help with the current resource, question, or exercise; optional presets can come later. Do not assume a fixed session sequence or model-generated roadmap.
- The 2026-10-04 follow-up authorizes model tools to create and edit notes directly when serving the learner’s current goal. Preserve learner contributions, distinguish model authorship, and retain source provenance, revision checks, backups and undo. Generated notes are not independent learning evidence.
- Treat flashcards as one learning tool. Recall ratings and assisted task completion are not evidence of comprehensive understanding.
- Treat all selected vault knowledge and skills, including selected source material, as learning targets. The current concept tags are `#unknown`, `#knowledge`, `#comprehension`, `#application`, and `#transfer`, for notes or sections. This supersedes the earlier two headline scores. New content is unassessed, distinct from `#unknown`. Ground suggestions in the [learner model](docs/building/learner-model.md); preserve coverage, dates, help, and uncertainty. Current heuristics are not validated mastery measures.
- Design tutoring around the learner's goal, prior knowledge, attempts, and help received. The precise policy for hints, explanations, and worked examples is still open.
- Keep knowledge accessible in ordinary Markdown and preserve source provenance. Protect existing vault content and account for external edits.

## Design and documentation

- This is an iterative design project. Do not turn a feature discussion into implementation or scaffolding unless the task calls for it.
- Distinguish confirmed user direction, provisional choices, proposals, and open questions. Do not promote an assistant proposal to a confirmed decision without supporting user direction.
- Update the relevant building documents when a task changes objectives, behavior, requirements, or decisions. Record the date, reason, alternatives, and remaining uncertainty for material decisions.
- For learning claims, verify scientific references through the original paper, publisher, or author/institutional manuscript. Include a stable link or DOI, relevant finding, study context, limitations, and the design inference.
- State what was actually read: an abstract or bibliographic record is not a full paper review. Never invent references, effect sizes, or a neuroscience explanation for a product choice.
- Use cognitive psychology, educational research, and neuroscience as appropriate. Evidence for a learning mechanism does not validate Noctua's implementation of it.
- Treat `/Users/jacopominniti/Desktop/temp/noctua-prev` as a read-only reference. Inspect ideas critically; do not inherit its architecture, prompts, dependencies, or scheduler by default.

## Current implementation

- The user has explicitly authorized the connected v1 implementation: Q&A, model-facing vault retrieval/vector cache, flashcards, exercises, interactive concept map/chat mentions, bits/guides/goals, direct model note creation/editing and optional grouped reviewed changes, PDF page highlights, adaptive facet/criterion evidence, scoped tutor handoffs, role model selection and opt-in Pi web search. Read [the implementation checkpoint](docs/building/implementation.md) and [architecture](docs/building/architecture.md) before changing it.
- Current engineering choices: Electron/TypeScript/React, built-in SQLite with durable records separated from cache, Pi SDK 1.0.1 with only bounded study tools, local Ollama embeddings with lexical fallback, `ts-fsrs` 5.4.2, patched PDF.js 6.4.299, and the reviewed search-only Pi Web Access 0.35.0 backend. A separate personal Pi extension has not been supplied. Versions are in `package.json`; choices remain experimental.
- Keep learning logic and data contracts separate from provider-specific model behavior and UI code. Enforce file and tool boundaries in application code rather than relying on prompts.
- Never commit credentials, personal vault content, private study histories, or provider payloads. Use synthetic fixtures for development.
- Make targeted, reviewable changes. Validate behavior that matters, especially vault integrity, persistence, citation resolution, scheduler transitions, and the distinction between assisted and independent attempts.
- Use `npm run typecheck`, `npm test`, `npm run format:check`, and `npm run build`. `npm run test:desktop` launches native Electron with synthetic resources and a mock provider through the real Pi SDK; use it for relevant UI/persistence/integration changes. `npm run package` creates an unsigned application directory. There is no ESLint command. Report only checks actually run.
- For documentation changes, check links, consistency, decision status, and reference accuracy. Keep the five-tag interface and explicit first-implementation scope current; do not revive superseded score/session proposals by default.
- Do not enable coding-agent shell/filesystem tools, automatic Pi resource loading, unscoped filesystem writes, or silent local-to-API fallback. Reusing Pi credentials is opt-in and includes normal SDK-managed token refresh.

## Code review rules

- Flag changes that substitute generated learning artifacts for the student's thinking, or present assisted success as independent understanding.
- Flag destructive vault writes, ambiguous source identities, unsupported citations, loss of durable learning history, or treating durable state as disposable cache.
- Flag retrieval or document ingestion that silently loses page, figure, equation, or source-version information needed to check the model's claims.
