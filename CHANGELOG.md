# Changelog

All notable changes to halias will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
