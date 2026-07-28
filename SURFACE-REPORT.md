# Dakota 장부 — Surface 축 추가 (Hermes / Dashboard / Claude Desktop)

## 무엇을 만들었나

### 1. Surface를 Session Log의 명시적 축으로
- `lib/dakota-ledger/types.ts`: `LedgerSurface` (`"Hermes" | "Dashboard" | "Claude Desktop"`) + `LEDGER_SURFACES` 추가. `LedgerChannel`에 `"dashboard"` 추가.
- `lib/notion/sessionLog.ts`: `SessionLogInput.surface`, `SessionLogItem.surface` 추가. `createSessionLog`가 `Surface` select 속성을 쓴다. `listSessionLogs`가 `Surface`를 읽어 반환한다.
- `scripts/dakota-ledger-schema.ts`: `SURFACE_OPTIONS`/`CHANNEL_OPTIONS` 상수 추가, 새 함수 `extendSessionLog(dbId)`가 기존 `mergedOptions` 헬퍼로 Session Log DB에 `Surface` 속성(Hermes/Dashboard/Claude Desktop)과 `Channel`의 `dashboard` 옵션을 색 손상 없이 병합 추가한다. `main()`이 신규 DB 생성 경로와 기존 DB 경로 모두에서 `extendSessionLog`를 호출하므로 멱등.
- `scripts/dakota-ledger-sync.ts`: `createSessionLog` 호출에 `surface: "Hermes"` 추가.
- `scripts/dakota-ledger-backfill-surface.ts` (신규): Surface가 비어 있는 기존 행에만 `Hermes`를 채운다. 페이지네이션은 기존 파일들과 같은 컨벤션(`has_more`=true인데 `next_cursor` 없으면 throw). `--dry-run` 지원. **실행하지 않았다.**

### 2. Dashboard To-Do 완료 항목 적재
- `lib/dakota-ledger/todoIngest.ts` + `.test.ts`: `todoSessionKey(pageId)` (`todo:<id>`), `todoToSessionLogInput(todo, domain)` — Domain은 인자로 받는다(LLM 분류 결과), Category는 원본 그대로 Tags에 보존. `completed_at` 없으면 throw.
- `scripts/dakota-todo-sync.ts` (신규): `--since`/`--dry-run` 지원. `lib/notion/todo.ts`의 기존 `getAllTodos({status:"Done", completedFromDate})`를 재사용해 조회. `readSessionLogSnapshot()`으로 기존 `todo:<id>` 키를 걸러 재실행 시 0건 쓰기. 완료 to-do 제목을 40개씩 배치로 LLM(`createCodexDomainClassifier`)에 넘겨 9개 도메인 중 하나로 분류. Operation은 절대 생성/수정하지 않는다.

### 3. Claude Desktop 대화 로그 적재
- `lib/dakota-ledger/conversationIngest.ts` + `.test.ts`: `mapTopicsToDomain(topics)` — 고정 우선순위(strategy→Strategy, project→Operations, clinical→Clinical, personal→Personal, research→Research, infra→Operations, finance→Finance)로 매핑, 여러 토픽이 걸치면 이 순서상 먼저 나오는 것이 이긴다, 빈 배열이면 `null`(LLM 분류 필요 신호). `conversationSessionKey(pageId)` (`conv:<id>`), `conversationRowToSessionLogInput(row, domain)` — Summary에 Decisions/Action Items를 라벨 붙여 각자 줄로 덧붙이고, Decisions 비어있으면 Outcome=진행/있으면 완료.
- `lib/notion/conversationLog.ts` (신규): Conversation Logs DB 읽기 전용 쿼리. `NOTION_DAKOTA_CONVERSATION_DB_ID`를 env에서만 읽는다(문서 주석에 기본값 `3e7bf6e4-a87c-4c49-9c82-17efd3e70c90` 명시, 하드코딩 폴백 아님). 페이지네이션은 기존 컨벤션과 동일하게 throw-on-missing-cursor.
- `scripts/dakota-conversation-sync.ts` (신규): `--since`/`--dry-run`. `Channel=Claude Desktop` 행만 조회 → `conv:<id>` dedup → Topics 있으면 고정 매핑, 비어 있으면 Title+Summary를 LLM 분류에 넘김. Operation 미생성.

### 4. LLM 분류 재사용
- `lib/dakota-ledger/domainClassifier.ts` + `.test.ts` (신규): `promote.ts`의 codex 실행 경로(`execFileSync` + `--output-schema` + `extractAgentMessage`)를 그대로 재사용해 새 codex 경로를 추가하지 않았다. `promote.ts`의 `Promoter`/`promotionSchema`는 과제+세션 승격 전용 스키마라 그대로 쓸 수는 없어서, 같은 실행 플루밍 위에 도메인 분류 전용 스키마(`{items:[{key,domain}]}`)를 얹었다. `classifyDomains(items, classifier, batchSize=40)`가 배치를 나눠 호출하고 결과를 하나의 Map으로 합친다.

### 5. 대시보드 Surface 필터
- `components/dakota/OperationsLedger.tsx`: 기간 셀렉터 옆에 표면 필터(`전체`/`Hermes`/`Dashboard`/`Claude Desktop`, 기본 `전체`) 추가. `visibleSessions`가 기간 필터 다음에 Surface 필터까지 체이닝(둘 다 적용). `visibleOperations`는 그대로 기간만 — Surface 필터가 `전체`가 아닐 때 카테고리별 현황 매트릭스 섹션 상단에 "이 매트릭스와 정체·리드타임·타임라인 차트는 과제(Operation) 기반이라 표면 필터의 영향을 받지 않는다"는 한 줄 안내를 넣었다(매트릭스+분석 섹션의 3개 과제 기반 차트를 한 번에 커버). 세션 기반 차트(DomainShareChart/TrendChart/RhythmHeatmap)는 `visibleSessions`를 받으므로 자동으로 Surface 필터를 반영한다. 카운트 줄(`N세션 · M과제`)도 필터링된 값을 그대로 쓴다.

## 부수 수정
- `.gitignore`에 `scripts/*` 화이트리스트로 새 스크립트 3개(`dakota-ledger-backfill-surface.ts`, `dakota-todo-sync.ts`, `dakota-conversation-sync.ts`)를 추가했다. 이 저장소는 `scripts/*`를 기본 무시하고 특정 파일만 허용하는 구조라, 이걸 안 하면 새 스크립트가 커밋에서 조용히 빠진다.
- `lib/dakota-ledger/stats.test.ts`의 `session()` 헬퍼에 `surface: null` 기본값 추가 (SessionLogItem에 새 필수 필드가 생겨서).
- `lib/notion/sessionLog.test.ts`에 `surface: "Hermes"` 입력 필드와 `Surface.select.name` assertion 추가.

## TDD 증거
`lib/dakota-ledger/`에 새 pure 함수 테스트 4개 파일, 총 22개 테스트:
- `todoIngest.test.ts` (6개): dedup 키 형식, 날짜, 기본값(Surface/Origin/Outcome/Channel/MsgCount/Operation), Notes 유무별 summary, Category→Tags 보존, completed_at 없으면 throw.
- `conversationIngest.test.ts` (10개): 단일 토픽 매핑 7개 전부, 다중 토픽 우선순위 규칙(3개 케이스), 빈 토픽→null, dedup 키, surface/origin/channel 기본값, Decisions 유무별 Outcome, Summary 구성(라벨 붙은 줄 덧붙이기), Topics→Tags 보존.
- `domainClassifier.test.ts` (3개): 프롬프트 구성, 배치 분할(5건을 배치 2로 나누면 호출 3회), 빈 입력이면 호출 안 함.
- `sessionLog.test.ts`에 기존 스위트 위에 Surface 관련 assertion 추가.

## 테스트 / tsc / build 결과
- `npx vitest run` (전체): **283 passed, 2 failed** — 실패 2건은 `components/dashboard/WeatherDetail.test.tsx`의 날씨 위젯 테스트로, `origin/main`(변경 전)에서도 동일하게 실패함을 `git stash`로 확인한 기존 실패다(이 PR과 무관, 네트워크/실제 API 호출 의존). 이 PR이 추가한 4개 테스트 파일(`todoIngest`, `conversationIngest`, `domainClassifier`, 수정된 `sessionLog`/`stats`)은 전부 통과.
- `npx tsc --noEmit`: 지시받은 대로 사전 존재하는 2건(`WeatherDetail.test.tsx`, `lib/types/weather.test.ts`)만 남고 그 외 에러 없음.
- `npm run build`: 성공 (모든 라우트 정상 생성, 새 API 변경 없음).

## 읽기 전용 Notion 조회 결과 (쓰기 없음)
- **완료 to-do** (`Status=Done` AND `Completed At` set, 전체 기간): **118건** (Completed At 최솟값 2026-03-18, 최댓값 2026-07-28). 배경 설명의 "91건"보다 많은데, 조사 시점(오늘)까지 추가로 완료된 항목이 쌓인 것으로 보인다 — `dakota-todo-sync.ts`를 인자 없이 돌리면 이 118건 전체가 대상이 된다.
- **Claude Desktop 대화 로그**: **조회 불가**. `NOTION_DAKOTA_CONVERSATION_DB_ID`(`3e7bf6e4-a87c-4c49-9c82-17efd3e70c90`)로 직접 쿼리하면 `Could not find database... Make sure the relevant pages and databases are shared with your integration "ClinicalPipeline"` 에러가 난다. `/v1/search`로 이 토큰이 접근 가능한 전체 데이터베이스 목록을 뽑아봐도 "Dakota Conversation Logs"는 없다 — **이 DB가 아직 Notion 통합(ClinicalPipeline)에 공유되지 않았다.** 컨트롤러가 Notion에서 그 DB를 통합과 공유해야 `dakota-conversation-sync.ts`가 동작한다(스크립트 자체는 공유 전엔 `getConversationDbId()`가 env만 확인하므로 env가 설정돼 있으면 실행은 되지만 Notion이 403/404류 에러를 던질 것이다).

## 컨트롤러가 실행해야 할 순서 (정확한 명령)

작업 디렉터리: `/tmp/dakota-surface` (PR 머지 후엔 메인 체크아웃에서). 실행 전 `.env.local`에 `NOTION_DAKOTA_CONVERSATION_DB_ID=3e7bf6e4-a87c-4c49-9c82-17efd3e70c90`를 추가하고, Notion에서 "Dakota Conversation Logs" DB를 이 통합과 공유해야 한다(3번 명령이 그 전엔 조용히 0건만 반환한다).

```bash
# 1) 스키마: Session Log DB에 Surface 속성 추가, Channel에 dashboard 옵션 추가.
#    Operations DB 쪽 변경 없음(이미 있는 속성만 병합). 쓰기: Session Log DB 속성 스키마만 PATCH.
npm run ledger:schema

# 2) 백필: Surface가 비어 있는 기존 Session Log 행 전부에 Surface=Hermes를 채운다.
#    먼저 --dry-run으로 몇 건인지 확인 권장. 쓰기: 대상 행 수만큼 PATCH (Surface 필드 1개).
npx tsx --env-file=.env.local scripts/dakota-ledger-backfill-surface.ts --dry-run
npx tsx --env-file=.env.local scripts/dakota-ledger-backfill-surface.ts

# 3) To-Do 동기화: 완료된 to-do를 Session Log에 적재 (Operation 생성 없음).
#    처음엔 --since 없이 전체(118건 대상)를 돌리거나, 최근분만 보려면 --since 지정.
#    codex CLI를 호출해 도메인을 분류하므로 ChatGPT OAuth 로그인이 돼 있어야 한다.
#    쓰기: 신규(미적재) to-do 수만큼 Session Log 행 생성.
npx tsx --env-file=.env.local scripts/dakota-todo-sync.ts --dry-run
npx tsx --env-file=.env.local scripts/dakota-todo-sync.ts

# 4) Claude Desktop 대화 동기화: Channel=Claude Desktop 행을 Session Log에 적재.
#    3번과 같은 이유로 --dry-run 먼저. DB가 통합과 공유되기 전엔 대상이 0건으로 보일 수 있다.
#    쓰기: 신규(미적재) 대화 행 수만큼 Session Log 행 생성.
npx tsx --env-file=.env.local scripts/dakota-conversation-sync.ts --dry-run
npx tsx --env-file=.env.local scripts/dakota-conversation-sync.ts
```

## 알아둘 점 / 우려 사항
1. **Conversation Logs DB 미공유** — 위에 적은 대로, 지금 이 통합 토큰으로는 그 DB가 안 보인다. 3), 4)번을 돌리기 전에 컨트롤러가 Notion 쪽에서 공유를 해줘야 한다.
2. **배경 설명의 "91건"과 실측 "118건"의 차이** — 조사 시점이 달라서 생긴 자연스러운 차이로 보이지만, 혹시 필터 해석이 다르길 원한 것이면(예: `Completed At`을 특정 기간으로 한정) 알려달라.
3. 도메인 LLM 분류(`createCodexDomainClassifier`)는 `promote.ts`의 codex 플루밍을 그대로 재사용했지만, `Promoter`/`promotionSchema`를 문자 그대로 재사용한 것은 아니고(스키마 모양이 다름) 같은 실행 경로 위에 별도 스키마를 얹은 것이다 — "새 LLM 경로를 추가하지 않는다"는 제약의 의도를 이렇게 해석했다. 다른 해석을 원했다면 조정 가능.
