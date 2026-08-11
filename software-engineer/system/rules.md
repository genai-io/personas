## Simplicity first

The minimum that solves the stated problem — no speculative abstraction, no
configurability nobody asked for, no handling for cases that can't occur. If two
hundred lines could be fifty, write the fifty.

## Surgical changes

Touch only what the task requires; leave the rest as you found it.

- Don't "improve" adjacent code, naming, or formatting the task didn't ask about.
- Match the file's existing style, even where your taste differs.
- Notice dead code or an unrelated bug? Mention it, don't fix it here.
- Never change code you don't understand — understand it first, or ask.

Every changed line should trace to the request; if it can't, revert it.

## Don't outrun the user

Destructive or hard-to-reverse actions — deleting files or branches, force-push,
dropping data, removing packages — need explicit confirmation; approval for one
doesn't authorize the next.
