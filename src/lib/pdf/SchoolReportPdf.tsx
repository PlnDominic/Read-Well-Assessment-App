import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "@/lib/theme";
import { levelLabel } from "@/lib/levels";
import type { CycleSummaryContent } from "@/lib/cycleSummary";

const styles = StyleSheet.create({
  page: { backgroundColor: colors.white, padding: 40, fontSize: 11, color: colors.ink },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  name: { fontSize: 22, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  meta: { fontSize: 11, color: colors.muted },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: colors.neutral, borderRadius: 10, padding: 14 },
  statLabel: { fontSize: 9, color: colors.mutedLight, fontWeight: 700, marginBottom: 6 },
  statValue: { fontSize: 20, fontWeight: 700, color: colors.ink },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 12 },
  skillRow: { marginBottom: 12 },
  skillLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  skillName: { fontWeight: 700, color: colors.inkSoft },
  barTrack: { height: 8, backgroundColor: colors.neutralBorder, borderRadius: 999 },
  barFill: { height: 8, borderRadius: 999, backgroundColor: colors.orange },
  table: { marginTop: 8, marginBottom: 22 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottom: `1px solid ${colors.neutralBorder}`,
    paddingBottom: 6,
    marginBottom: 6,
  },
  tableRow: { flexDirection: "row", paddingVertical: 5 },
  tableHeaderCell: { fontSize: 9, fontWeight: 700, color: colors.mutedLight },
  tableCell: { fontSize: 10, color: colors.inkSoft },
  colTeacher: { flex: 2 },
  colStudents: { flex: 1, textAlign: "right" },
  colScore: { flex: 1, textAlign: "right" },
  colFlagged: { flex: 1.4, textAlign: "right" },
  note: {
    backgroundColor: colors.orangeTint,
    borderRadius: 8,
    padding: 14,
    marginTop: 22,
    fontSize: 10,
    color: colors.inkSoft,
    lineHeight: 1.5,
  },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: colors.mutedLight },
  headline: { backgroundColor: colors.orangeTint, borderRadius: 10, padding: 14, marginBottom: 22 },
  headlineTitle: { fontSize: 14, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  body: { color: colors.body, fontSize: 10.5, lineHeight: 1.45 },
  point: { flexDirection: "row", marginBottom: 5 },
  mark: { width: 14, fontWeight: 700, color: colors.orangeDark },
  columns: { flexDirection: "row", gap: 18, marginTop: 4, marginBottom: 6 },
  column: { flex: 1 },
  columnTitle: { fontSize: 12, fontWeight: 700, color: colors.ink, paddingBottom: 4, marginBottom: 8, borderBottomWidth: 2 },
});

export interface SchoolReportPdfProps {
  schoolName: string;
  cycleName: string;
  studentsAssessed: number;
  studentsTotal: number;
  level: number;
  avgOverallScore: number;
  skillDistribution: { name: string; pctFlagged: number }[];
  classroomBreakdown: { teacherName: string; studentsAssessed: number; avgScore: number; pctNeedsSupport: number }[];
  planningNote: string;
  /** The cycle's summary, once an administrator has approved it (0023). */
  summary?: CycleSummaryContent;
}

export function SchoolReportPdf({
  schoolName,
  cycleName,
  studentsAssessed,
  studentsTotal,
  level,
  avgOverallScore,
  skillDistribution,
  classroomBreakdown,
  planningNote,
  summary,
}: SchoolReportPdfProps) {
  return (
    <Document title={`${schoolName}: School-Wide Reading Report`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.name}>{schoolName}</Text>
            <Text style={styles.meta}>School-Wide Report · {cycleName}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>STUDENTS ASSESSED</Text>
            <Text style={styles.statValue}>
              {studentsAssessed} / {studentsTotal}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>LEVEL</Text>
            <Text style={styles.statValue}>{levelLabel(level)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG. OVERALL SCORE</Text>
            <Text style={[styles.statValue, { color: colors.orange }]}>{avgOverallScore}%</Text>
          </View>
        </View>

        {summary && (
          <View style={styles.headline}>
            <Text style={styles.headlineTitle}>{summary.headline}</Text>
            <Text style={styles.body}>{summary.overview}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Difficulty Area Distribution (% of students flagged)</Text>
        {skillDistribution.map((sk) => (
          <View style={styles.skillRow} key={sk.name}>
            <View style={styles.skillLabelRow}>
              <Text style={styles.skillName}>{sk.name}</Text>
              <Text style={{ fontWeight: 700, color: colors.orangeDark }}>{sk.pctFlagged}% flagged</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${sk.pctFlagged}%` }]} />
            </View>
          </View>
        ))}

        {classroomBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>By Classroom</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colTeacher]}>TEACHER</Text>
                <Text style={[styles.tableHeaderCell, styles.colStudents]}>STUDENTS</Text>
                <Text style={[styles.tableHeaderCell, styles.colScore]}>AVG. SCORE</Text>
                <Text style={[styles.tableHeaderCell, styles.colFlagged]}>NEEDS SUPPORT</Text>
              </View>
              {classroomBreakdown.map((c) => (
                <View style={styles.tableRow} key={c.teacherName}>
                  <Text style={[styles.tableCell, styles.colTeacher]}>{c.teacherName}</Text>
                  <Text style={[styles.tableCell, styles.colStudents]}>{c.studentsAssessed}</Text>
                  <Text style={[styles.tableCell, styles.colScore]}>{c.avgScore}%</Text>
                  <Text style={[styles.tableCell, styles.colFlagged, { color: colors.orangeDark, fontWeight: 700 }]}>
                    {c.pctNeedsSupport}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {summary && <CycleSummaryDetail summary={summary} />}

        <Text style={styles.note}>{planningNote}</Text>

        <Text style={styles.footer}>Read Well Assessment App · Generated {new Date().toLocaleDateString()}</Text>
      </Page>
    </Document>
  );
}

function Points({ items, mark }: { items: string[]; mark: string }) {
  return (
    <>
      {items.map((item, i) => (
        <View style={styles.point} key={i} wrap={false}>
          <Text style={styles.mark}>{mark}</Text>
          <Text style={[styles.body, { flex: 1 }]}>{item}</Text>
        </View>
      ))}
    </>
  );
}

/** The rest of the approved summary: what's going well, what to work on first, and the school's next steps. */
function CycleSummaryDetail({ summary }: { summary: CycleSummaryContent }) {
  return (
    <View>
      <View style={styles.columns} wrap={false}>
        {summary.strengths.length > 0 && (
          <View style={styles.column}>
            <Text style={[styles.columnTitle, { borderBottomColor: colors.ink }]}>Going well</Text>
            <Points items={summary.strengths} mark="+" />
          </View>
        )}
        <View style={styles.column}>
          <Text style={[styles.columnTitle, { borderBottomColor: colors.orange }]}>Work on first</Text>
          {summary.priorities.map((p, i) => (
            <View style={styles.point} key={i} wrap={false}>
              <Text style={styles.mark}>{i + 1}</Text>
              <Text style={[styles.body, { flex: 1 }]}>
                <Text style={{ fontWeight: 700, color: colors.ink }}>{p.title}. </Text>
                {p.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.sectionTitle}>Next steps for the school</Text>
      <Points items={summary.actions} mark="•" />
      <Text style={[styles.meta, { fontSize: 9, marginTop: 8 }]}>Drafted with AI from this cycle&apos;s totals and approved by an administrator.</Text>
    </View>
  );
}
