import { LIMITS, parseClientErrorReport } from "@/lib/client-error";
import { log } from "@/lib/log";

// Receives the reports lib/report-error.ts sends from the browser and logs each
// one as a JSON line. The input is anonymous, so the body is size-capped and
// validated before anything reaches the log.

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.body) return Response.json({ error: "Report too large" }, { status: 413 });
  const text = await request.text();
  if (text.length > LIMITS.body) return Response.json({ error: "Report too large" }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const report = parseClientErrorReport(body);
  if (!report) return Response.json({ error: "Not a client error report" }, { status: 400 });

  log("error", "client error", {
    ...report,
    user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? undefined,
  });
  return new Response(null, { status: 204 });
}
