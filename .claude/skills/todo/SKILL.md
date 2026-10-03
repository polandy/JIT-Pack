---
name: todo
description: Add an item to the owner's todo list / roadmap (`TODO.md` in the repo root, tracked). Use when the owner says "/todo <text>", "put it on the todo list", "add to the roadmap" or "note that for later".
---

# /todo — put an item on the todo list

The list is **`TODO.md` in the repo root**, tracked like any file: an edit goes through a worktree and a PR as
the working agreement says, never straight to `main`. It is not `dev-docs/backlog.md` (closed items, standing
decisions); an entry moves there only when the owner promotes it.

## Steps

1. Take the item from the arguments (or the conversation, if the owner says "that" / "note that"). Never ask a
   clarifying question; if it is vague, record it as stated.
2. Read `TODO.md` if it exists (it is small). If it does not, create it with this header:

   ```markdown
   # Todo / roadmap

   One line per item, newest at the end. A finished item is deleted.

   ## Open
   ```

3. **Check for a duplicate** (grep the key words in `TODO.md`); if one exists, say so and update that line instead.
4. Append one line to `## Open`:

   `- [ ] <short imperative title> — <one sentence of context: why / where, spec id (FR-n, M-n, ADR-n) if known> (2026-MM-DD)`

   - Today's date, absolute. English throughout (translate the owner's German; German only if it is UI copy or
     seed data). No history narration.
   - Add a spec id only if you can name it from what the owner said or a quick `grep`; do not research the item.
   - A larger item may carry indented sub-bullets (`  - ...`), nothing more.
5. Reply with one line: the entry as written. Do nothing else (no implementation, no `git` commands).

## Variations

- `/todo done <words>` — find the matching open line and **delete it** (no `## Done` section, no ticking).
- `/todo list` — print the open items, nothing else.
