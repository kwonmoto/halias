# halias

> Hyper alias — a personal command layer that learns from how you actually work. Save, search, edit, track, and back up shell shortcuts without repeatedly touching `.zshrc`.

📖 English · [한국어 README](./README.ko.md)

[![npm version](https://img.shields.io/npm/v/halias.svg)](https://www.npmjs.com/package/halias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

## What's different?

Managing shell aliases used to mean editing `.zshrc` by hand. **halias** turns it into a personal command layer:

- 🎯 **Context-aware ranking** — shortcuts you use in this directory float to the top of search. No manual grouping required.
- ⚡ **Save the last command** (`ha add --last <name>`) — turn the command you just ran into a reusable shortcut.
- 💡 **Shortcut suggestions** (`ha suggest`) — find repeated shell commands that are good alias candidates.
- ✨ **Interactive add** (`ha add`) — Clack-powered TUI ...
- 🔍 **Fuzzy search** (`ha`) — fzf integration searches across name, command, tags, and description
- 📊 **Auto stats** — every shortcut is generated as a wrapper function, so usage is tracked automatically
- 🛡️ **Safety nets** — system command conflict detection, frequent-use confirmation on delete
- 💾 **Backup & restore** — single-file JSON export/import with merge or replace strategies
- 🐚 **Two entry points** — `halias` for scripts, `ha` for daily use; same binary

## Install

```bash
npm install -g halias
```

Both `halias` and `ha` will be available globally. The shorter `ha` is recommended for daily use.

### From source

```bash
git clone https://github.com/hyukjunkwon/halias.git
cd halias
npm install
npm run link:local      # registers both `halias` and `ha` globally
```

## Quick start

```bash
# 1. Add your first shortcut interactively
ha add
#   ◇ Name?         gs
#   ◇ Type?         alias
#   ◇ Command?      git status
#   ◇ Description?  show working tree status   (optional)
#   ◇ Tags?         git                        (optional)

# Or save the command you just ran
docker compose logs -f api
ha add --last dlog

# 2. Install shell integration (one-time setup)
ha install

# 3. Apply (or just open a new terminal)
source ~/.zshrc

# 4. Use it!
gs                   # → runs `git status`

# 5. Find shortcuts later
ha                   # fuzzy search across all your shortcuts
hareload             # apply newly added shortcuts to current shell
```

## Commands

| Command | Description |
| --- | --- |
| `ha` (no args) | Fuzzy search — find shortcuts fast |
| `ha search` (= `ha s`) | Same as above, explicit |
| `ha add` | Add a new shortcut interactively |
| `ha add --last [name]` | Save the last shell command as a shortcut |
| `ha edit [name]` | Edit an existing shortcut (picker if no name) |
| `ha list` (= `ha ls`) | List shortcuts (`--sort name\|recent\|usage`) |
| `ha rm [name]` | Delete a shortcut (extra confirm for frequently used) |
| `ha stats` | Usage stats (top N, unused, time-filtered) |
| `ha suggest` | Suggest repeated shell commands worth saving |
| `ha export [path]` | Back up shortcuts to JSON |
| `ha import <path>` | Restore from backup (`--strategy merge\|replace`) |
| `ha install` | Add shell integration to `~/.zshrc` |
| `ha doctor` | Diagnose your environment |

## How it works

halias keeps a single source of truth in `~/.halias/shortcuts.json` and generates `~/.halias/generated/aliases.sh` from it. Your `.zshrc` only ever has one line added:

```bash
# >>> halias shortcuts >>>
[ -f "$HOME/.halias/generated/aliases.sh" ] && source "$HOME/.halias/generated/aliases.sh"
# <<< halias shortcuts <<<
```

Every shortcut — even simple aliases — is generated as a shell **function** so usage tracking works consistently:

```bash
# from `ha add gs "git status"`:
gs() {
  _halias_track "gs"      # appends to ~/.halias/stats.log
  git status "$@"         # forwards extra args
}
```

This unification means `ha stats` works identically for aliases and functions, and you get `"$@"` arg forwarding for free.

## Fuzzy search

Hit `ha` with no args to drop into a full-text search across all your shortcuts:

​```
halias❯ git
gs    git status         #git    ★ 12회   Show working tree status
dev   pnpm dev           #js     ★ 8회    Start dev server
gp    git pull           #git    34회     Pull from origin
mkcd  mkdir -p && cd     #fs              Make and enter directory
​```

Search matches across **name, command body, tags, and description**. Try searching for "polled" — if you described `gp` as "pull from origin", it'll match.

### Context-aware ranking ⭐

halias automatically tracks which shortcuts you use in each directory. When you run `ha`, shortcuts you've used in the **current directory** float to the top, marked with `★`. Global frequency is the tiebreaker.

Example: in `~/work/myapp`, `dev` (used 8 times here) ranks above `gs` (used 12 times globally but only once here). Move to `~/side/api` and the ranking shifts to match what you actually do there.

This means **you don't need to organize aliases manually** — they organize themselves around your usage patterns.

### fzf installation

Best experience comes with [fzf](https://github.com/junegunn/fzf) installed. The easiest way:

```bash
ha doctor
```

It detects your OS and package manager (Homebrew, apt, dnf, winget, scoop) and offers safe options. Without fzf, search falls back to a simple selector.

## Stats

```bash
ha stats              # top 10 with bar chart
ha stats --top 5
ha stats --since 7d   # last 7 days only (also: 24h, 30m)
ha stats --unused     # never-used + 30+ days idle
```

```
  Usage stats  (since 1 month ago · 14 calls total)

   1.  gs    5  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  last: 1 min ago
   2.  gp    3  ▇▇▇▇▇▇▇▇▇▇▇▇          last: 6 min ago
   3.  mkcd  2  ▇▇▇▇▇▇▇▇              last: 30 min ago
```

## Suggestions

```bash
ha suggest           # repeated command candidates from recent shell history
ha suggest --top 5
ha suggest --min 4   # only commands repeated 4+ times
ha suggest --save    # pick a suggestion and save it immediately
```

```
  Shortcut candidates
  Commands repeated 3+ times in recent shell history.

   1.  12x  docker compose logs -f api
   2.   7x  git pull --rebase

  To save one: ha suggest --save
```

Suggestions skip commands that are already saved as shortcuts, short one-off commands, and common navigation commands like `cd`, `ls`, and `pwd`.

## Backup & restore

```bash
ha export                              # ./halias-backup-2026-04-29.json
ha export ~/Dropbox/halias-backup.json
ha import ~/Dropbox/halias-backup.json # merge (existing wins)
ha import backup.json --strategy replace
```

`merge` keeps existing entries on name conflict (safe). `replace` clears everything first (explicit confirmation required).

## Doctor

`ha doctor` checks your environment end-to-end:

```
halias environment check

  ✓ fzf installed
  ✓ Shell integration installed (.zshrc)
  ✓ shortcuts.json integrity OK (12 entries)
  ! 1 shortcut overrides system command
      • ls
    → Run `ha rm <name>` if unintended.
  ✓ aliases.sh generated
```

## Data

```
~/.halias/
├── shortcuts.json          # source of truth (human-readable JSON)
├── stats.log               # raw usage log (timestamp + name + directory)
└── generated/
    └── aliases.sh          # auto-generated, sourced by your shell
```

Everything is plain text, version-controllable, and easy to back up.

## Roadmap

### v0.2.0 — Context-aware search ✅

Search results now learn from where you actually use shortcuts. Shortcuts used in the current directory float to the top without manual project scopes.

### Future versions

Driven by real usage and friction discovered in daily work, not by feature checklists. Some likely candidates:

- **Command capture** — save recently used commands with `ha add --last`
- **Cleanup** — find unused, stale, or duplicate shortcuts from real usage data
- **`$EDITOR` mode for function bodies** — edit multi-line functions in vim/code

Suggestions and bug reports welcome via [issues](https://github.com/hyukjunkwon/halias/issues).

## Development

```bash
npm run dev -- add        # run with tsx (no build needed)
npm run typecheck         # type check
npm run build             # produce dist/
```

## License

MIT — see [LICENSE](./LICENSE).
