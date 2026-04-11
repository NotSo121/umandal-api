const XLSX = require('xlsx');

// Parse uploaded Excel buffer → array of row objects
const parseExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
};

// Generate Excel buffer from array of objects
const generateExcel = (data) => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Bhakto');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = { parseExcel, generateExcel };