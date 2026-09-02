/**
 * 수업 영상(드랍박스) ↔ 노션 수련 기록 연결.
 *
 * 조인 키는 날짜다. 드랍박스 폴더명이 이미 `2026-08-19` 형식이고 노션 수련
 * 기록도 날짜를 갖고 있어서, 파일이나 폴더 이름을 하나도 바꾸지 않고 붙일 수 있다.
 * 폴더명 뒤에 붙는 말(`2026-01-21 김진우 No-gi`)은 무시한다 — 그 정보는 이미
 * 노션의 Instructor/Class 필드에 있다.
 *
 * 링크는 파일이 아니라 **폴더** 단위로 만든다. 한 수업에 클립이 평균 4~5개인데
 * 파일마다 링크를 만들면 205개를 관리해야 하고, 정작 어느 클립인지는 열어봐야
 * 안다. 폴더 링크 하나면 드랍박스 뷰어가 썸네일과 재생을 다 해준다.
 */

/** 드랍박스에서 재생 가능한 영상 확장자 */
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv)$/i

export interface DropboxEntry {
  name: string
  path_lower?: string
  path_display?: string
  [".tag"]?: string
}

export interface ClassVideoFolder {
  /** ISO 날짜 (YYYY-MM-DD) — 노션 수련 기록과의 조인 키 */
  date: string
  /** 드랍박스 폴더 전체 경로 */
  path: string
  /** 폴더 안 영상 개수 */
  clipCount: number
}

/** 폴더명 앞머리의 날짜를 뽑는다. 날짜로 시작하지 않으면 null */
export function folderDate(name: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(name.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const month = Number(mo), day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${mo}-${d}`
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name)
}

export function countClips(entries: DropboxEntry[]): number {
  return entries.filter((e) => e[".tag"] !== "folder" && isVideoFile(e.name)).length
}

/**
 * 드랍박스 shared link 를 링크아웃용으로 정규화한다.
 *
 * API 가 돌려주는 `?dl=0` 은 드랍박스 미리보기 페이지를 연다 — 폴더면 썸네일
 * 목록, 영상이면 플레이어. 이게 우리가 원하는 동작이다. `dl=1` 은 즉시 다운로드가
 * 시작되므로 절대 쓰면 안 된다.
 */
export function normalizeShareUrl(url: string): string {
  return url.replace(/([?&])dl=1(&|$)/, "$1dl=0$2")
}

/** 노션 기록이 없는 영상 폴더 — 백필 대상 */
export function unmatchedFolders(
  folders: ClassVideoFolder[],
  notionDates: Set<string>,
): ClassVideoFolder[] {
  return folders.filter((f) => !notionDates.has(f.date))
}

/** 사람이 읽을 링크 라벨 */
export function videoLabel(clipCount: number): string {
  return clipCount > 0 ? `수업 영상 ${clipCount}개` : "수업 영상"
}
