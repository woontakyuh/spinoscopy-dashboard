// app/api/journal/fulltext/route.ts
// Journal Alert 메일의 "원문" 버튼이 여는 엔드포인트.
//
// 메일 클라이언트에서 바로 눌러야 하므로 대시보드 로그인을 거치지 않는다
// (proxy.ts 가 /api/* 를 통과시킨다). 방어선은 링크 서명 하나뿐이다.
//
// 응답은 JSON 이 아니라 HTML — 사람이 브라우저로 여는 화면이고,
// meta refresh 로 자기 자신을 다시 열며 확보될 때까지 상태를 갱신한다.
import { NextRequest, NextResponse } from "next/server"
import { getArticle } from "@/lib/notion/journal"
import { requestFulltext, readLastFailureReason } from "@/lib/notion/fulltext"
import { publishTrigger } from "@/lib/fulltext/ably"
import { fulltextState } from "@/lib/fulltext/status"
import { isNoAccessJournal, NO_ACCESS_REASON } from "@/lib/fulltext/access"
import { verifyPageToken } from "@/lib/journal-alert/fulltextLink"
import { decideFulltextAction, renderFulltextPage } from "@/lib/journal-alert/fulltextPage"

export const dynamic = "force-dynamic"
export const revalidate = 0

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 상태가 바뀌는 화면이라 어떤 단계에서도 캐시되면 안 된다.
      "Cache-Control": "no-store, must-revalidate",
    },
  })
}

const PLAIN = (msg: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>원문 확보</title></head><body style="margin:0;background:#fff;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:0 auto;padding:32px 24px;"><p style="margin:0;font-size:15px;">${msg}</p></div></body></html>`

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const pageId = searchParams.get("p") ?? ""
  const token = searchParams.get("t") ?? ""
  const retry = searchParams.get("retry") === "1"
  const secret = process.env.JOURNAL_ALERT_LINK_SECRET ?? ""

  if (!pageId || !verifyPageToken(pageId, token, secret)) {
    // 링크가 왜 안 되는지는 알려주지 않는다 — 서명 탐색의 단서가 된다.
    return html(PLAIN("링크가 유효하지 않습니다."), 403)
  }

  try {
    const article = await getArticle(pageId)

    // 구독이 없어 애초에 못 받는 저널은 브라우저를 띄우지 않는다.
    if (isNoAccessJournal(article.journal_name)) {
      return html(
        renderFulltextPage({
          title: article.title,
          journal: article.journal_name,
          state: "none",
          pdfUrl: null,
          refreshSeconds: null,
          blockedReason: NO_ACCESS_REASON(article.journal_name),
        })
      )
    }

    const state = fulltextState(article.fulltext_status, article.fulltext_requested)
    const { shouldRequest, refreshSeconds } = decideFulltextAction(state, retry)

    if (shouldRequest) {
      await requestFulltext(pageId)
      await publishTrigger(pageId)
    }

    const retryUrl = new URL(req.url)
    retryUrl.searchParams.set("retry", "1")

    return html(
      renderFulltextPage({
        title: article.title,
        journal: article.journal_name,
        // 방금 걸었으면 "접수됨" 화면(none), 아니면 실제 상태 그대로.
        state: shouldRequest ? "none" : state,
        pdfUrl: article.fulltext_pdf,
        refreshSeconds,
        reason: state === "failed" && !shouldRequest ? (await readLastFailureReason(pageId)) ?? undefined : undefined,
        retryUrl: state === "failed" && !shouldRequest ? retryUrl.toString() : undefined,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류"
    return html(PLAIN(`처리 중 문제가 생겼습니다 — ${message}`), 500)
  }
}
