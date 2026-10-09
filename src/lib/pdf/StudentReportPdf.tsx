import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "@/lib/theme";
import { gradeLabel } from "@/lib/grades";
import type { FormSummary } from "@/lib/readwell/score";

const styles = StyleSheet.create({
  page: { backgroundColor: colors.white, padding: 40, fontSize: 11, color: colors.ink },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  name: { fontSize: 22, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  meta: { fontSize: 11, color: colors.muted },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 12, marginTop: 20 },
  skillRow: { marginBottom: 12 },
  skillLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  skillName: { fontWeight: 700, color: colors.inkSoft },
  barTrack: { height: 8, backgroundColor: colors.neutralBorder, borderRadius: 999 },
  barFill: { height: 8, borderRadius: 999 },
  recCard: {
    backgroundColor: colors.orangeTint,
    borderLeftWidth: 3,
    borderLeftColor: colors.orange,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  recSkill: { fontWeight: 700, color: colors.ink, marginBottom: 3, fontSize: 11 },
  recText: { color: colors.body, fontSize: 11, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: colors.mutedLight },
});

export interface StudentReportPageProps {
  studentName: string;
  grade: number;
  /** The grade level of the assessment this session actually used, only
   * passed when it differs from `grade` (a grade override -- see
   * GradeOverrideControl.tsx / overrideStudentGrade in lib/kiosk.ts). */
  contentGrade?: number;
  assessedDate: string;
  overallLabel: string;
  skills: { name: string; score: number; flagged: boolean }[];
  recommendations: { skillName: string; text: string; programReference?: string | null }[];
  /** Present for assessor-led forms (ReadWell Level 1): strands with raw scores and bands replace the percent bars. */
  formSummary?: FormSummary;
}

/**
 * One student's report as a single <Page>, factored out of
 * StudentReportPdf so BulkStudentReportsPdf can render many of these into
 * one Document (a whole class or cycle as one PDF) without duplicating
 * this layout.
 */
export function StudentReportPage({
  studentName,
  grade,
  contentGrade,
  assessedDate,
  overallLabel,
  skills,
  recommendations,
  formSummary,
}: StudentReportPageProps) {
  const isOnTrack = overallLabel === "On Track" || overallLabel === "On track for Level 1";
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{studentName}</Text>
          <Text style={styles.meta}>{gradeLabel(grade)} · Assessed {assessedDate}</Text>
          {contentGrade !== undefined && contentGrade !== grade && (
            <Text style={[styles.meta, { color: colors.orangeDark, fontWeight: 700 }]}>
              Assessed with {gradeLabel(contentGrade)} content (grade override)
            </Text>
          )}
        </View>
        {/* On Track is solid black/white, not orange -- see the matching
            comment in the web report page: orange is the only accent
            color in this palette, so it can't distinguish by hue alone. */}
        <Text
          style={[
            styles.badge,
            {
              backgroundColor: isOnTrack ? colors.ink : colors.orangeTint,
              color: isOnTrack ? colors.white : colors.orangeDark,
            },
          ]}
        >
          {overallLabel}
        </Text>
      </View>

      {formSummary ? (
        <FormSummarySection summary={formSummary} />
      ) : (
        <>
          <Text style={styles.sectionTitle}>Skill Area Breakdown</Text>
          {skills.map((sk) => (
            <View style={styles.skillRow} key={sk.name}>
              <View style={styles.skillLabelRow}>
                <Text style={styles.skillName}>{sk.name}</Text>
                <Text style={{ fontWeight: 700, color: sk.flagged ? colors.orangeDark : colors.ink }}>
                  {sk.score}%
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${sk.score}%`, backgroundColor: sk.flagged ? colors.orange : colors.ink },
                  ]}
                />
              </View>
            </View>
          ))}
        </>
      )}

      {/* KG 1 has no recommendation rules yet, and "no flagged areas" would be
          wrong for a child with Emerging strands, so the section is left out
          until there's something to show. */}
      {!(formSummary && recommendations.length === 0) && (
        <>
          <Text style={styles.sectionTitle}>Program-Aligned Recommendations</Text>
          {recommendations.length === 0 ? (
            <Text style={styles.recText}>No flagged areas this cycle. Continue with grade-level independent reading.</Text>
          ) : (
            recommendations.map((rec, i) => (
              <View style={styles.recCard} key={`${rec.skillName}-${i}`}>
                <Text style={styles.recSkill}>{rec.skillName}</Text>
                <Text style={styles.recText}>{rec.text}</Text>
              </View>
            ))
          )}
        </>
      )}

      <Text style={styles.footer}>Read Well Assessment App · Generated {new Date().toLocaleDateString()}</Text>
    </Page>
  );
}

const table = StyleSheet.create({
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.neutralBorder, paddingVertical: 5 },
  head: { fontWeight: 700, color: colors.muted, fontSize: 9 },
  strand: { width: "38%" },
  score: { width: "17%" },
  band: { width: "45%" },
  note: { color: colors.muted, fontSize: 9 },
});

/** The guide's report: each strand on its own, never one total, so it shows exactly where the child is stuck. */
function FormSummarySection({ summary }: { summary: FormSummary }) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Strands</Text>
      <View style={table.row}>
        <Text style={[table.strand, table.head]}>STRAND</Text>
        <Text style={[table.score, table.head]}>SCORE</Text>
        <Text style={[table.band, table.head]}>BAND</Text>
      </View>
      {summary.strands.map((s) => (
        <View style={table.row} key={s.key} wrap={false}>
          <Text style={[table.strand, { fontWeight: 700 }]}>{s.name}</Text>
          <Text style={table.score}>
            {s.status === "na" ? "NA" : s.status === "notEntered" ? "Not entered" : `${s.raw} / ${s.max}`}
          </Text>
          <Text style={[table.band, s.band === "Emerging" ? { color: colors.orangeDark, fontWeight: 700 } : {}]}>
            {s.band ?? (s.status === "na" ? s.parts.find((p) => p.note)?.note ?? "Skipped by a gate rule" : s.bandNote ?? "")}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Story reading</Text>
      <Text style={styles.recText}>
        {summary.storyReading
          ? `${summary.storyReading.wordsCorrect} words correct out of ${summary.storyReading.outOf}` +
            (summary.storyReading.wcpm !== null
              ? `, ${summary.storyReading.wcpm} words correct per minute (${summary.storyReading.seconds} seconds).`
              : ".")
          : "Not given (skipped by a gate rule)."}
      </Text>

      <Text style={styles.sectionTitle}>Reading attitude (not scored)</Text>
      {summary.attitude.map((a) => (
        <Text style={[styles.recText, { marginBottom: 3 }]} key={a.itemId}>
          {a.prompt} {a.answer ?? "No answer"}
        </Text>
      ))}

      <Text style={[table.note, { marginTop: 14 }]}>
        Support level counts how many foundation strands are Emerging ({summary.emergingFoundation} of{" "}
        {summary.bandedFoundation} banded). Cut points are provisional until the pilot.
      </Text>
      {summary.rulesApplied.map((r) => (
        <Text style={table.note} key={r}>
          {r}
        </Text>
      ))}
    </View>
  );
}

export type StudentReportPdfProps = StudentReportPageProps;

export function StudentReportPdf(props: StudentReportPdfProps) {
  return (
    <Document title={`${props.studentName}: Reading Assessment Report`}>
      <StudentReportPage {...props} />
    </Document>
  );
}
