import * as XLSX from 'xlsx';

export function exportToExcel(records, filename = "voice_log.xlsx") {
  if (!records || records.length === 0) {
    alert("No records to export.");
    return;
  }

  // Sanitize formula injection
  const sanitizedRecords = records.map(record => {
    const cleanRow = {};
    Object.keys(record).forEach(key => {
      let val = record[key];
      if (typeof val === 'string' && ['=', '+', '-', '@', '\t', '\r'].includes(val.charAt(0))) {
        val = `'${val}`;
      }
      cleanRow[key] = val;
    });
    return cleanRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(sanitizedRecords);
  
  // Set column widths
  const colWidths = Object.keys(sanitizedRecords[0] || {}).map(key => ({
    wch: Math.max(key.length + 4, 14)
  }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Voice Logs");

  // Trigger browser/device file download
  XLSX.writeFile(workbook, filename);
}
