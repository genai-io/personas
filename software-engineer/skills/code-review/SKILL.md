---
name: code-review
description: >-
  Review the changed code in one pass — correctness bugs first, then the
  cleanups the diff invites: duplicated logic, needless complexity, wasted work,
  fixes patched at the wrong depth, project conventions broken. Every finding is
  verified against the code before it is reported; fixes are applied on request.
  Use when the user says "code review", "review my changes", "any bugs", "clean
  this up", "simplify", or asks whether a change is good to ship.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
  - Edit
  - Agent
argument-hint: "[--fix] [target or focus area]"
---

# Code Review

One pass over the diff that answers two questions: **does this break anything**,
and **is this worth keeping as written**. Bugs and cleanups come back in one
report because they are found in the same reading — but they are ranked
separately, and bugs always win when something has to be cut.

`flow.d2` in this directory diagrams the whole flow.

Default is report-only. Apply fixes when `--fix` is passed or the user asks after
seeing the report. A trailing focus area (`concurrency`, `efficiency`) narrows
the angles to that dimension.

## Phase 0 — Scope

Run `git diff @{upstream}...HEAD` for the committed range, and `git diff HEAD` as
well when the tree is dirty or the range comes back empty — the review usually
runs before the commit. If a path, branch, or PR was passed as an argument,
review that instead. That diff is the scope.

Read enough around each hunk to judge it. A changed line is rarely wrong on its
own — only against what calls it and what it calls. Bugs on *unchanged* lines of
a function the diff touches are in scope; the change re-exposes them.

## Phase 1 — Find candidates

Launch the angles concurrently in one message (foreground) via the Agent tool,
each with the full diff. Every candidate carries a `file:line`, a one-line
summary, and a **concrete scenario**:

- for a bug — the inputs, state, or timing that produce the wrong result;
- for a cleanup — the **cost**: what is duplicated, wasted, or made harder to
  change.

A candidate with no nameable scenario is a guess. But pass through everything
that *has* one, even half-believed — Phase 2 exists to kill the wrong ones, and
finders that self-censor are the main reason real bugs get missed. No angle may
suppress another: if two flag the same line for different reasons, keep both.

If the Agent tool isn't available, don't stop — work every angle yourself,
sequentially, in this context, and say in the report that it was a single pass
rather than a parallel fan-out, so nobody misreads the coverage.

### Correctness

**A · Hunk and enclosing function.** Line by line: what input, state, timing, or
platform makes this wrong? Inverted conditions, off-by-one, nil deref on a path
where the value can be absent, missing await, falsy-zero checks, wrong variable
from a copy-paste, an error swallowed in a catch that should propagate,
unescaped metacharacters in a regex built from input.

**B · Language pitfalls.** The traps specific to this language and framework —
mutable default arguments and late-binding closures in Python; falsy-zero, `==`
coercion, and closure-captured loop variables in JS; nil-map writes and
range-variable capture in Go; string-built SQL; float equality; timezone and DST
drift. Flag each one the diff introduces.

**C · Removed behavior.** For every line the diff deletes or replaces, name the
invariant it enforced, then find where the new code re-establishes it. If you
can't, that is the finding: a dropped guard, a narrowed validation, a deleted
error path, a test that was covering a real case. Extracted or moved code is the
usual culprit — a guard or a regex anchor gets left behind in the move.

**D · Cross-file.** For each changed function, grep its callers and check whether
the change breaks them — a new precondition, a different return shape, a new
exception, a new ordering requirement. Check the callees too: did another change
in this same diff make one of these calls unsafe?

**E · Wrappers, concurrency, resources, contracts.** When the diff adds or
changes a type that wraps another — cache, proxy, decorator, adapter — check that
every method routes to the wrapped instance rather than back out through a
registry, session, or global; a cache whose `delegate` resolves through
`session.get(...)` instead of `delegate.get(...)` re-enters itself or recurses.
Check too that it forwards every method its callers actually use.

Then the same class of defect in shared state: writes without synchronization,
check-then-act races, a lock held across a blocking call, work started and never
awaited or cancelled. Handles, connections, and subscriptions opened but not
closed on every path. Preconditions of a called API violated, or an invariant its
callers rely on broken.

### Cleanup

**F · Reuse and simplification.** New code that re-implements something the
codebase already has — grep shared and adjacent modules and name the helper to
call instead. Also: state that could be derived rather than stored, near-
duplicate blocks, nesting that early returns would flatten, dead code the diff
leaves behind.

**G · Efficiency.** Redundant computation, repeated I/O, N+1 access, independent
work run sequentially, new blocking work on a startup or per-request path.
Watch for long-lived objects built from closures — a captured environment keeps
its whole enclosing scope alive, which leaks when that scope holds anything
large; a struct copying just the fields it needs does not.

**H · Altitude.** Is the change made at the right depth, or is it a bandaid? A
special case layered onto shared infrastructure usually means the fix didn't go
deep enough — generalizing the underlying mechanism is the real fix. This is the
one angle that reads the change as a *decision* rather than as code.

**I · Conventions.** Find the instruction files that govern the changed code and
check the diff against what they actually say.

Which files those are depends on the host and the project — the agent
instructions at the user level and the repo root, plus any in a directory above
a changed file. `AGENTS.md` and `CLAUDE.md` are the common names; a project may
instead use `CONVENTIONS.md`, `GEMINI.md`, `.cursorrules`, or
`.github/copilot-instructions.md`. Look for what is there rather than a fixed
list, and take local variants (`*.local.md`) with the file they extend. Scope
matters: a file in a directory governs only what sits at or below it.

Flag only what you can pin to an exact quoted rule and an exact line, and name
the file the rule came from so the report can cite it. No style preferences, no
inferring the spirit of the document. Nothing to report if no such file applies.

## Phase 2 — Verify

Deduplicate candidates pointing at the same line or mechanism, keeping the one
with the most concrete scenario. Then check each survivor against the actual code
and assign one verdict:

- **Confirmed** — you can name the inputs or state that trigger it and the wrong
  result that follows. Quote the line.
- **Plausible** — the mechanism is real but the trigger depends on timing,
  environment, or config you can't see. Say what would settle it.
- **Refuted** — drop it.

**Plausible is the default.** Do not refute something for sounding speculative or
for depending on runtime state, when that state is realistic — a race, a nil on a
rare-but-reachable path like an error handler or a cold cache, a falsy zero read
as missing, an off-by-one on a boundary the code doesn't exclude, a retry storm, a
pattern that lost its anchor. Those are plausible, and they are exactly the bugs
that ship.

Refute only on evidence you can construct from the code: it is factually wrong
(quote the line), it is impossible by a type, constant, or invariant (show it), it
is already handled in this diff (cite the guard), or it is pure style with no
observable effect.

## Phase 3 — Sweep for gaps

On a large or risky diff, take one more pass as a fresh reviewer holding the
verified list. Re-read the diff and the enclosing functions looking **only** for
what is not already on it — do not re-derive or re-confirm anything. Aim at what
first passes miss: a guard or anchor dropped during a move or extraction; a
default evaluated once at definition instead of per call; non-deterministic
hashing or ordering; a lock whose scope quietly shrank; a predicate with a side
effect; setup and teardown that no longer mirror each other; a config default
flipped. Add nothing if nothing is there — padding this pass defeats it.

## Phase 4 — Report

Bugs first, ordered by severity — `critical` (crash, data loss, security),
`high` (wrong result on a realistic input), `medium` (wrong in an edge case),
`low` (fragile, latent). Then cleanups, ordered by what fixing them buys.

Each line: `file:line` — what's wrong — the scenario or the cost. Mark plausible
findings as such rather than stating them as fact.

**Correctness outranks cleanup.** If the list has to be cut to stay readable,
cut cleanups. A long undifferentiated list reads as noise and gets ignored.

If nothing survives verification, say so plainly and name any residual risk or
gap in test coverage.

## Phase 5 — Fix (on request)

Apply the smallest change that removes each finding — no refactoring past it, no
adjacent tidying. Skip any fix that would change intended behavior, that reaches
well outside the reviewed diff, or that you judge a false positive on second
look; note the skip in one line rather than arguing with the finding.

Where a fix has trade-offs or isn't obvious, present the options and ask instead
of guessing. Re-state what you changed and what you skipped.
