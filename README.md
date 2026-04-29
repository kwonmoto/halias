# halias

> Hyper alias — manage shell aliases and functions through an interactive CLI. Search, edit, track usage, and back up — without ever touching `.zshrc`.

📖 English · [한국어 README](./README.ko.md)

[![npm version](https://img.shields.io/npm/v/halias.svg)](https://www.npmjs.com/package/halias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

## What's different?

Managing shell aliases used to mean editing `.zshrc` by hand. **halias** turns it into an app:

- ✨ **Interactive add** (`ha add`) — Clack-powered TUI with type selection, validation, and a preview before saving
- 🔍 **Fuzzy search** (`ha`) — fzf integration searches across name, command, tags, and description
- 📊 **Auto stats** — every shortcut is generated as a wrapper function, so usage is tracked automatically
- 🛡️ **Safety nets** — system command conflict detection, frequent-use confirmation on delete
- 💾 **Backup & restore** — single-file JSON export/import with merge or replace strategies
- 🐚 **Two entry points** — `halias` for scripts, `ha` for daily use; same binary

## Install

> ⚠️ Not yet published to npm. For now, clone and link locally:

```bash
git clone https://github.com/hyukjunkwon/halias.git
cd halias
npm install
npm run link:local      # registers both `halias` and `ha` globally
```

Once published, you'll be able to install via:
```bash
npm install -g halias
```

## Quick start

```bash
ha add               # add your first shortcut interactively
ha install           # add shell integration to ~/.zshrc (one-time)
source ~/.zshrc      # apply (or open a new terminal)

gs                   # use it! (assuming you registered `gs` → `git status`)

ha                   # fuzzy search — find any shortcut
hareload             # apply newly added shortcuts to current shell
```

## Commands

| Command | Description |
| --- | --- |
| `ha` (no args) | Fuzzy search — find shortcuts fast |
| `ha search` (= `ha s`) | Same as above, explicit |
| `ha add` | Add a new shortcut interactively |
| `ha edit [name]` | Edit an existing shortcut (picker if no name) |
| `ha list` (= `ha ls`) | List shortcuts (`--sort name\|recent\|usage`) |
| `ha rm [name]` | Delete a shortcut (extra confirm for frequently used) |
| `ha stats` | Usage stats (top N, unused, time-filtered) |
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

```
halias❯ git
gs        git status                      #git       Show working tree status
gp        git pull                        #git,daily Pull from origin
mkcd      mkdir -p "$1" && cd "$1"        #fs        Make and enter directory
```

Search matches across **name, command body, tags, and description**. Try searching for "polled" — if you described `gp` as "pull from origin", it'll match.

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
├── stats.log               # raw usage log (timestamp + name)
└── generated/
    └── aliases.sh          # auto-generated, sourced by your shell
```

Everything is plain text, version-controllable, and easy to back up.

## Roadmap

### v0.1.0 — Initial release ✅

The first version ships with everything you need for personal alias management:
core CRUD, fuzzy search, usage stats, backup/restore, and an environment doctor.

### Coming next

- npm publish — `npm i -g halias` for everyone
- First-run onboarding flow
- Demo GIF for the README

## Development

```bash
npm run dev -- add        # run with tsx (no build needed)
npm run typecheck         # type check
npm run build             # produce dist/
```

## License

MIT — see [LICENSE](./LICENSE).
