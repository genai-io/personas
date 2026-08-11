---
name: overdesign
description: >-
  Find code that is more elaborate than the problem it solves — abstractions with
  one implementation, layers that only forward, options nobody set, generality
  built for requirements that never arrived. Reports what to delete and what that
  buys; removal is handed to refactor. Use when the user asks whether something
  is over-engineered, over-abstracted, too complicated, or asks to cut a design
  back.
allowed-tools:
  - Bash
  - Read
  - Glob
  - Grep
argument-hint: "[path or subsystem]"
---

# Overdesign

One test decides most of it:

> **If this were deleted, what would break?**

"Nothing, but later we might" is not an answer — it is the defect. Complexity is
paid for on every read, by everyone, forever; the future requirement it was built
for arrives rarely and usually in a different shape.

Complexity that the problem itself demands is not overdesign. A hard domain
produces hard code, and cutting that is not simplification — it is deletion of
work someone will have to redo.

## 1. Abstractions with one implementation

An interface, strategy, plugin point, or type parameter with exactly one
concrete use, and no specific second one named. It costs a name, an indirection,
and a decision at every call site, and buys a flexibility nobody has asked for.

The rule: **abstract on the second concrete case, not the first.** The second
case is also the first time you know what actually varies — guessing earlier is
how you get an extension point that doesn't fit the extension.

Same for configuration: an option that has never been changed from its default is
a branch to read and test forever, for a decision nobody made.

## 2. Indirection that hides nothing

A unit that only forwards to another without adding a decision. Test it directly:
**remove the layer — what would the caller now have to know?** If the answer is
"nothing", it was never hiding anything, only lengthening the path.

Wrapper classes with a single method, a "service" that calls the one repository
method of the same name, a manager that manages one object.

## 3. Units that cost more than they hide

A unit is worth its name when the interface is small and the behavior behind it
is substantial. Inverted — a large interface over a thin body — the reader pays
to learn a name for something they could have read outright.

This is why splitting has a limit. Six functions called only in sequence, in one
order, make the reader hold six names and their ordering where one linear body
held nothing.

## 4. Structure added for its own sake

Layers, folders-per-layer, a DTO at every boundary, ports and adapters — added
because an architecture prescribes them rather than because something concrete
demanded them. The prescribed shape is one way to get dependencies pointing the
right way; it is not the goal, and it is usually the expensive way.

Keep the property: core logic testable without infrastructure, dependencies
pointing consistently. Drop the ceremony that doesn't produce it.

## 5. Work for cases that cannot happen

Error handling for failures the code makes impossible, a null check on something
just constructed, a retry around an in-memory call, validation of a value already
validated one frame up. Each one implies a possibility the reader must consider
and then rule out.

## 6. Generality nobody asked for

Parameters that have never been passed anything but the same value. A function
signature shaped for callers that don't exist. A rewrite substantially more
elaborate than what it replaced, generalized in advance.

A large dependency pulled in for one small function is the same trade in
package form — every dependency is code you now own.

## Do not report

- **Exhaustive matching over a closed set.** A switch on an external protocol,
  wire format, or fixed enum is not missing polymorphism, and scattering it into
  subtypes would make it worse.
- **A wrapper that isolates something volatile** — a third-party API, a vendor
  SDK, an unstable interface. It is buying something real.
- **An abstraction whose second implementation is specific and scheduled.**
- **Defensive code at a trust boundary.** Validation of external input,
  permission checks, and handling of failures that genuinely occur are not
  speculative — never propose removing them under this skill.
- **Depth.** A large body behind a small interface is the target, not a finding.
- **Intrinsic complexity.** If the domain is genuinely intricate, the code will
  be too. Confirm the complexity isn't the problem's before calling it accidental.
- **A bigger second version that does more.** Larger is not automatically
  second-system effect; generality exceeding present need is.
- **Anything you cannot say the deletion cost of.** If you can't name what is
  lost by removing it, you don't understand it yet — read further or stay quiet.

## When writing rather than reviewing

The same test, applied before the code exists: write the version with no
extension point, no wrapper, no option. Add each one only when a second concrete
case forces it. Code that turns out to need an abstraction is easy to abstract;
an abstraction that turns out to be wrong has already spread to its call sites.

## Reporting

Per finding: `file:line`, what the construct is, what it costs to keep (names to
learn, hops to follow, branches to test), and what deleting it would take. Order
by what the removal buys, not by how egregious it looks.

Removal is a refactor — call sites change and tests must be green after. Report
here, then offer to take the highest-leverage one into `refactor`.
