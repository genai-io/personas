#!/usr/bin/env bash
# Install a San persona from this repo and enable it.
#
# Local:   ./install.sh <persona> [--user] [--dir <path>]
# Remote:  curl -fsSL https://raw.githubusercontent.com/genai-io/personas/main/install.sh | bash -s -- <persona>
#          curl -fsSL .../install.sh | bash -s -- <persona> --user
#
# Re-running the same command updates in place. Local edits under the persona
# directory are detected and moved aside first, never silently discarded.
#
# Default scope is the current project (<cwd>/.san). --user installs to
# ~/.san; --dir <path> targets <path>/.san.
set -euo pipefail

REPO_URL="${SAN_PERSONAS_REPO:-https://github.com/genai-io/personas.git}"
REF="${SAN_PERSONAS_REF:-main}"

usage() {
  cat <<EOF
Usage: install.sh <persona> [--user] [--dir <path>] [--check]
  <persona>     name of the persona to install (e.g. codex, aider)
  --user        install into ~/.san (user scope)
  --dir <path>  install into <path>/.san
  --check       report what is installed and whether it is current; change nothing
  (default: current project, ./.san)

Env: SAN_PERSONAS_REF pins a branch, tag, or commit (default: main)
EOF
}

PERSONA=""
SCOPE="project"
BASE="$PWD"
CHECK=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)    SCOPE="user"; shift ;;
    --dir)     BASE="$2"; shift 2 ;;
    --check)   CHECK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*)        echo "unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *)         [ -z "$PERSONA" ] || { echo "unexpected arg: $1" >&2; usage >&2; exit 2; }
               PERSONA="$1"; shift ;;
  esac
done

if [ "$SCOPE" = "user" ]; then
  CONFDIR="$HOME/.san"
else
  CONFDIR="$BASE/.san"
fi

# Resolve the repo root holding the persona directories. Use the checkout when
# run from one, otherwise clone (the `curl | bash` path).
SRC_ROOT=""
if [ -n "${BASH_SOURCE:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  [ -f "$here/install.sh" ] && SRC_ROOT="$here"
fi
if [ -z "$SRC_ROOT" ]; then
  command -v git >/dev/null 2>&1 || { echo "error: git is required for remote install" >&2; exit 3; }
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "→ fetching personas@$REF"
  git clone --depth 1 --branch "$REF" --quiet "$REPO_URL" "$TMP/src"
  SRC_ROOT="$TMP/src"
fi

SRC_COMMIT="unknown"
if command -v git >/dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse HEAD >/dev/null 2>&1; then
  SRC_COMMIT="$(git -C "$SRC_ROOT" rev-parse HEAD)"
fi

# A persona directory is any top-level dir holding settings.json or system/.
available() {
  for d in "$SRC_ROOT"/*/; do
    [ -d "$d" ] || continue
    { [ -f "$d/settings.json" ] || [ -d "$d/system" ]; } && basename "$d"
  done
}

if [ -z "$PERSONA" ]; then
  echo "error: no persona given" >&2
  echo "available:" >&2
  available | sed 's/^/  /' >&2
  echo >&2
  usage >&2
  exit 2
fi

SRC="$SRC_ROOT/$PERSONA"
if [ ! -d "$SRC" ]; then
  echo "error: no persona named '$PERSONA' in this repo" >&2
  echo "available:" >&2
  available | sed 's/^/  /' >&2
  exit 3
fi

DEST="$CONFDIR/personas/$PERSONA"
STAMP="$DEST/.install.json"
ITEMS="system skills settings.json NOTICE"

# The stamp records the commit installed and a checksum per file, so a later run
# can tell a stale copy from an edited one. Without python3 we skip both and say
# so — the install itself still works.
HAVE_PY=0
command -v python3 >/dev/null 2>&1 && HAVE_PY=1

# --- stamp helpers (python3 only) -------------------------------------------
stamp_read() {  # $1=field
  [ "$HAVE_PY" = 1 ] && [ -f "$STAMP" ] || return 1
  python3 - "$STAMP" "$1" <<'PY' 2>/dev/null || return 1
import json, sys
try:
    with open(sys.argv[1]) as f: print(json.load(f).get(sys.argv[2], "") or "")
except Exception: raise SystemExit(1)
PY
}

# Prints one line per file whose content no longer matches the stamp.
stamp_drift() {
  [ "$HAVE_PY" = 1 ] && [ -f "$STAMP" ] || return 0
  python3 - "$STAMP" "$DEST" <<'PY' 2>/dev/null || true
import hashlib, json, os, sys
stamp, dest = sys.argv[1], sys.argv[2]
try:
    with open(stamp) as f: files = json.load(f).get("files", {})
except Exception: raise SystemExit(0)
seen = set()
for root, _, names in os.walk(dest):
    for n in names:
        p = os.path.join(root, n)
        rel = os.path.relpath(p, dest)
        if rel == ".install.json": continue
        seen.add(rel)
        with open(p, "rb") as f: h = hashlib.sha256(f.read()).hexdigest()
        if rel not in files: print(f"added    {rel}")
        elif files[rel] != h:  print(f"modified {rel}")
for rel in sorted(set(files) - seen):
    print(f"removed  {rel}")
PY
}

stamp_write() {
  [ "$HAVE_PY" = 1 ] || return 0
  python3 - "$STAMP" "$DEST" "$PERSONA" "$SRC_COMMIT" "$REF" "$REPO_URL" "$SCOPE" "$CMD_HINT" <<'PY'
import hashlib, json, os, sys, datetime
stamp, dest, persona, commit, ref, repo, scope, cmd = sys.argv[1:9]
files = {}
for root, _, names in os.walk(dest):
    for n in names:
        p = os.path.join(root, n)
        rel = os.path.relpath(p, dest)
        if rel == ".install.json": continue
        with open(p, "rb") as f: files[rel] = hashlib.sha256(f.read()).hexdigest()
with open(stamp, "w") as f:
    json.dump({
        "persona": persona, "commit": commit, "ref": ref, "source": repo,
        "scope": scope, "reinstall": cmd,
        "installed_at": datetime.datetime.now(datetime.timezone.utc)
                          .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
    }, f, indent=2)
    f.write("\n")
PY
}

CMD_HINT="install.sh $PERSONA"
[ "$SCOPE" = "user" ] && CMD_HINT="$CMD_HINT --user"
[ "$SCOPE" = "project" ] && [ "$BASE" != "$PWD" ] && CMD_HINT="$CMD_HINT --dir $BASE"

# --- --check: report, change nothing ----------------------------------------
if [ "$CHECK" = 1 ]; then
  if [ ! -d "$DEST" ]; then
    echo "not installed: $DEST"
    echo "  install with:  $CMD_HINT"
    exit 1
  fi
  echo "installed: $DEST"
  if [ "$HAVE_PY" != 1 ] || [ ! -f "$STAMP" ]; then
    echo "  no install stamp — installed before stamping, or python3 missing."
    echo "  reinstall to start tracking:  $CMD_HINT"
    exit 0
  fi
  echo "  commit:    $(stamp_read commit || echo unknown)"
  echo "  installed: $(stamp_read installed_at || echo unknown)"
  echo "  source:    $(stamp_read ref || echo unknown) @ $(stamp_read source || echo unknown)"
  echo "  available: $SRC_COMMIT"
  if [ "$(stamp_read commit || echo x)" = "$SRC_COMMIT" ]; then
    echo "  → up to date"
  else
    echo "  → out of date; update with:  $(stamp_read reinstall || echo "$CMD_HINT")"
  fi
  drift="$(stamp_drift)"
  if [ -n "$drift" ]; then
    echo "  local edits (a reinstall moves these aside first):"
    echo "$drift" | sed 's/^/    /'
  fi
  exit 0
fi

# --- install / update -------------------------------------------------------
if [ -d "$DEST" ]; then
  drift="$(stamp_drift)"
  if [ -n "$drift" ]; then
    BACKUP="$DEST.local-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "→ local edits found under $DEST:"
    echo "$drift" | sed 's/^/    /'
    mv "$DEST" "$BACKUP"
    echo "→ moved aside to $BACKUP (nothing discarded)"
  elif [ "$HAVE_PY" != 1 ] || [ ! -f "$STAMP" ]; then
    BACKUP="$DEST.local-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$DEST" "$BACKUP"
    echo "→ existing install has no stamp; moved aside to $BACKUP"
  else
    rm -rf "$DEST"
  fi
fi

mkdir -p "$DEST"
copied=0
for item in $ITEMS; do
  if [ -e "$SRC/$item" ]; then
    cp -R "$SRC/$item" "$DEST/"
    copied=1
  fi
done
[ "$copied" = 1 ] || { echo "error: no persona content found in $SRC" >&2; exit 3; }
stamp_write
echo "→ installed persona to $DEST"
[ "$HAVE_PY" = 1 ] || echo "warning: python3 not found; skipped the install stamp (no update tracking)." >&2

# Enable: set "persona" in <confdir>/settings.json, preserving any other keys.
SETTINGS="$CONFDIR/settings.json"
mkdir -p "$CONFDIR"
if [ "$HAVE_PY" = 1 ]; then
  python3 - "$SETTINGS" "$PERSONA" <<'PY'
import json, sys
path, name = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = {}
data["persona"] = name
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
elif [ ! -s "$SETTINGS" ]; then
  printf '{\n  "persona": "%s"\n}\n' "$PERSONA" > "$SETTINGS"
else
  echo "warning: python3 not found and $SETTINGS already exists." >&2
  echo "         add  \"persona\": \"$PERSONA\"  to it manually to enable." >&2
fi
echo "→ enabled '$PERSONA' in $SETTINGS ($SCOPE scope)"

cat <<EOF

✓ $PERSONA installed & enabled ($SCOPE scope)
  Persona:  $DEST
  Enabled:  $SETTINGS  →  "persona": "$PERSONA"
  Version:  ${SRC_COMMIT:0:7} ($REF)

Start san in this directory and the persona is active. Switch anytime with:
  /persona $PERSONA      (activate)   ·   /persona default   (back to built-in San)

Check for updates:  $CMD_HINT --check
Update:             $CMD_HINT
EOF
