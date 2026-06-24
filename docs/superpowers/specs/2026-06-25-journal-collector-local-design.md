# Journal Collector — 맥미니 로컬 수집 전환 (A-local) 설계

- **작성일**: 2026-06-25
- **에이전트**: Scholar (저널 논문 수집 / "Brian")
- **상태**: 설계 승인됨, 스펙 리뷰 대기

## 1. 배경 / 문제

Scholar의 저널 알림 수집이 **2026-05-29 이후 멈춰 있음** (약 4주간 신규 논문 0건). 진단 결과 두 가지가 동시에 터져 있었다:

1. **PubMed가 Vercel datacenter IP를 차단(429)** — 프로덕션 엔드포인트(`/api/notion/journal/alert/run`)를 직접 호출하면 `PubMed search (pdat) failed: 429`. 파이프라인은 첫 429에서 전체 throw → 매 run 0건. (검증: 같은 PubMed esearch가 **병원 M4 맥미니 IP 121.165.0.87** 에서는 **HTTP 200**.)
2. **Vercel cron 미등록** — `vercel inspect`의 Crons 섹션이 비어 있음. 현재 라이브 프로덕션 배포에 cron 자체가 등록 안 됨. (env `JOURNAL_ALERT_PAUSED`·`CRON_SECRET`는 둘 다 없음 → 킬스위치/인증 차단은 원인 아님.)

추가로 PubMed는 구조적으로 **색인 지연·누락**이 있다 (online-first가 며칠~몇 주 늦게 색인되고, 한 호가 통째로 안 들어오고 뜨문뜨문 들어옴). cron을 살려도 신선도 문제는 남는다.

## 2. 목표

- 수집을 **Vercel cron 의존에서 떼어내 병원 M4 맥미니(launchd, 24/7 서버) 로컬 수집으로 전환** — 소셜 컬렉터와 같은 토대. 비-datacenter(병원) IP라 PubMed 429 해소.
- PubMed 색인 지연을 **저널 사이트 직접 스크랩(Aside)** 으로 보강 → 신선도 확보.
- 기존 분류(必読/関心/参考)·이메일·dedup 로직은 그대로 재사용.
- 멈춰 있던 ~4주 backlog 복구.

## 3. 설계 결정: A (하이브리드 보완), Aside-only 아님

PubMed와 Aside 스크랩은 경쟁이 아니라 **역할 분담**이다. 429는 "PubMed의 문제"가 아니라 "Vercel IP의 문제"였으므로, PubMed를 맥미니로 옮기면 여전히 최고의 메타데이터 소스다.

| | PubMed (맥미니) | Aside 저널 스크랩 |
|---|---|---|
| 잘하는 것 | 구조화 메타데이터, **publication type**(関心 분류용), MeSH, PMID, 6저널 균일 | **신선도**(색인 전에 포착) |
| 약한 것 | 색인 지연·누락 | HTML 파싱 → 사이트 개편에 깨짐 |
| 비용 | 단순 HTTP fetch (기존 코드) | GUI앱+로그인세션+headless Chrome |

- **PubMed = 안정적 메타데이터 backbone** (분류·완전성·6저널 균일·상호백업)
- **Aside = 그 위에 얹는 신선도 가속기** ("이 논문이 지금 떴다"만 알려주면 PubMed가 DOI로 따라붙어 enrich)
- Aside-only(B)를 기각한 이유: 関心 분류 약화(pub type 부재), 단일 장애점(스크래퍼 깨지면 백업 없음), fragile한 스크래퍼 6개에 전부를 거는 구조.

## 4. 아키텍처

```
[병원 M4 맥미니 Taks-Mac-mini.local · 24/7 · launchd]  scripts/journal-collector/
  ├─ 소스1: PubMed E-utilities (병원 IP, 429 없음)          ← backbone
  │        기존 lib/journal-alert 로직 재사용
  └─ 소스2: Aside CLI 로 저널 "Articles in Press" 스크랩     ← 신선도 가속기
  → DOI(차선: 제목 정규화)로 merge + dedup
  → 분류(必読/関心/参考) → Notion Journal DB upsert
  → (선택) 신규 논문 이메일 1통

[Vercel] 대시보드: Notion 을 READ 만. 수집 안 함. cron 폐기.
```

호스트 확정: **병원 M4 맥미니**(Mac16,10 / Apple M4, 24/7 가동, 메인 개발+서버). 소셜 컬렉터(launchd + Aside) 호스트와 동일 머신. `~/.local/bin/aside` 존재, `com.spino.social-collector` launchd 등록됨. 공개 학술 데이터만 다루므로 환자 데이터 프라이버시 이슈 없음. 병원 방화벽은 소셜 컬렉터 outbound + PubMed 200 이미 통과 확인.

## 5. 컴포넌트

소셜 컬렉터(`scripts/social-collector/`) 구조를 그대로 미러:

- `scripts/journal-collector/collect.mjs` — 엔트리. PubMed fetch + Aside 스크랩 + merge + Notion upsert 오케스트레이션.
- `scripts/journal-collector/sources/pubmed.mjs` — `lib/journal-alert/pipeline.ts`의 PubMed 검색/파싱 로직을 재사용/이식 (esearch edat+pdat, efetch 50개 청크, 400ms 딜레이).
- `scripts/journal-collector/sources/aside-tsj.mjs` — **파일럿 대상**. Aside `repl`로 TSJ "Articles in Press" 페이지 열고 DOM에서 `{title, authors, abstract, doi, url}` 추출. (추출 셀렉터는 파일럿 1단계에서 실측 확정 — 아래 §8.)
- `scripts/journal-collector/normalize.mjs` — DOI/제목 키 정규화, 소스 merge, Notion dedup(`loadExistingKeys` 재사용), Notion property 빌드.
- `scripts/journal-collector/run.sh` — `.env.local` source, PATH에 `~/.local/bin` 추가, `node collect.mjs` exec. (소셜의 run.sh 패턴.)
- `~/Library/LaunchAgents/com.spino.journal-collector.plist` — launchd 스케줄. 저널은 1시간마다일 필요 없음 → **하루 1~2회** (예: 매일 08:00, 20:00).

**재사용 (수정 최소화)**:
- `lib/journal-alert/config.ts` — 6저널 목록, `MUST_READ_PATTERNS`, `STRONG_METHOD_PUBTYPES`, 분류 규칙.
- `lib/journal-alert/pipeline.ts` — 분류 함수, dedup(`loadExistingKeys`), 이메일, `runBackfillFields`(DOI→PMID 보강).
- `lib/notion/journal.ts` — Notion DB 쿼리.

이식 vs 재사용: pipeline.ts는 Next.js 런타임 가정(`process.env`)이라 collect.mjs(node)에서 직접 import 가능한지 확인 필요. 안 되면 분류/dedup 순수 함수를 `lib/journal-alert/`에서 추출해 양쪽이 공유.

## 6. 데이터 흐름 / merge·dedup

1. PubMed: 최근 N일(edat+pdat union) 검색 → efetch → `PubmedArticle[]` (PMID, DOI, title, abstract, pub types, ...).
2. Aside: TSJ Articles in Press 스크랩 → `{title, authors, abstract, doi, url}[]`.
3. Merge: **DOI 우선** 키, DOI 없으면 정규화 제목 키. 같은 키면 PubMed 레코드가 메타데이터 우선(풍부), Aside는 존재/신선도만 기여.
4. Dedup: 기존 Notion DB 키(`loadExistingKeys`: DOI/PMID/title)와 대조해 신규만 INSERT. Aside가 먼저 넣은 행을 나중에 PubMed가 보강하는 경우 UPDATE 가능(2차).
5. 분류 → Notion upsert → 신규분 이메일.

## 7. 분류 (재사용, 무변경)

- 🔴 必読: `MUST_READ_PATTERNS` (endoscopy/UBE/PROM/AI·ML/registry) title·abstract 매칭. Aside가 abstract까지 주면 그대로 동작.
- 🟡 関心: `STRONG_METHOD_PUBTYPES` (RCT/Meta/Systematic Review). **PubMed pub type 필요** → Aside-only로는 못 매김(=A 채택 근거). PubMed 색인 전 Aside만 잡은 논문은 일단 参考/必読로 들어가고, 나중에 PubMed가 따라붙으면 재분류(`runReclassifyInterest`).
- ⚪ 参考: 그 외.

## 8. 파일럿 범위 (TSJ The Spine Journal / Elsevier)

TSJ를 먼저 하는 이유: WAF가 가장 센 출판사. 여기가 Aside로 뚫리면 나머지 5개(Neurospine 오픈액세스 포함)는 쉬움.

**파일럿 성공 기준 = 한 바퀴 end-to-end:**
1. **(스파이크) Aside로 TSJ Articles in Press 페이지가 실제로 열리고 DOM이 잡히는가** — 셀렉터·초록 위치(목록에 있나/클릭해야 하나)·DOI 추출 가능 여부 실측. ← 최대 리스크, 가장 먼저.
2. 추출 → 정규화 → 기존 Notion 키와 dedup → 신규만 upsert.
3. PubMed(맥미니) TSJ 검색과 DOI merge가 맞물리는지 확인.
4. 분류·(테스트는 email=false) 동작 확인.

검증되면 §10 확장.

## 9. Vercel 이슈 해결 (별도 작업, 병행 가능)

1. **Backlog 복구**: 병원 M4 맥미니에서 기존 파이프라인을 병원 IP로 직접 실행 — `days=30, email=false`(백필 모드, 메일 안 감)로 5/29~현재 누락분 Notion 채움. (429 없음 검증됨.)
2. **죽은 Vercel cron 정리**: 로컬 수집으로 전환하므로 `vercel.json`의 cron 제거(또는 명시적으로 비활성). 좀비 cron이 혼란/중복 유발하지 않게. 단, 로컬 수집기가 안정 가동 확인된 뒤 제거 (전환 공백 방지).
3. 대시보드 READ 경로는 무변경.

## 10. 확장 계획 (파일럿 이후)

- 나머지 5개 저널 소스 추가: Neurospine(오픈액세스, 최易), Global Spine J(Sage), Eur Spine J(Springer), J Neurosurg Spine(JNS), Spine(Wolters Kluwer). 각 `sources/aside-<journal>.mjs`.
- PubMed 소스를 맥미니 수집기에 정식 통합 (backbone).
- launchd 스케줄 안정화 후 Vercel cron 최종 제거.

## 11. 리스크 / 오픈 이슈

- **TSJ DOM 셀렉터 미상** — 파일럿 1단계 스파이크로 해소. 사이트 개편 시 깨질 수 있음(그래서 PubMed 백업 유지).
- **Aside 로그인 세션** — 저널 사이트는 초록까지는 보통 비로그인 공개. 로그인 필요 여부 파일럿서 확인. (Aside는 실제 Chrome라 WAF/JS는 통과.)
- **pipeline.ts의 node 직접 import 가능성** — 안 되면 순수 함수 추출 리팩터.
- **이메일 중복** — 로컬 수집기가 이메일 보내면, Vercel cron(살아있을 경우)과 중복 가능. cron 제거로 해소. (메모리: journal-alert sender는 하나여야 함.)
- **맥미니 가동률** — launchd는 맥 꺼지면 안 돔. 단 병원 M4는 24/7 서버라 리스크 낮음(소셜 컬렉터가 이미 안정 가동 중).
- **병원 네트워크 의존** — 수집이 병원 IP/방화벽에 묶임. 현재 outbound 통과 확인됐으나, 병원 망 정책 변경 시 영향 가능.

## 12. 성공 기준

- TSJ 신규 논문이 PubMed 색인 전에 Notion에 들어온다 (신선도 입증).
- 맥미니 수집 run이 429 없이 완주한다.
- 5/29~현재 backlog가 복구된다.
- 기존 분류·이메일·대시보드 표시가 회귀 없이 동작한다.

## 13. 테스트

- Aside TSJ 추출: 실제 페이지로 셀렉터 검증, 추출 건수 sanity check.
- merge/dedup/normalize: 순수 함수 단위 테스트 (vitest), 소셜의 `normalize.mjs` 테스트 패턴 참고.
- end-to-end: `email=false`로 Notion 쓰기 한 바퀴, 신규/중복 분기 확인.
