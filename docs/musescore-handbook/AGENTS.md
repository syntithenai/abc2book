# Agent guidance — MuseScore handbook mirror

When answering MuseScore Studio behavior questions or implementing notation-editor parity:

1. Prefer this folder’s [`llms.txt`](llms.txt) / [`llms-full.txt`](llms-full.txt) and [`INDEX.md`](INDEX.md) over memorized MuseScore habits.
2. For a specific page, fetch live markdown with the handbook URL plus `.md` (e.g. `https://handbook.musescore.org/basics/entering-notes-and-rests.md`).
3. For open questions, the handbook supports `?ask=` on handbook URLs when online.
4. Map MuseScore concepts to abc2book’s session-event model (`src/notation/`), not engraver rewriting. See [`../musescore-parity-gap.md`](../musescore-parity-gap.md).
5. Refresh the mirror with `npm run docs:musescore-handbook`.
