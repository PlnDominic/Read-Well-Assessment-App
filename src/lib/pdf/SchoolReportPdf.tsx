import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "@/lib/theme";

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
});

export interface SchoolReportPdfProps {
  schoolName: string;
  cycleName: string;
  studentsAssessed: number;
  studentsTotal: number;
  gradeLevel: number;
  avgOverallScore: number;
  skillDistribution: { name: string; pctFlagged: number }[];
  planningNote: string;
}

export function SchoolReportPdf({
  schoolName,
  cycleName,
  studentsAssessed,
  studentsTotal,
  gradeLevel,
  avgOverallScore,
  skillDistribution,
  planningNote,
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
            <Text style={styles.statLabel}>GRADE LEVEL</Text>
            <Text style={styles.statValue}>Grade {gradeLevel}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVG. OVERALL SCORE</Text>
            <Text style={[styles.statValue, { color: colors.orange }]}>{avgOverallScore}%</Text>
          </View>
        </View>

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

        <Text style={styles.note}>{planningNote}</Text>

        <Text style={styles.footer}>Read Well Assessment App · Generated {new Date().toLocaleDateString()}</Text>
      </Page>
    </Document>
  );
}
