import { NextRequest, NextResponse } from "next/server"
import {
  createOperation,
  getOperations,
  getOperationsDbId,
  OPERATION_DOMAINS,
  OPERATION_STATUSES,
  OPERATION_TYPES,
  updateOperation,
} from "@/lib/notion/operations"

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value)
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function optionalUrl(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === "string" ? value : undefined
}

export async function GET() {
  try {
    const configured = Boolean(getOperationsDbId())
    const operations = configured ? await getOperations() : []
    return NextResponse.json({ configured, operations })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!getOperationsDbId()) {
      return NextResponse.json({ error: "Dakota Operations DB is not configured" }, { status: 503 })
    }
    const body = await req.json() as Record<string, unknown>
    const name = optionalText(body.name)?.trim() ?? ""
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

    const operation = await createOperation({
      name,
      status: isOneOf(body.status, OPERATION_STATUSES) ? body.status : undefined,
      type: isOneOf(body.type, OPERATION_TYPES) ? body.type : undefined,
      domain: isOneOf(body.domain, OPERATION_DOMAINS) ? body.domain : undefined,
      priority: optionalText(body.priority),
      context: optionalText(body.context),
      action_taken: optionalText(body.action_taken),
      result: optionalText(body.result),
      next_action: optionalText(body.next_action),
      linked_todo_url: optionalUrl(body.linked_todo_url),
      source_url: optionalUrl(body.source_url),
    })

    return NextResponse.json({ success: true, operation })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const pageId = optionalText(body.page_id)?.trim() ?? ""
    if (!pageId) return NextResponse.json({ error: "page_id is required" }, { status: 400 })

    const status = isOneOf(body.status, OPERATION_STATUSES) ? body.status : undefined
    await updateOperation(pageId, {
      name: optionalText(body.name),
      status,
      type: isOneOf(body.type, OPERATION_TYPES) ? body.type : undefined,
      domain: isOneOf(body.domain, OPERATION_DOMAINS) ? body.domain : undefined,
      priority: optionalText(body.priority),
      context: optionalText(body.context),
      action_taken: optionalText(body.action_taken),
      result: optionalText(body.result),
      next_action: optionalText(body.next_action),
      linked_todo_url: optionalUrl(body.linked_todo_url),
      source_url: optionalUrl(body.source_url),
      completed_at: status
        ? (status === "Completed" ? new Date().toISOString().slice(0, 10) : null)
        : undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
