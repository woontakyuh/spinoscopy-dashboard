# Dashboard 리디자인 — Antigravity 베이스 코드 사용

## 핵심 지시
.claude/design-reference/AntigravityDashboard.tsx 를 읽어라.
이것은 Google Antigravity에서 생성된 디자인 베이스 코드다.
이 코드의 **디자인, 레이아웃, 스타일을 그대로 유지**하면서,
기존 SenseiDashboard.tsx의 **데이터 연결(API, state, props)**을 병합해라.

## 작업 순서

1. AntigravityDashboard.tsx의 UI/스타일을 베이스로 사용
2. 기존 SenseiDashboard.tsx의 데이터 로직 (useQuery, API 호출, userProfile, archetypes 등)을 가져와 연결
3. 현재 SenseiDashboard.tsx를 교체

## Antigravity 코드의 핵심 디자인 요소 (반드시 유지)

- **배경**: bg-[#0a0a0a], 카드 bg-[#121212], border border-zinc-800
- **벨트 chevron**: clipPath polygon으로 화살표 형태 — 이 구현을 그대로 사용
- **레이아웃**: 상단에 프로필+수련기록, 아래에 벨트 chevron, 하단에 2컬럼 (레이더+스탯바)
- **수련 기록**: grid-cols-4 (수련기간, 기록된수련, 연속스트릭, Gi비율)
- **레이더 차트**: Recharts RadarChart, orange stroke/fill
- **스탯 바**: 수평 바 + 각 카테고리 색상
- **최근 포커스**: orange 태그

## 데이터 연결 (기존 SenseiDashboard.tsx에서 가져올 것)

- useQuery로 /api/notion/sensei/stats 호출
- loadUserProfile()로 사용자 프로필 불러오기
- ARCHETYPES에서 가장 유사한 아키타입 계산
- onNavigate(tab) 함수로 탭 전환
- onAskCoach(question) 함수로 Coach 질문

## 추가해야 할 것 (Antigravity 코드에 없는 것)

1. **Gi/No-Gi 토글** — 수련기록 영역에 작은 토글 추가
2. **Coach 한 줄 추천** — 하단에 코치 추천 + 질문 입력 필드
3. **하단 네비 버튼** — 수련기록 / 상세스탯 / BJJ Heroes / 대회
4. **목표 프로그레스** — 최근 포커스 옆에 "블루벨트 4그랄 75%" 프로그레스
5. **벨트 호버 툴팁** — 각 벨트 구간별 승급 날짜 (Notion 데이터 연결)

## 주의사항

- AntigravityDashboard.tsx의 디자인을 **바꾸지 말 것**
- 데이터만 연결하고, 추가 요소만 같은 스타일로 덧붙일 것
- Props 인터페이스는 기존 데이터에 맞게 수정 OK
- recharts 이미 사용 중이므로 호환 문제 없음
