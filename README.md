# Noctua

An experimental Electron workspace for deep learning, initially focused on STEM. Chat with a Pi-powered tutor, use your Markdown/Obsidian vault as context, review flashcards, and work through exercises. The learner keeps the work of reasoning, retrieval, and explanation.

## Run locally

Use Node.js 22.19 or later and npm:

```sh
npm ci
npm run dev
```

For a production build, run `npm run build` followed by `npm start`. `npm run package` creates an unsigned application directory in `release/` for the current platform.

1. Connect your Markdown folder from the left sidebar. Noctua indexes Markdown, plain text, and PDFs; background watching keeps the cache current and **Chunk & cache notes** refreshes it explicitly.
2. Open **Settings → Providers**. Sign in with ChatGPT directly, enter a provider API key, opt into existing Pi credentials, or configure a local OpenAI-compatible server. Set default models for chat, naming, organization and feedback in **Settings → Models**, or switch the main model in the chat composer. Local chat defaults to `http://127.0.0.1:11434/v1`; it needs a model with usable tool support.
3. For vector retrieval, run a local Ollama server and install its embedding model, for example `ollama pull nomic-embed-text`. The embedding endpoint/model are configurable in **Settings → Knowledge**. When embeddings are unavailable, Noctua visibly uses lexical retrieval; it does not silently send embedding requests to an API.
4. Select notes, attach PDF/Markdown/text sources, and ask questions, or type `/` to select **Flashcards** / **Exercises**. Type `@` to add concepts or search vault files. You can combine these inputs. Source references open the right-side reader; vault originals open in Obsidian.

Use **+** in the chat tab strip for separate contexts within one conversation. Highlight a passage in the main chat, a card, note, exercise prompt, or rendered PDF page and choose **Add to Chat 1 / Chat 2 / …** from the floating selection toolbar, or **+ New chat**. Quotes include nearby context and their original source or message identity. Closing an empty tab discards it; tabs with drafts or saved work keep their histories for reopening.

Source browsing, manual cards, reviews, concept tags, and existing exercises work without a configured AI model. Manual capture, guides, map authoring and closed answer-key checking also work without a model. The tutor can create and edit notes directly in the connected vault, with conflict checks, backups and undo. Model changes are marked in saved-change history; grouped proposals remain available when you want review first.

## First tools

- Flashcards use FSRS with Again, Hard, Good, and Easy ratings. Reveal after attempting recall; Space reveals and 1–4 rate. Card edits keep past reviews and start a new schedule for the changed content.
- Exercises keep your answer, hints used, solution reveal, and feedback. AI judgments are provisional and can be corrected. Assisted success stays distinct from independent work.
- Concepts can be whole notes or sections of larger notes. Their tags are `#unknown`, `#knowledge`, `#comprehension`, `#application`, and `#transfer`. New concepts are **unassessed**. Evidence provides experimental suggestions; you choose the rank. Writing a tag into a note requires a preview and creates a backup.
- Chats, activities, attempts, and review history persist locally. Export a full study JSON backup or portable activity Markdown from Settings. Back up the vault and original resources separately; a backup restore UI is not implemented yet.

Open **Concept map** from the left for an interactive tab; its **Concept list** button opens a searchable overlay. **Notes** on the right contains captured bits, changes and guides. Guided study and note-building switches are per chat. Settings → Models lets you choose default tutor/naming/organizer/evaluator models; Providers lets you connect accounts and enable Pi Web Access search; direct PDF/text links can be imported explicitly. Cards flip; the exercise canvas preserves your draft and can highlight exact feedback excerpts. Chat replies show elapsed work time and expandable tool activity, plus reasoning when the provider supplies it.

This remains an early experiment. Evidence uses facets, dates, task families, contexts and help without a fixed level ladder; its thresholds are unvalidated. PDF pages preserve original appearance, but OCR and model interpretation of diagrams/equations need further work. Note identities survive conservative rename cases; ambiguous split/merge and moved-vault reconciliation remain open.

## Development

```sh
npm run typecheck
npm test
npm run format:check
npm run test:desktop
```

The desktop integration test launches Electron with synthetic sources and a local mock model, exercising the real Pi SDK and persistence. It needs permission to launch a native application.

Read the [implementation checkpoint](docs/building/implementation.md) for behavior, data boundaries, and limitations, and the [building index](docs/building/README.md) for objectives, decisions, and scientific references. Contributors and coding agents should read [AGENTS.md](AGENTS.md).
