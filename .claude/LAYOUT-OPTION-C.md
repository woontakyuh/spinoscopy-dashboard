# Layout Option C 확정 — Dashboard 컴팩트 + Character 풀바디

## 결정사항
**Option C: Dashboard 컴팩트 허브 + Character 탭 풀바디 RPG 시트**

## 1. Dashboard 탭 (컴팩트 허브)
첫 화면. 모든 정보를 한눈에 요약. 미니 아바타 사용.

레이아웃:
```
┌──────────────────────────────────────────────────────────┐
│ [미니아바타80x100] 여운탁 Lv.2 [BLUE III] Guard Player   │
│                   OVR 16 | Lv.2→Lv.3 ████ 10/12 XP      │
│                                 6y3m  20sessions  3w streak│
├──────────────────────────────────────────────────────────┤
│ chevron 벨트: ▷화이트▷블루▷퍼플▷브라운▷블랙              │
├─────────────────────┬────────────────────────────────────┤
│ Radar + Compare     │ Training this month                │
│ (compact)           │ 12 sessions / 3w streak            │
├─────────────────────┼────────────────────────────────────┤
│ Competition         │ Focus + Goal                       │
│ IBJJF Korea Open    │ HG Lasso Spider                    │
│ May 17 / Registered │ Blue 4 stripe 75%                  │
├─────────────────────┴────────────────────────────────────┤
│ Coach: Guard is solid. Focus on Control... [Ask...]      │
├──────────────────────────────────────────────────────────┤
│ [View full character sheet →]                            │
├──────────────────────────────────────────────────────────┤
│ 수련기록 | 상세스탯 | BJJ Heroes | 대회                   │
└──────────────────────────────────────────────────────────┘
```

- 미니 아바타: character_full.png을 80x100 크기로 object-fit:cover + border-radius:12px
- "View full character sheet" 버튼 → Character 탭으로 이동
- Antigravity 베이스 코드 (.claude/design-reference/AntigravityDashboard.tsx) 스타일 유지
- 대회, 수련현황, Coach, 스킬요약 등 허브 위젯 전부 포함

## 2. Character 탭 (풀바디 RPG 시트) ★ 새 탭 추가
풀바디 캐릭터가 왼쪽에 크게 서있는 RPG 캐릭터 시트.

레이아웃:
```
┌───────────┬──────────────────────────────────────────┐
│           │  Lv.2  [BLUE III] [Half Guard Spec] [Gi] │
│           │  Lv.2 → Lv.3  ████████ 10/12 XP         │
│           │  6년3개월  20  3주  3주  80%              │
│ [풀바디   ├──────────────────────────────────────────┤
│  캐릭터   │  능력치 레이더                            │
│  340px]   │  (큰 레이더 차트 + Compare: Lucas Leite)  │
│           │  아키타입: Coyote Half Guard              │
│ 여운탁    ├──────────────────────────────────────────┤
│           │  6축 능력치                               │
│ (도복     │  Guard ██████████ 32                     │
│  블루벨트 │  Passing ████ 14                         │
│  Control  │  Control  0                              │
│  로고)    │  Finishing ███ 10                         │
│           │  Takedowns ██ 8                          │
│           │  Leg Locks  0                            │
│           ├──────────────────────────────────────────┤
│           │  최근 포커스                              │
│           │  HG 10  Lasso 3  Spider 3  Open 5  HQ 3 │
└───────────┴──────────────────────────────────────────┘
```

- 캐릭터 이미지: public/images/character_full.png (풀바디, 340px 너비)
- 2컬럼: grid-template-columns: 340px 1fr
- 캐릭터 이름 "여운탁"은 이미지에 포함되어 있으므로 별도 텍스트 불필요
- 오른쪽 패널: 프로필 → chevron 벨트 → 레이더 → 6축 → 포커스
- 모바일: 캐릭터 상반신만 보이고 스탯은 아래로

## 탭 최종 순서
🏠 Dashboard / ⚔️ Character / 📝 Journal / 📊 Stats / 🏆 BJJ Heroes / 📅 Competition / 🤖 Coach

## 캐릭터 이미지
- public/images/character_full.png = avatar2.png (풀바디 도복+블루벨트)
- Dashboard의 미니 아바타도 같은 이미지를 작게 crop해서 사용

## Claude Code 지시
1. SenseiDashboard.tsx = 컴팩트 허브 (Antigravity 스타일 유지 + 미니 아바타 + "View character sheet" 버튼)
2. SenseiCharacterSheet.tsx = 새로 만들기 (풀바디 2컬럼 RPG 시트)
3. 탭에 Character 추가 (Dashboard 다음)
