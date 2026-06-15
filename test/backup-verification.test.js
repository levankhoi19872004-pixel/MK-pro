'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { promisify } = require('node:util');

const { APP_COLLECTION_KEYS } = require('../src/constants/collectionKeys');
const systemService = require('../src/services/systemService');
const gzip = promisify(zlib.gzip);

test('backup verifier checks gzip, checksum, format, canonical collections and counts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-backup-test-'));
  const fileName = 'backup-2026-06-13T12-00-00-000Z.json.gz';
  const data = Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, []]));
  data.products = [{ code: 'P1' }];
  const counts = Object.fromEntries(APP_COLLECTION_KEYS.map((key) => [key, data[key].length]));
  const compressed = await gzip(Buffer.from(JSON.stringify({ format: 'mk-pro-backup-v2', createdAt: '2026-06-13T12:00:00.000Z', source: 'mongodb', counts, data })));
  const sha = crypto.createHash('sha256').update(compressed).digest('hex');
  await fs.writeFile(path.join(dir, fileName), compressed);
  await fs.writeFile(path.join(dir, `${fileName}.sha256`), `${sha}  ${fileName}\n`);

  try {
    const verified = await systemService.verifyBackup(fileName, { backupDir: dir });
    assert.equal(verified.ok, true);
    assert.equal(verified.checksumVerified, true);
    assert.equal(verified.counts.products, 1);
    const listed = await systemService.listBackups({ backupDir: dir });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].fileName, fileName);
    await assert.rejects(() => systemService.verifyBackup('../escape.json.gz', { backupDir: dir }), /không hợp lệ/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('backup verifier accepts pre-dashboard backups without salesTargets', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-backup-legacy-dashboard-'));
  const fileName = 'backup-2026-06-14T12-00-00-000Z.json.gz';
  const legacyKeys = APP_COLLECTION_KEYS.filter((key) => key !== 'salesTargets');
  const data = Object.fromEntries(legacyKeys.map((key) => [key, []]));
  const counts = Object.fromEntries(legacyKeys.map((key) => [key, 0]));
  const compressed = await gzip(Buffer.from(JSON.stringify({
    format: 'mk-pro-backup-v2',
    createdAt: '2026-06-14T12:00:00.000Z',
    source: 'mongodb',
    counts,
    data
  })));
  await fs.writeFile(path.join(dir, fileName), compressed);

  try {
    const verified = await systemService.verifyBackup(fileName, { backupDir: dir });
    assert.equal(verified.ok, true);
    assert.deepEqual(verified.legacyMissingCollections, ['salesTargets']);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
