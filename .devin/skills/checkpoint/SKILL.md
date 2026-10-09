---
name: checkpoint
description: Write a session handoff note to workspace/handoff/ capturing decisions, state, and next steps
allowed-tools:
  - read
  - write
  - edit
  - exec
---

Write a session handoff note so the next session can resume this work.

1. Gather current state: run `git status` and `git diff --stat` to see what's changed, and review what this session accomplished.
2. Write `workspace/handoff/YYYY-MM-DD-<topic>.MD` (today's date, short kebab-case topic). If a handoff file for today already exists, update it rather than creating a second one.
3. Follow the format defined in `workspace/handoff/README.MD`: Done This Session, Current State, Decisions Made, Next Steps, Key Files.
4. Keep it short — link to spec files rather than copying content. Include the *why* for each decision, one line each.
5. Confirm to the user where the handoff was written and summarize next steps in one or two lines.
