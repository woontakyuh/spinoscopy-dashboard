import { NextRequest, NextResponse } from "next/server"
import {
  listResearchProjects,
  createResearchProject,
  updateResearchProject,
} from "@/lib/notion/research"
import type { ResearchCreateInput, ResearchUpdateInput } from "@/lib/types/research"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const projects = await listResearchProjects()
    return NextResponse.json(projects, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResearchCreateInput
    if (!body.title) {
      return NextResponse.json({ error: "title required" }, { status: 400 })
    }
    const result = await createResearchProject(body)
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pageId: string
      updates: ResearchUpdateInput
    }
    if (!body.pageId) {
      return NextResponse.json({ error: "pageId required" }, { status: 400 })
    }
    await updateResearchProject(body.pageId, body.updates)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
