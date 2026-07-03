# 원문 PDF 온디맨드 확보 시스템 설계

- 날짜: 2026-07-03
- 대상 에이전트: Brian (Scholar)
- 상태: 설계 확정 대기 → 구현 플랜

## 1. 배경과 목적

Brian(Scholar) 파이프라인은 이미 신규 논문을 찾아 메일로 보내고 Notion Journal DB에
축적하며 대시보드에서 DOI 포함 시각화를 제공한다. OA(오픈액세스) 논문은 센터장님이
DOI 링크를 타고 직접 받을 수 있으므로 **이 시스템의 대상이 아니다.**

진짜 자동화 대상은 구독형(paywall) 논문이다. 현재 흐름:

```
[지금]  안 되는 논문 발견 → 카톡/메일로 고용산 교수께 부탁
        → 교수가 경북대 원내망에서 다운로드 → 파일 전달 → 그제야 열람
```

이 사람 손을 타는 핸드오프를, 논문 카드의 버튼 하나로 대체한다:

```
[이후]  안 되는 논문에서 [원문 받기] 클릭 → 경북대 맥스튜디오가 원내망에서 자동 다운로드
        → Notion 페이지에 PDF 첨부 + 추출 텍스트 저장 → 대시보드에서 [PDF 열기]
```

고용산 교수의 역할은 "매번 수동 다운로드·전달"에서 "맥스튜디오를 켜두고 로그인
세션을 살아있게 유지"로 바뀐다.

## 2. 성공 기준

1. 대시보드 논문 상세(ArticleDetail)에 PDF 버튼이 생기고, 상태가
   `원문 받기 → 확보 중… → PDF 열기`(또는 `실패`)로 자동 전이한다.
2. 고용산 교수는 대시보드 없이 Notion에서 `원문 요청` 체크박스만 켜도 같은 큐를 탄다.
3. 구독형 논문의 PDF가 경북대 맥스튜디오를 통해 실제로 Notion 페이지에 첨부된다.
4. 실패해도 기존 DOI 수동 이동 경험이 유지된다(열화 없음).
5. 출판사 대량 다운로드 탐지에 걸리지 않도록 rate limit·일일 상한이 강제된다.

## 3. 비목표 (YAGNI)

- OA 자동 대량 수집은 하지 않는다. OA는 큐 처리 직전의 **부수적 fast-path**로만 둔다.
- **PDF 본문 텍스트 추출은 하지 않는다.** 목표는 사람이 PDF를 열람하는 것까지다. Brian이
  원문을 API로 읽어 요약/Q&A하는 기능은 후속 과제 — 필요해지면 첨부된 PDF를 소스로
  추출 레이어만 얹는다. 지금은 poppler 의존성·본문 블록 조작 없이 첨부만 한다.
- 논문 전체 텍스트에 대한 RAG/임베딩·의미검색은 이번 범위 밖.
- 출판사 로그인/자격증명 관리는 하지 않는다. 경북대 원문 접근은 **IP 기반(원내망 자동)** 이
  므로 맥스튜디오가 원내망 IP에 붙어있는 한 인증이 자동 통과된다. Aside-Chrome은 인증이
  아니라 **봇 차단(Cloudflare·JS challenge) 우회** 목적으로만 쓴다.
- PDF 뷰어 자체 구현 안 함 — Notion 첨부/원문 링크로 연다.

## 4. 데이터 모델 — Notion Journal DB 필드 추가

기존 필드(Title, Author, Journal Name, DOI, Abstract, 관심도, 읽음, Alerted, PMID 등)는
그대로 두고 3개 추가한다.

| 필드명 | 타입 | 용도 |
|--------|------|------|
| `원문 요청` | checkbox | 큐 트리거. 대시보드 버튼과 Notion 수동 체크 둘 다 이걸 켠다. |
| `원문 상태` | select | `요청됨` / `OA 확보` / `원내망 확보` / `실패` |
| `PDF` | files | 확보된 PDF 첨부. Notion File Upload API로 업로드. |

Notion 워크스페이스는 유료(파일 용량 무제한)이므로 PDF는 크기 제한 없이 그대로 첨부한다.

실패 사유는 `원문 상태 = 실패`일 때 워커 로그 + 페이지 본문 콜아웃 블록
(`⚠️ 원문 확보 실패: <사유>`)으로 남긴다.

### 상태 머신

```
(없음) --원문 요청 체크--> 요청됨
요청됨 --OA fast-path 성공--> OA 확보 (종료)
요청됨 --원내망 다운 성공--> 원내망 확보 (종료)
요청됨 --모두 실패--> 실패 (종료, 사용자는 DOI 수동 이동)
실패  --원문 요청 재체크--> 요청됨 (재시도)
```

`원문 요청` 체크박스는 워커가 처리 완료(확보/실패) 후에도 **끄지 않는다**(감사 추적).
큐 판별은 `원문 요청 = true AND 원문 상태 ∈ {비어있음, 요청됨}`으로 한다. 확보/실패로
전이되면 큐에서 빠진다. 재시도는 `원문 상태`를 `요청됨`으로 되돌리면 된다(실패 상태에서
버튼 재클릭 시 route가 수행).

## 5. 아키텍처 — 컴포넌트와 경계

세 개의 독립 유닛으로 나눈다. 각각 인터페이스가 명확하고 단독 테스트 가능해야 한다.

### 5.1 대시보드 버튼 + API (Vercel, 지금 개발)

- **컴포넌트**: `ArticleDetail.tsx`의 DOI 버튼 옆에 PDF 버튼 추가. `article.원문상태`에
  따라 라벨/동작 분기. 클릭 시 `PATCH /api/notion/journal` 호출.
- **API 액션**: 기존 route의 PATCH에 `action: "requestFulltext"` 추가. 하는 일:
  1. (OA fast-path) DOI/PMID로 Unpaywall·PMC·Europe PMC 조회. 무료 PDF가 있으면
     즉시 다운로드 → Notion 첨부 + 텍스트 추출 → `원문 상태 = OA 확보`, 응답으로 완료 반환.
  2. OA 없으면 `원문 요청 = true`, `원문 상태 = 요청됨` 세팅 → 큐 등록. 응답 `확보 중`.
- **폴링**: 대시보드는 상세 조회 시 `원문 상태`를 읽어 버튼 라벨을 렌더. `확보 중…` 상태면
  가벼운 폴링(예: 상세 열려있는 동안 20~30초 간격 재조회)으로 완료를 감지. (SSE/실시간
  불필요 — 원내망 확보는 분 단위라 폴링으로 충분.)

### 5.2 확보 라이브러리 (공유, 지금 개발 + 테스트)

`lib/fulltext/` 신규 모듈. 워커·API route 양쪽에서 재사용.

- `resolveOA(doi, pmid): Promise<{url, source} | null>` — Unpaywall/PMC/Europe PMC 조회.
- `fetchPdfViaAside(articlePageUrl): Promise<Buffer | null>` — Aside-Chrome로 논문
  페이지 열고 PDF 획득(§6).
- `attachToNotion(pageId, pdfBuffer, filename)` — Notion File Upload API로 첨부 +
  `원문 상태`/`PDF` 갱신.
- `markFailed(pageId, reason)` — `원문 상태 = 실패` + 콜아웃 블록.

경계: OA 해석과 Aside 다운로드와 Notion 저장을 서로 모른 채 조합 가능하게 분리.
Notion File Upload는 3-step(create upload → send bytes → attach) 흐름을 캡슐화.

### 5.3 원내망 워커 (경북대 맥스튜디오, Phase 2)

`scripts/fulltext-worker/` 신규. 기존 `scripts/journal-collector/` 와 동일 패턴:
launchd plist + run.sh + tsx 엔트리포인트.

- launchd로 5분 간격 실행(`StartInterval` 또는 기존처럼 캘린더).
- 큐 조회: `원문 요청 = true AND 원문 상태 ∈ {요청됨}`인 페이지 목록.
- 각 페이지에 대해: OA fast-path(놓쳤을 경우 대비) → 실패 시 Aside fetch → 저장.
- 안전장치: 건당 최소 간격 30초 + 랜덤 지터, 세션당 일일 상한(env `FULLTEXT_DAILY_MAX`,
  기본 20), 출판사 도메인별 연속 실패 시 백오프.

## 6. PDF 확보 엔진 (Aside-Chrome) — 상세

기존 `scrape-tsj.mjs`가 검증한 `aside repl` CLI 패턴을 재사용한다. 실제 Chrome을 스크립트로
조종하므로 봇 차단·JS challenge를 사람과 동일하게 통과한다. 원문 접근 권한은 맥스튜디오가
붙은 경북대 원내망 IP에서 자동으로 적용된다(별도 로그인 세션 불필요).

절차:

1. `openTab("https://doi.org/{DOI}")` → 출판사 논문 페이지 착지. `sleep`으로 JS 렌더 대기.
2. **PDF 위치 탐지**:
   - 1순위: `<meta name="citation_pdf_url">` (대부분 출판사가 지원하는 표준 태그).
   - 2순위: 출판사별 "Download PDF"/"Full Text PDF" 앵커 셀렉터(설정 테이블로 관리).
3. **PDF 획득 — 2경로**:
   - **A. in-page fetch (주 경로)**: 논문 페이지 컨텍스트에서 PDF URL을 `fetch`(동일 세션·
     쿠키·IP) → `arrayBuffer` → base64로 청크 분할해 `console.log('PDF_CHUNK ...')` 출력 →
     워커가 재조립. `execFileSync`의 `maxBuffer`를 넉넉히(예: 64MB) 잡아 ~18MB PDF 커버.
   - **B. 다운로드 폴더 감시 (폴백)**: A가 막히거나 PDF가 스트리밍/대용량이면 브라우저
     다운로드를 유발하고, 지정 다운로드 폴더에 새로 떨어진 파일을 mtime으로 집어온다.
4. 획득한 Buffer가 실제 PDF인지 매직넘버(`%PDF`)로 검증. 아니면(로그인 벽·challenge
   HTML) 실패 처리.
5. `attachToNotion` 호출.

주의: base64 exfil 경로는 파일 크기 상한이 있으니, 상한 초과 시 자동으로 폴백 B로.

## 7. 에러 처리

| 상황 | 처리 |
|------|------|
| OA·원내망 모두 실패 | `원문 상태 = 실패` + 콜아웃(사유). 버튼 `실패 — DOI로 이동`. |
| 원내망 IP 이탈(맥스튜디오가 외부망에 붙음) | 워커가 로그인 벽/구독 안내 HTML 감지 → 실패 사유 "원내망 아님"; 로그 경고. 네트워크 확인 필요. |
| 출판사 봇 차단(challenge) | 재시도 1회(지터 후) → 실패. 도메인 백오프. |
| Notion File Upload 실패 | 재시도 1회 → 실패 사유 기록(`원문 상태 = 실패`). |
| DOI 없음 | 버튼 비활성(요청 불가) — DOI 없는 논문은 대상 아님. |
| 중복 요청(이미 확보) | route에서 `원문 상태` 확인 후 no-op. |

## 8. 테스트 전략

- **단위(Vitest)**: `resolveOA` 응답 파싱, PDF 매직넘버 검증, base64 청크 재조립,
  상태 머신 전이 판별.
- **통합(로컬 맥미니)**: 실제 OA DOI로 end-to-end(Unpaywall→다운→Notion 테스트 페이지 첨부).
- **Aside fetch**: 로컬 맥미니의 Aside-Chrome로 OA 논문 페이지에서 in-page fetch 경로
  검증(원내망 권한 없이도 OA 논문으로 메커니즘 확인 가능).
- **실전 검증**: Phase 2에서 맥스튜디오 반입 후 구독형 논문 1건 수동 트리거로 확인.

## 9. 배포 단계

가치가 전부 원내망 워커에 있으므로 맥스튜디오 셋업이 크리티컬 패스다. 단, 개발/검증은
로컬에서 선행한다.

- **Phase 1 (로컬, 경북대 준비 불필요)**
  - Notion 필드 3개 추가 + 타입/쿼리 반영(`lib/notion/journal.ts`, `lib/types/journal.ts`).
  - `lib/fulltext/` 라이브러리 + 단위 테스트.
  - `ArticleDetail.tsx` PDF 버튼 + `PATCH requestFulltext` 액션 + 폴링.
  - OA fast-path end-to-end 동작(맥미니 Aside로 fetch 메커니즘 검증).
- **Phase 2 (경북대 맥스튜디오)**
  - `scripts/fulltext-worker/` + launchd plist + 설치 스크립트/가이드.
  - 맥스튜디오 반입: Aside 앱 + 로그인 Chrome(원내망 접근 확인) + Node/tsx.
  - Tailscale 원격 관리, 구독형 논문 실전 확인.

## 10. Phase 2 착수 전 확인 사항 (고용산 교수)

1. 맥스튜디오에 Aside 앱 + Chrome + Node/tsx 설치 가능한가.
2. ~~원문 접근 방식~~ — **IP 기반(원내망 자동) 확인됨.** 맥스튜디오가 원내망 IP에
   상시 붙어있으면 됨(Wi-Fi/유선이 원내망인지, VPN·게스트망 아닌지 확인).
3. 맥스튜디오를 24시간 켜두고 외부망(Notion API) 아웃바운드가 허용되는가.

## 11. 미해결/리스크

- 출판사 다양성: `citation_pdf_url` 미지원 사이트는 셀렉터 테이블을 점진 확장해야 함.
  초기엔 코어 저널(ESJ/GSJ/TSJ/JNS Spine/Spine 등) 우선 대응.
- 라이선스: 기관 구독 범위 내 개인 열람 목적. 대량/재배포 아님을 rate limit로 보장.
- Notion 워크스페이스 유료(파일 무제한) 확인됨 — PDF 크기 제한 이슈 없음.
