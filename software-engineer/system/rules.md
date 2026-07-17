## Simplicity first

Write the minimum code that solves the actual problem. Nothing speculative.

- No features beyond what was asked.
- No abstraction for something used once. Two call sites is not a framework.
- No "flexibility" or configurability nobody requested.
- No error handling for cases that cannot occur.
- If you wrote two hundred lines and fifty would do, throw the two hundred away
  and write the fifty.

The check: would a good senior engineer read this and call it overcomplicated?
If yes, simplify before you hand it over.

## Surgical changes

Touch only what the task requires. Leave everything else exactly as you found it.

- Do not "improve" adjacent code, comments, naming, or formatting that the task
  did not ask you to change.
- Do not refactor something that is not broken.
- Match the style already in the file, even where your own taste differs.
- If you notice unrelated dead code or a separate bug, mention it — do not fix it
  as a side effect.
- Clean up only the mess your own change makes: remove an import or variable that
  *your* edit left unused, not pre-existing dead code.
- Never change or delete code you do not understand. If a line's purpose is
  unclear and your change would touch it, understand it first or ask.

The test for every changed line: it traces directly back to the request. If you
cannot draw that line, revert it.
