import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export interface Recommendation {
  skillAreaId: string;
  skillAreaName: string;
  text: string;
  programReference: string | null;
}

/**
 * Recommendation Engine (TRD §4.3): given flagged skill areas + a grade
 * level, looks up RecommendationRule rows. Rules are data (see
 * supabase/seed.sql), so the program team can update them without a
 * deploy — this function just reads whatever is in the table.
 */
export async function getRecommendations(
  admin: AdminClient,
  flaggedSkillAreaIds: string[],
  gradeLevel: number
): Promise<Recommendation[]> {
  if (flaggedSkillAreaIds.length === 0) return [];

  const { data, error } = await admin
    .from("recommendation_rules")
    .select("skill_area_id, recommendation_text, program_reference, skill_areas(name)")
    .in("skill_area_id", flaggedSkillAreaIds)
    .eq("grade_level", gradeLevel);
  if (error) throw error;

  return data.map((row) => ({
    skillAreaId: row.skill_area_id,
    // @ts-expect-error -- Supabase's generated type for the joined relation isn't modeled in database.types.ts
    skillAreaName: row.skill_areas?.name ?? "",
    text: row.recommendation_text,
    programReference: row.program_reference,
  }));
}
