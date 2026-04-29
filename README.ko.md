# halias

> Hyper alias — 단축키를 GUI처럼 편하게 관리하세요.

📖 [English README](./README.md) · 한국어

## 무엇이 다른가요?

기존 alias 관리는 `~/.zshrc` 를 직접 편집해야 했습니다. `halias` 는:

- ✨ **대화형 추가** (`ha add`) — 입력만으로 안전하게 등록, 미리보기로 안심
- 🔍 **퍼지 검색** (`ha`) — fzf 통합으로 단축키를 빠르게 찾기
- 📊 **자동 통계** — 모든 단축키가 wrapper 함수로 생성되어 사용 빈도 자동 추적
- 🛡️ **안전장치** — 시스템 명령어 충돌 감지, 자주 쓰는 단축키 삭제 시 추가 확인
- 💾 **백업/복원** — JSON 한 파일로 export/import

## 두 가지 명령어 진입점

```bash
halias add        # 정식 이름
ha add            # 일상 단축 — 매일 사용
```

`halias` 와 `ha` 는 동일하게 동작합니다. 단축키 매니저인데 매니저 자체도 짧게 부를 수 있어야겠죠.

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 로컬에서 halias / ha 명령어로 사용 가능하게 등록
npm run link:local

# 3. 첫 단축키 추가
ha add

# 4. 셸에 통합 (한 번만)
ha install

# 5. 새 터미널을 열거나 source 적용
source ~/.zshrc

# 6. 사용!
gs   # 방금 등록했다면 git status 가 실행됩니다

# 7. 이후 새 단축키를 추가했을 때, 현재 셸에 즉시 반영하려면:
hareload
```

> 💡 **`hareload` 가 뭐예요?**
> `ha install` 시점에 셸에 자동 등록되는 함수입니다. 새 단축키를 만든 후 현재 터미널에 즉시 반영하고 싶을 때 한 단어로 끝낼 수 있어요.
> CLI 명령(`ha reload` 등)으로 만들지 않은 이유는, 자식 프로세스에서 `source` 해봤자 부모 셸에 영향을 못 주기 때문입니다. 사용자 셸에서 직접 실행되는 함수여야 동작합니다.

## 명령어

CLI 명령 (Node.js로 실행):

| 명령 | 설명 |
| --- | --- |
| `ha` (인자 없이) | 퍼지 검색 — 등록된 단축키 빠르게 찾기 |
| `ha search` (= `ha s`) | 위와 동일, 명시적 호출 |
| `ha add` | 대화형으로 새 단축키 추가 |
| `ha edit [name]` | 기존 단축키 편집 (이름 없으면 선택 화면) |
| `ha list` (= `ha ls`) | 등록된 단축키 목록 (`--sort name\|recent\|usage`) |
| `ha rm [name]` | 단축키 삭제 (자주 쓰는 거면 추가 확인) |
| `ha stats` | 사용 통계 (top N, 미사용 등) |
| `ha export [path]` | JSON 백업 |
| `ha import <path>` | 백업에서 복원 (`--strategy merge\|replace`) |
| `ha install` | `~/.zshrc` 에 셸 통합 추가 |
| `ha doctor` | 환경 점검 (fzf, 셸 통합, 위험 단축키 등) |

셸 함수 (`ha install` 시 자동 등록, 셸에서 직접 호출):

| 함수 | 설명 |
| --- | --- |
| `hareload` | 새 단축키를 현재 셸에 즉시 반영 |

## 데이터 저장 구조

```
~/.halias/
├── shortcuts.json          # 단일 진실 공급원 (JSON)
├── stats.log               # 사용 통계 원본 로그
└── generated/
    └── aliases.sh          # 셸이 source 하는 자동 생성 파일
```

`~/.zshrc` 는 다음 한 줄 + 마커만 추가됩니다:

```bash
# >>> halias shortcuts >>>
[ -f "$HOME/.halias/generated/aliases.sh" ] && source "$HOME/.halias/generated/aliases.sh"
# <<< halias shortcuts <<<
```

모든 변경은 `halias` CLI를 통해 이루어지고, `aliases.sh` 는 자동 재생성됩니다.

## 작동 원리: alias도 함수로 통일

`halias` 는 모든 단축키를 셸 **함수**로 생성합니다. alias 타입도 마찬가지:

```bash
# ha add gs "git status" 입력 시 생성되는 코드:
gs() {
  _halias_track "gs"      # ← 통계 자동 기록 (백그라운드)
  git status "$@"         # ← 추가 인자 forwarding
}
```

이렇게 통일한 이유:
1. **통계 wrapper를 일관되게 적용** — alias는 함수 호출 hook이 어려움
2. **인자 forwarding** (`"$@"`) 으로 alias의 한계 우회
3. zsh / bash 모두 동일하게 동작

## 퍼지 검색

`ha` 만 입력하면 등록한 단축키를 인터랙티브하게 검색할 수 있습니다.

```bash
ha
# halias❯ git
# > gs    git status               #git       현재 git 상태
#   gp    git pull                 #git,daily 원격 가져오기
#   gco   git checkout             #git
```

- **이름, 명령어, 태그, 설명** 모두에 대해 검색 (예: "git" 검색 시 `gs`, `gp` 등 모두 매치, "폴더" 같은 설명 검색도 가능)
- `Esc` 또는 `Ctrl+C` 로 취소
- `Enter` 로 선택 → 단축키 정보 출력 (함수는 본문 전체)

### fzf 설치 (권장)

가장 좋은 검색 경험을 위해 [fzf](https://github.com/junegunn/fzf) 설치를 추천합니다. 가장 쉬운 방법은:

```bash
ha doctor
```

OS와 패키지 매니저를 감지해서 정확한 설치 명령어를 안내합니다. macOS(brew)나 Windows(winget/scoop) 환경에서는 자동 설치 옵션도 제공됩니다.

수동 설치:
```bash
brew install fzf            # macOS
sudo apt install fzf        # Ubuntu/Debian
sudo dnf install fzf        # Fedora/RHEL
winget install fzf          # Windows
```

fzf가 없어도 동작하지만, Clack의 단순 선택 UI로 폴백됩니다 (검색 없이 화살표로만 선택, 취소는 Ctrl+C).

## 사용 통계

`ha stats` 로 어떤 단축키를 자주 쓰는지, 무엇이 잠자고 있는지 확인할 수 있습니다.

```bash
ha stats              # top 10 + 막대 그래프 + 마지막 사용 시점
ha stats --top 5      # top 5 만
ha stats --since 7d   # 최근 7일만 (또는 24h, 30m)
ha stats --unused     # 한 번도 안 쓴 / 30일 이상 미사용 단축키
```

### 출력 예시

```
  사용 통계  (1개월 전부터 · 총 14회)

   1.  gs    5  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇  마지막: 1분 전
   2.  gp    3  ▇▇▇▇▇▇▇▇▇▇▇▇          마지막: 6분 전
   3.  mkcd  2  ▇▇▇▇▇▇▇▇              마지막: 30분 전
```

데이터는 `ha install` 시 자동 등록되는 `_halias_track` 함수가 매 호출마다 `~/.halias/stats.log` 에 append합니다. 별도 설정 불필요.

## 안전성 — 백업과 복원

```bash
ha export                              # ./halias-backup-2026-04-29.json
ha export ~/Dropbox/halias-backup.json # 특정 경로
ha import ~/Dropbox/halias-backup.json # 머지 (기존 우선)
ha import backup.json --strategy replace  # 완전 교체
```

`merge` 전략은 같은 이름이 있으면 기존을 유지합니다 (안전). `replace` 는 기존을 모두 지우고 백업 내용으로 덮어씁니다 (위험, 명시적 확인 필요).

## 환경 점검

```bash
ha doctor
# ✓ fzf 설치됨
# ✓ 셸 통합 설치됨 (.zshrc)
# ✓ shortcuts.json 무결성 정상 (12개)
# ! 시스템 명령어를 덮어씌우는 단축키 1개
#     • ls
#   → 의도한 것이 아니라면 ha rm <name> 으로 삭제하세요.
# ✓ aliases.sh 생성됨
```

`ha doctor` 는 다음을 체크합니다:
- fzf 설치 여부 (퍼지 검색 품질)
- 셸 통합 설치 여부 (`~/.zshrc` 에 source 라인)
- `shortcuts.json` 무결성 (parse 가능?)
- 위험한 단축키 (시스템 명령어 덮어씌움)
- `aliases.sh` 존재 여부

## 로드맵

## 로드맵

### v0.1.0 — 첫 릴리즈 ✅

개인 alias 관리에 필요한 모든 게 들어있습니다: 코어 CRUD, 퍼지 검색, 사용 통계,
백업/복원, 환경 점검까지.

### 다음 예정

- npm publish — `npm i -g halias` 로 누구나 설치
- 첫 실행 시 자동 onboarding (install 안내)
- README 데모 GIF

## 개발

```bash
npm run dev -- add        # tsx로 직접 실행 (빌드 불필요)
npm run typecheck         # 타입 체크
npm run build             # dist/ 빌드
```

## 라이선스

MIT
