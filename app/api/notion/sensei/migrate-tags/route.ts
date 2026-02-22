import { NextResponse } from "next/server"
import { notionRequest } from "@/lib/notion/client"
import { BJJ_TAG_REFERENCE } from "@/lib/ai/bjjTags"

const LEGACY_TO_ABBR: Record<string, string> = {
  "Lapel": "WG",
  "Worm": "WG",
  "Crab Ride": "CrabR",
  "Sit-up": "SitG",
  "Double Sleeve": "DblS",
  "DL takedown": "DL",
  "Squid": "SqG",
  "Reverse Worm": "RWG",
  "Rubber guard": "RG",
  "Omoplata": "Omo",
  "Triangle": "Tri",
  "Gogoplata": "Gogo",
  "Half Gaurd": "HG",
  "Half Guard": "HG",
  "Long step": "LSP",
  "Octopus": "OctG",
  "Head rock": "HeadR",
  "RDL": "RDLR",
  "No-gi": "NG",
  "Worm Guard": "WG",
  "Worm Guard (Lapel)": "WG",
  "Sit-up Guard": "SitG",
  "Squid Guard": "SqG",
  "Octopus Guard": "OctG",
  "Rubber Guard": "RG",
  "Reverse Worm Guard": "RWG",
  "Crab ride": "CrabR",
  "Half guard": "HG",
  "Long Step Pass": "LSP",
  "Long Step": "LSP",
  "Toreando pass": "TP",
  "Torreando Pass": "TP",
  "Torreando pass": "TP",
  "X pass": "XP",
  "X Pass": "XP",
  "Smash pass": "SmP",
  "Smash Pass": "SmP",
  "Stack pass": "SP",
  "Stack Pass": "SP",
  "HQ position": "HQ",
  "Headquarters": "HQ",
  "X-Guard": "XG",
  "X guard": "XG",
  "Butterfly Guard": "BG",
  "Closed Guard": "CG",
  "Open Guard": "OG",
  "Spider Guard": "SG",
  "Lasso Guard": "LG",
  "De La Riva": "DLR",
  "Reverse De La Riva": "RDLR",
  "Deep Half Guard": "DSG",
  "Z-Guard": "ZG",
  "Knee Shield": "K-G",
  "Single Leg X": "SLX",
  "Berimbolo": "BS",
  "Half Pass": "HP",
  "Knee Through Pass": "KTP",
  "Bullfight Pass": "BTP",
}

function buildReverseMap(): Record<string, string> {
  const map: Record<string, string> = { ...LEGACY_TO_ABBR }
  for (const [abbr, full] of Object.entries(BJJ_TAG_REFERENCE)) {
    map[full] = abbr
    map[full.toLowerCase()] = abbr
  }
  return map
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

function mapTag(tag: string, reverseMap: Record<string, string>): string {
  if (reverseMap[tag]) return reverseMap[tag]
  if (reverseMap[tag.toLowerCase()]) return reverseMap[tag.toLowerCase()]
  return tag
}

export async function POST() {
  try {
    const dbId = process.env.NOTION_BJJ_DB_ID ?? "2e7908af25b980978098c857bdc0acbe"
    const reverseMap = buildReverseMap()

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

      const newClass = classTags.map((t) => mapTag(t, reverseMap))
      const newSparring = sparringTags.map((t) => mapTag(t, reverseMap))

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
