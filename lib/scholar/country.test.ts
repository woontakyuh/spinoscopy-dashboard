import { describe, it, expect } from "vitest"
import { extractCountry } from "./country"

// 2026-08-10: Journal DB 2,065행 중 336행이 Affiliations 는 있는데 국가가 비어 있었다.
// 336건 전부 extractCountry 가 null 을 반환한 건들이고, 아래가 그 실패 유형이다.
// 케이스는 전부 Notion 에 실제로 들어 있는 원문에서 가져왔다.
describe("extractCountry — 실패하던 실제 케이스", () => {
  it("UK 약어를 인식한다", () => {
    expect(extractCountry("Aston Medical School, Aston University, Birmingham, UK.")).toBe("UK")
  })

  it("뒤에 붙은 이메일 때문에 국가가 밀려도 찾는다", () => {
    expect(extractCountry("Aston Medical School, Aston University, Birmingham, UK. a.gardner2@aston.ac.uk.")).toBe("UK")
    expect(extractCountry("Department of Orthopaedics, University of Rochester, Rochester, NY, USA. Ram_Haddas@URMC.rochester.edu.")).toBe("USA")
  })

  it("Electronic address 꼬리를 무시한다", () => {
    expect(extractCountry("Department of Orthopaedics, Ohio State University, Columbus, OH, USA. Electronic address: Daniel.schneider@osumc.edu.")).toBe("USA")
  })

  // 미국 저널은 자국 논문에 USA 를 안 붙이는 경우가 많다. 실패 336건의 최대 덩어리.
  it("국가 표기 없이 미국 주 약어만 있어도 USA 로 본다", () => {
    expect(extractCountry("Rothman Orthopedic Institute, Philadelphia, PA.")).toBe("USA")
    expect(extractCountry("Department of Neurological Surgery, Vanderbilt University Medical Center, Nashville, TN.")).toBe("USA")
  })

  it("주 약어 뒤에 우편번호가 붙어도 USA 로 본다", () => {
    expect(extractCountry("Harvard Medical School, 75 Francis Street, Boston, MA 02115.")).toBe("USA")
  })

  it("HTML 엔티티로 인코딩된 국가명을 해석한다", () => {
    expect(extractCountry("Department of Physiotherapy, Bursa State Hospital, Bursa, T&#xfc;rkiye.")).toBe("Turkey")
  })

  it("별칭 표에 없던 국가를 인식한다", () => {
    expect(extractCountry("Department of Traumatology and Orthopedics, Bogomolets National Medical University, Kyiv, Ukraine.")).toBe("Ukraine")
  })

  // JNS 계열은 주를 풀네임으로 적고 국가를 생략한다. 남은 불명 100건의 대부분.
  it("주 이름이 풀네임이어도 USA 로 본다", () => {
    expect(extractCountry("3Infection Prevention and Control, University of Pittsburgh Medical Center, Pittsburgh, Pennsylvania.")).toBe("USA")
    expect(extractCountry("Department of Neurological Surgery, University of California, San Francisco, California.")).toBe("USA")
    expect(extractCountry("Department of Orthopedics, Warren Alpert Medical School of Brown University, East Providence, Rhode Island.")).toBe("USA")
  })

  it("문장 끝에 기관명으로만 주가 드러나도 USA 로 본다", () => {
    expect(extractCountry("Investigation performed at the University of Utah.")).toBe("USA")
  })

  // 마지막 affiliation 이 국가를 안 적었으면 앞쪽 affiliation 으로 후퇴한다.
  it("마지막 소속에 국가가 없으면 앞쪽 소속에서 찾는다", () => {
    const aff = "1Faculty of Medicine, University of Montr&#xe9;al.; 4Physiatry Department, H&#xf4;pital du Sacr&#xe9;-Coeur, Montr&#xe9;al, Qu&#xe9;bec, Canada.; 3Orthopedic Department, H&#xf4;pital du Sacr&#xe9;-Coeur, Montr&#xe9;al."
    expect(extractCountry(aff)).toBe("Canada")
  })
})

describe("extractCountry — 기존 동작 유지", () => {
  it("마지막 소속의 국가를 우선한다", () => {
    const aff = "Department of Neurosurgery, Seoul National University Hospital, Seoul, Republic of Korea.; Department of Spine Surgery, Coimbatore, Tamil Nadu, India."
    expect(extractCountry(aff)).toBe("India")
  })

  it("정식 국가명을 표준형으로 정규화한다", () => {
    expect(extractCountry("Department of Neurosurgery, Seoul National University Hospital, Seoul, Republic of Korea.")).toBe("Korea")
    expect(extractCountry("Department of Orthopaedic Surgery, The University of Tokyo, Tokyo, Japan.")).toBe("Japan")
    expect(extractCountry("Department of Spine Surgery, Peking University Third Hospital, Beijing, China.")).toBe("China")
  })

  it("빈 문자열은 null", () => {
    expect(extractCountry("")).toBeNull()
    expect(extractCountry("   ")).toBeNull()
  })

  it("국가 단서가 전혀 없으면 null", () => {
    expect(extractCountry("1Goodman Campbell Brain and Spine, Carmel.")).toBeNull()
  })
})
