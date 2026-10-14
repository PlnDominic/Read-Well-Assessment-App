import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AssessmentItem } from "@/lib/database.types";
import { partFor, partsFor } from "@/lib/gameParts";
import { stopsFor } from "@/lib/gameStop";
import { getRecommendations } from "@/lib/recommendations";
import { computeOverallLabel } from "@/lib/scoring";
import { isAssessorLed } from "@/lib/readwell/form";
import { assessorFormSummary } from "@/lib/reports";
import { formLabel, type AssessmentForm } from "@/lib/levels";
import {
  JSON_ANSWER_INSTRUCTION,
  SUMMARY_SCHEMA,
  SYSTEM_PROMPT,
  extractJson,
  factsMessage,
  parseSummary,
  type SummaryContent,
  type SummaryFacts,
} from "@/lib/aiSummary";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Who writes the summaries. "anthropic" (the default) uses Claude through the
 * Anthropic API. "openai-compatible" uses any service that speaks the common
 * chat-completions format, which covers free and self-hosted options: Groq,
 * OpenRouter's free models, Google's OpenAI-compatible endpoint, or a model
 * you run yourself with Ollama. Set AI_REPORT_PROVIDER, AI_REPORT_BASE_URL,
 * AI_REPORT_API_KEY (if the service wants one) and AI_REPORT_MODEL.
 */
export type SummaryProvider = "anthropic" | "openai-compatible";
export const summaryProvider = (): SummaryProvider =>
  process.env.AI_REPORT_PROVIDER?.trim() === "openai-compatible" ? "openai-compatible" : "anthropic";

/** The model that writes summaries; set AI_REPORT_MODEL to change it. Required for openai-compatible. */
export const DEFAULT_SUMMARY_MODEL = "claude-opus-5-5";
export const summaryModel = () =>
  process.env.AI_REPORT_MODEL?.trim() || (summaryProvider() === "anthropic" ? DEFAULT_SUMMARY_MODEL : "");

const compatBaseUrl = () => process.env.AI_REPORT_BASE_URL?.trim().replace(/\/+$/, "") ?? "";

/** Whether this deployment can write summaries at all. */
export const aiConfigured = () =>
  summaryProvider() === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(compatBaseUrl() && summaryModel());

/**
 * Where summary requests go, for the admin to see before turning the feature
 * on: the service's host, and whether it is this computer or network.
 */
export function summaryDestination(): { provider: SummaryProvider; host: string; local: boolean } {
  if (summaryProvider() === "anthropic") return { provider: "anthropic", host: "api.anthropic.com", local: false };
  try {
    const { hostname } = new URL(compatBaseUrl());
    const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".internal") || hostname.endsWith(".local");
    return { provider: "openai-compatible", host: hostname, local };
  } catch {
    return { provider: "openai-compatible", host: "(invalid AI_REPORT_BASE_URL)", local: false };
  }
}

/** Models that accept the server-side refusal fallback, so a rare decline is re-run instead of failing. */
const SUPPORTS_FALLBACK = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

const MAX_MISSES = 30;
const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * Everything the model is told about one finished assessment, with no name,
 * id, school or date. Game answers are included because they show what the
 * child found hard (a letter mixed up, a word misheard); the child's name,
 * which the writing task asks for, never is.
 */
export async function collectSummaryFacts(admin: AdminClient, sessionId: string): Promise<SummaryFacts> {
  const { data: session, error } = await admin
    .from("assessment_sessions")
    .select("id, student_id, assessments(level, form, delivery, items)")
    .eq("id", sessionId)
    .single();
  if (error || !session) throw new Error("Session not found");
  const assessment = (session as unknown as {
    assessments: { level: number; form: AssessmentForm | null; delivery: "assessor" | "game"; items: AssessmentItem[] } | null;
  }).assessments;
  if (!assessment) throw new Error("Assessment not found");
  const { items } = assessment;

  const { data: results } = await admin
    .from("results")
    .select("score, flagged_as_difficulty, skill_areas(id, name)")
    .eq("session_id", sessionId);
  type ResultRow = { score: number; flagged_as_difficulty: boolean; skill_areas: { id: string; name: string } };
  const rows = (results ?? []) as unknown as ResultRow[];
  const flaggedIds = rows.filter((r) => r.flagged_as_difficulty).map((r) => r.skill_areas.id);
  const recs = await getRecommendations(admin, flaggedIds, assessment.level);

  const facts: SummaryFacts = {
    level: assessment.level,
    form: assessment.form ? formLabel(assessment.form) : null,
    how: assessment.delivery === "assessor" ? "given by an adult, one to one" : "played by the child as a game",
    overall: computeOverallLabel(flaggedIds.length),
    recommendations: recs.map((r) => ({ skill: r.skillAreaName, text: r.text })),
  };

  if (isAssessorLed(items)) {
    const summary = await assessorFormSummary(admin, sessionId);
    if (summary) {
      facts.overall = summary.supportLevel;
      facts.strands = summary.strands.map((s) => ({
        name: s.name,
        score: s.status === "scored" ? `${s.raw} out of ${s.max}` : s.status === "na" ? "not applicable" : "not entered yet",
        band: s.band,
        foundation: s.foundation,
        note: s.bandNote,
      }));
      facts.storyReading = summary.storyReading
        ? { wordsCorrect: summary.storyReading.wordsCorrect, errors: summary.storyReading.errors, wordsPerMinute: summary.storyReading.wcpm }
        : null;
      facts.attitude = summary.attitude.filter((a) => a.answer).map((a) => ({ question: a.prompt, answer: a.answer! }));
      facts.rulesApplied = summary.rulesApplied;
    }
    return facts;
  }

  // A game: percent per skill area, where it stopped, and what was missed.
  facts.skills = rows.map((r) => ({ name: r.skill_areas.name, percent: r.score, flagged: r.flagged_as_difficulty }));
  const { data: responses } = await admin
    .from("responses")
    .select("item_id, answer, is_correct")
    .eq("session_id", sessionId);
  const byItem = new Map((responses ?? []).map((r) => [r.item_id, r]));
  const parts = partsFor(assessment.level);

  const correctById = new Map<string, boolean>();
  for (const r of responses ?? []) if (typeof r.is_correct === "boolean") correctById.set(r.item_id, r.is_correct);
  facts.stoppedParts = stopsFor(items, parts, correctById).map((s) => s.part.title);

  facts.misses = [];
  facts.attitude = [];
  for (const item of items) {
    const response = byItem.get(item.id);
    if (!response) continue;
    const partTitle = partFor(parts, item)?.title ?? "Questions";
    const answer = typeof response.answer === "string" ? response.answer : "";
    if (item.skillAreaKey === "readingAttitude") {
      facts.attitude.push({ question: item.prompt, answer: answer.replace(/^\S+\s/, "") });
      continue;
    }
    if (response.is_correct !== false || facts.misses.length >= MAX_MISSES) continue;
    if (item.type === "text") {
      if (!item.expectedText) continue; // "Write your name": never sent
      facts.misses.push({ part: partTitle, question: item.prompt, answered: clip(answer), correct: item.expectedText });
    } else if (item.type === "mic") {
      const heard = answer === "skipped" ? "skipped (couldn't read it yet)" : answer === "nospeech" ? "nothing heard" : clip(answer.split(" | ")[0] ?? "");
      facts.misses.push({ part: partTitle, question: `Read aloud: ${item.passage ?? ""}`, answered: heard });
    } else {
      const right = item.options?.find((o) => o.isCorrect)?.text;
      facts.misses.push({ part: partTitle, question: item.prompt, answered: clip(answer), ...(right ? { correct: right } : {}) });
    }
  }
  return facts;
}

/** What one call to the model returned, reduced to what the draft needs. */
export interface ModelReply {
  text: string | null;
  stopReason: string | null;
  model: string;
}
export type CallModel = (system: string, user: string, model: string) => Promise<ModelReply>;

/** The real call: Anthropic's Messages API, answering in the summary's JSON shape. */
export const callAnthropic: CallModel = async (system, user, model) => {
  const client = new Anthropic({ timeout: 90_000, maxRetries: 2 });
  const response = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    // A short write-up from given facts needs little thinking; low effort keeps it quick and cheap.
    output_config: { effort: "low", format: { type: "json_schema", schema: SUMMARY_SCHEMA as unknown as Record<string, unknown> } },
    // If the safety check declines a request, re-run it on the fallback model instead of failing.
    ...(SUPPORTS_FALLBACK.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const block = response.content.find((b) => b.type === "text");
  return { text: block && block.type === "text" ? block.text : null, stopReason: response.stop_reason, model: response.model };
};

export class SummaryError extends Error {}

/** A failed HTTP call to an OpenAI-compatible service, with the status for the caller to act on. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/**
 * The call for any OpenAI-compatible service (free or self-hosted). Asks for
 * a JSON object; a service that doesn't know that option is asked again
 * without it, since the instructions already spell out the shape.
 */
export const callOpenAiCompatible: CallModel = async (system, user, model) => {
  const url = `${compatBaseUrl()}/chat/completions`;
  const key = process.env.AI_REPORT_API_KEY?.trim();
  const post = async (jsonMode: boolean) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        // Room for a reasoning model's thinking as well as the summary: its thinking counts toward this limit.
        max_tokens: 4000,
        // gpt-oss models think before answering; a short write-up needs little of it.
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: `${system}\n\n${JSON_ANSWER_INSTRUCTION}` },
          { role: "user", content: user },
        ],
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      // The service's own explanation ("model not found", "invalid API key") goes to the server log, with any key-like text removed.
      const detail = (await res.text().catch(() => "")).replace(/\b(?:gsk|sk)[-_][A-Za-z0-9_-]{8,}/g, "[key]").slice(0, 300);
      throw new HttpError(res.status, `${res.status} from ${new URL(url).host} at ${new URL(url).pathname}: ${detail}`);
    }
    return (await res.json()) as { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string | null }[] };
  };
  let body: Awaited<ReturnType<typeof post>>;
  try {
    body = await post(true);
  } catch (err) {
    // 400/422: this service or model doesn't take response_format.
    if (err instanceof HttpError && (err.status === 400 || err.status === 422)) body = await post(false);
    else throw err;
  }
  const choice = body.choices?.[0];
  const finish = choice?.finish_reason;
  return {
    text: choice?.message?.content ?? null,
    stopReason: finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : (finish ?? null),
    model: body.model || model,
  };
};

/** Asks the model for a summary of these facts; throws a SummaryError whose message is fit to show a teacher. */
export async function draftSummary(
  facts: SummaryFacts,
  call: CallModel = summaryProvider() === "anthropic" ? callAnthropic : callOpenAiCompatible,
  model: string = summaryModel(),
  // Small and free models sometimes miss the format; one more go is cheap. Claude answers in a schema, so it doesn't need it.
  attempts: number = summaryProvider() === "anthropic" ? 1 : 2
): Promise<{ content: SummaryContent; model: string }> {
  let lastProblem = "The summary came back in the wrong shape. Try again.";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let reply: ModelReply;
    try {
      reply = await call(SYSTEM_PROMPT, factsMessage(facts), model);
    } catch (err) {
      console.error("AI summary request failed", err);
      const status = err instanceof HttpError ? err.status : err instanceof Anthropic.APIError ? err.status : undefined;
      if (status === 404) {
        throw new SummaryError("The summary writer's address or model wasn't found. The model may have been retired or renamed: ask your administrator to check the AI address and model name.");
      }
      if (status === 429) throw new SummaryError("The summary writer is busy or its free allowance is used up. Try again in a few minutes.");
      if (status === 401 || status === 403) {
        throw new SummaryError("The summary writer isn't set up correctly. Ask your administrator to check the AI key.");
      }
      throw new SummaryError("The summary couldn't be written just now. Try again, or write it yourself.");
    }
    if (reply.stopReason === "refusal") throw new SummaryError("A summary couldn't be written for this one. You can write it yourself.");
    if (reply.stopReason === "max_tokens" || !reply.text) {
      lastProblem = "The summary came back incomplete. Try again.";
      continue;
    }
    // A schema-constrained reply is plain JSON; a free model's may be wrapped in fences or chatter.
    const parsed = parseSummary(extractJson(reply.text));
    if (parsed) return { content: parsed, model: reply.model || model };
    lastProblem = "The summary came back in the wrong shape. Try again.";
  }
  throw new SummaryError(lastProblem);
}
