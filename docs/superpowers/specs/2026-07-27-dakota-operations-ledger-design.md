# Dakota 운영 장부 (Operations Ledger) — 설계

- 작성일: 2026-07-27
- 대상: `spinoscopy-dashboard` · Notion · Hermes (`~/.hermes`)
- 상태: 설계 확정, 구현 계획 대기

## 1. 문제

센터장님은 Telegram으로 Dakota(Hermes 페르소나)에게 업무·코딩·조사·가족 일까지 광범위하게 지시하지만,
그 기록이 칸반처럼 정리되어 있지 않아 **"언제 어떤 일을 했는지" 회상이 불가능**하다.

Hermes가 Notion에 `Dakota Operations` DB를 만들었으나 다음이 비어 있다.

- 뷰가 `Default view` 테이블 하나뿐 — 칸반/타임라인/캘린더 0개
- 13건 전부 2026-07-27 09:02에 생성된 **일회성 수동 backfill**. 자동 적재 경로 없음
- 날짜 속성이 `Completed At` 하나뿐 — **타임라인을 그릴 시간축 자체가 없음**
  (`createdTime`은 전부 backfill 시각이라 무의미)

## 2. 핵심 발견

### 2.1 기록은 이미 100% 존재한다

`~/.hermes/state.db` (SQLite, FTS5 인덱스 포함)

| source | 세션 | 메시지 | 기간 |
|---|---:|---:|---|
| cron | 682 | 11,121 | 2026-04-14 ~ 07-27 |
| telegram | 169 | 10,209 | 2026-04-13 ~ 07-21 |
| cli | 43 | 2,468 | 2026-04-13 ~ 07-26 |
| subagent | 16 | 655 | 2026-07-21 ~ 07-27 |
| tui | 7 | 152 | 2026-06-03 ~ 07-15 |
| curator | 1 | 120 | 2026-07-01 |
| **합계** | **918** | **27,731** | |

`sessions` / `messages` 테이블에 모든 대화가 남아 있다.
만들어야 할 것은 기록 시스템이 아니라 **승격 파이프라인 + 뷰**다.

### 2.2 cron 569건은 전량 노이즈

`msg>=3`인 cron 세션의 첫 사용자 메시지가 전부 동일 보일러플레이트다.

```
07-27 18:00  [IMPORTANT: The user has invoked the "kakaotalk-mac" skill, indicating ...
07-27 17:30  [IMPORTANT: The user has invoked the "executive-email-briefings" skill, ...
07-27 16:00  [IMPORTANT: The user has invoked the "kakaotalk-mac" skill, indicating ...
```

30분~1시간 간격 스케줄 실행. 장부에 넣을 내용이 없다.
cron 산출물(아침 브리핑 등)에 센터장님이 반응한 기록은 어차피 telegram에 남으므로 **전량 제외**한다.

### 2.3 `telegram` source에 사람 대화와 에이전트 디스패치가 섞여 있다

```
07-20 13:00  m231  응답?                                              ← 사람 대화
07-20 17:36  m11   Analyze /tmp/kakao-delta-agent-korea.json (479 ...  ← 디스패치
07-18 20:20  m9    You are Andrej, AI/workflow specialist. Read ...    ← 디스패치
07-18 16:47  m34   Brian으로서 이번 주 새로 들어온 논문을 ...            ← 디스패치
```

7/20 12:22~23:25의 카카오 분석 **16세션**(그날 telegram 21세션 중)은 전부 단일 과제
("AI 오픈채팅 4개방 signal intelligence" — 이미 Operations에 존재)의 하위 실행이다.

디스패치 경로는 도중에 이동했다: **~7/20 `telegram` → 7/26~ `subagent`**. backfill 시 둘 다 처리해야 한다.

### 2.4 `cli` / `tui`도 센터장님의 직접 지시다

```
tui  07-15 22:41 m80  aside 로 제주패스 로그인했어. 렌트카 빌리는거 진행해
tui  06-24 08:17 m45  이 폴더 안 동영상 3개 (척추내시경 수술영상) 10분짜리로 편집해봐
cli  07-26 08:22 m8   chatGPT 서버 터지면서 뻑났었는듯?
cli  06-25 09:07 m88  너 동영상 편집하다 뻑난듯
```

`source='telegram'`만 보면 놓친다. tui 사례는 "제주 가족 여행 운영" 과제의 실제 근거다.

### 2.5 `Domain` 옵션이 실제 트래픽과 어긋난다

현재 7개: `Strategy / Clinical / Research / AI / Family / Personal / Operations`

| 실제 세션 주제 | 현재 귀결 |
|---|---|
| 비트코인 · MSTR · CLARITY Act · 알리바바 구독 | **분류 불가** → Strategy/Personal로 뭉개짐 |
| BJJ attendance rate 리뷰 | Personal로 뭉개짐 |
| 카카오 오픈채팅 시그널 · Fable5 vs GPT-5.6 | AI (정상) |
| 수술 스케줄 · Patient DB | Clinical (정상) |
| facet joint 논문 · Journal DB | Research (정상) |

대시보드 전담 에이전트는 6명(Warren=재무, Lo=수련)인데 Domain이 이를 따라가지 않는다.
→ **`Finance`, `Training` 추가**하여 Domain ↔ 에이전트를 정렬한다.

### 2.6 장기기억 DB가 raw 이벤트로 오염되고 있다

`lib/orchestrator/notionEventStore.ts:31`이 `NOTION_DAKOTA_MEMORY_DB_ID`를 쓴다.
그 결과 `Dakota Memory`(장기기억)에 `dakota summarized · 직접 specialist 보고 요약 — Warren 응답 완료: ...`
같은 raw 이벤트 행이 누적된다. 장부와 분리해 정리한다.

### 2.7 기존 구현 자산 — `feat/dakota-operations-ledger` 브랜치

Hermes가 이미 커밋해둔 읽기 계층이 있다 (`main` 기준 4커밋).

| 파일 | 줄 | 내용 |
|---|---:|---|
| `lib/notion/operations.ts` | 191 | Operations Notion 조회/생성/수정, `NOTION_DAKOTA_OPERATIONS_DB_ID` |
| `app/api/dakota/operations/route.ts` | 95 | GET / PATCH |
| `components/dakota/OperationsLedger.tsx` | 196 | 4레인 보드 + 상세 드로어 + Domain 필터 칩 |

**재사용한다.** 단, 레인 라벨에 오독이 있어 바로잡는다 —
`Inbox`를 "반복 운영"으로 라벨링했으나 Inbox는 미분류 수신함이지 반복 운영이 아니다.
반복 운영은 `Type=Automation`으로 표현하는 것이 맞다.

## 3. 설계 원칙

1. **원본을 복제하지 않는다.** raw 레이어는 `state.db`가 이미 담당한다. Notion에는 승격된 것만 넣는다.
2. **지시·논의만 과제를 만든다.** 수행(디스패치)은 반드시 상위 과제에 종속된다.
3. **집계는 단일 Domain, 교차는 Tags.** 비중 그래프의 합이 항상 100%가 되어야 한다.
4. **재실행이 안전해야 한다.** `Session Key`로 중복 적재를 차단한다.

## 4. 아키텍처

```
L0  RAW      ~/.hermes/state.db                      코드 0줄, 이미 존재
                    |
                    |  (1) 승격 — Mac mini cron + LLM
                    v
L1  LEDGER   Notion · Dakota Session Log   [신규]     타임라인/카테고리 축
             Notion · Dakota Operations    [확장]     칸반 축
                    |
                    |  (2) 조회 — REST
                    v
L2  VIEW     /agents/dakota "운영 로그" 탭  [확장]
             Notion 뷰 6종                 [신규]
```

승격 스크립트는 **Mac mini에서 실행**한다(`state.db`가 로컬 파일이므로).
Vercel에 배포된 대시보드는 Notion만 읽는다. 따라서 폰에서도 동일하게 보인다.

## 5. Origin 분류

승격 기준은 세 가지다: **내가 지시한 것 / 논의한 것 / Hermes가 수행한 것.**

| Origin | source | 장부 역할 | 실측 |
|---|---|---|---:|
| **지시** | `telegram`(사용자 발화) · `cli` · `tui` | 과제 카드를 **생성한다** | 64 |
| **논의** | `telegram` 멀티턴 | 과제를 **생성/갱신한다** | 84 |
| **수행** | `telegram`(디스패치) · `subagent` | 기존 과제에 **붙는다. 독립 카드를 만들지 않는다** | 48 |
| (제외) | `cron` | — | 569 |

- 대상 세션 **196건** (`cron` 제외, `message_count >= 3`), 활동일 **48일**
- 위 실측은 휴리스틱 사전분류 결과다. 최종 판정은 LLM이 한다.
  휴리스틱: 첫 사용자 메시지가 영어 명령형으로 시작하거나 `You are` / `/tmp/` / `~으로서`를 포함하면 수행,
  `source='subagent'`면 수행.
- **수행 세션이 과제 매칭에 실패하면 `미분류 실행`으로 보류**하고 칸반에 노출하지 않는다.
  이 규칙이 없으면 `Produce a detailed Korean briefing on 김연규's 48-hour ...` 같은 하위 실행이
  독립 카드로 칸반에 튀어나온다.

## 6. 스키마

### 6.1 Dakota Session Log (신규)

| 속성 | 타입 | 설명 |
|---|---|---|
| Name | title | LLM 한 줄 요약 |
| Date | date (datetime) | 세션 시작 시각 |
| Channel | select | `telegram` / `cli` / `tui` / `subagent` |
| Origin | select | `지시` / `논의` / `수행` |
| Agent | select | `dakota` / `elon` / `brian` / `andrej` / `warren` / `lo` |
| Domain | select | 자체 보유 — 과제 없는 단발 세션도 카테고리가 잡힌다 |
| Tags | multi_select | 교차 조회용 |
| Summary | rich_text | 3~5줄 |
| Outcome | select | `완료` / `진행` / `보류` / `단발조회` |
| Operation | relation → Dakota Operations | 상위 과제 |
| Msg Count | number | 공수 지표 |
| Session Key | rich_text | `state.db` 세션 ID. **중복 적재 방지 키** |

`Domain`을 rollup이 아니라 자체 속성으로 두는 이유: `Operation`이 없는 단발 조회 세션도
카테고리 비중 집계에 잡혀야 "내 관심이 어디 갔나"가 정확해진다.

### 6.2 Dakota Operations (기존 확장 — 파괴적 변경 없음)

DB: `3aa908af-25b9-81d9-9b1b-c0017675c0a0`
data source: `collection://3aa908af-25b9-81a0-8a99-000bcfe25b59`

`Domain` 옵션 확대 (7 → 9): 기존 + **`Finance`** + **`Training`**

추가 속성:

| 속성 | 타입 | 용도 |
|---|---|---|
| Tags | multi_select | 교차 조회 |
| Started At | date | 타임라인 시작점 |
| Last Touched | date | 타임라인 끝점 · 정체 판정 기준 |
| Sessions | relation → Session Log | 하위 세션 |
| Session Count | rollup (count) | 세션 수 |
| Msg Total | rollup (sum of Msg Count) | **투입 공수** |
| Days Stalled | formula | `today - Last Touched` — **정체 경보** |
| Lead Time | formula | `Completed At - Started At` — 속도 |
| OPS ID | unique_id (prefix `OPS`) | 안정 참조키 |

기존 속성(`Type` / `Status` / `Priority` / `Visibility` / `Context` / `Action Taken` /
`Result` / `Next Action` / `Completed At` / `Source` / `Linked Todo`)은 그대로 유지한다.

## 7. 승격 파이프라인

`scripts/dakota-ledger-sync.ts` — Mac mini에서 실행.

```
1. state.db 조회
     source IN ('telegram','cli','tui','subagent')
     AND message_count >= 3
     AND started_at >= <since>
2. 날짜별 그룹핑                 # 7/20 카카오 16세션 -> 하루 단위로 묶음
3. Origin 휴리스틱 사전분류
4. 이미 적재된 Session Key 제외   # idempotent, 재실행 안전
5. 컨텍스트 절삭 (아래 참조)
6. LLM 1회/활동일 -> { sessions[], operations[] } 구조화 출력
7. Session Log 생성 -> 과제 매칭 또는 생성 -> relation 연결
8. 과제의 Status / Next Action / Last Touched 갱신
```

**컨텍스트 절삭이 필수다.** 7/20 세션들이 카카오 6,715메시지를 물고 있어 원문을 그대로 넣으면
컨텍스트가 터진다. 세션당 다음으로 제한한다.

- 첫 사용자 메시지
- 마지막 assistant 응답
- 사용된 툴 이름 목록
- 상한 약 2,000자

**과제 매칭**: LLM에 기존 과제 목록(제목 + Domain + Status)을 함께 전달해
기존 과제에 붙일지 신규 생성할지 판정하게 한다. 확신이 낮으면 `Operation`을 비워 둔다.

**노이즈 컷**: `message_count < 3`이거나 `Outcome=단발조회`이면서 과제 매칭이 없으면
Session Log에만 남기고 Operations는 건드리지 않는다.

**backfill**: `--since 2026-04-13` → 196세션 / 활동일 48일 → **LLM 48회**.
3개월치가 한 번에 채워진다. 일 세션 수 중앙값 2, 상위 3일은 7/18 38세션 · 7/20 21세션 · 7/15 9세션.

**cron 2개** (동일 스크립트, idempotent이므로 겹쳐도 안전):

| 주기 | 인자 | 목적 |
|---|---|---|
| 3시간마다 | `--since today` | 낮 반영 |
| 23:30 | `--since yesterday` | 야간 정식 정리 |

## 8. 뷰

### 8.1 Notion 뷰 6종

Operations:
1. **칸반** — `GROUP BY Status`, `FILTER Visibility = Dashboard`
2. **타임라인** — `TIMELINE BY Started At TO Last Touched`
3. **도메인 보드** — `GROUP BY Domain`
4. **정체** — `FILTER Status != Completed`, `SORT BY Days Stalled DESC`

Session Log:
5. **일지** — `SORT BY Date DESC`, 리스트
6. **캘린더** — `CALENDAR BY Date`

### 8.2 대시보드 "운영 로그" 탭

상단 Domain 칩이 **전역 필터**다. 칩 선택 시 하위 패널 전부가 해당 카테고리로 좁혀진다.

```
+-- Domain 스트립 · 클릭 = 전역 필터 ---------------------------+
| [전체 47] AI 16 ~~~  Clinical 9 ~~~  Research 8 ~~~           |
|           Finance 6 ~~~  Ops 5 ~~~  Family 3 ~~~              |
+---------------------------+-----------------------------------+
| (1) 비중 도넛 (이번 달)    | (2) 12주 추세 (stacked area)      |
|     합 100%               |     뜨는 / 식는 카테고리          |
+---------------------------+-----------------------------------+
| (3) 리듬 히트맵            | (4) 속도 & 정체                   |
|     요일 x 시간대          |     리드타임 중앙값 | 정체 top5    |
|                           |     + 위임 분포(Agent별)          |
+---------------------------+-----------------------------------+
| (5) 칸반  Inbox | In Progress | Waiting | Completed           |
|     카드: Priority 좌측바 · Tags 칩 · 세션수 · 정체일수        |
+---------------------------------------------------------------+
| (6) 타임라인 최근 14일 — Domain 색 스택, 클릭 시 그날 세션 펼침 |
+---------------------------------------------------------------+
```

| 패널 | 답하는 질문 | 데이터 소스 |
|---|---|---|
| (1) 비중 | 이번 달 관심이 어디 갔나 | Session Log × Domain |
| (2) 추세 | 무엇이 뜨고 무엇이 식었나 | Session Log × Domain × 주 |
| (3) 리듬 | **어떤 식으로 진행하나** — Clinical은 화·목 오전인지 | Session Log × 요일 × 시간대 |
| (4) 속도·정체 | 얼마나 빨리 끝내나 / 뭐가 방치됐나 | Operations `Lead Time` / `Days Stalled` |
| (5) 칸반 | 지금 어디에 뭐가 있나 | Operations |
| (6) 타임라인 | 7월 14일에 뭐 했나 | Session Log × 날짜 |

레인 라벨(2.7의 오독 수정):

| Status | 라벨 |
|---|---|
| Inbox | 미분류 수신함 |
| In Progress | 지금 진행 |
| Waiting | 센터장님 결정 대기 |
| Completed | 최근 마침 |

반복 운영은 레인이 아니라 `Type=Automation` 필터로 표현한다.

### 8.3 API

`lib/notion/dakotaLedger.ts` — Session Log 조회 + 집계.
기존 `lib/notion/operations.ts`는 유지하고 확장 속성만 매핑에 추가한다.

| 엔드포인트 | 반환 |
|---|---|
| `GET /api/dakota/operations` | 기존. 확장 속성 추가 |
| `GET /api/dakota/ledger/sessions?since=&domain=` | Session Log 목록 |
| `GET /api/dakota/ledger/stats?range=12w&domain=` | 비중·추세·리듬·리드타임·정체·위임 집계 |

집계는 `stats` 한 번에 반환해 패널마다 왕복하지 않는다.

## 9. Phase

| Phase | 내용 | 완료 시 효과 |
|---|---|---|
| 1 | Session Log 생성 · Operations 확장 · sync 스크립트 · **backfill 1회** | **Notion 뷰만으로 3개월치 즉시 조회** |
| 2 | Notion 뷰 6종 | 칸반·타임라인·정체 확보 |
| 3 | cron 2개 등록 | 자동 유지 |
| 4 | 대시보드 "운영 로그" 탭 — 6패널 카테고리 렌즈 | 폰에서 한눈에 |
| 5 | `notionEventStore` → Memory DB 오염 분리 | 장기기억 정화 |

**Phase 1만 끝나도 원래 목적("언제 어떤 일 했는지")은 해결된다.**

## 10. 리스크

| 리스크 | 대응 |
|---|---|
| LLM 과제 매칭 오분류 | 확신 낮으면 `Operation` 비움. `미분류 실행`으로 보류 후 수동 연결 |
| backfill 중 컨텍스트 초과 | 세션당 2,000자 절삭. 7/18(38세션)·7/20(21세션) 같은 날은 `Msg Count` 상위 10건만 상세, 나머지는 제목만 |
| Notion API rate limit | 활동일 단위 배치 + 지수 백오프 |
| `state.db` 스키마 변경 (Hermes 업데이트) | 읽기 전용 접근. 컬럼 부재 시 graceful degrade |
| 재실행 중복 | `Session Key` 조회 후 제외 |

## 11. 범위 밖

- Telegram에서 칸반을 조작하는 기능 (읽기 전용 장부로 시작)
- `cron` 세션의 장부 편입
- `Dakota Memory` DB 구조 개편 (오염 경로 분리만 수행)
- 기존 `Dakota Conversation Logs` DB 마이그레이션
