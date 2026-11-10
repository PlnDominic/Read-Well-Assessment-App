import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { retryFailedReports } from "@/lib/retryFailedReports";

/**
 * On-demand trigger for the automatic report retry (see
 * lib/retryFailedReports.ts). Not scheduled in vercel.json: the daily
 * cycle-scheduler cron runs the same thing. Same CRON_SECRET auth as the
 * other cron routes.
 */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await retryFailedReports()) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
