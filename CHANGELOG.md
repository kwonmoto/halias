# Changelog

All notable changes to halias will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ha completion zsh` / `ha completion bash` outputs a shell completion script. Enables tab-completing commands and shortcut names (`ha edit <tab>`, `ha rm <tab>`, etc.).
- `ha install` now also offers to set up shell completion in one step.
- `ha add` now opens `$EDITOR` for function-type shortcuts, consistent with `ha edit`.
- i18n support: English (default) and Korean (`HALIAS_LANG=ko` or set via `~/.halias/config.json`). All user-facing messages are now translatable.
- `ha tags [tag]` shows all tags in use with their shortcut counts. Selecting a tag in interactive mode filters the shortcut list. Passing a tag argument directly jumps to the filtered view.
- `ha import-rc [file]` parses aliases and single-line functions from `~/.zshrc` (or any rc file) and lets you pick which ones to bring into halias. Skips entries already registered and the halias-managed block.

### Changed

- Editor utilities (`editFunctionBody`, `resolveEditorArgs`) extracted to `src/lib/editor.ts` and shared between `add` and `edit` commands.

## [0.3.0] - 2026-05-13

### Added

- `ha stats --unused` now shows the command body and registration date alongside each unused shortcut, making it easier to decide what to remove.
- `ha stats --unused --clean` / `ha unused --clean` opens an interactive checklist to bulk-delete unused and stale shortcuts in one step.
- `ha unused` shorthand command — equivalent to `ha stats --unused`, for quicker access.
- `ha rename <old> <new>` renames a shortcut without going through the full edit form. Prompts interactively if arguments are omitted.
- `ha list --tag <tag>` filters the shortcut list to a specific tag.
- `ha edit` now opens `$EDITOR` (or `$VISUAL`) for function-type shortcuts, enabling proper multiline editing. If neither variable is set, halias detects installed editors (VSCode, Zed, Neovim, Vim, etc.) and prompts once to pick one — the choice is saved to `~/.halias/config.json`. Falls back to inline prompt if no editor is found.
- `ha add --last [name]` can save the last shell command as a shortcut, making repeated long commands easier to capture without retyping.
- `ha suggest` can surface repeated shell commands from recent history as shortcut candidates.
- `ha suggest --save` lets you pick a suggested command and save it through the normal preview/confirmation flow.
- `ha doctor` now checks shell history readability for `ha add --last` and `ha suggest`.

### Changed

- CLI and README positioning now describe halias as a personal command layer that learns from real shortcut usage.
- `ha suggest` now filters common shell/session setup noise such as shell integration sourcing, virtualenv activation, `eval`, `export`, and `unset`.
- Shortcut names now allow hyphens in non-leading positions (e.g. `git-status`).

### Fixed

- `halias --version` now reports the correct package version.
- `ha unused --clean` and editor picker now show a helpful message instead of crashing when stdin is not a TTY (e.g. inside IDE terminals).
- GUI editors (`code`, `subl`, `zed`, etc.) automatically receive `--wait` flag so the terminal blocks until the file is closed.

## [0.2.0] - 2026-04-30

### Added

- **Context-aware fuzzy search** — `ha` now ranks shortcuts by usage frequency in the current directory. Shortcuts you've used here will float to the top, with global frequency as a tiebreaker. Look for the ★ marker to see context matches.
- Stats log now tracks the directory where each shortcut was invoked. This enables future per-directory insights commands.

### Changed

- `_halias_track` helper now records `<timestamp>\t<name>\t<pwd>` (tab-separated) instead of the previous `<timestamp> <name>` (space-separated). Both formats are read transparently — older log entries continue to count toward global frequency stats.


## [0.1.0] — 2026-04-29

Initial release.

### Features

**Core CRUD**
- `ha add` — interactive shortcut creation with Clack TUI, type selection (alias / function), validation, and live preview
- `ha edit [name]` — edit existing shortcut with diff display before save
- `ha list` — sortable list (`--sort name|recent|usage`) with usage counts in usage mode
- `ha rm [name]` — delete with extra confirmation for frequently-used shortcuts
- `ha install` — install shell integration into `~/.zshrc` / `.bashrc`

**Search**
- `ha` (no args) — fuzzy search across name, command, tags, and description via fzf
- Fallback to Clack selector when fzf is not available

**Stats**
- `ha stats` — top N usage with bar chart, time filtering (`--since 7d`), and `--unused` mode
- Tracking via auto-generated `_halias_track` wrapper functions; no setup required

**Safety**
- `ha export [path]` / `ha import <path>` — JSON backup and restore with `merge` (default) or `replace` strategies
- System command conflict detection at `add` time
- `ha doctor` — environment check covering fzf, shell integration, JSON integrity, dangerous shortcuts, and aliases.sh existence

**Shell integration**
- All shortcuts (including aliases) generated as wrapper functions for consistent stat tracking
- `hareload` shell function auto-installed for instant reload after add/edit
- Two binary entry points: `halias` (formal) and `ha` (daily)
