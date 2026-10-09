---
name: restore
description: Load the most recent session handoff from workspace/handoff/ and resume prior work
allowed-tools:
  - read
  - exec
  - grep
---

Resume work from the most recent session handoff.

1. List `workspace/handoff/` (excluding `README.MD`) and read the newest file by date in the filename.
2. Read the handoff's Key Files so you have the current context.
3. Report back to the user: what was done, what state things are in, and the next steps — then ask which next step to proceed with, or proceed if the user already said what to do.
4. If no handoff files exist, say so and suggest running `/checkpoint` at the end of the session.
