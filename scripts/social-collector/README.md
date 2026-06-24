# social-collector (맥 mini 전용)

AI Radar 소셜 컬럼용 수집기. **Aside CLI(`aside repl`)** 로 X·Threads 공개/팔로우 글을
**인증(로그인) 상태**로 긁어 Notion "Social Feed" DB에 적재한다. 대시보드(Vercel)는 Notion만 읽음.

스펙: `docs/superpowers/specs/2026-06-22-radar-social-column-design.md`

## 왜 Aside CLI인가

이전엔 로그아웃 Playwright라 X는 IP 레이트리밋(429), Threads는 ~11개 로그인월에 막혔다.
**Aside 브라우저의 로그인 세션을 그대로 쓰면** X·Threads 모두 인증 상태로 접근 → 우회 불필요,
일주일치 전체 수집 가능. (검증: choi.openai 로그아웃 11건 → Aside 26건)

- **MCP가 아니라 CLI(`aside repl`)** 를 쓴다 — 무인 cron엔 결정론적 CLI가 적합(에이전트·토큰 불필요).

## 전제 조건 (맥)

1. **Aside 앱 실행 중** + 수집 대상 계정으로 **X·Threads(인스타) 로그인**.
2. `aside` CLI 설치: `curl -fsSL https://releases.aside.com/install.sh | bash` (→ `~/.local/bin/aside`).
3. env(repo 루트 `.env.local`): `NOTION_TOKEN`, `NOTION_SOCIAL_DB_ID`.

## 수집 대상

`collect.mjs`의 `ACCOUNTS` — threads: `choi.openai`, `unclejobs.ai` / x: `karpathy`.
추가 시 여기 + `lib/radar/socialSources.ts`에 한 줄.

## 실행 / 테스트

```bash
node collect.mjs     # 1회 수집 (PATH에 aside 필요, Aside 앱 실행 중)
node --test          # 정규화/중복제거 단위 테스트
```

## 자동 실행 (launchd, 1시간)

`~/Library/LaunchAgents/com.spino.social-collector.plist` (StartInterval 3600, RunAtLoad).
`run.sh`가 `.env.local` 로드 + PATH(`~/.local/bin`) 설정 후 `collect.mjs` 실행. 로그: `/tmp/social-collector.log`.

> launchd는 GUI 세션에서 돌아 Aside 앱(GUI)에 접근 가능. 맥이 24/7 + Aside 상시 실행이어야 함.

## 알려진 한계

- 최근 7일(`SINCE_DAYS`) 윈도우만 수집. 더 과거는 범위 밖.
- **선생님 실제 X/Threads 계정 세션**으로 동작 → 플랫폼 ToS·계정 정책 유의. Aside의 에이전트 권한 설정 확인 권장.
- Threads 본문에 계정명·시각 머리줄이 일부 섞일 수 있음(`cleanThreadText`로 일부 정제).
