---
name: naming
description: >-
  Review names — variables, functions, types, files — for whether they say what
  the thing is and does, use one word per concept across the codebase, and match
  the language's conventions. Reports findings; renaming is handed to refactor.
  Use when the user asks about naming, whether a name is good, what to call
  something, or asks for a naming pass over a file or module.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
argument-hint: "[path or symbol]"
---

# Naming

One test decides most of it:

> **Can a reader say what this is, or what this does, without reading the
> implementation?**

If not, the name is doing no work and the reader pays for it every time they pass
through. Everything below is a way that test fails.

Check in this order — the first is worth more than the rest combined, because it
is the only one that compounds across the codebase.

## 1. One concept, one word

The same thing must not go by several names. `user` / `account` / `member` /
`customer` for one entity forces every reader to maintain a translation table,
and every new file to pick a side. Grep the area for the synonyms before
judging any single name.

Equally: one word must not mean several things. If `process` names three
unrelated operations, it names none of them.

Prefer the word the business uses. When code and stakeholders disagree, the code
is wrong.

## 2. The name must match what it does

- A name that omits the important effect is a lie: `getUser` that also writes a
  cache entry, `validate` that mutates its argument. Either the name states the
  effect or the effect moves out.
- `and` / `or` in a name is a confession of doing two things — split it.
- The name should reflect the expected result, not its negation. `isDisabled =
  count <= 3` beats `disabled={!isEnabled}`; the reader shouldn't invert in their
  head.

## 3. Functions: action + subject

`prefix? + action + high context + low context?` — `getUser`, `getUserMessages`,
`handleClickOutside`, `shouldDisplayMessage`. Order carries meaning:
`shouldUpdateComponent` (I update it) is not `shouldComponentUpdate` (it updates
itself).

Keep verbs distinct and consistent across the codebase: `get` reads, `compose`
derives, `set` assigns, `reset` restores, `add`/`remove` need a destination,
`create`/`delete` don't, `handle` responds to an event. Pick the pairs and hold
to them.

## 4. Booleans

- `is` for a characteristic or state, `has` for possession, `should` for a
  conditional coupled to an action. `hasProducts`, not `isProductsExist`.
- A bare boolean parameter at a call site says nothing: `filter(items, true)` —
  take or drop? Name it at the call site, or take an enum/named option instead.
  This also usually means the function does two things.

## 5. Smaller things

- **Don't repeat the context.** Inside `MenuItem`, `handleClick` reads better
  than `handleMenuItemClick` — it will be read as `MenuItem.handleClick()`.
- **No invented words.** `shouldPaginate`, not `shouldPaginatize`.
- **No contractions.** `onItemClick`, not `onItmClk`.
- **Plural means many.** A collection is plural, a single value is singular.
- **One convention.** Whatever the language and the project already use —
  consistency beats preference.

## Do not report

- **Language idiom beats everything above.** Go has no `Get` prefix and uses
  short names in short scopes; Python uses `_private` and dunders; Rust uses
  `into_`/`as_`/`to_` with settled meanings. Idiomatic code is not a finding.
- **Short names in short scopes.** `i`, `j`, `k` in a loop, `r`/`w` for a reader
  and writer, `e` for an error in a two-line block. Scope length sets name
  length.
- **Domain jargon that practitioners actually use.** `nack`, `tranche`, `ARPU`
  are precise, not obscure. Verify against the domain before calling it unclear.
- **Established public API names.** Renaming breaks callers. Report only if the
  name is actively misleading, and say what the rename costs.
- **Conventional test names.** `sut`, `fixture`, `mock*`, `given*/when*/then*`.
- **Personal preference.** If two names are equally clear, there is no finding.

## Reporting

Per finding: `file:line`, the current name, what a reader would wrongly conclude
from it, and one concrete replacement. No replacement means no finding.

Group by concept, not by file — one inconsistent vocabulary is one finding, not
twelve.

Renaming is a refactor: it needs the call sites updated in the same pass and
tests green after. Report here, then offer to take it into `refactor`.
