# Sensei Dashboard — Design System & CSS Spec

Claude Code가 구현할 때 이 파일의 디자인 토큰을 정확히 따를 것.
목업 이미지(.claude/design-reference/bjjdashboard.png)와 이 스펙을 같이 참고.

## 전체 레이아웃

```css
/* 메인 컨테이너 */
.sensei-dashboard {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px;
  background: #0a0a0a;
  color: #e5e5e5;
  font-family: -apple-system, 'Pretendard Variable', 'Segoe UI', sans-serif;
}
```

## 카드 시스템

두 종류의 카드:

```css
/* 기본 카드 — 대부분의 위젯 */
.card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 20px;
}

/* 강조 카드 — 수련 기록, 목표 등 */
.card-accent {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
}
```

**절대 하지 말 것:**
- box-shadow 사용 금지 (flat design)
- background gradient 금지
- glow, neon 효과 금지
- border-radius 20px 이상 금지 (최대 12px)

## 타이포그래피

```css
/* 이름 (헤딩) */
.name { font-size: 24px; font-weight: 600; color: #ffffff; letter-spacing: -0.3px; }

/* 레벨, 뱃지 */
.badge { font-size: 13px; font-weight: 500; }

/* 라벨 (카드 제목) */
.label { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.45); letter-spacing: 0.5px; }

/* 수치 */
.stat-number { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }

/* 본문 */
.body { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.6; }

/* 힌트 */
.hint { font-size: 11px; color: rgba(255,255,255,0.25); }
```

**font-weight 규칙:**
- 400: 본문, 힌트
- 500: 라벨, 뱃지
- 600: 이름, 수치 (최대 — 700 사용 금지)

## 색상 시스템

```typescript
const colors = {
  // 벨트
  belt: {
    white: '#d4d4d8',
    blue: '#3b82f6',
    purple: '#a855f7',
    brown: '#92400e',
    black: '#27272a',
  },
  // 6축 카테고리
  category: {
    guard: '#a855f7',     // 보라
    passing: '#22c55e',   // 초록
    control: '#f97316',   // 주황
    finishing: '#ef4444',  // 빨강
    takedowns: '#06b6d4', // 시안
    legLocks: '#eab308',  // 노랑
  },
  // 모드
  gi: '#3b82f6',
  nogi: '#ef4444',
  // 텍스트
  text: {
    primary: '#ffffff',
    secondary: 'rgba(255,255,255,0.5)',
    tertiary: 'rgba(255,255,255,0.25)',
    muted: 'rgba(255,255,255,0.12)',
  },
  // 배경
  bg: {
    base: '#0a0a0a',
    card: 'rgba(255,255,255,0.03)',
    cardHover: 'rgba(255,255,255,0.05)',
    subtle: 'rgba(255,255,255,0.02)',
  },
  // 보더
  border: {
    default: 'rgba(255,255,255,0.06)',
    hover: 'rgba(255,255,255,0.12)',
    accent: 'rgba(255,255,255,0.15)',
  },
}
```

태그/뱃지 색상은 카테고리 색상의 12% 불투명도 배경 + 원색 텍스트:
```css
/* 예: Guard 태그 */
.tag-guard { background: rgba(168,85,247,0.12); color: #c084fc; }
/* 예: Passing 태그 */
.tag-passing { background: rgba(34,197,94,0.12); color: #4ade80; }
```

## 프로필 섹션 상세

### 레이아웃
```
┌─────────────────────────────────────────────────────┐
│ [아바타 120x140]  이름 Lv.14     [수련기록 카드]     │
│                   Guard Player                       │
│                   블루벨트 3그랄  OVR 16             │
│                   Lv.2→Lv.3 ████ 10/12 XP           │
└─────────────────────────────────────────────────────┘
```

- 3컬럼: `grid-template-columns: 140px 1fr 280px;`
- gap: 20px
- 아바타: 120x140px, border-radius: 12px, object-fit: cover
- 수련기록: key-value 테이블, 간격 tight

### 수련 기록 카드 내부
```css
.training-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  font-size: 12px;
}
.training-meta dt { color: rgba(255,255,255,0.4); }
.training-meta dd { text-align: right; font-weight: 500; color: #e5e5e5; }
```

## 벨트 프로그레션

```css
.belt-bar {
  height: 28px;
  border-radius: 4px;
  display: flex;
  overflow: hidden;
}
.belt-section {
  position: relative;
  display: flex;
  align-items: center;
}
/* 현재 위치 마커 */
.belt-marker {
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid currentColor;
  position: absolute;
  z-index: 2;
}
/* 미래 구간 */
.belt-future { opacity: 0.2; }
/* 스트라이프 */
.stripe {
  width: 3px;
  height: 60%;
  border-radius: 1px;
}
```

## 레이더 차트 + 바 차트

```
┌─────────────────┬──────────────────┐
│ 능력치 레이더    │ 능력치 상세       │
│                 │                  │
│ 레이더 차트      │ (빈 레이더 공간)  │
│ 250x250         │                  │
│                 │  32  14  0  10 8 0│
│ Legend:          │  G   P  C  F  T L│
│ ■ Lucas Leite   │                  │
│ ■ Me            │ 아키타입: Leite  │
└─────────────────┴──────────────────┘
```

- 2컬럼: `grid-template-columns: 1fr 1fr;`
- gap: 16px
- 레이더: Recharts RadarChart 사용, 동심원 10/20/30/40
- 바 차트: Recharts BarChart, 각 바 위에 숫자 표시 (카테고리 색상)
- 바 높이가 너무 크면 안됨 — 콤팩트하게

### 바 차트 스타일
```typescript
// Recharts BarChart 설정
<BarChart data={data} layout="horizontal">
  <Bar radius={[4,4,0,0]} barSize={40} />
  <LabelList position="top" style={{ fontSize: 14, fontWeight: 600 }} />
</BarChart>
```

바 색상: 각 카테고리 고유색 (보라/초록/주황/빨강/시안/노랑)
바 아래 라벨: Guard, Passing, Control, Finishing, Takedowns, Leg Locks

## 포커스 태그 + 목표

### 태그
```css
.focus-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  /* 배경: 카테고리색 12% / 텍스트: 카테고리색 밝은 톤 */
}
/* 태그 옆에 숫자 표시 */
.tag-count { opacity: 0.6; font-size: 11px; }
```

### 목표 프로그레스
```css
.goal-progress {
  height: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  overflow: hidden;
}
.goal-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: 4px;
}
```

## Coach 위젯

```css
.coach-widget {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}
.coach-message {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  flex: 1;
}
.coach-input {
  width: 220px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: #e5e5e5;
  font-size: 13px;
}
```

## 하단 네비게이션 버튼

```css
.nav-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.nav-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.nav-btn:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.7);
}
```

## Tailwind v4 매핑

위 CSS 값들을 Tailwind 클래스로:
- bg-card → bg-white/[0.03]
- border-card → border-white/[0.06]
- text-label → text-white/45
- text-hint → text-white/25
- rounded-card → rounded-xl (12px)

## 모바일 반응형

```css
@media (max-width: 768px) {
  .profile-grid { grid-template-columns: 80px 1fr; /* 수련기록은 아래로 */ }
  .stats-grid { grid-template-columns: 1fr; /* 레이더/바 세로 스택 */ }
}
```

## 캐릭터 아바타

기본 placeholder: public/images/avatar-default.svg
- 도복 입은 실루엣 (현재 벨트색 반영)
- 나중에 AI 생성 이미지나 실제 사진으로 교체 가능 (avatarUrl)
- 사이즈: 120x140px, border-radius: 12px

## 핵심 원칙 다시 한번

1. **flat design** — 그림자, 그라디언트, glow 없음
2. **정보 밀도** — 빈 공간 최소화, 한눈에 파악
3. **색상은 의미** — 카테고리/벨트/상태를 나타낼 때만 사용
4. **간격은 일정하게** — 카드 gap: 16px, 내부 padding: 20px, 섹션 gap: 16px
5. **글씨 크기 체계** — 24/16/13/12/11px 5단계만 사용
