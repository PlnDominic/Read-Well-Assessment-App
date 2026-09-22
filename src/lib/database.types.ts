/**
 * Hand-written mirror of the schema in supabase/migrations/*.sql.
 *
 * Once a real Supabase project is linked, regenerate this file from the
 * live schema instead of maintaining it by hand:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 */

export type UserRole = "teacher" | "reading_specialist" | "administrator";
export type SessionStatus = "not_started" | "in_progress" | "completed";
export type ReportStatus = "pending" | "ready" | "failed";

export interface AssessmentItemOption {
  text: string;
  isCorrect: boolean;
}

export interface AssessmentItem {
  id: string;
  skillAreaKey: string;
  type: "choice" | "mic";
  prompt: string;
  passage?: string;
  options?: AssessmentItemOption[];
}

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      schools: Table<
        { id: string; name: string; address: string | null; created_at: string },
        { id?: string; name: string; address?: string | null }
      >;
      profiles: Table<
        {
          id: string;
          school_id: string;
          name: string;
          email: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
        },
        { id: string; school_id: string; name: string; email: string; role: UserRole; is_active?: boolean }
      >;
      students: Table<
        {
          id: string;
          school_id: string;
          teacher_id: string;
          name: string;
          grade: number;
          created_at: string;
        },
        {
          id?: string;
          school_id: string;
          teacher_id: string;
          name: string;
          grade: number;
        }
      >;
      specialist_assignments: Table<
        { specialist_id: string; student_id: string; created_at: string },
        { specialist_id: string; student_id: string }
      >;
      skill_areas: Table<
        { id: string; key: string; name: string },
        { id?: string; key: string; name: string }
      >;
      assessments: Table<
        {
          id: string;
          grade_level: number;
          version: number;
          items: AssessmentItem[];
          is_active: boolean;
          created_at: string;
        },
        {
          id?: string;
          grade_level: number;
          version?: number;
          items: AssessmentItem[];
          is_active?: boolean;
        }
      >;
      recommendation_rules: Table<
        {
          id: string;
          skill_area_id: string;
          grade_level: number;
          recommendation_text: string;
          program_reference: string | null;
          created_at: string;
        },
        {
          id?: string;
          skill_area_id: string;
          grade_level: number;
          recommendation_text: string;
          program_reference?: string | null;
        }
      >;
      assessment_cycles: Table<
        {
          id: string;
          school_id: string;
          name: string;
          starts_at: string;
          ends_at: string | null;
          is_current: boolean;
          created_at: string;
        },
        {
          id?: string;
          school_id: string;
          name: string;
          starts_at: string;
          ends_at?: string | null;
          is_current?: boolean;
        }
      >;
      assessment_sessions: Table<
        {
          id: string;
          student_id: string;
          assessment_id: string;
          cycle_id: string;
          status: SessionStatus;
          session_code: string;
          current_item_index: number;
          started_at: string | null;
          completed_at: string | null;
          created_by: string;
          created_at: string;
        },
        {
          id?: string;
          student_id: string;
          assessment_id: string;
          cycle_id: string;
          status?: SessionStatus;
          session_code: string;
          current_item_index?: number;
          started_at?: string | null;
          completed_at?: string | null;
          created_by: string;
        }
      >;
      responses: Table<
        {
          id: string;
          session_id: string;
          item_id: string;
          answer: unknown;
          is_correct: boolean | null;
          answered_at: string;
        },
        {
          id?: string;
          session_id: string;
          item_id: string;
          answer: unknown;
          is_correct?: boolean | null;
        }
      >;
      results: Table<
        {
          id: string;
          session_id: string;
          skill_area_id: string;
          score: number;
          flagged_as_difficulty: boolean;
          created_at: string;
        },
        {
          id?: string;
          session_id: string;
          skill_area_id: string;
          score: number;
          flagged_as_difficulty?: boolean;
        }
      >;
      student_reports: Table<
        {
          id: string;
          student_id: string;
          session_id: string;
          overall_label: string;
          generated_at: string;
          pdf_path: string | null;
          status: ReportStatus;
        },
        {
          id?: string;
          student_id: string;
          session_id: string;
          overall_label: string;
          pdf_path?: string | null;
          status?: ReportStatus;
        }
      >;
      school_reports: Table<
        {
          id: string;
          school_id: string;
          cycle_id: string;
          generated_at: string;
          pdf_path: string | null;
          status: ReportStatus;
        },
        {
          id?: string;
          school_id: string;
          cycle_id: string;
          pdf_path?: string | null;
          status?: ReportStatus;
        }
      >;
      audit_log: Table<
        {
          id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string;
          metadata: Record<string, unknown>;
          created_at: string;
        },
        {
          id?: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id: string;
          metadata?: Record<string, unknown>;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      current_profile_role: { Args: Record<string, never>; Returns: UserRole };
      current_profile_school_id: { Args: Record<string, never>; Returns: string };
      is_administrator: { Args: Record<string, never>; Returns: boolean };
      can_access_student: { Args: { target_student_id: string }; Returns: boolean };
      can_access_session: { Args: { target_session_id: string }; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      session_status: SessionStatus;
    };
  };
}
