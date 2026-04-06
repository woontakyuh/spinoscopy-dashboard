import { NextRequest, NextResponse } from "next/server"
import { createTodo, deleteTodo, getAllTodos, getTodayTodos, updateTodo } from "@/lib/notion/todo"

interface TodoPayload {
  page_id?: string
  name?: string
  due?: string | null
  status?: string
  priority?: string
  category?: string
  notes?: string
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") ?? ""
    const fromDate = searchParams.get("from_date") ?? ""

    if (status === "active") {
      const todos = await getTodayTodos()
      return NextResponse.json(todos)
    }

    const todos = await getAllTodos({
      status: status || undefined,
      fromDate: status !== "Done" ? (fromDate || undefined) : undefined,
      completedFromDate: status === "Done" ? (fromDate || undefined) : undefined,
      excludeDone: !status,
    })

    return NextResponse.json(todos)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TodoPayload
    const name = body.name?.trim() ?? ""

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const result = await createTodo({
      name,
      due: body.due ?? undefined,
      status: body.status,
      priority: body.priority,
      category: body.category,
      notes: body.notes,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as TodoPayload
    const pageId = body.page_id?.trim() ?? ""

    if (!pageId) {
      return NextResponse.json({ error: "page_id is required" }, { status: 400 })
    }

    await updateTodo(pageId, {
      name: body.name,
      due: body.due,
      status: body.status,
      priority: body.priority,
      category: body.category,
      notes: body.notes,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as TodoPayload
    const pageId = body.page_id?.trim() ?? ""

    if (!pageId) {
      return NextResponse.json({ error: "page_id is required" }, { status: 400 })
    }

    await deleteTodo(pageId)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
