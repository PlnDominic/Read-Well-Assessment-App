import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "@/lib/theme";

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
  assessedDate: string;
  overallLabel: string;
  skills: { name: string; score: number; flagged: boolean }[];
  recommendations: { skillName: string; text: string; programReference?: string | null }[];
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
  assessedDate,
  overallLabel,
  skills,
  recommendations,
}: StudentReportPageProps) {
  const isOnTrack = overallLabel === "On Track";
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{studentName}</Text>
          <Text style={styles.meta}>Grade {grade} · Assessed {assessedDate}</Text>
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

      <Text style={styles.footer}>Read Well Assessment App · Generated {new Date().toLocaleDateString()}</Text>
    </Page>
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
