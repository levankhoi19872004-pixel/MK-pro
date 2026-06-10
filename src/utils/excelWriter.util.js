'use strict';

const zlib = require('zlib');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function colName(index) {
  let n = Number(index) + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(rowIndex, colIndex) {
  return `${colName(colIndex)}${rowIndex + 1}`;
}

function encodeRange(rowCount, colCount) {
  const rows = Math.max(Number(rowCount) || 1, 1);
  const cols = Math.max(Number(colCount) || 1, 1);
  return `A1:${cellRef(rows - 1, cols - 1)}`;
}

function normalizeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => (Array.isArray(row) ? row : [row]));
}

function createWorkbook() {
  return { sheets: [] };
}

function appendAoaSheet(workbook, name, rows, options = {}) {
  if (!workbook || !Array.isArray(workbook.sheets)) throw new Error('Workbook không hợp lệ');
  const safeRows = normalizeRows(rows);
  workbook.sheets.push({
    name: sanitizeSheetName(name || `Sheet${workbook.sheets.length + 1}`),
    rows: safeRows,
    widths: Array.isArray(options.widths) ? options.widths : null,
    autoFilter: Boolean(options.autoFilter)
  });
  return workbook;
}

function sheetXml(sheet) {
  const rows = normalizeRows(sheet.rows);
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0) || 1;
  const dim = encodeRange(Math.max(rows.length, 1), maxCols);
  const colsXml = Array.isArray(sheet.widths) && sheet.widths.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Number(width) || 12}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rowXml = rows.map((row, r) => {
    const cells = row.map((value, c) => {
      const ref = cellRef(r, c);
      if (value === null || value === undefined || value === '') return '';
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const autoFilterXml = sheet.autoFilter && rows.length ? `<autoFilter ref="${dim}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dim}"/>${colsXml}<sheetData>${rowXml}</sheetData>${autoFilterXml}</worksheet>`;
}

function workbookXml(workbook) {
  const sheets = workbook.sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelsXml(workbook) {
  const sheetRels = workbook.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${workbook.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypesXml(workbook) {
  const sheetTypes = workbook.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetTypes}</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function zipFiles(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { dosTime, dosDate } = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(dosTime), u16(dosDate),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), name, compressed
    ]);
    chunks.push(local);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(8), u16(dosTime), u16(dosDate),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
    ]));
    offset += local.length;
  }
  const centralStart = offset;
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBuffer.length), u32(centralStart), u16(0)
  ]);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

function writeWorkbook(workbook) {
  if (!workbook || !Array.isArray(workbook.sheets) || workbook.sheets.length === 0) {
    throw new Error('Workbook cần ít nhất một sheet');
  }
  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml(workbook) },
    { name: '_rels/.rels', data: rootRelsXml() },
    { name: 'xl/workbook.xml', data: workbookXml(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(workbook) },
    { name: 'xl/styles.xml', data: stylesXml() },
    ...workbook.sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: sheetXml(sheet) }))
  ];
  return zipFiles(files);
}

module.exports = { createWorkbook, appendAoaSheet, writeWorkbook };
