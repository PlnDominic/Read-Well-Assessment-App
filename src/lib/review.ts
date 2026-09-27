/**
 * Teacher review of automatically scored read-aloud answers (see
 * supabase/migrations/0012_response_review.sql). Pure so it's testable
 * without a Supabase client; the reviewSpokenAnswer server action does the
 * auth checks, the write, and the re-score.
 */

export type ReviewVerdict = "correct" | "incorrect" | "reset";

export function parseReviewVerdict(raw: unknown): ReviewVerdict | null {
  return raw === "correct" || raw === "incorrect" || raw === "reset" ? raw : null;
}

export interface ReviewableResponse {
  is_correct: boolean | null;
  auto_is_correct: boolean | null;
  reviewed_at: string | null;
}

export interface ReviewUpdate {
  is_correct: boolean | null;
  auto_is_correct: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

/**
 * The column values a verdict writes. The automatic score is captured into
 * auto_is_correct on the first review only, so reviewing twice (correct,
 * then incorrect) never overwrites the original with a teacher's value.
 * "reset" restores the automatic score and clears the review; resetting a
 * response nobody reviewed leaves it untouched.
 */
export function applyReview(
  current: ReviewableResponse,
  verdict: ReviewVerdict,
  reviewerId: string,
  now: Date = new Date()
): ReviewUpdate {
  const wasReviewed = current.reviewed_at !== null;
  const automatic = wasReviewed ? current.auto_is_correct : current.is_correct;

  if (verdict === "reset") {
    return { is_correct: automatic, auto_is_correct: null, reviewed_by: null, reviewed_at: null };
  }

  return {
    is_correct: verdict === "correct",
    auto_is_correct: automatic,
    reviewed_by: reviewerId,
    reviewed_at: now.toISOString(),
  };
}

/** True when a teacher's review changed the automatic score (as opposed to
 * confirming it), which is what the report page calls out. */
export function isScoreChangedByReview(response: ReviewableResponse): boolean {
  return response.reviewed_at !== null && response.is_correct !== response.auto_is_correct;
}
