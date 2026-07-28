# Dakota 장부 대시보드 라이트 모드 대응

## 증상 / 근본 원인

라이트 모드에서도 장부(Ledger) 탭의 차트 패널이 "검정 박스 안에 차트"로 보이는 문제였다.
원인은 두 가지였고, 둘 다 `components/dakota/**`에 전반적으로 퍼져 있었다:

1. `border-zinc-800 bg-zinc-950`, `text-white`, `text-zinc-*` 같은 다크 전용 Tailwind
   팔레트 클래스가 `dark:` variant 없이 그대로 쓰여서 테마와 무관하게 항상 어두웠다.
2. `components/dakota/charts/ChartPanel.tsx`가 내보내던 `CHART_SURFACE` /
   `CHART_GRID` / `CHART_MUTED_TEXT` / `CHART_TOOLTIP_STYLE` /
   `CHART_TOOLTIP_LABEL_STYLE` 하드코딩 hex가 recharts의 stroke/fill/tick.fill 같은
   SVG presentation attribute로 그대로 꽂혔다. `var(--token)` 문자열은 이 자리에서
   해석되지 않으므로 런타임에 구체 색상값으로 리졸브해야 했다.

## 변경 파일

### 새 파일
- `components/dakota/charts/useChartTokens.ts` — 디자인 토큰(`--card`, `--border`,
  `--muted-foreground`, `--popover`, `--popover-foreground`)을 `getComputedStyle`로
  런타임에 구체 색상 문자열로 읽어오는 훅. `<html>`의 `class` 속성을 `MutationObserver`로
  지켜보다가 `.dark` 토글(= ThemeToggle이 하는 일) 때마다 다시 계산해 새로고침 없이
  차트 색이 즉시 바뀐다. 순수 함수 `buildChartTokens(readVar, isDark)`를 DOM 의존
  부분과 분리해 유닛 테스트 가능하게 했다.
- `components/dakota/charts/useChartTokens.test.ts` — `buildChartTokens`의 토큰→CSS
  변수 매핑, 폴백, trim, tooltip 스타일 빌더를 가짜 `readVar`로 검증 (DOM 없이 6개
  테스트).

### Tailwind 클래스 → 시맨틱 토큰
- `components/dakota/charts/ChartPanel.tsx` — `border-zinc-800 bg-zinc-950` →
  `border-border bg-card`, `text-white` → `text-foreground`, `text-zinc-500/600` →
  `text-muted-foreground` / `text-muted-foreground/70`. 하드코딩 hex 상수 5개 삭제
  (재도입 못 하게).
- `components/dakota/LedgerMatrix.tsx`, `OperationsLedger.tsx`, `OperationDetail.tsx`,
  `KnowledgeInbox.tsx`, `DakotaCommandCenter.tsx` — `border-zinc-*`, `bg-zinc-*`,
  `text-white`, `text-zinc-*` 전부 `border-border` / `bg-card` / `bg-muted` /
  `text-foreground` / `text-muted-foreground`로 치환. `bg-white text-zinc-950`
  (선택된 상태를 반전 배색으로 표시하는 토글/버튼) → `bg-foreground text-background`로
  치환해 라이트/다크 모두에서 반전 배색이 유지되게 했다.
- `components/dakota/operationLabels.ts` — `DOMAIN_TONE`(명시적으로 지목된 파일)뿐
  아니라 같은 파일의 `STATUS_TONE`, `PRIORITY_TONE`도 동일한 패턴(예:
  `text-violet-200`, `text-zinc-400`이 `dark:` 없이 사용됨)이라 함께 고쳤다 —
  `components/dashboard/MonthCalendar.tsx`가 이미 쓰고 있는 `text-X-700
  dark:text-X-200` 관용구를 그대로 따랐다. 중립 항목(Archived/Operations/Low)은
  `bg-muted text-muted-foreground`로 정리.
- `components/dakota/OperationDetail.tsx` — `action_taken`/`result`/`next_action`에
  쓰이던 `text-sky-100`/`text-emerald-100`/`text-amber-100`(다크 전용 파스텔)을
  `text-{color}-700 dark:text-{color}-200`으로 변경.
- `components/dakota/ConferenceTab.tsx`, `PresentationCard.tsx`,
  `TodoStatsCards.tsx` — 목록에 없던 파일이지만 동일한 하드코딩 버그를 발견해 함께
  고쳤다: `text-zinc-500`, `border-zinc-500/30 bg-zinc-500/10`, `text-green-400`
  (recharts 밖 텍스트/뱃지)을 시맨틱 토큰 또는 `dark:` 쌍으로 교체.

### recharts로 가는 색상값 (런타임 리졸브)
- `components/dakota/charts/DomainShareChart.tsx`, `LeadTimeChart.tsx`,
  `TrendChart.tsx`, `TodoStatsCards.tsx`(목록에 없었지만 동일 패턴 발견) — 삭제된
  `CHART_*` 상수 대신 `useChartTokens()` + `chartTooltipStyle/chartTooltipLabelStyle`
  헬퍼 사용. `stroke`/`tick.fill`/`axisLine.stroke`/`contentStyle`/`labelStyle`/
  `Legend wrapperStyle` 전부 훅이 반환하는 구체 색상 문자열로 교체.
- `components/dakota/charts/RhythmHeatmap.tsx` — 순차 램프가 다크 표면 전용
  8스텝(`#18181b`~`#3987e5`)이었던 것을, dataviz 스킬 `validate_palette.js
  --ordinal`로 검증한 라이트/다크 두 개의 7스텝 램프로 교체하고 `tokens.isDark`로
  선택. 0건 셀은 램프에 넣지 않고 `tokens.surface`(카드 배경)로 자연스럽게
  묻히게 했다. 셀 안 숫자 색도 각 배경 스텝의 WCAG 대비가 더 큰 쪽(흰색/짙은
  네이비)으로 미리 짝지었다.
- `components/dakota/charts/StalledChart.tsx` — `tone()`이 반환하는 값은 recharts가
  아니라 일반 `<span>`/`<div>` style에 들어가므로 `var(--token)` 문자열이 그대로
  해석된다. `app/globals.css`에 이미 있던 `--status-hold-text`(critical, 라이트
  `#791F1F` / 다크 `#f87171`)와 `--status-revision-text`(warning, 라이트 `#633806` /
  다크 `#fbbf24`) 토큰을 재사용했다 — 둘 다 두 표면에서 WCAG 대비 ≥3:1 확인.
  neutral은 `var(--muted-foreground)`, 기본값은 검증된 단일 hex(`#3987e5`) 유지.

### 그대로 둔 것 (테마 무관하다고 판단)
- `components/dakota/OperationDetail.tsx`의 모달 배경 스크림 `bg-black/55` — 모달
  뒤를 어둡게 까는 표준 UX 패턴으로, 테마와 무관하게 항상 검게 유지하는 것이 맞다.
- `useChartTokens.ts`의 `FALLBACK_CHART_TOKENS` hex 6개 — 마운트 전/SSR 시점의 안전
  기본값. `ThemeToggle`의 기본 테마가 `"dark"`이므로 다크 값으로 맞춰 두면
  하이드레이션 직후 실제 값으로 즉시 교체되어 깜빡임이 최소화된다. `useEffect` 밖에서는
  절대 렌더에 쓰이지 않는다(초기 1프레임 제외).
- `DOMAIN_CHART_COLOR` / `StalledChart`의 기본 hex(`#3987e5`) — 카테고리/상태
  마크 색으로, recharts fill/style에 쓰이는 콘크리트 값이라 애초에 var()가 안
  통하는 자리다. 아래 "카테고리 팔레트" 절에서 dataviz 검증 결과를 설명한다.
- `RhythmHeatmap.tsx`의 두 램프 hex 14개 — dataviz `--ordinal` 검증을 통과한 값
  그대로이며, `useChartTokens`가 다루는 "디자인 토큰" 범주가 아니라 차트 전용
  시퀀셜 팔레트라 이 파일에 상수로 둔다(재도입 방지 대상인 "임의 하드코딩"이 아님).

## 카테고리 팔레트 검증 (dataviz 스킬)

`DOMAIN_CHART_COLOR`(8슬롯)를 라이트 카드 표면(`#fdfcf8`)과 다크 카드 표면
(`#282623`, `app/globals.css`의 `--card` oklch 값을 sRGB로 환산)에 대해 각각
`validate_palette.js`로 검증했다.

- 다크: 전항목 PASS.
- 라이트: AI 슬롯(`#c98500`)만 대비 2.99:1로 WARN(3:1 기준 미달). 나머지 7개는 PASS.

**결정: 두 표면 모두에서 통과하는 단일 팔레트를 쓴다** (라이트/다크 쌍을 따로 두지
않음). AI 슬롯을 `#c98500` → `#b87a00`으로만 조정했더니 같은 팔레트가 라이트/다크
둘 다 ALL CHECKS PASS(명도대역·크로마 하한·CVD 분리·정상시각 하한·대비)로 나왔다.
recharts의 `fill`/`Cell`은 SVG presentation attribute라 애초에 콘크리트 hex여야
하므로, 단일 팔레트 쪽이 라이트/다크 쌍을 훅으로 골라 쓰는 것보다 더 단순하고
recharts 자리에 그대로 넣을 수 있어 이 방식을 택했다.

`Training` 폴백(`#71717a`, zinc-500)은 라이브 데이터에 사실상 없는 9번째 도메인용
중립색이라 "9번째 계열은 생성색이 아니라 기타로 접는다" 규칙에 따라 카테고리
검증 범위 밖에 둔다(대비는 두 표면 모두 3:1 이상 통과 확인).

정체(stalled) 경고 톤(14일/30일 초과)은 `--status-revision-text`(warning) /
`--status-hold-text`(critical) 재사용으로 라이트/다크 모두 대비 ≥3:1 확보.

리듬 히트맵 시퀀셜 램프는 원래 다크 전용 8스텝이 인접 스텝 ΔL < 0.06(구간 구분이
잘 안 됨)에 옅은 끝 대비 1.26:1(다크 표면에서도 거의 안 보임)로 이미 문제가 있었다.
`--ordinal` 검증을 통과하는 라이트/다크 7스텝 램프 두 벌로 재설계했다(모든 인접
ΔL ≥ 0.06, 옅은 끝 대비 ≥ 2:1).

## grep 검증

```
grep -rnE "zinc-[0-9]|text-white|#[0-9a-fA-F]{6}" components/dakota/
```

남은 매치는 전부 의도된 것이고 파일별로 다음과 같다:

- `operationLabels.ts` — `DOMAIN_CHART_COLOR`의 콘크리트 hex 8개(+ Training 폴백) —
  recharts `fill`에 쓰이는 카테고리 팔레트. dataviz 검증 완료(위 절 참고).
- `charts/StalledChart.tsx` — 기본 톤 하드코딩 hex 1개(`#3987e5`, 검증된 카테고리
  slot 1) — 나머지 warning/critical/neutral은 CSS var 토큰으로 이미 전환됨.
- `charts/useChartTokens.ts` — `FALLBACK_CHART_TOKENS` hex 6개 — 마운트 전 SSR
  안전 기본값, 실사용은 `useEffect` 이후 훅 반환값으로 즉시 대체됨.
- `charts/RhythmHeatmap.tsx` — 시퀀셜 램프 hex 14개(라이트 7 + 다크 7) — dataviz
  `--ordinal` 검증 통과, 차트 전용 팔레트 상수.

`zinc-[0-9]`, `text-white` 패턴은 결과에 전혀 남지 않았다. 유일한 "하드코딩 색"으로
남긴 건 `bg-black/55`(모달 스크림, 위에서 설명)뿐이고 이건 grep 정규식에도 안 걸린다.

## 테스트 / tsc / build

- `npx tsc --noEmit` — 사전에 알려진 2건만 남음 (`components/dashboard/WeatherDetail.test.tsx`,
  `lib/types/weather.test.ts`, 둘 다 `WeatherCurrent` 타입에 없는 필드 관련, 이 작업과
  무관). 그 외 에러 없음.
- `npm run test` — 285개 중 282 통과, 3개 실패는 전부 이 작업 범위 밖 파일이고
  `origin/main`에 스태시 없이 그대로 실행해도 동일하게 실패함을 확인(사전 존재 실패):
  `components/dashboard/WeatherDetail.test.tsx`(2건, 위 타입 문제와 동일 원인),
  `app/api/weather/route.test.ts`(1건, 이 환경에 날씨 API 키가 없어 500),
  `scripts/social-collector/normalize.test.mjs`. `components/dakota/**` +
  `lib/dakota-ledger/**` 관련 테스트 6개 파일 139개는 전부 통과(새로 추가한
  `useChartTokens.test.ts` 6개 포함).
- `npm run build` — 성공 (59개 라우트 정상 생성).

## 제약 준수

- 신규 npm 의존성 없음.
- `scripts/dakota-ledger-sync.ts` 등 라이브 파이프라인 스크립트를 직접 실행하지
  않음. `npm run build`가 내부적으로 실행하는 `scripts/generate-dakota-manifest.ts`는
  로컬 `public/dakota` 이미지 폴더만 스캔하는 정적 매니페스트 생성기라 Notion과
  무관 — build 검증에 필요해 그대로 뒀다.
- Notion API 호출 없음.
- `lib/dakota-ledger/stats.ts` 등 차트 로직/데이터 가공 코드는 건드리지 않음 —
  전부 프레젠테이션(클래스/색상) 레이어만 수정.
