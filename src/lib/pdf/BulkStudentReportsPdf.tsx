import { Document } from "@react-pdf/renderer";
import { StudentReportPage, type StudentReportPageProps } from "./StudentReportPdf";

export interface BulkStudentReportsPdfProps {
  title: string;
  reports: StudentReportPageProps[];
}

/**
 * A whole class or cycle as one PDF: every student's report as its own
 * Page inside a single Document, so it can be printed or downloaded in one
 * shot instead of one-at-a-time. See /api/reports/class and
 * /api/reports/school/[cycleId]/bulk.
 */
export function BulkStudentReportsPdf({ title, reports }: BulkStudentReportsPdfProps) {
  return (
    <Document title={title}>
      {reports.map((r, i) => (
        <StudentReportPage key={i} {...r} />
      ))}
    </Document>
  );
}
