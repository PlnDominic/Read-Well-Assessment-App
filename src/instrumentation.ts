import type { Instrumentation } from "next";

/**
 * Next.js calls this for every error thrown while rendering a page, running
 * a route handler or a server action in production, so none of them vanish
 * without a trace. See src/lib/logger.ts for where it goes.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logError } = await import("@/lib/logger");
  await logError(`${context.routeType}:${context.routePath}`, err, { method: request.method, path: request.path.split("?")[0] });
};
