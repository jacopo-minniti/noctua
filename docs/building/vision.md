# Vision and objectives

Status: confirmed product direction with proposed operational definitions. Updated: 2026-10-04.

## Purpose

Noctua should help a student build deep, durable understanding and know their current level. Learning efficiently matters, but depth is the priority. The app should help the student enact an effective process naturally across sessions, including when setting up that process would otherwise consume too much time.

The user should be able to request help with a specific part of studying. Sometimes study is mostly reading a book with a few flashcards; sometimes it is mostly exercises; sometimes it means returning to a particular idea after doing something else. Independently useful capabilities are the current priority. Combining them into optional presets may be useful later, but the app should not require a fixed session sequence or an AI-generated roadmap.

The initial audience is students learning STEM subjects. Other subjects can be supported later; STEM provides the first design context for reasoning, derivation, equations, diagrams, experiments, and problem solving. A specific course, topic, and source collection have not been chosen.

The user's organizing principle for knowledge is that the vault should be a copy of the learner's brain: its selected information and skills should be internalized. Selected source material also counts as learning targets. This is an objective, not an assumption that anything stored is already learned. The latest chosen representation is a rank tag for each concept, covering recall, comprehension, application, and transfer, with `#unknown` for substantial gaps. A concept can be a note or part of a large note. This supersedes the earlier two headline scores; their underlying distinction remains useful. Definitions and current experimental evidence rules are in [learner-model.md](learner-model.md).

## The problem to solve

The user describes two connected obstacles:

1. Effective learning activities can be difficult to prepare and coordinate. Gathering sources, finding the next exercise, organizing review, and maintaining continuity take time away from study.
2. Activities can be poorly matched to the learner's level. They may be too easy to develop understanding or too hard to support useful progress.

Noctua should be an overall learning environment. Non-AI functions such as opening sources, navigating activities, tracking work, editing notes, and scheduling practice must be useful in their own right.

The 2026-10-04 clarification strengthens this direction: AI should understand and connect current study work, while essential tools also have manual entry points and remain practical without a model. A few deeply useful capabilities are preferable to many superficial pipelines. Quick capture, source reading, concepts/connections, practice, collaborative notes, and optional guidance should reinforce one another. The [v1 discussion](v1-study-ecosystem.md) records the accepted connected-v1 direction without prescribing a fixed study sequence. The user subsequently authorized its experimental implementation in D15.

## What depth could mean in practice

Proposed dimensions supporting the chosen concept ranks, not additional required headline scores or an established scoring system:

| Dimension | Example of evidence in STEM |
| --- | --- |
| Recall | Retrieve a definition or relation without looking it up |
| Explanation | Explain why a method works and connect it to underlying concepts |
| Derivation | Reconstruct a result, stating assumptions and justifying steps |
| Application | Select and execute a method on a relevant problem |
| Transfer | Use the idea in a changed representation or unfamiliar situation |
| Boundaries | Identify when the method fails, or give a counterexample |
| Calibration | Compare confidence with demonstrated performance and recognize gaps |

A learner may recall a formula yet struggle to choose when to use it. A correct answer after substantial hints differs from an independent solution. An untested ability is unassessed, not automatically `#unknown`. Rank displays should preserve evidence, coverage, dates, and uncertainty rather than imply a universal mastery percentage. Missing a retrieval prompt alone should not be treated as proof of absent understanding; the interpretation is discussed in [learner-model.md](learner-model.md).

The emphasis on later independent performance is informed by [E5, learning versus performance](evidence.md#e5-learning-versus-performance), but this dimensional model is our proposal.

## Division of work

| Noctua can prepare or administer | The learner must remain involved in |
| --- | --- |
| Find a relevant source passage or diagram | Interpret it and connect it to prior knowledge |
| Offer a small set of suitable activities | Choose a goal and attempt the activity |
| Schedule reviews and retain relevant study context | Retrieve, explain, derive, and solve |
| Detect possible gaps and suggest feedback | Inspect the feedback and revise their reasoning |
| Suggest formatting, links, or corrections | Build and validate the meaning of their notes |

Whether a task is administrative depends on the learning goal. Organizing concepts can itself be meaningful learning; the app should not automatically remove that work merely because it can.

## Boundaries

- The 2026-10-04 refinement permits direct model note creation/editing for the current learner goal, including model-authored explanations. Preserve the learner’s thinking and contribution; generated notes are not evidence of independent understanding. Keep provenance, recovery and conflict protection.
- AI assistance must preserve learning. The tutor should support the student's reasoning and make help visible when interpreting progress.
- Flashcards support memory, but the wider app must also support understanding, exercises, and source use.
- Reading, practice, review, and revisiting work must be accessible independently. The learner controls their order and emphasis.
- More generated material, more chat messages, and more time in the app are not sufficient evidence of success.
- Suggestions about hints, worked examples, and showing solutions need discussion. Preserving thinking does not yet specify one rigid tutoring policy for every situation.

## Proposed measures of usefulness

Evaluate reduced preparation time for individual activities alongside later independent explanation, problem solving, and transfer on suitable tasks. Track whether useful work is easier to enter, switch between, and resume at a specific point. Keep the learner's sense of understanding separate from demonstrated evidence.

The user has now requested a first implementation to learn from actual use. Inspect a small number of real attempts and source interactions in the [current experiment](implementation.md), including preparation effort, task correctness, feedback, and later independent performance. No global mastery dashboard has been validated. The [study activities](study-activities.md) document describes capabilities to examine individually.
