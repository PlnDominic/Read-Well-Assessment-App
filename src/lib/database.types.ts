/**
 * Hand-written mirror of the schema in supabase/migrations/*.sql.
 *
 * Once a real Supabase project is linked, regenerate this file from the
 * live schema instead of maintaining it by hand:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 */

import type { AssessmentForm, Delivery } from "@/lib/levels";

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
   * "choice", "mic" and "text" are answered by the student in the game on
   * their own device (src/app/student). "assessor" items are scored by a
   * trained adult on the assessor screen (src/lib/readwell/). An assessment
   * is one or the other, never a mix (see isAssessorLed in
   * src/lib/readwell/form.ts).
   */
  type: "choice" | "mic" | "text" | "assessor";
  prompt: string;
  passage?: string;
  options?: AssessmentItemOption[];
  /**
   * Game items: what Sunny says aloud instead of reading the prompt and
   * passage, never shown. Used to read choices to a child who can't read
   * yet, to dictate a word without showing it, and so a read-aloud item
   * never speaks the word the child is meant to read.
   */
  say?: string;
  /**
   * The exact word/phrase a mic item expects the student to read aloud,
   * used to score the browser's speech-to-text transcript (or a typed
   * writing answer) in evaluateResponse (src/lib/kiosk.ts). Optional: an
   * item with no expectedText counts any attempt.
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
          /** Staff may have an AI draft a report summary for a teacher to review (0022). */
          ai_reports_enabled: boolean;
          created_at: string;
        },
        { id?: string; name: string; address?: string | null; data_retention_days?: number | null; ai_reports_enabled?: boolean }
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
          level: number;
          created_at: string;
          deleted_at: string | null;
        },
        {
          id?: string;
          school_id: string;
          teacher_id: string;
          name: string;
          level: number;
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
          level: number;
          /** null only for content from before levels that wasn't kept (switched off). */
          form: AssessmentForm | null;
          /** How it's given: by an adult on the assessor screen, or played by the child (0018). */
          delivery: Delivery;
          /** Game forms: tell the child right from wrong, with one practice retry (0019). */
          show_feedback: boolean;
          version: number;
          items: AssessmentItem[];
          is_active: boolean;
          created_at: string;
        },
        {
          id?: string;
          level: number;
          form?: AssessmentForm | null;
          delivery: Delivery;
          show_feedback?: boolean;
          version?: number;
          items: AssessmentItem[];
          is_active?: boolean;
        }
      >;
      recommendation_rules: Table<
        {
          id: string;
          skill_area_id: string;
          level: number;
          recommendation_text: string;
          program_reference: string | null;
          created_at: string;
        },
        {
          id?: string;
          skill_area_id: string;
          level: number;
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
          /** Student game sessions have one for /student/join; assessor-led ones don't. */
          session_code: string | null;
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
          session_code?: string | null;
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
      student_report_summaries: Table<
        {
          id: string;
          student_id: string;
          session_id: string;
          /** A draft is shown only to staff; an approved one goes in the PDF (0022). */
          status: "draft" | "approved";
          content: import("@/lib/aiSummary").SummaryContent;
          /** An optional note for the family in Twi, Ga or Ewe, approved with the summary (0023). */
          family_note: import("@/lib/familyNote").FamilyNote | null;
          model: string;
          edited: boolean;
          generated_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          student_id: string;
          session_id: string;
          status?: "draft" | "approved";
          content: import("@/lib/aiSummary").SummaryContent;
          family_note?: import("@/lib/familyNote").FamilyNote | null;
          model: string;
          edited?: boolean;
          generated_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          updated_at?: string;
        }
      >;
      cycle_report_summaries: Table<
        {
          id: string;
          school_id: string;
          cycle_id: string;
          /** null for the whole school, else this teacher's class (0023). */
          teacher_id: string | null;
          status: "draft" | "approved";
          content: import("@/lib/cycleSummary").CycleSummaryContent;
          model: string;
          edited: boolean;
          generated_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          school_id: string;
          cycle_id: string;
          teacher_id?: string | null;
          status?: "draft" | "approved";
          content: import("@/lib/cycleSummary").CycleSummaryContent;
          model: string;
          edited?: boolean;
          generated_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          updated_at?: string;
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
