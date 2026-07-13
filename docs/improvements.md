# halias 개선 사항 (backlog)

여러 줄 function 단축키를 등록하다 발견한 개선 포인트. 임팩트 순으로 정리.

## 발단

macOS Keychain을 조회하는 여러 줄 vault 함수를 `ha add`(function 타입)로 등록했는데,
본문에 heredoc(`<<EOF`)이 있었다. 저장·생성은 그대로 됐지만 `hareload` 시점에
`~/.halias/generated/aliases.sh:228: parse error near '\n'` 로 터졌다. 원인은
generator가 본문을 들여쓰기하면서 heredoc 닫는 마커(`EOF`)까지 `  EOF`로 밀려,
셸이 종료 마커를 못 찾고 파일 끝까지 삼킨 것.

---

## 1. 저장 전 문법 검증 (`bash -n`) — 최우선

깨진 단축키가 **그대로 저장·생성**됐고, 문제는 `hareload` 시점에야 생성 파일 라인번호와
암호 같은 메시지(`parse error near '\n'`)로 드러났다. 원본 단축키와 연결이 안 된다.

**개선**: `confirmAndSaveShortcut`(src/commands/add.ts) 저장 직전에 렌더된 함수를
`bash -n`으로 검사.
- 통과 못 하면 저장 막고 어느 줄이 문제인지 사용자 언어로 안내
- 미리보기(`p.note(preview)`) 옆에 ✅/❌ 문법 체크 결과 표시

→ 깨진 단축키가 스토어에 아예 안 들어가서 아래 문제도 원천 차단.

## 2. function 본문을 들여쓰기하지 말 것 (근본 원인)

src/core/generator.ts 의 `renderShortcut`에서 function 본문을 한 줄씩 2칸 들여쓴다
(`.split('\n').map(line => '  ' + line)`). 이게 heredoc을 깨뜨린 범인. 닫는 `EOF`가
컬럼0이어야 하는데 `  EOF`가 된다.

**개선**: function 타입 본문은 사용자가 작성한 코드이므로 verbatim으로 삽입.
`_halias_track` 줄만 들여쓰고 본문은 원문 그대로 둔다.

```
name() {
  _halias_track "name"
<본문 그대로>
}
```

보기엔 덜 예뻐도 셸에선 정확성 > 미관. heredoc·`read -d ''`·여러 줄 문자열 리터럴이
전부 안전해진다. 지금은 들여쓰기에 민감한 모든 구문이 잠재적 지뢰.

## 3. 한 개가 깨지면 전부 안 터지게 (fault isolation)

생성 파일을 `source` 하나로 읽어서, 단축키 하나의 문법 오류가 그 뒤 단축키들과
`hareload`까지 못 쓰게 만들 수 있다(unterminated heredoc은 EOF까지 삼킴).

**개선**:
- `generateAliasesFile`(src/core/generator.ts)에서 각 단축키를 개별 `bash -n` 검사 →
  깨진 건 주석 처리 + 경고 배너로 남기고 나머지는 살림
- 또는 전체 파일이 `bash -n` 실패하면 직전 정상본을 유지하고 사용자에게 알림(안전 롤백)
- `hareload`/`_halias_track` 같은 메타 함수는 별도의 항상-유효한 파일로 분리해서,
  사용자 단축키가 깨져도 halias 자체 명령은 살아있게

## 4. 공유/재현을 위한 비대화형 등록

"여러 단축키 세팅을 문서로 공유"하는 시나리오가 실제로 있었다. 지금은 `ha add`가
대화형뿐(플래그는 `--last`만)이라 N번 수동 붙여넣기가 필요.

**개선 (택1)**:
- `ha add <name> --type function --file body.sh` 또는 stdin 파이프
  (`cat body.sh | ha add name --type function`)
- 기존 export/import JSON을 "공유 번들"로 밀기 → 문서가 "본문 붙여넣기 ×N" 대신
  `ha import pack.json` 한 줄이 된다. 단일 JSON 소스라는 halias 강점과 가장 잘 맞음.
  레시피/번들 개념으로 확장하면 좋음.

## 5. 흔한 footgun 린트 (nice-to-have)

미리보기 단계에서 자주 하는 실수 경고:
- function 본문에 heredoc이 있는데 닫는 마커가 없거나 들여써진 경우
- alias 타입인데 본문에 `$1`·`$2`를 쓴 경우(`"$@"`만 붙어 조용히 오작동)
- 저장 전 diff를 보여주면 본문 유실(예: 붙여넣기 중 `#!/bin/bash` 줄 누락)도 눈에 띔

---

## 우선순위

| 순위 | 개선 | 효과 |
|------|------|------|
| P0 | 저장 전 `bash -n` 검증 | 깨진 단축키 원천 차단, 명확한 에러 |
| P0 | function 본문 verbatim (들여쓰기 제거) | heredoc 등 근본 원인 제거 |
| P1 | fault isolation + 메타함수 분리 | 하나 깨져도 전체·hareload 생존 |
| P2 | 비대화형/번들 공유 | 세팅 재현·공유 1줄화 |
| P3 | footgun 린트 | 흔한 실수 사전 경고 |

1·2번은 같은 버그의 앞뒤(2=원인 제거, 1=안전망)라 세트로 처리하면 좋다.
관련 파일: `src/core/generator.ts`(renderShortcut, generateAliasesFile),
`src/commands/add.ts`(confirmAndSaveShortcut).
