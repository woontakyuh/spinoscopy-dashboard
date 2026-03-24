# Character Sheet 레이아웃 — 최종 디자인 (★ 이걸 따라라)

## 디자인 레퍼런스
.claude/design-reference/character_sheet_mockup.png 를 반드시 확인할 것.

## 핵심 컨셉
RPG 캐릭터 시트 / 격투 게임 캐릭터 셀렉트 화면.
풀바디 캐릭터가 왼쪽에 크게 서있고, 오른쪽에 스탯 패널이 붙는 구조.

## 레이아웃 (2컬럼)

```
┌──────────────────┬─────────────────────────────┐
│                  │ Lv.14  BLUE BELT III         │
│                  │ Guard Player                  │
│                  │ 6년3개월  20  3주  3주  80%   │
│   [풀바디        ├─────────────────────────────┤
│    캐릭터        │ 능력치 레이더                 │
│    일러스트]     │   (레이더 차트)               │
│                  │   Compare: Lucas Leite        │
│  이름: 여운탁    │   아키타입: Coyote HG         │
│                  ├─────────────────────────────┤
│  (도복 + 블루벨트│ 6축 능력치                    │
│   + Control 로고 │   Guard ████████ 32          │
│   + 벨트에 이름) │   Passing ████ 14            │
│                  │   Control  0                  │
│                  │   Finishing ███ 10            │
│                  │   Takedowns ██ 8              │
│                  │   Leg Locks  0                │
│                  ├─────────────────────────────┤
│                  │ 최근 포커스                    │
│                  │   HG  Lasso  Spider  Open  HQ│
└──────────────────┴─────────────────────────────┘
```

## CSS 구조

```css
.character-sheet {
  display: grid;
  grid-template-columns: 340px 1fr;
  min-height: 100vh;
  background: #0a0a0a;
}

/* 왼쪽: 캐릭터 영역 */
.character-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;  /* 캐릭터가 아래쪽에 서있음 */
  padding: 20px;
}

.character-image {
  width: 100%;
  max-width: 300px;
  height: auto;
  object-fit: contain;
}

.character-name {
  position: absolute;
  left: 20px;
  top: 40%;
  font-size: 28px;
  font-weight: 700;
  color: #ffffff;
  writing-mode: horizontal-tb;  /* 가로 이름 */
}

/* 오른쪽: 스탯 패널 */
.stats-panel {
  display: flex;
  flex-direction: column;
  gap: 0;  /* 카드 사이 간격 없이 연속 */
}

.stat-card {
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
```

## 상세 요소

### 1. 캐릭터 이미지
- public/images/character_full.png 사용
- 풀바디: 도복 입고 블루벨트 매고 서있는 모습
- 도복에 "Control" 로고 (체육관 이름)
- 벨트에 "Tak" 이름
- 배경: 투명 또는 매우 어두운 그라데이션
- 캐릭터 왼쪽에 이름 "여운탁" 세로 또는 가로로 표시

### 2. 상단 프로필 바
- Lv.14 뱃지 (둥근 사각형, 진한 배경)
- BLUE BELT III (파란 뱃지)
- Guard Player (회색 뱃지) 
- Gi / NoGi 토글 스위치
- 수련 기록: 6년3개월 | 20회 | 3주연속 | 3주최장 | 80% Gi

### 3. 레이더 차트 카드
- Recharts RadarChart
- orange/주황 스트로크 + fill
- "Compare: Lucas Leite" 토글 버튼 (우측 상단)
- 하단: "가장 유사한 아키타입: 🇧🇷 Lucas Leite — Coyote Half Guard"

### 4. 6축 능력치 카드
- 수평 프로그레스 바 (이 레이아웃에서는 수평이 맞음)
- 각 카테고리 색상: Guard=보라, Passing=초록, Control=주황, Finishing=빨강, Takedowns=시안, LegLocks=회색
- 좌: 이름, 우: 숫자 (색상 강조)
- OVR 숫자는 우측 상단에

### 5. 최근 포커스 태그
- 태그 칩: 테두리 + 투명 배경, 흰색 텍스트

## 모바일 반응형

```css
@media (max-width: 768px) {
  .character-sheet {
    grid-template-columns: 1fr;
  }
  .character-panel {
    height: 300px;
    /* 캐릭터가 상단에 잘려서 보임 */
  }
}
```

## 기존 대시보드와의 관계
이 캐릭터 시트는 **Character 탭** (기존 Dashboard 탭을 대체).
다른 탭 (Journal, Stats, BJJ Heroes, Competition, Coach)은 유지.

## 캐릭터 이미지 교체
avatarUrl 필드로 캐릭터 이미지 교체 가능.
기본: public/images/character_full.png
사용자가 직접 업로드하거나 AI 생성 캐릭터로 교체 가능.
