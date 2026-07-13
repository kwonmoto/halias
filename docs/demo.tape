# halias demo — regenerate with: vhs docs/demo.tape
# (run from the repo root after `npm run build`)

Output docs/demo.gif

Set FontSize 17
Set Width 1100
Set Height 640
Set TypingSpeed 45ms
Set Shell bash
Set Padding 16

# ── 셋업 (화면에 안 보임): 격리 HOME + 데모 데이터 시드 ──
Hide
Type `export HOME=$(mktemp -d); ha() { node "$PWD/dist/cli.js" "$@"; }` Enter
Type `ha add gs "git status" --desc "show working tree" --tags git >/dev/null` Enter
Type `ha add dev "pnpm dev" --desc "start dev server" --tags js >/dev/null` Enter
Type `ha add mkcd 'mkdir -p "$1" && cd "$1"' --type function --desc "make dir and enter" >/dev/null` Enter
Type `NOW=$(date +%s); { for i in $(seq 1 12); do printf "%s\tgs\t%s\n" "$NOW" "$PWD"; done; for i in $(seq 1 5); do printf "%s\tdev\t%s\n" "$NOW" "$PWD"; done; } >> "$HOME/.halias/stats.log"` Enter
Type "clear" Enter
Show

# ── 1. 비대화형으로 단축키 추가 ──
Type `ha add dlog "docker compose logs -f api" --tags docker`
Sleep 600ms
Enter
Sleep 2s

# ── 2. 퍼지 검색 + 미리보기 ──
Type "ha"
Sleep 400ms
Enter
Sleep 2s
Type "log"
Sleep 2.5s
Enter
Sleep 2.5s

# ── 3. 사용 통계 ──
Type "ha stats"
Sleep 400ms
Enter
Sleep 3.5s
