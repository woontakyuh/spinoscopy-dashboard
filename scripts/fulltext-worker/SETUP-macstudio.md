# 맥스튜디오 원문 확보 워커 설치 가이드 (고용산 교수님용)

이 맥스튜디오가 하는 일: 김태신 센터장/교수님이 Notion에서 논문에 **"원문 요청"**을 켜면,
이 맥이 경북대 원내망으로 그 논문 PDF를 받아 **두 분이 공유하는 Dropbox 폴더**에 자동 저장합니다.
한 번 설치해두면 계속 자동으로 돕니다(맥 켜두기만 하면 됨).

준비물: 이 맥스튜디오가 **경북대 원내망에 연결**돼 있고 **24시간 켜져** 있을 것.

---

## 0단계 ⭐ 가장 먼저 — 이게 되는지부터 확인 (5분, 이게 되면 나머지는 형식적)

이 맥스튜디오의 **Chrome**에서, 평소 **유료로 막히던 논문** 하나를 열어보세요.
(예: Spine, European Spine Journal, Elsevier 논문 아무거나 — 집/개인망에선 돈 내라고 뜨던 것)

- 그 논문 페이지에서 **로그인 없이 PDF가 다운로드되면** → ✅ 원내망 접근 정상. 계속 진행하세요.
- **로그인/결제를 요구하면** → ⚠️ 이 맥이 원내망 IP가 아닐 수 있습니다(게스트망·와이파이 확인).
  이 경우 센터장님께 알려주세요. 접근 방식을 바꿔야 합니다.

**0단계가 안 되면 아래를 진행해도 소용없습니다.** 먼저 이것부터 확인해주세요.

---

## 1단계 — Node.js 설치 (한 번만)

1. https://nodejs.org 접속 → 큰 초록 버튼 중 **"LTS"** 버전 다운로드
2. 받은 `.pkg` 파일 더블클릭 → 계속/동의 눌러 설치

## 2단계 — Aside 앱 (센터장님과 이미 이야기된 부분)

Aside 앱을 설치하고 실행해서, Chrome에 연결된 상태로 둡니다.
(유료 논문을 받을 때 이 Aside가 로그인된 Chrome을 조종합니다. 설치 방법은 센터장님 안내를 따르세요.)

## 3단계 — 코드 내려받기

터미널 앱(응용프로그램 > 유틸리티 > **터미널**)을 열고, 아래를 **한 줄씩 복사→붙여넣기→엔터**:

```
cd ~/Documents
git clone https://github.com/woontakyuh/spinoscopy-dashboard.git
cd spinoscopy-dashboard
```

> 만약 로그인/권한을 물으면, 센터장님이 준 접근 방법(초대 수락 또는 토큰)을 쓰세요.
> `git`이 없다고 하면, 뜨는 안내창의 "설치"를 누르면 됩니다.

## 4단계 — 비밀 설정파일 넣기

센터장님이 보내준 **4줄짜리 내용**을 `.env.local` 이라는 파일로 저장합니다. 터미널에서:

```
cat > .env.local
```

엔터 친 뒤, 센터장님이 보내준 4줄을 **붙여넣고**, 마지막에 **엔터 → Control+D**(끝).
(붙여넣을 내용 예시 — 실제 값은 센터장님 것으로):
```
NOTION_TOKEN=...
NOTION_JOURNAL_DB_ID=...
DROPBOX_TOKEN=...
DROPBOX_SCHOLAR_DIR="/공유폴더/경로"
```

## 5단계 — 설치 실행 (한 줄)

```
bash scripts/fulltext-worker/setup.sh
```

이 명령이 알아서: 필요한 것 설치 → 설정 확인 → 자동 가동 등록 → 테스트까지 합니다.
마지막에 **"✅ 완료!"** 가 뜨면 끝입니다. 이제 맥을 켜두기만 하면 계속 자동으로 돕니다.

---

## 확인 & 문제 생기면

- 잘 도는지 로그 보기: 터미널에 `tail -f /tmp/fulltext-worker.log` (멈추려면 Control+C)
- 테스트: 센터장님이 Notion에서 논문 하나 "원문 요청" 켜기 → 몇 분 뒤 공유 Dropbox 폴더에 PDF가 생기는지 확인
- 잘 안 되면: 위 로그 화면을 캡처해서 센터장님께 보내주세요.

## 코드가 업데이트되면 (가끔)

터미널에서 repo 폴더로 가서:
```
cd ~/Documents/spinoscopy-dashboard
git pull
launchctl unload ~/Library/LaunchAgents/com.spino.fulltext-worker.plist
launchctl load ~/Library/LaunchAgents/com.spino.fulltext-worker.plist
```
