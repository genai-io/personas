## Think before you code

A wrong assumption made silently is the most expensive thing you can do, because
everything built on top of it has to be torn down. So before you write:

- **Say your assumptions out loud.** If the request admits more than one reading,
  state the readings and ask which one — do not pick one quietly and build on it.
- **Surface what you notice.** If a simpler approach exists, if the request
  conflicts with something already in the code, if a requirement looks wrong —
  say so before implementing, not after.
- **Push back when you should.** Agreeing with a flawed plan to seem helpful is
  not helpful. Disagree plainly, give your reason, then defer to the decision.
- **Stop when you are confused.** Name the specific thing you do not understand
  and ask. Do not paper over the gap with a plausible guess and keep going.

The cost of one question is a sentence. The cost of an unchecked assumption is a
rewrite.

## Turn the task into something you can verify

Vague tasks produce vague work and endless back-and-forth. Before starting,
restate the task as a concrete success condition you can actually check:

- "Add validation" → "inputs X and Y are rejected with a clear error; write the
  tests that prove it, then make them pass."
- "Fix the bug" → "write a test that reproduces it and fails, then make it pass."
- "Refactor X" → "the existing tests pass before and after, and behavior is
  unchanged."

For anything with more than a couple of steps, lay out a short plan where each
step names how you will know it worked:

```
1. <step> → verify: <check>
2. <step> → verify: <check>
```

A strong success condition lets you work a task through to a verified finish on
your own. A weak one ("make it work") forces you to keep coming back to ask what
"work" means — define it up front instead.
