// Excel and PDF exports. The libraries are loaded on demand so the app stays small.

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/** rows: array of objects; columns: [{ header, key, width, type: 'number'|'text' }] */
export async function exportXlsx({ fileName, title, columns, rows, totals }) {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const bold = (value) => ({ value, fontWeight: 'bold' });
  const data = [
    [bold(title), ...columns.slice(1).map(() => null)],
    columns.map(() => null),
    columns.map((c) => bold(c.header)),
    ...rows.map((r) => columns.map((c) => r[c.key] ?? null)),
  ];
  if (totals) data.push(columns.map((c, i) => (totals[c.key] != null ? bold(totals[c.key]) : i === 0 ? bold('Total') : null)));
  const blob = await writeExcelFile(data, { columns: columns.map((c) => ({ width: c.width ?? 14 })) }).toBlob();
  download(blob, fileName);
}

export async function exportPdf({ fileName, title, subtitle, columns, rows, totals, footer }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  // jsPDF's built-in fonts have no ₹ glyph, so PDFs use "Rs".
  const clean = (v) => (typeof v === 'string' ? v.replace(/₹\s?/g, 'Rs ') : v);
  doc.setFontSize(16);
  doc.text(clean(title), 40, 44);
  doc.setFontSize(10);
  doc.setTextColor(110);
  if (subtitle) doc.text(clean(subtitle), 40, 62);
  autoTable(doc, {
    startY: 76,
    head: [columns.map((c) => clean(c.header))],
    body: rows.map((r) => columns.map((c) => clean(r[c.key] ?? ''))),
    foot: totals ? [columns.map((c, i) => clean(totals[c.key] ?? (i === 0 ? 'Total' : '')))] : undefined,
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [42, 120, 214] },
    footStyles: { fillColor: [240, 239, 236], textColor: 20, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.type === 'number' ? 'right' : 'left' }])),
  });
  if (footer) {
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(clean(footer), 40, doc.internal.pageSize.getHeight() - 24);
  }
  download(doc.output('blob'), fileName);
}
