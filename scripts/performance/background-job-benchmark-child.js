'use strict';
const { createWorkbook, appendAoaSheet, writeWorkbook } = require('../../src/utils/excelWriter.util');
function buildRows(count) {
  const rows = [['STT','Mã đơn','Khách hàng','Mã SP','Tên SP','SL','Đơn giá','Thành tiền']];
  for (let i = 0; i < count; i += 1) rows.push([i + 1, `SO${i}`, `Khách ${i % 500}`, `P${i % 2000}`, `Sản phẩm ${i % 2000}`, (i % 20) + 1, 10000 + (i % 100), ((i % 20) + 1) * (10000 + (i % 100))]);
  return rows;
}
const count = Math.max(1, Number(process.argv[2] || 1000));
if (process.send) process.send({ type: 'started' });
const before = process.memoryUsage().heapUsed;
const start = process.hrtime.bigint();
const wb = createWorkbook();
appendAoaSheet(wb, 'Export', buildRows(count));
const buffer = writeWorkbook(wb);
const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
const heapDelta = process.memoryUsage().heapUsed - before;
if (process.send) process.send({ type: 'completed', durationMs, heapDelta, bytes: buffer.length });
