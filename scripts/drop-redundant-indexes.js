'use strict';

// Backward-compatible wrapper. Lệnh cũ không có --dry-run là chế độ ghi.
if (process.argv.includes('--dry-run')) {
  process.argv = process.argv.filter((arg) => arg !== '--dry-run');
} else if (!process.argv.includes('--write')) {
  process.argv.push('--write');
}

require('./audit-mongo-indexes');
