# AGENTS.md

이 파일은 `CLAUDE.md`의 프로젝트 지식을 Codex 작업 방식에 맞게 옮긴 가이드입니다.
Codex가 halias 코드베이스를 작업할 때는 이 문서를 우선 참고합니다.

## Codex working rules

- 작업 전 현재 파일 상태를 확인하고, 사용자가 만든 변경을 되돌리지 않습니다.
- 코드 변경을 하면 README.md, README.ko.md, CHANGELOG.md 갱신 필요 여부를 함께 판단합니다. 명시적 예외가 없으면 코드 변경에는 문서 변경이 동반됩니다.
- 구현은 기존 구조를 따릅니다. 명령 라우팅은 `commands/`, 순수 도메인 로직은 `core/`, 공통 유틸은 `lib/`에 둡니다.
- 사용자에게 보이는 CLI 메시지는 한국어, 함수/변수명과 README/JSDoc/커밋 메시지는 영어를 유지합니다.
- 변경 후 기본 검증은 `npm run typecheck && npm run build && node dist/cli.js --help`입니다. 범위가 좁으면 필요한 하위 검증도 함께 실행합니다.
- `generator.ts`의 HEADER, release workflow, npm package identity, `~/.halias/` 데이터 위치처럼 사용자 셸이나 배포에 직접 닿는 부분은 수정 전 의도를 다시 확인합니다.

## Project overview

**halias** (Hyper alias) — 셸 alias와 function을 인터랙티브 CLI로 관리하는 도구.
사용자가 `~/.zshrc`를 직접 편집하지 않고도 단축키를 추가/검색/편집/통계 확인/백업할 수 있게 함.

- **사용자**: 본인 (Harry Kwon, GitHub `hyukjunkwon`) 및 npm으로 설치할 일반 개발자
- **상태**: v0.2.0 npm publish 완료. 실사용 + 발견되는 마찰점 기반으로 점진 개선 중.
- **아이덴티티**: "본인 손에 맞는 도구"가 출발점. 기능 부풀리기보다 사용성/안전성을 다듬는 방향.

## Tech stack

- **언어**: TypeScript (strict, ES2022, ESM)
- **Runtime**: Node.js 20+
- **빌드**: tsup (단일 dist/cli.js로 번들)
- **CLI 프레임워크**: commander (라우팅) + @clack/prompts (대화형 TUI)
- **검증**: zod (shortcuts.json 스키마)
- **출력**: chalk (컬러)
- **외부 의존**: fzf (선택적, 퍼지 검색용)

설치/패키지 매니저는 **npm 고정**. (lock 파일 의미 + CI 일관성)

## Repository layout

```
halias/
├── src/
│   ├── cli.ts                # commander 진입점, 모든 명령 라우팅
│   ├── commands/             # 명령별 진입 함수 (run* 형태)
│   │   ├── add.ts
│   │   ├── edit.ts
│   │   ├── list.ts
│   │   ├── remove.ts
│   │   ├── search.ts
│   │   ├── stats.ts
│   │   ├── install.ts
│   │   ├── doctor.ts
│   │   └── export-import.ts
│   ├── core/                 # 도메인 로직 (CLI 무관)
│   │   ├── types.ts          # zod 스키마 + 타입
│   │   ├── store.ts          # shortcuts.json CRUD (원자적 쓰기)
│   │   ├── generator.ts      # JSON → aliases.sh 셸 코드 생성
│   │   └── stats.ts          # stats.log 집계
│   └── lib/                  # 횡단 유틸 (어디서든 쓸 수 있는)
│       ├── paths.ts          # ~/.halias/* 경로 상수
│       ├── fzf.ts            # fzf 외부 바이너리 래퍼
│       ├── platform.ts       # OS + 패키지 매니저 감지
│       └── system-commands.ts# 시스템 명령어 충돌 검출
├── .github/workflows/
│   ├── ci.yml                # main push/PR 마다 type check + build
│   └── release.yml           # v* 태그 push 시 npm publish + GitHub Release
├── dist/                     # 빌드 결과물 (gitignore)
├── README.md                 # 영문 메인
├── README.ko.md              # 한국어 보조
├── CHANGELOG.md              # Keep a Changelog 형식
├── LICENSE                   # MIT
├── package.json
└── tsconfig.json
```

명령(`commands/`)은 비즈니스 로직을 직접 짜지 말고 **`core/`의 함수를 조합**하는 식으로. 같은 패턴이 다른 명령에도 필요하면 `core/`로 승격.

## Runtime data layout

런타임 사용자 데이터는 모두 `~/.halias/` 아래:

```
~/.halias/
├── shortcuts.json          # 단일 진실 공급원 (사용자 데이터)
├── stats.log               # append-only 사용 로그
│                           # 형식: <timestamp>\t<name>\t<directory> (탭 구분)
│                           # 옛 형식 (공백 구분) 도 호환 — 컨텍스트 점수만 못 씀
└── generated/
    └── aliases.sh          # JSON → 셸 함수로 변환된 결과
```

사용자 `.zshrc`엔 다음 한 블록만 추가됨:

```bash
# >>> halias shortcuts >>>
[ -f "$HOME/.halias/generated/aliases.sh" ] && source "$HOME/.halias/generated/aliases.sh"
# <<< halias shortcuts <<<
```

마커 (`# >>> halias shortcuts >>>`)는 미래에 셸 통합 제거/업데이트할 때 식별자로 쓸 예정. 절대 변경 금지.

## Critical design decisions

이 결정들은 의식적으로 선택된 것. 변경 전 반드시 이유 검토.

### 1. 모든 단축키를 셸 함수로 통일 생성

alias 타입도 함수로 래핑함:

```bash
gs() {
  _halias_track "gs"          # 통계 자동 기록
  git status "$@"             # alias 본문 + 인자 forwarding
}
```

이유:
- 통계 wrapper를 모든 단축키에 일관되게 적용 가능 (alias엔 hook이 어려움)
- `"$@"` forwarding으로 alias의 인자 한계 우회
- zsh / bash 동일 동작

함수 타입 단축키는 사용자 본문을 그대로 들여쓰기해서 삽입.

### 2. `~/.zshrc`에는 한 줄만 추가

`ha install`이 마커 블록을 한 번만 추가. 이후 단축키 추가/편집은 `~/.halias/generated/aliases.sh`만 갱신. 사용자 셸 설정 파일을 반복적으로 건드리는 건 신뢰 잃기 쉬워서 금지.

### 3. 통계 추적은 동기 쓰기 (백그라운드 ❌)

```bash
# 안 됨 — zsh가 [job] done 알림을 매번 띄움
( echo "$(date +%s) $1" >> "$HALIAS_STATS_LOG" ) &

# 올바름 — 한 줄 append는 1ms 미만이라 사용자 체감 없음
echo "$(date +%s) $1" >> "$HALIAS_STATS_LOG" 2>/dev/null
```

이전에 `&`로 했다가 zsh의 잡 제어 알림 (`[2] done ...`) 때문에 사용자 셸이 지저분해지는 사고 있었음. **다시 백그라운드로 바꾸지 말 것.**

### 4. 원자적 파일 쓰기 (`shortcuts.json`)

```typescript
// store.ts의 writeStore
const tmp = `${STORE_PATH}.tmp`;
await fs.writeFile(tmp, JSON.stringify(store, null, 2));
await fs.rename(tmp, STORE_PATH);
```

writing 도중 죽거나 동시 편집해도 파일이 깨지지 않음. 중요.

### 5. zod 스키마 양쪽 검증

- 읽을 때: 외부 편집/손상 가능성 방어
- 쓸 때: 우리 코드 버그 방어

`store.ts`의 `readStore`/`writeStore` 둘 다 `StoreSchema.parse()` 통과시킴.

### 6. `hareload`는 CLI 명령이 아니라 셸 함수

`ha reload` 같은 CLI 명령으로 만들면 자식 프로세스에서 `source` 해봤자 부모 셸에 영향 0. 그래서 `ha install` 시 `aliases.sh` 안에 `hareload()` 함수를 자동 추가하는 방식.

이 함수는 `generator.ts`의 HEADER 부분에서 생성됨 — 함수 정의 변경 시 거기 수정.

### 7. fzf는 선택적 의존

설치되어 있으면 `ha` 검색 UX가 훨씬 좋아지지만, 없어도 Clack select로 폴백. 자동 설치는 `ha doctor`가 OS/패키지매니저 감지 후 사용자 동의 받고 진행 (sudo 필요한 환경은 명령어만 안내).

### 8. 컨텍스트 인식 정렬은 자동 학습 (사용자 결정 X)

`ha` 검색 결과는 **현재 디렉토리에서의 사용 빈도** 를 기반으로 정렬됨. 사용자가 "이 단축키는 이 폴더용" 같은 명시적 분류를 하지 않음 — 사용 패턴이 자연스럽게 학습됨.

이전에 검토했다가 거부된 대안: **명시적 디렉토리 scope 필드**. 사용자에게 "이 단축키 어디서 쓸 거예요?" 묻는 방식. 거부 이유:
- 사용자 부담 ↑
- 같은 이름 여러 동작 → 헷갈림
- 진입 장벽 ↑

대신 데이터로 답하기로. macOS Spotlight 가 자주 여는 앱을 위로 올리는 것과 같은 원리.

핵심 알고리즘 (`core/stats.ts` 의 `scoreShortcutsForDirectory`):
​```
score = α × (현재 디렉토리에서 쓴 횟수) + β × (전체 빈도)
       α=10, β=1 (현재 디렉토리 강하게 우선)
​```

stats.log 형식: `<timestamp>\t<name>\t<directory>` (탭 구분).
옛 형식 (`<timestamp> <name>`) 도 호환 유지 — 글로벌 빈도엔 합산되지만 컨텍스트엔 영향 X.

## Coding conventions

### TypeScript

- `tsconfig.json`이 strict 모드 — `any` 절대 추가하지 말 것
- ESM 전용 (`"type": "module"`) — `require()` 금지, import 사용
- `import type { X }` 으로 타입 import 명시 (tree-shaking)
- 함수 시그니처에 명시적 타입 (return 타입 추론 의존 ❌)
- zod 스키마와 TypeScript 타입은 `z.infer<typeof X>`로 단일 소스화

### 명령(commands/) 작성 패턴

각 명령 파일은 `run*` export 함수 하나. 호출 흐름:

```typescript
export async function runFoo(options: FooOptions): Promise<void> {
  // 1. 데이터 읽기 (core/store, core/stats)
  // 2. Clack TUI 또는 인자 처리
  // 3. core/ 함수로 비즈니스 로직 실행
  // 4. 사용자에게 결과 출력 (chalk + console.log)
}
```

`runFoo`는 `process.exit()` 호출 금지. 에러는 throw로 던지고 `cli.ts`의 최상단 catch가 처리.

### Clack TUI

- `p.intro()` / `p.outro()` 로 화면 시작/끝 명확히
- `p.group()` 으로 다단계 입력 묶기
- 취소 처리 (`p.isCancel`) 모든 prompt 후 명시
- 미리보기 → confirm 패턴 (사용자가 무엇을 저장하는지 보여준 뒤 yes/no)

### 출력 스타일

- 보통 결과는 `console.log` + chalk 직접
- 들여쓰기는 공백 2칸 (`'  ' +` 또는 `padStart(2)`)
- 색상 사용 원칙:
  - `chalk.cyan` — 명령어, 단축키 이름
  - `chalk.dim` — 보조 정보, 설명
  - `chalk.green` — 성공 (✓)
  - `chalk.yellow` — 경고 (!)
  - `chalk.red` — 에러 (✗)
  - 굵게는 `chalk.bold` (헤더용)

### 한국어 vs 영어

- **사용자에게 보이는 메시지**: 한국어 (사용자가 한국 개발자)
- **코드 주석**: 한국어 (혁준님 본인 가독성)
- **함수/변수명, 커밋 메시지, README, JSDoc**: 영어 (npm 글로벌 사용자)

이 분리 의식적으로 유지.

### 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/) 형식:
- `feat:` 새 기능
- `fix:` 버그 수정
- `docs:` 문서만
- `refactor:` 리팩토링 (외부 동작 변화 없음)
- `chore:` 빌드/설정/의존성
- `ci:` CI/CD 변경
- `test:` 테스트 추가/수정

CHANGELOG와 무관하게 항상 이 형식 유지.

## Workflow commands

```bash
npm run dev -- <command>       # tsx로 바로 실행 (빌드 불필요, 빠름)
npm run typecheck              # tsc --noEmit
npm run build                  # tsup으로 dist/cli.js 생성
npm run link:local             # build + npm link (글로벌 ha 등록)
```

코드 변경 후 검증 표준 흐름:
```bash
npm run typecheck && npm run build && node dist/cli.js --help
```

## Release workflow

수동 단계 + 자동화 결합:

```bash
# 1. 코드 + main 머지 끝낸 상태
# 2. CHANGELOG.md의 [Unreleased] 섹션을 새 버전으로 옮김 (사람이 작성)
# 3. 한 줄로 버전업 + commit + tag
npm version patch              # 또는 minor / major
# 4. push (--follow-tags 가 핵심: tag도 같이)
git push --follow-tags
# → release.yml이 자동으로 npm publish + GitHub Release 생성
```

⚠️ 절대 하지 말 것:
- 같은 버전으로 publish 재시도 (npm 거부, 워크플로우 빨강)
- CHANGELOG 안 채우고 릴리즈 (Release 노트가 빈 채로 생성됨)
- 태그와 package.json 버전 불일치 (release.yml이 거부함)

## CHANGELOG 작성 가이드

### [Unreleased] 섹션 평소 사용

매 변경마다 [Unreleased] 에 한 줄씩 쌓아두는 패턴. 릴리즈 시 헤더만 새 버전으로 옮기고 [Unreleased]는 비움 (헤더는 유지).

### 카테고리 (Keep a Changelog)

`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` — 변경 있는 카테고리만 사용.

### 사용자 관점 작성

좋은 예: `ha stats --since 7d 옵션 추가 — 최근 N일만 집계`
별로: `update stats.ts`

내부 리팩토링은 changelog에 안 적어도 됨.

## ⭐ Documentation update policy (필독)

**모든 코드 변경은 README와 CHANGELOG 갱신을 동반합니다.** 코드만 바꾸고 문서를 안 건드리면 작업이 끝난 게 아닙니다. Codex는 어떤 작업이든 다음을 자동으로 검토하고 필요한 갱신을 함께 수행해야 합니다.

### 변경 유형별 갱신 매트릭스

| 변경 유형 | README.md | README.ko.md | CHANGELOG.md | 카테고리 |
| --- | :---: | :---: | :---: | --- |
| 새 명령 추가 (`ha foo`) | ✅ Commands 표 + 해당 섹션 | ✅ 동일 | ✅ Added | Added |
| 명령에 새 옵션 추가 | ✅ 해당 섹션 | ✅ 동일 | ✅ Added | Added |
| 동작 변경 (사용자 체감) | ✅ 해당 섹션 | ✅ 동일 | ✅ Changed | Changed |
| 버그 수정 (사용자 영향) | ⚠️ 필요 시 | ⚠️ 필요 시 | ✅ Fixed | Fixed |
| 새 데이터 필드 (Schema 변경) | ✅ Data 섹션 | ✅ 동일 | ✅ Changed | Changed |
| 의존성 업그레이드 (호환성 변경) | ⚠️ 필요 시 | ⚠️ 필요 시 | ✅ Changed | Changed |
| 보안 패치 | ⚠️ 필요 시 | ⚠️ 필요 시 | ✅ Security | Security |
| 내부 리팩토링 (외부 동작 동일) | ❌ | ❌ | ❌ | — |
| 테스트 추가 | ❌ | ❌ | ❌ | — |
| CI/CD 설정 변경 | ❌ | ❌ | ⚠️ 외부 영향 있을 때만 | — |
| 오타/문구 수정 | 해당 변경 자체 | 해당 변경 자체 | ❌ | — |

### 영문/한국어 README 동기화 원칙

두 README는 **같은 골격으로 1:1 대응**합니다. 한쪽만 변경되어 차이가 누적되는 걸 방지:

- 영문 README의 한 섹션 추가 → 한국어 README의 같은 위치에 동일 구조로 추가
- 헤더 순서, 테이블 행, 코드 블록 모두 일치 유지
- 한국어가 영문보다 풍부한 설명을 가져갈 순 있어도 (한국어 사용자 친화적 톤), **빠진 정보가 있으면 안 됨**

검증 명령:
```bash
# 양쪽 헤더 비교 — 같은 개수 + 같은 순서여야 함
diff <(grep '^##' README.md) <(grep '^##' README.ko.md)
```

### CHANGELOG 작성 규칙

평소엔 `[Unreleased]` 섹션에 한 줄씩 쌓기. 릴리즈 시 헤더만 새 버전으로 교체.

```markdown
## [Unreleased]

### Added
- `ha foo --bar` 옵션 추가 — 사용자 관점 한 줄 설명
```

**좋은 항목 작성법**:
- ✅ 사용자가 이 줄만 보고 영향을 알 수 있어야 함
- ✅ 명령어/옵션은 코드 블록(`` ` ``)으로 감쌈
- ✅ 한국어 또는 영어 통일 (현재는 영어 사용 중)
- ❌ commit 메시지 그대로 옮기기 (`fix: typo in foo.ts`)
- ❌ 내부 구현 노출 (`refactor: extract helper function`)

### 작업 흐름 안에서

코드 변경 시 항상 다음 순서로:

1. 코드 변경 + 검증 (`npm run typecheck && npm run build`)
2. **README 영문/한국어 양쪽 동시 갱신**
3. **CHANGELOG `[Unreleased]` 섹션에 항목 추가**
4. commit (Conventional Commits 형식)
5. push

PR이라면 이 모든 게 한 PR 안에 들어가야 함. "코드 PR + 문서 PR 분리" 같은 건 안 함 — 검토 비용만 늘고 동기화 깨지기 쉬움.

### 사용자가 명시적으로 "갱신 안 해도 됨" 한 경우만 예외

작업 도중 본인(혁준)이 "지금은 코드만 빠르게 바꾸고 문서는 나중에 한 번에" 같이 명시적으로 지시한 경우만 문서 갱신 생략. 이때도:

- 어떤 문서가 보류됐는지 응답에 명시
- TODO 코멘트로 코드에 표시 (선택)

기본값은 **항상 문서 갱신 포함**.

## Common operations

### 새 명령 추가

코드:
1. `src/commands/<name>.ts` 생성, `run<Name>(options)` export
2. `src/cli.ts`에 import + commander로 라우팅 추가
3. 사용자에게 보이는 메시지/도움말은 한국어로 작성

문서 (의무, 같은 PR/commit):
4. `README.md` 의 Commands 표에 행 추가 + 동작 설명 섹션이 필요하면 추가
5. `README.ko.md` 에 동일하게 (같은 행 위치, 같은 섹션)
6. `CHANGELOG.md` `[Unreleased]` 섹션에 `Added` 항목 추가

검증:
7. `npm run typecheck && npm run build`
8. `node dist/cli.js <new-command> --help` 로 도움말 확인

### 새 단축키 데이터 필드 추가

코드:
1. `src/core/types.ts`의 `ShortcutSchema` 에 zod 필드 추가
2. 옵셔널이라면 `.optional()`, 디폴트 있다면 `.default()`
3. `src/commands/add.ts`, `edit.ts`의 폼에 입력 필드 추가
4. `src/core/generator.ts`에서 새 필드가 셸 코드에 반영되어야 하는지 검토
5. 기존 사용자의 shortcuts.json 마이그레이션 고려 — 보통 옵셔널 필드라 무중단

문서 (의무):
6. `README.md` / `README.ko.md` 의 Data 섹션 또는 How it works 섹션 갱신
7. `CHANGELOG.md` `[Unreleased]` 에 `Changed` 또는 `Added` 항목

### 기존 명령 동작 변경

코드 변경 후:
1. `README.md` / `README.ko.md` 의 해당 섹션 본문/예시 갱신
2. `CHANGELOG.md` `[Unreleased]` 에 `Changed` 항목 — 이전 동작 vs 새 동작 명시

### 버그 수정

1. 코드 수정
2. (사용자 체감 버그라면) `CHANGELOG.md` `[Unreleased]` 에 `Fixed` 항목
3. (외부 동작 변경된 경우만) README 갱신
4. 가능하면 같은 commit에 회귀 방지용 단언 (assert) 추가 — 정식 테스트 프레임워크 도입 전까진 `node -e "..."` 류 검증 스크립트라도 OK

### 메이저 데이터 마이그레이션 (v1.0+)

`StoreSchema.version` 필드를 통한 버전 분기. 현재 `version: 1`. v2 도입 시:
- `readStore` 에 마이그레이션 로직 추가
- 마이그레이션 전 자동 백업 (`~/.halias/shortcuts.json.bak-v1`)
- 사용자에게 알림 출력
- README 의 Data 섹션 갱신
- CHANGELOG 에 `Changed` (대형 변경) 또는 `Breaking` 항목

### 릴리즈 (수동 발화)

본인이 직접 트리거:
```bash
# 1. CHANGELOG.md 의 [Unreleased] → [0.x.y] 헤더 변경, [Unreleased]는 비움
# 2. 한 줄로 끝
npm version patch    # 또는 minor / major
git push --follow-tags
# → release.yml 이 npm publish + GitHub Release 자동
```

## Files Codex shouldn't touch without confirmation

- **`LICENSE`** — 저작권자 이름, 연도
- **`package.json` 의 `name`, `bin`, `version`** — npm 페이지 영향
- **`.github/workflows/release.yml`** — npm publish 자동화 (실수 시 사고 큼)
- **`generator.ts` 의 HEADER 상수** — 모든 사용자의 셸에 들어갈 코드. 이전 호환성 깨면 큰 일.
- **`~/.halias/` 경로 변경** — 기존 사용자 데이터 위치 변경되면 마이그레이션 필요

## Things explicitly out of scope

이미 한 번 검토하고 "안 함"으로 결정된 항목들. 다시 제안할 필요 없음:

- **`ha add` 후 자동 hareload** — 기존 흐름이 이미 충분히 짧음
- **백그라운드 통계 추적** — zsh 잡 알림 사고 재발 위험
- **자체 fuzzy 검색 구현** — fzf가 압도적으로 좋음, 외부 의존이 맞음

## Roadmap (작업 우선순위 참고)

### v0.1.x (당분간)
실사용하면서 발견되는 마찰점 기반 패치. 본인 직접 사용이 진짜 우선순위 결정.

### v0.2 후보 (가능성)
- **첫 실행 시 onboarding** — 처음 `ha` 입력 시 install 안내
- **`ha edit <name>` 의 `$EDITOR` 모드** — 함수 본문은 vim/code로 편집
- **검색 결과 사용 빈도 정렬** — `ha` 검색 시 자주 쓴 게 위로

### v0.3+
실 사용자 피드백 누적되면 결정.

## Reference: 의도적 약식 처리

이 도구는 작업 도구지 production 시스템이 아니라서, 다음은 의도적으로 단순함:

- **테스트 코드 없음** — 첫 실 사용자(혁준님)가 곧 테스트. 향후 외부 사용자 늘면 추가
- **i18n 없음** — 사용자 메시지 한국어 하드코딩
- **에러 추적/로깅 없음** — 콘솔 출력만
- **DB 없음** — JSON 한 파일

이 결정들이 미래에 부담될 만큼 사용자 늘면 그때 다시 평가.

---

## When in doubt

- **사용자 워크플로우 우선** — "이게 손에 맞을까?" 가 모든 결정의 기준
- **단순한 게 강건** — 옵션 늘리는 것보다 기본 동작 다듬기
- **신뢰성 > 화려함** — `ha doctor` 같은 안전장치가 더 중요
- **본인이 안 쓸 기능은 안 만든다**
- **코드 변경엔 항상 문서 변경 동반** — README 양쪽 + CHANGELOG, 예외는 명시적 지시 있을 때만
