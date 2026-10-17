import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { colors } from "@/lib/theme";
import { formDeliveryLabel, formLabel, levelLabel, type AssessmentForm, type Delivery } from "@/lib/levels";
import { isOnTrackLabel, type FormSummary } from "@/lib/readwell/score";
import type { SummaryContent } from "@/lib/aiSummary";
import { FAMILY_LANGUAGES, type FamilyNote } from "@/lib/familyNote";
import { LOCAL_LANGUAGE_FONT } from "@/lib/pdf/fonts";

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
  /** The student's level. */
  level: number;
  /** The level of the assessment this session used, when known; it differs
   * from `level` only if the student has since moved level. */
  assessedLevel?: number;
  /** Form A, B, C or the Final assessment; null for kiosk sessions from before levels. */
  form?: AssessmentForm | null;
  delivery?: Delivery | null;
  assessedDate: string;
  overallLabel: string;
  skills: { name: string; score: number; flagged: boolean }[];
  recommendations: { skillName: string; text: string; programReference?: string | null }[];
  /** Present for assessor-led forms (ReadWell Level 1): strands with raw scores and bands replace the percent bars. */
  formSummary?: FormSummary;
  /** A teacher-approved summary (0022); a draft never reaches the PDF. */
  summary?: SummaryContent;
  /** The approved summary's note for the family in Twi, Ga or Ewe (0023), on a page of its own. */
  familyNote?: FamilyNote;
}

/**
 * One student's report as a single <Page>, factored out of
 * StudentReportPdf so BulkStudentReportsPdf can render many of these into
 * one Document (a whole class or cycle as one PDF) without duplicating
 * this layout.
 */
export function StudentReportPage({
  studentName,
  level,
  assessedLevel,
  form,
  delivery,
  assessedDate,
  overallLabel,
  skills,
  recommendations,
  formSummary,
  summary,
  familyNote,
}: StudentReportPageProps) {
  const isOnTrack = isOnTrackLabel(overallLabel);
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.name}>{studentName}</Text>
          <Text style={styles.meta}>
            {levelLabel(assessedLevel ?? level)}
            {form ? ` · ${delivery ? formDeliveryLabel(form, delivery) : formLabel(form)}` : ""} · Assessed {assessedDate}
          </Text>
          {assessedLevel !== undefined && assessedLevel !== level && (
            <Text style={[styles.meta, { color: colors.orangeDark, fontWeight: 700 }]}>Now in {levelLabel(level)}</Text>
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

      {summary && <SummaryHeadline summary={summary} />}

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
            <Text style={styles.recText}>No flagged areas this cycle. Continue with level-appropriate independent reading.</Text>
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

      {summary && <SummaryDetail summary={summary} />}

      {summary && familyNote && <FamilyNotePage studentName={studentName} assessedDate={assessedDate} note={familyNote} />}

      <Text style={styles.footer}>Read Well Assessment App · Generated {new Date().toLocaleDateString()}</Text>
    </Page>
  );
}

const sum = StyleSheet.create({
  headline: { backgroundColor: colors.orangeTint, borderRadius: 10, padding: 14, marginBottom: 6 },
  headlineTitle: { fontSize: 15, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  columns: { flexDirection: "row", gap: 18, marginTop: 14 },
  column: { flex: 1 },
  columnTitle: { fontSize: 12, fontWeight: 700, color: colors.ink, paddingBottom: 4, marginBottom: 8, borderBottomWidth: 2 },
  point: { flexDirection: "row", marginBottom: 5 },
  mark: { width: 14, fontWeight: 700, color: colors.orangeDark },
  pointText: { flex: 1, color: colors.body, fontSize: 10.5, lineHeight: 1.4 },
  cardText: { color: colors.body, fontSize: 10.5, lineHeight: 1.4 },
  cards: { flexDirection: "row", gap: 10, marginTop: 2 },
  card: { flex: 1, borderWidth: 1, borderColor: colors.neutralBorderStrong, borderRadius: 10, padding: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  num: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, color: colors.white, textAlign: "center", fontSize: 10, fontWeight: 700, paddingTop: 3, marginRight: 6 },
  cardTitle: { flex: 1, fontSize: 11, fontWeight: 700, color: colors.ink },
});

/** The approved headline: where the child stands, in a sentence or two, above the strands. */
function SummaryHeadline({ summary }: { summary: SummaryContent }) {
  return (
    <View style={sum.headline}>
      <Text style={sum.headlineTitle}>{summary.headline}</Text>
      <Text style={styles.recText}>{summary.overview}</Text>
    </View>
  );
}

function Points({ title, items, mark, color }: { title: string; items: string[]; mark: string; color: string }) {
  return (
    <View style={sum.column}>
      <Text style={[sum.columnTitle, { borderBottomColor: color }]}>{title}</Text>
      {items.map((item, i) => (
        <View style={sum.point} key={i} wrap={false}>
          <Text style={sum.mark}>{mark}</Text>
          <Text style={sum.pointText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The rest of the approved write-up, after the strands: what the child can
 * and cannot do yet, the three first priorities, and what school and home
 * will do. The scores themselves come from the app, never from the AI.
 */
function SummaryDetail({ summary }: { summary: SummaryContent }) {
  return (
    <View>
      <View style={sum.columns} wrap={false}>
        <Points title="What they can already do" items={summary.canDo} mark="+" color={colors.ink} />
        <Points title="What they have not learned yet" items={summary.notYet} mark=">" color={colors.orange} />
      </View>

      <Text style={styles.sectionTitle}>First things first</Text>
      <View style={sum.cards} wrap={false}>
        {summary.firstThings.map((p, i) => (
          <View style={sum.card} key={i}>
            <View style={sum.cardHead}>
              <Text style={sum.num}>{i + 1}</Text>
              <Text style={sum.cardTitle}>{p.title}</Text>
            </View>
            <Text style={sum.cardText}>{p.text}</Text>
          </View>
        ))}
      </View>

      <View style={sum.columns} wrap={false}>
        <Points title="At school, the teacher will" items={summary.atSchool} mark="•" color={colors.ink} />
        <View style={sum.column}>
          <Text style={[sum.columnTitle, { borderBottomColor: colors.orange }]}>At home, five minutes a day</Text>
          {summary.atHome.map((p, i) => (
            <View style={sum.point} key={i} wrap={false}>
              <Text style={sum.mark}>•</Text>
              <Text style={sum.pointText}>
                <Text style={{ fontWeight: 700, color: colors.ink }}>{p.title}. </Text>
                {p.text}
              </Text>
            </View>
          ))}
          <Text style={[styles.meta, { fontSize: 9 }]}>Sound games work in any language you speak at home.</Text>
        </View>
      </View>
      <Text style={[styles.meta, { fontSize: 9, marginTop: 10 }]}>Drafted with AI and approved by a teacher.</Text>
    </View>
  );
}

const fam = StyleSheet.create({
  title: { fontSize: 18, fontWeight: 700, color: colors.ink, marginBottom: 4 },
  text: { fontFamily: LOCAL_LANGUAGE_FONT, color: colors.body, fontSize: 12, lineHeight: 1.6, marginTop: 18, marginBottom: 14 },
  point: { flexDirection: "row", marginBottom: 8 },
  pointText: { flex: 1, fontFamily: LOCAL_LANGUAGE_FONT, color: colors.body, fontSize: 11.5, lineHeight: 1.5 },
});

/**
 * The family note, on a page of its own so it can be printed and sent home.
 * Its words are in the family's language, in a font that has their letters;
 * the heading stays in English for the teacher.
 */
function FamilyNotePage({ studentName, assessedDate, note }: { studentName: string; assessedDate: string; note: FamilyNote }) {
  const lang = FAMILY_LANGUAGES[note.language];
  return (
    <View break>
      <Text style={fam.title}>{studentName}</Text>
      <Text style={styles.meta}>
        A note for the family, in {lang} · Assessed {assessedDate}
      </Text>
      <Text style={fam.text}>{note.text}</Text>
      {note.atHome.map((p, i) => (
        <View style={fam.point} key={i} wrap={false}>
          <Text style={sum.mark}>•</Text>
          <Text style={fam.pointText}>
            <Text style={{ fontWeight: 700, color: colors.ink }}>{p.title}. </Text>
            {p.text}
          </Text>
        </View>
      ))}
      <Text style={[styles.meta, { fontSize: 9, marginTop: 14 }]}>
        Drafted with AI from the teacher&apos;s summary, then checked and approved by a teacher.
      </Text>
    </View>
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
