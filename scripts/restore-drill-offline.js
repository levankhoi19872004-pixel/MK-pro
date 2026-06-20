'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { promisify } = require('util');
const { APP_COLLECTION_KEYS } = require('../src/constants/collectionKeys');
const systemService = require('../src/services/systemService');
const { buildBackupIntegrity, compareBackupIntegrity } = require('../src/operations/backupIntegrity');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

function fixtureData() {
  const data = Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, []]));
  data.products = [{ code: 'TEST-001', name: 'Restore Drill Product', salePrice: 10000 }];
  data.customers = [{ code: 'CUS-001', name: 'Restore Drill Customer' }];
  data.users = [{ username: 'restore-drill', role: 'admin' }];
  data.salesOrders = [{ id: 'SO-DRILL-001', code: 'SO-DRILL-001', customerCode: 'CUS-001', total: 10000 }];
  data.returnOrders = [{ id: 'RO-DRILL-001', code: 'RO-DRILL-001', salesOrderCode: 'SO-DRILL-001', status: 'pending' }];
  data.inventories = [{ productCode: 'TEST-001', warehouseCode: 'MAIN', onHand: 12, availableQty: 12 }];
  data.arLedgers = [{ id: 'AR-DRILL-001', account: 'AR', debit: 10000, credit: 2000, status: 'active' }];
  data.fundLedgers = [{ id: 'FUND-DRILL-001', direction: 'in', amount: 2000, status: 'active' }];
  return data;
}

async function main() {
  const started = Date.now();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mkpro-restore-drill-'));
  const backupDir = path.join(tempRoot, 'backup');
  const restoreDir = path.join(tempRoot, 'restored');
  await fs.mkdir(backupDir, { recursive: true });
  await fs.mkdir(restoreDir, { recursive: true });

  const data = fixtureData();
  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length]));
  const integrity = buildBackupIntegrity(data);
  const payload = {
    format: 'mk-pro-backup-v2',
    createdAt: new Date().toISOString(),
    source: 'offline-fixture',
    counts,
    integrity,
    data
  };
  const compressed = await gzip(Buffer.from(JSON.stringify(payload), 'utf8'));
  const fileName = `backup-${payload.createdAt.replace(/[:.]/g, '-')}.json.gz`;
  const filePath = path.join(backupDir, fileName);
  const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');
  await fs.writeFile(filePath, compressed);
  await fs.writeFile(`${filePath}.sha256`, `${sha256}  ${fileName}\n`);

  const verification = await systemService.verifyBackup(fileName, { backupDir });
  const parsed = JSON.parse((await gunzip(await fs.readFile(filePath))).toString('utf8'));
  for (const [key, rows] of Object.entries(parsed.data)) {
    await fs.writeFile(path.join(restoreDir, `${key}.json`), JSON.stringify(rows));
  }
  const restored = {};
  for (const key of Object.keys(parsed.data)) {
    restored[key] = JSON.parse(await fs.readFile(path.join(restoreDir, `${key}.json`), 'utf8'));
  }
  const comparison = compareBackupIntegrity(parsed.integrity, restored);
  if (!comparison.ok) throw new Error(`Offline restore mismatch: ${comparison.mismatches.join(', ')}`);

  const report = {
    ok: true,
    mode: 'offline-logical-restore-simulation',
    startedAt: payload.createdAt,
    durationMs: Date.now() - started,
    backup: verification,
    restoredCollectionCount: Object.keys(restored).length,
    restoredDocumentCount: Object.values(restored).reduce((sum, rows) => sum + rows.length, 0),
    integrity: { ok: comparison.ok, technicalTotals: comparison.actual.technicalTotals },
    limitation: 'Không thay thế restore drill trên MongoDB staging/test riêng.'
  };
  const output = path.resolve(process.argv.find((item) => item.startsWith('--output='))?.slice(9) || 'RESTORE_DRILL_OFFLINE_RESULT.json');
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await fs.rm(tempRoot, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
