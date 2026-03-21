import { NextResponse } from "next/server"
import { notionRequest } from "@/lib/notion/client"
import { BJJ_TAG_REFERENCE } from "@/lib/ai/bjjTags"

// v1 → v2 태그 매핑: 구 약어/풀네임 → 새 약어
const V1_TO_V2: Record<string, string> = {
  // Guard 리네임
  ButtG: "Butterfly",
  "Butterfly Guard": "Butterfly",
  Close: "Closed",
  "Closed Guard": "Closed",
  ClosG: "Closed",
  "Open Guard": "Open",
  OpenG: "Open",
  OG: "Open",
  SpidG: "Spider",
  "Spider Guard": "Spider",
  LassG: "Lasso",
  LP: "Lasso",
  "Lasso Guard": "Lasso",
  SitG: "Sit-up",
  "Sit-up Guard": "Sit-up",
  WG: "Worm",
  WormG: "Worm",
  "Worm Guard": "Worm",
  "Worm Guard (Lapel)": "Worm",
  RWG: "RWorm",
  RWormG: "RWorm",
  "Reverse Worm Guard": "RWorm",
  "Reverse Worm": "RWorm",
  SqG: "Squid",
  SquidG: "Squid",
  "Squid Guard": "Squid",
  OctG: "Octopus",
  "Octopus Guard": "Octopus",
  RG: "Rubber",
  RubG: "Rubber",
  "Rubber guard": "Rubber",
  "Rubber Guard": "Rubber",
  CrabR: "CrabRide",
  "Crab Ride": "CrabRide",
  "Crab ride": "CrabRide",
  TruckG: "Truck",
  ZG: "KShield",
  "Z-Guard": "KShield",
  WaitG: "Waiter",
  "Waiter Guard": "Waiter",
  "K-G": "KGuard",
  "K-Guard": "KGuard",
  HalfButt: "HalfButt",
  SingSw: "SingleSweep",
  HipSw: "HipSweep",
  ScsSw: "Scissor",
  "Scissor Sweep": "Scissor",

  // Passing 리네임
  TorrP: "Torreando",
  TP: "Torreando",
  KTP: "KCP",
  "Toreando pass": "Torreando",
  "Torreando Pass": "Torreando",
  "Torreando pass": "Torreando",
  StackP: "Stack",
  "Stack pass": "Stack",
  "Stack Pass": "Stack",
  SmashP: "Smash",
  "Smash pass": "Smash",
  "Smash Pass": "Smash",
  LegPP: "LegPummel",
  HalfP: "HalfPass",
  HP: "HalfPass",
  "Half Pass": "HalfPass",
  "Half Gaurd": "HG",
  "Half Guard": "HG",
  "Half guard": "HG",
  LongSP: "LongStep",
  LSP: "LongStep",
  "Long step": "LongStep",
  "Long Step": "LongStep",
  "Long Step Pass": "LongStep",
  BullP: "Bullfight",
  "Bullfight Pass": "Bullfight",
  "HQ position": "HQ",
  "Headquarters": "HQ",
  "X pass": "HQ",
  "X Pass": "HQ",

  // Control 리네임
  SMt: "S-Mount",
  SideB: "SideCtrl",
  "Side Back": "SideCtrl",
  BackT: "BackTake",
  "Back Take": "BackTake",
  BackMt: "BackMount",
  "Back Mount": "BackMount",
  "Knee on Belly": "KoB",
  "North-South": "NS",
  "Scarf Hold": "Scarf",

  // Finishing 리네임
  AnaC: "Anaconda",
  "Anaconda Choke": "Anaconda",
  Darce: "Darce",
  "Darce Choke": "Darce",
  Guill: "Guillotine",
  Tri: "Triangle",
  Gogo: "Gogoplata",
  BicepS: "BicepSlicer",
  "Bicep Slicer": "BicepSlicer",
  CanOp: "ArmB",
  Ameri: "Americana",
  WristLk: "Wristlock",
  "Wrist Lock": "Wristlock",

  // Takedowns 리네임
  TD: "Takedown",
  SingL: "SingleLeg",
  "Single Leg": "SingleLeg",
  DoubL: "DoubleLeg",
  DL: "DoubleLeg",
  "DL takedown": "DoubleLeg",
  "Double Leg": "DoubleLeg",
  BodyLk: "Bodylock",
  "Body Lock": "Bodylock",
  JudoTH: "JudoThrow",
  "Judo Throw": "JudoThrow",
  InTrip: "InsideTrip",
  "Inside Trip": "InsideTrip",
  KnElb: "Takedown",

  // LegLocks 리네임
  HL: "IHH",
  KL: "KneeBar",
  AL: "SFL",
  CL: "ToeHold",
  EstLk: "Estima",
  "Estima Lock": "Estima",
  ToeLk: "ToeHold",
  "Toe Lock": "ToeHold",
  "Toe Hold": "ToeHold",
  KneeB: "KneeBar",
  FootLk: "SFL",
  "Straight Footlock": "SFL",
  LegLk: "IHH",

  // Meta
  NG: "NoGi",
  "No-gi": "NoGi",

  // DLR 관련 (유지되는 것들)
  RDL: "RDLR",
  "De La Riva": "DLR",
  "Reverse De La Riva": "RDLR",

  // 기타
  Bolo: "Bolo",
  "Berimbolo": "Bolo",
  "X-Guard": "XG",
  "X guard": "XG",
  "Single Leg X": "SLX",
  "Knee Shield": "KShield",
  "Knee Through Pass": "KCP",
  "Deep Half Guard": "DHG",
  DblS: "Open",
  "Double Sleeve": "Open",
}

interface NotionPage {
  id: string
  properties: Record<string, {
    type: string
    multi_select?: Array<{ name: string }>
  }>
}

interface QueryResponse {
  results: NotionPage[]
  has_more: boolean
  next_cursor: string | null
}

function mapTag(tag: string): string {
  // 직접 매핑 있으면 사용
  if (V1_TO_V2[tag]) return V1_TO_V2[tag]
  // 이미 v2 태그면 그대로
  if (BJJ_TAG_REFERENCE[tag]) return tag
  // 비표준 태그 (HeadR, DSG 등) — 그대로 유지
  return tag
}

function dedupTags(tags: string[]): string[] {
  return Array.from(new Set(tags.filter(Boolean)))
}

export async function POST() {
  try {
    const dbId = process.env.NOTION_BJJ_DB_ID ?? "2e7908af25b980978098c857bdc0acbe"

    let allPages: NotionPage[] = []
    let cursor: string | null = null

    do {
      const body: Record<string, unknown> = { page_size: 100 }
      if (cursor) body.start_cursor = cursor
      const res = await notionRequest<QueryResponse>(`/databases/${dbId}/query`, {
        method: "POST",
        body: JSON.stringify(body),
      })
      allPages = allPages.concat(res.results)
      cursor = res.has_more ? res.next_cursor : null
    } while (cursor)

    let updated = 0
    let skipped = 0
    const changes: Array<{ id: string; field: string; from: string[]; to: string[] }> = []

    for (const page of allPages) {
      const classTags = (page.properties.Class?.multi_select ?? []).map((t) => t.name)
      const sparringTags = (page.properties.Sparring?.multi_select ?? []).map((t) => t.name)

      const newClass = dedupTags(classTags.map(mapTag))
      const newSparring = dedupTags(sparringTags.map(mapTag))

      const classChanged = JSON.stringify(classTags) !== JSON.stringify(newClass)
      const sparringChanged = JSON.stringify(sparringTags) !== JSON.stringify(newSparring)

      if (!classChanged && !sparringChanged) {
        skipped++
        continue
      }

      const props: Record<string, unknown> = {}
      if (classChanged) {
        props.Class = { multi_select: newClass.map((name) => ({ name })) }
        changes.push({ id: page.id, field: "Class", from: classTags, to: newClass })
      }
      if (sparringChanged) {
        props.Sparring = { multi_select: newSparring.map((name) => ({ name })) }
        changes.push({ id: page.id, field: "Sparring", from: sparringTags, to: newSparring })
      }

      await notionRequest(`/pages/${page.id}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: props }),
      })
      updated++
    }

    return NextResponse.json({
      total: allPages.length,
      updated,
      skipped,
      changes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
