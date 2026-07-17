# Personas

Agents you can hire into your terminal.

Ready-to-use [personas](https://github.com/genai-io/san/blob/main/docs/concepts/persona.md)
for [San](https://github.com/genai-io/san). A persona is a folder that bundles a
system prompt, a skill set, and a config overlay. Selecting one swaps all three
as a unit, mid-session, without a restart.

| Persona | What it is |
|---|---|
| `codex` | Autonomous coding: acts first, verifies, reports concisely. Strong opinions on frontend design. Adapted from [openai/codex](https://github.com/openai/codex). |
| `aider` | Surgical coding: minimal diffs, strict scope, asks when ambiguous, never leaves stubs. Adapted from [Aider-AI/aider](https://github.com/Aider-AI/aider). |
| `software-engineer` | A disciplined senior engineer: thinks before coding, asks instead of assuming, writes the minimum that solves the problem, changes only what the task requires. Principles from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls. |
| `readonly` | Answers questions, analyzes code, debugs environments — **cannot write**. Enforced by a deny-list, not by asking nicely. |
| `social-creator` | 社媒主理人 — 公众号文案、讲解视频脚本、小红书 / X 等社交媒体内容创作. |

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/genai-io/personas/main/install.sh | bash -s -- codex
```

Installs into the current project (`./.san`) and enables it. Add `--user` for
`~/.san` (available in every project), or `--dir <path>` to target another
project. Windows:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/genai-io/personas/main/install.ps1))) -Persona codex
```

To remove: same URL, `uninstall.sh` / `uninstall.ps1`.

Or just copy the directories yourself — this repo mirrors the layout of
`~/.san/personas/` exactly:

```bash
git clone https://github.com/genai-io/personas.git
cp -r personas/*/ ~/.san/personas/
```

The trailing `/` matches directories only, so the repo's `README`, `LICENSE`,
and `NOTICE` stay out of your personas directory.

Then switch with `/persona` in San. Scope matters:

- `~/.san/personas/<name>/` — available in every project
- `<project>/.san/personas/<name>/` — project-only; overrides a user-level
  persona of the same name

## Kinds of persona here

**Original** (`readonly`, `social-creator`) — written for San from scratch.

**Idea-sourced** (`software-engineer`) — original prose that applies principles
stated publicly by someone else. `software-engineer` expresses Andrej Karpathy's
public observations about how LLMs go wrong at the keyboard. The ideas are
public and not protectable; the text is written from scratch (the popular repo
packaging those ideas carries no license, so none of its wording was reused).
Its `NOTICE` spells out exactly what was and was not reused.

**Adapted** (`codex`, `aider`) — these take the working style of an
openly-licensed coding agent and retarget it at San.

Adapted personas are **adaptations, not ports.** A coding agent's system prompt
is tightly coupled to its own harness: it names that harness's tools, assumes its
context model, and writes for its renderer. Copying one verbatim into San does
not give you that agent — it gives you a model reasoning about tools that do not
exist. Two examples of what that means in practice:

- Aider's prompt says `ONLY EVER RETURN CODE IN A *SEARCH/REPLACE BLOCK*!`
  because Aider parses those blocks out of the model's text output. San has an
  `Edit` tool. Carried over literally, that line would make the model print code
  instead of editing files. The *discipline* it encodes — minimal matches, small
  edits, no long runs of unchanging lines — is kept, restated for `Edit`.
- Codex's prompt says "You are producing plain text that will later be styled by
  the CLI" and then specifies its own file-reference syntax. San renders markdown
  via glamour. Following that instruction would degrade output, so it is dropped.

Every adapted persona ships a `NOTICE` documenting exactly what was kept,
changed, dropped, and why — both because Apache-2.0 §4(b) requires modified
files to say they were modified, and because you should be able to see how far a
persona has drifted from the thing it is named after.

## Scope: openly licensed sources only

Adapted personas only come from agents whose prompts are published by their
owners under a license that permits redistribution — Apache-2.0 and MIT, today.

**We do not accept personas transcribed from closed-source agents** (Claude Code,
Cursor, Windsurf, Devin, and similar), and PRs adding them will be declined. Their
prompts have never been published by their owners; the copies circulating on
GitHub come from decompiled bundles, extraction attacks, and leaks. Those texts
are unlicensed copyrighted work no matter how widely they are mirrored, and
redistributing them here would put the whole project at risk.

If you want a persona that *works like* a closed-source agent, write one from
observable behavior and public documentation and say so in its NOTICE. Behavior
and ideas are not protected — the specific text is. An original persona aimed at
San's actual tools will also simply work better.

## Adding a persona

One directory per persona, at the repo root.

```
<name>/
├── system/
│   ├── identity.md      who it is        (optional)
│   ├── behavior.md      how it acts      (optional)
│   └── rules.md         what it follows  (optional)
├── skills/
│   └── <skill>/SKILL.md persona-scoped skills
├── settings.json        description, skill states, config overlay
└── NOTICE               attribution + modification record (adapted personas only)
```

All parts are optional; anything you omit falls back to San's built-in default.
The persona name is the directory name.

Checklist for a PR:

1. If adapted: source is Apache-2.0, MIT, or similar — link the repo, license,
   and the exact commit SHA you read, and record the changes in `NOTICE`.
2. No references to tools San does not have. San's surface: `Read` `Write`
   `Edit` `Bash` `Grep` `Glob` `Agent` `Skill` `TaskCreate`/`TaskUpdate`/…
   `WebSearch` `WebFetch`.
3. Every skill directory has a `SKILL.md` — without one San will not load it.
4. Guidance that only matters sometimes belongs in `skills/`, not in the system
   prompt — a skill's description stays resident while its body loads on demand.
5. The persona is meaningfully different from San's built-in default. If it
   reduces to "be concise and helpful", it is not worth a switch.

## License

Apache-2.0 — see [`LICENSE`](LICENSE), the top-level [`NOTICE`](NOTICE), and each
adapted persona's own `NOTICE`.
