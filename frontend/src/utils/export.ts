// Imports dynamiques : jspdf / xlsx pèsent ~700 kB combinés. En les chargeant
// uniquement au moment où l'utilisateur clique sur "Exporter", on évite de
// gonfler le bundle initial (chunk vendor-export devient lazy).
import i18n from "../i18n";

/**
 * Export an array of objects to a .xlsx file download.
 */
export async function exportToExcel(data: Record<string, unknown>[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Export a simple key-value list to a PDF file download.
 */
export async function exportToPDF(
  title: string,
  rows: { label: string; value: string }[],
  filename: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 20);

  // Date
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(i18n.t("common.generatedOn", { date: new Date().toLocaleDateString(i18n.language) }), 14, 28);

  // Separator line
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.5);
  doc.line(14, 31, 196, 31);

  // Rows
  doc.setTextColor(30, 30, 30);
  let y = 40;
  for (const row of rows) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(row.label, 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(row.value), 90, y);
    y += 9;
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Export a table (headers + rows) to a .xlsx file download.
 */
export async function exportTableToExcel(
  headers: string[],
  rows: (string | number)[][],
  filename: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
