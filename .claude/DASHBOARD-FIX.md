# Dashboard 디자인 수정 — 목업과 일치시키기

## 문제
현재 대시보드가 목업(.claude/design-reference/bjjdashboard.png)과 너무 다름.
아래 구체적인 수정 사항을 SenseiDashboard.tsx에 적용할 것.

## 1. 캐릭터 아바타 — 크게, 왼쪽에
현재: 작은 실루엣 박스
변경: 목업처럼 큰 캐릭터 영역 (최소 140x160px)
- 배경: 연한 베이지/크림 (#f5f0e8 계열, 다크모드에서는 rgba(255,255,255,0.06))
- 둥근 모서리: border-radius: 16px
- 내부에 도복 실루엣 SVG (현재보다 훨씬 크게, 80x100px)
- 벨트 색상이 실루엣에 반영
- 아래에 avatarUrl로 교체 가능한 구조 유지
- 미국 국기 배지 같은 디테일은 나중에 추가 (지금은 벨트색 배경 + 큰 실루엣)

## 2. 프로필 + 수련기록 — 3컬럼 tight
현재: 수련기록이 카드 안에 들어가있고 간격이 넓음
변경:
```
grid-template-columns: 160px 1fr 240px;
gap: 16px;
align-items: start;
```
- 좌: 아바타 (160px 고정)
- 중: 이름(24px 볼드) + "Lv.14" 뱃지 + "Guard Player" + "현재: 블루벨트 3그랄" + XP바
- 우: 수련기록 테이블 (border 있는 카드, 내부는 key-value 2열 테이블)
  - 수련 기간: 6년 3개월 / 기록된 수련: 20
  - 연속: 3주 / 최장: 3주
  - Gi 비율: 80%
  - 테이블 폰트: 12px, key는 tx2 색상, value는 tx1 + font-weight 500

## 3. 벨트 — chevron 화살표 형태 (★ 핵심)
현재: 직사각형 블록 나열
변경: 목업처럼 각 벨트 구간이 화살표(chevron) 형태로 다음 벨트를 가리키는 모양

구현 방법 (SVG):
```tsx
// 각 벨트 구간을 chevron polygon으로 렌더링
// 첫 번째는 왼쪽이 직선, 나머지는 왼쪽이 V자 들여쓰기
<svg viewBox="0 0 700 40">
  {belts.map((belt, i) => {
    const x = i * 140;
    const points = i === 0
      ? `${x},0 ${x+130},0 ${x+140},20 ${x+130},40 ${x},40`  // 첫 번째: 직사각형 + 우측 화살표
      : `${x},0 ${x+130},0 ${x+140},20 ${x+130},40 ${x},40 ${x+10},20`;  // 나머지: 좌측 V + 우측 화살표
    return <polygon points={points} fill={belt.color} opacity={isPast ? 1 : 0.2} />;
  })}
  {/* 스트라이프는 각 벨트 구간 내부에 세로 막대 */}
  {/* 현재 위치 마커: 원형 + glow */}
</svg>
```
- 각 chevron 호버 → 승급 날짜 툴팁
- 스트라이프는 chevron 내부 세로 막대 (3px 너비)
- 현재 위치: 흰색 원 마커

## 4. 레이더 + 바 차트 — 나란히, 컴팩트
현재: 기본적으로 맞지만 바 차트가 목업과 다름
변경:
- 레이더: 현재 OK. 다만 동심원에 숫자 라벨 (10, 20, 30, 40) 추가
- 바 차트: 목업처럼 세로 막대 + 막대 위에 숫자 직접 표시
  - 바 너비: 36-40px
  - 바 아래 라벨: Guard, Passing, Control, Finishing, Takedowns, Leg Locks
  - 숫자 크기: 14px bold, 바 색상과 동일
  - 0인 경우에도 라벨 표시 (숫자 0, 막대는 매우 짧거나 없음)
- 아키타입: 바 차트 아래에 "가장 유사한 아키타입: 🇧🇷 Lucas Leite — Coyote Half Guard"
- 2컬럼: grid-template-columns: 1fr 1fr; gap: 16px;

## 5. 최근 포커스 + 목표 — 2컬럼
현재: 대략 맞음
변경:
- 포커스 태그에 숫자 표시: "HG 10" "Lasso 3" "Spider 3" 형태
- 목표: "블루벨트 4그랄" + 75% 프로그레스 바 + "현재: 블루벨트 3그랄"

## 6. Coach 위젯 — 하단
현재: OK
변경: 아이콘 + "코치 추천 로딩 중..." + 입력 필드 + "질문" 버튼

## 7. 하단 네비 버튼
현재: OK
변경: 아이콘 + 텍스트 조합. 📝 수련 기록 / 📊 상세 스탯 / 🏆 BJJ Heroes / 📅 대회

## 타이포그래피 수정
- 이름: 24px, font-weight 600, 한글
- Lv 뱃지: 배경 #3b82f6, 흰색 텍스트, border-radius: 4px, padding: 2px 8px
- "Guard Player": 14px, tx2 색상
- 카드 제목 (최근 수련 기록, 능력치 레이더 등): 14px, font-weight 500, tx1
- 수치: font-variant-numeric: tabular-nums

## 반드시 확인
- .claude/design-reference/bjjdashboard.png 를 다시 한 번 보고 최대한 일치시킬 것
- 이건 다크모드이므로 목업의 라이트 느낌을 다크로 변환
- 카드 간격: gap: 16px (현재 너무 넓으면 줄일 것)
- 전체 max-width: 1080px
