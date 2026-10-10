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
  /**
   * "choice", "mic", and "text" are answered by the student on the kiosk.
   * "assessor" items are scored by a trained adult on the assessor screen.
   */
  type: "choice" | "mic" | "text" | "assessor";
  prompt: string;
  passage?: string;
  options?: AssessmentItemOption[];
  /**
   * The exact word/phrase a mic item expects the student to read aloud,
   * used to score the browser's speech-to-text transcript in
   * evaluateResponse (src/lib/kiosk.ts). Optional: a mic item with no
   * expectedText configured falls back to "any attempt counts."
   */
  expectedText?: string;

  // --- assessor items only ---
  /** The guide's part number (1-13); the part's script and rules live in the form definition. */
  part?: number;
  /** Row on a letter/word grid, or rung on the sound ladder. */
  row?: number;
  /** What counts as correct, as the guide words it. */
  accept?: string;
  /** Secondary text shown with the prompt: the pictures in a vocabulary row, a heart word's set, a dictation sentence. */
  detail?: string;
  /** Shown before this item, e.g. "Now turn to page 4 yourself." */
  instruction?: string;
  /** Highest score for the item; 1 unless stated (the name task scores 0-2). */
  maxScore?: number;
  /** false for items recorded but not scored (reading attitude, the story reading record). */
  scored?: boolean;
  /** Story questions: the story line the question comes from (asked only if the child read it). */
  fromLine?: number;
  /** Unscored items answered by picking one of these (reading attitude). */
  responseChoices?: { label: string; value: string | number }[];
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
        {
          id: string;
          name: string;
          address: string | null;
          data_retention_days: number | null;
          created_at: string;
        },
        { id?: string; name: string; address?: string | null; data_retention_days?: number | null }
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
          deleted_at: string | null;
        },
        {
          id?: string;
          school_id: string;
          teacher_id: string;
          name: string;
          grade: number;
          deleted_at?: string | null;
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
      school_skill_weights: Table<
        { school_id: string; skill_area_id: string; weight: number; flagged_threshold: number | null },
        {
          school_id: string;
          skill_area_id: string;
          weight?: number;
          flagged_threshold?: number | null;
        }
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
          grade_override: boolean;
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
          grade_override?: boolean;
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
          auto_is_correct: boolean | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
        },
        {
          id?: string;
          session_id: string;
          item_id: string;
          answer: unknown;
          is_correct?: boolean | null;
          auto_is_correct?: boolean | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
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
          attempted_at: string | null;
          retry_count: number;
          last_error: string | null;
          alerted_at: string | null;
        },
        {
          id?: string;
          student_id: string;
          session_id: string;
          overall_label: string;
          pdf_path?: string | null;
          status?: ReportStatus;
          attempted_at?: string | null;
          retry_count?: number;
          last_error?: string | null;
          alerted_at?: string | null;
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
          attempted_at: string | null;
          retry_count: number;
          last_error: string | null;
          alerted_at: string | null;
        },
        {
          id?: string;
          school_id: string;
          cycle_id: string;
          pdf_path?: string | null;
          status?: ReportStatus;
          attempted_at?: string | null;
          retry_count?: number;
          last_error?: string | null;
          alerted_at?: string | null;
        }
      >;
      notifications: Table<
        {
          id: string;
          recipient_id: string;
          type: string;
          message: string;
          link: string | null;
          read: boolean;
          created_at: string;
        },
        {
          id?: string;
          recipient_id: string;
          type: string;
          message: string;
          link?: string | null;
          read?: boolean;
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
