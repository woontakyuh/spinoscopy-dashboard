# Weather Widget Design Spec

## 개요
MorningBriefing 컴포넌트에 날씨 정보를 추가한다. 인사말 아래 날짜 옆에 현재 날씨를 한 줄로 표시하고, 클릭 시 팝오버로 상세 날씨 + 지도를 보여준다.

## 위치 및 표시
- MorningBriefing 내 날짜(`p.text-zinc-500`) 옆 또는 바로 아래
- 인라인 표시: `☁️ 12°C` 형태 (아이콘 + 온도)
- 클릭 가능한 요소로 스타일링
- 위치 거부 시: 인라인에 아무것도 표시하지 않음 (날짜만 기존대로 표시)

## 팝오버 상세 (탭 2개)

### 탭 1 — 상세
| 섹션 | 내용 |
|------|------|
| 현재 | 날씨 아이콘, 온도, 체감온도, 습도, 풍속 |
| 오늘 | 최고/최저 기온, 강수확률 |
| 시간별 | 향후 12시간 (3시간 간격, 4개 슬롯) |
| 주간 | 5일 예보 (아이콘 + 최고/최저) |

### 탭 2 — 지도
- Leaflet 미니맵 (약 300x200px)
- OpenWeatherMap 타일 레이어: precipitation, wind speed 토글
- 현재 위치 중심, 줌 레벨 7~8

## 위치 결정
- 브라우저 `navigator.geolocation` 사용
- 위치 허용 시: 좌표 기반 API 호출
- 위치 거부 시: 인라인 — 표시 안 함, 팝오버 — "위치 권한이 필요합니다" 안내

## 기술 스택

### API
- **OpenWeatherMap**: Current Weather API (무료) + 5 Day / 3 Hour Forecast API (무료)
- One Call API 3.0은 유료이므로 사용하지 않음
- 엔드포인트: `/api/weather` (Next.js API route, 서버 사이드에서 호출)
- 클라이언트 → `/api/weather?lat=XX&lon=XX` → 서버에서 OWM 호출 → 응답 반환
- API 키를 서버 사이드에 유지 (`OPENWEATHERMAP_API_KEY`)

### 지도 타일
- Leaflet + `react-leaflet` + `@types/leaflet`
- Next.js에서 SSR 이슈 방지를 위해 `dynamic(() => import(...), { ssr: false })` 사용
- Leaflet CSS import 필요
- OWM tile layer: `https://tile.openweathermap.org/map/{layer}/{z}/{x}/{y}.png?appid={key}`
- 지도 타일은 클라이언트 브라우저에서 직접 로드해야 하므로 `NEXT_PUBLIC_OPENWEATHERMAP_API_KEY` 사용
  - OWM 무료 키는 rate-limit이 있으므로 클라이언트 노출 리스크 낮음

### UI
- Radix Popover → `npx shadcn@latest add popover` 로 설치 필요 (현재 미설치)
- 탭: shadcn `<Tabs>` (이미 설치 확인 필요, 없으면 추가)
- 다크 테마: `bg-zinc-900`, `border-zinc-700`, `text-zinc-100`

### 설치할 패키지
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
npx shadcn@latest add popover tabs
```

### 환경변수
- `OPENWEATHERMAP_API_KEY` — 서버 사이드 API 호출용
- `NEXT_PUBLIC_OPENWEATHERMAP_API_KEY` — 지도 타일 로드용 (클라이언트)

## 파일 구조
```
app/api/weather/route.ts              — API route (OWM 프록시)
components/dashboard/WeatherInline.tsx — 인라인 날씨 표시 + 팝오버
components/dashboard/WeatherDetail.tsx — 팝오버 내 상세 탭
components/dashboard/WeatherMap.tsx    — 팝오버 내 지도 탭 (dynamic import, ssr: false)
lib/types/weather.ts                  — TypeScript 타입 정의
```

## MorningBriefing 수정
```tsx
// 기존
<p className="text-zinc-500 text-base mt-2">{dateStr}</p>

// 변경
<div className="flex items-center gap-2 mt-2">
  <p className="text-zinc-500 text-base">{dateStr}</p>
  <WeatherInline />
</div>
```

## 캐싱
- API route에서 응답 캐싱: `Cache-Control: max-age=600` (10분)
- React Query: `staleTime: 600000` (10분), `refetchInterval: 600000`

## 에러 처리
- API 실패 시: 인라인에 날씨 표시 안 함 (빈 상태, 에러 메시지 없음)
- 위치 거부 시: 인라인 — 표시 안 함, 팝오버 — "위치 권한이 필요합니다" 안내
- 지도 로드 실패 시: "지도를 불러올 수 없습니다" fallback

## 스코프 외
- 알림/푸시
- 날씨 기반 일정 추천
- 다중 도시 지원
