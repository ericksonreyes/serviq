# Session Handoffs

This folder holds session handoff notes — short records of what happened in a working session so the next session (human or agent) can resume without re-deriving context.

## Convention

- One file per handoff, named `YYYY-MM-DD-<topic>.MD`.
- Write a handoff when wrapping up a session, switching topics, or pausing mid-work. The `/checkpoint` skill does this.
- Resume work by reading the newest handoff file. The `/restore` skill does this.
- Handoffs are operational notes, not specs — decisions that belong in the specs must be written into `workspace/specs/` directly; the handoff only points at them.
- Keep handoffs short. Link to files instead of copying their contents.

## File Format

```md
# Handoff — <date> — <topic>

## Done This Session

- What was decided or built, and which files changed.

## Current State

- Where things stand right now; anything mid-flight.

## Decisions Made

- Choices locked in this session, with the why (one line each).

## Next Steps

- Ordered list of what to pick up next.

## Key Files

- Links to the specs/code that matter for resuming.
```

## Related Documentation

- [Workspace Specs](../specs/README.MD)
