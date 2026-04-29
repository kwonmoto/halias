# halias

> Hyper alias — 셸 단축키를 GUI처럼 편하게 관리하세요. `.zshrc` 한 번만 건드리고 그 다음부턴 CLI로 끝.

📖 [English README](./README.md) · 한국어

[![CI](https://github.com/hyukjunkwon/halias/actions/workflows/ci.yml/badge.svg)](https://github.com/hyukjunkwon/halias/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/halias.svg)](https://www.npmjs.com/package/halias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

## 무엇이 다른가요?

기존 alias 관리는 `~/.zshrc` 를 매번 열어 편집해야 했습니다. **halias** 는 그걸 앱처럼 만들었어요:

- ✨ **대화형 추가** (`ha add`) — 입력만으로 안전하게 등록, 미리보기로 안심
- 🔍 **퍼지 검색** (`ha`) — 이름·명령·태그·설명 모두에 대해 fzf로 즉시 검색
- 📊 **자동 통계** — 모든 단축키가 wrapper 함수로 생성되어 사용 빈도 자동 추적
- 🛡️ **안전장치** — 시스템 명령어 충돌 감지, 자주 쓰는 단축키 삭제 시 추가 확인
- 💾 **백업/복원** — JSON 한 파일로 export/import
- 🐚 **두 가지 진입점** — `halias` (정식) / `ha` (일상용), 동일한 바이너리

## 설치

```bash
npm install -g halias
```

`halias` 와 `ha` 가 글로벌로 등록됩니다. 일상에서는 짧은 `ha` 를 추천해요.

### 소스에서 설치

```bash
git clone https://github.com/hyukjunkwon/halias.git
cd halias
npm install
npm run link:local
```

## 빠른 시작

```bash
# 1. 첫 단축키 추가 (대화형)
ha add
#   ◇ 단축키 이름은?    gs
#   ◇ 어떤 종류?        alias
#   ◇ 실행할 명령어?    git status
#   ◇ 설명 (선택)       현재 git 상태 확인
#   ◇ 태그 (선택)       git

# 2. 셸 통합 추가 (최초 1회)
ha install

# 3. 적용 (또는 새 터미널 열기)
source ~/.zshrc

# 4. 사용!
gs                   # → git status 실행됨

# 5. 나중에 까먹었을 때
ha                   # 퍼지 검색으로 단축키 찾기
hareload             # 새 단축키를 현재 셸에 즉시 반영
```

## 명령어

| 명령 | 설명 |
| --- | --- |
| `ha` (인자 없이) | 퍼지 검색 — 등록된 단축키 빠르게 찾기 |
| `ha search` (= `ha s`) | 위와 동일, 명시적 호출 |
| `ha add` | 대화형으로 새 단축키 추가 |
| `ha edit [name]` | 기존 단축키 편집 (이름 없으면 선택 화면) |
| `ha list` (= `ha ls`) | 단축키 목록 (`--sort name\|recent\|usage`) |
| `ha rm [name]` | 단축키 삭제 (자주 쓰는 거면 추가 확인) |
| `ha stats` | 사용 통계 (top N, 미사용, 기간 필터) |
| `ha export [path]` | JSON 백업 |
| `ha import <path>` | 백업에서 복원 (`--strategy merge\|replace`) |
| `ha install` | `~/.zshrc` 에 셸 통합 추가 |
| `ha doctor` | 환경 점검 (fzf, 셸 통합, 위험 단축키 등) |

## 작동 원리

halias 는 `~/.halias/shortcuts.json` 한 파일을 진실 공급원으로 두고, `~/.halias/generated/aliases.sh` 를 그로부터 생성합니다. `.zshrc` 에는 단 한 번 다음 블록만 추가됩니다:

```bash
# >>> halias shortcuts >>>
[ -f "$HOME/.halias/generated/aliases.sh" ] && source "$HOME/.halias/generated/aliases.sh"
# <<< halias shortcuts <<<
```

모든 단축키는 — 단순한 alias도 포함해서 — 셸 **함수**로 생성됩니다:

```bash
# ha add gs "git status" 입력 시 생성:
gs() {
  _halias_track "gs"      # ~/.halias/stats.log 에 사용 기록
  git status "$@"         # 추가 인자 forwarding
}
```

이렇게 통일한 이유:
1. **통계 wrapper 일관 적용** — alias 자체엔 호출 hook이 어려움
2. **인자 forwarding** (`"$@"`) — alias 의 한계 우회
3. **zsh / bash 동일 동작**

## 퍼지 검색

`ha` 만 입력하면 모든 단축키를 인터랙티브하게 검색할 수 있어요:

```
halias❯ git
gs        git status                      #git       현재 git 상태
gp        git pull                        #git,daily 원격 가져오기
mkcd      mkdir -p "$1" && cd "$1"        #fs        폴더 만들고 이동
```

검색은 **이름, 명령 본문, 태그, 설명** 모두에 대해 동작합니다. "폴더" 같은 한국어 설명으로도 매치돼요.

### fzf 설치 (권장)

가장 좋은 검색 경험을 위해 [fzf](https://github.com/junegunn/fzf) 를 추천합니다. 가장 쉬운 방법:

```bash
ha doctor
```

OS와 패키지 매니저(brew / apt / dnf / winget / scoop)를 자동 감지해서 안전한 옵션을 안내합니다. fzf 가 없으면 단순 선택 모드로 폴백돼요.

## 사용 통계

```bash
ha stats              # top 10 + 막대 그래프 + 마지막 사용 시점
ha stats --top 5      # top 5 만
ha stats --since 7d   # 최근 7일만 (또는 24h, 30m)
ha stats --unused     # 한 번도 안 쓴 / 30일 이상 미사용
```

### 출력 예시

```
  사용 통계  (1개월 전부터 · 총 14회)

   1.  gs    5  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  마지막: 1분 전
   2.  gp    3  ▇▇▇▇▇▇▇▇▇▇▇▇          마지막: 6분 전
   3.  mkcd  2  ▇▇▇▇▇▇▇▇              마지막: 30분 전
```

데이터는 `ha install` 시 자동 등록되는 `_halias_track` 함수가 매 호출마다 `~/.halias/stats.log` 에 append합니다. 별도 설정 불필요.

## 백업 / 복원

```bash
ha export                              # ./halias-backup-YYYY-MM-DD.json
ha export ~/Dropbox/halias-backup.json # 특정 경로
ha import ~/Dropbox/halias-backup.json # merge (기존 우선) — 기본
ha import backup.json --strategy replace  # 완전 교체
```

`merge` 는 같은 이름이 있으면 기존을 유지합니다 (안전). `replace` 는 기존을 모두 지우고 백업으로 갈아끼웁니다 (명시적 확인 필요).

## 환경 점검

```bash
ha doctor
```

다음 항목을 종합 점검합니다:

- fzf 설치 여부 (퍼지 검색 품질)
- 셸 통합 설치 여부 (`~/.zshrc` 마커)
- `shortcuts.json` 무결성 (parse 가능?)
- 위험한 단축키 (시스템 명령어 덮어씌움)
- `aliases.sh` 존재 여부

```
halias 환경 점검

  ✓ fzf 설치됨
  ✓ 셸 통합 설치됨 (.zshrc)
  ✓ shortcuts.json 무결성 정상 (12개)
  ! 시스템 명령어를 덮어씌우는 단축키 1개
      • ls
    → 의도한 것이 아니라면 ha rm <name> 으로 삭제하세요.
  ✓ aliases.sh 생성됨
```

## 데이터 저장 구조

```
~/.halias/
├── shortcuts.json          # 단일 진실 공급원 (사람이 읽을 수 있는 JSON)
├── stats.log               # 사용 통계 원본 (timestamp + name)
└── generated/
    └── aliases.sh          # 자동 생성, 셸이 source 함
```

모두 plain text 라 버전 관리도 가능하고 백업도 쉽습니다.

## 로드맵

### v0.1.0 — 첫 릴리즈 ✅

개인 alias 관리에 필요한 모든 게 들어있습니다: 코어 CRUD, 퍼지 검색, 사용 통계, 백업/복원, 환경 점검까지.

### 다음 버전

체크리스트 채우기보다는 **실 사용에서 발견되는 마찰점** 기반으로 진행합니다. 후보:

- **첫 실행 시 onboarding** — 처음 `ha` 입력 시 install 안내
- **`$EDITOR` 모드** — 함수 본문을 vim/code 로 편집
- **검색 결과 사용 빈도순 정렬**

이슈/제안은 [GitHub issues](https://github.com/hyukjunkwon/halias/issues) 환영합니다.

## 개발

```bash
npm run dev -- add        # tsx 로 직접 실행 (빌드 없이 빠르게)
npm run typecheck         # 타입 체크
npm run build             # dist/ 빌드
```

## 라이선스

MIT — [LICENSE](./LICENSE) 참고.