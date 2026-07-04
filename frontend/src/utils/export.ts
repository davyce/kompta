// Imports dynamiques : jspdf / exceljs pèsent plusieurs centaines de kB combinés.
// En les chargeant uniquement au moment où l'utilisateur clique sur "Exporter",
// on évite de gonfler le bundle initial (chunk vendor-export reste lazy).
import i18n from "../i18n";

/**
 * Déclenche le téléchargement d'un classeur ExcelJS dans le navigateur.
 */
async function downloadWorkbook(workbook: import("exceljs").Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Export an array of objects to a .xlsx file download.
 */
export async function exportToExcel(data: Record<string, unknown>[], filename: string): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  if (data.length > 0) {
    sheet.columns = Object.keys(data[0]).map((key) => ({ header: key, key }));
    data.forEach((row) => sheet.addRow(row));
  }
  await downloadWorkbook(workbook, filename);
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
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  await downloadWorkbook(workbook, filename);
}
