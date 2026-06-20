'use strict';

const { Readable } = require('stream');
const mongoose = require('mongoose');

const BUCKET_NAME = String(process.env.BACKGROUND_JOB_ARTIFACT_BUCKET || 'background_job_artifacts').trim();
const DEFAULT_TTL_MS = Math.max(60_000, Number(process.env.BACKGROUND_JOB_ARTIFACT_TTL_MS || 24 * 60 * 60 * 1000));
const IMPORT_INPUT_TTL_MS = Math.max(60_000, Number(process.env.IMPORT_JOB_INPUT_TTL_MS || 6 * 60 * 60 * 1000));

function db() {
  if (!mongoose.connection?.db) throw new Error('MongoDB chưa sẵn sàng cho artifact store');
  return mongoose.connection.db;
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(db(), { bucketName: BUCKET_NAME, chunkSizeBytes: 255 * 1024 });
}

function objectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) throw new Error('Artifact fileId không hợp lệ');
  return new mongoose.Types.ObjectId(String(value));
}

async function putBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Artifact phải là Buffer');
  const expiresAt = options.expiresAt || new Date(Date.now() + Number(options.ttlMs || DEFAULT_TTL_MS));
  const upload = bucket().openUploadStream(String(options.fileName || 'artifact.bin'), {
    contentType: String(options.contentType || 'application/octet-stream'),
    metadata: {
      ...(options.metadata || {}),
      expiresAt,
      createdAt: new Date()
    }
  });
  await new Promise((resolve, reject) => {
    upload.once('error', reject);
    upload.once('finish', resolve);
    Readable.from(buffer).pipe(upload);
  });
  return {
    fileId: String(upload.id),
    fileName: upload.filename,
    contentType: String(options.contentType || 'application/octet-stream'),
    size: buffer.length,
    expiresAt
  };
}

async function readBuffer(fileId, options = {}) {
  const maxBytes = Math.max(1, Number(options.maxBytes || 20 * 1024 * 1024));
  const chunks = [];
  let size = 0;
  const stream = bucket().openDownloadStream(objectId(fileId));
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBytes) {
      stream.destroy();
      const error = new Error(`Artifact vượt giới hạn đọc ${maxBytes} bytes`);
      error.code = 'ARTIFACT_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function openDownloadStream(fileId) {
  return bucket().openDownloadStream(objectId(fileId));
}

async function remove(fileId) {
  if (!fileId) return false;
  try {
    await bucket().delete(objectId(fileId));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || /FileNotFound/i.test(String(error?.name || error?.message || ''))) return false;
    throw error;
  }
}


async function removeByJobId(jobId) {
  const rows = await db().collection(`${BUCKET_NAME}.files`).find({ 'metadata.jobId': String(jobId || '') }, { projection: { _id: 1 } }).toArray();
  let deleted = 0;
  for (const row of rows) {
    if (await remove(row._id).catch(() => false)) deleted += 1;
  }
  return deleted;
}


async function cleanupExpired(limit = 100) {
  const now = new Date();
  const rows = await db().collection(`${BUCKET_NAME}.files`).find(
    { 'metadata.expiresAt': { $lte: now } },
    { projection: { _id: 1 }, sort: { 'metadata.expiresAt': 1 }, limit: Math.max(1, Math.min(Number(limit || 100), 1000)) }
  ).toArray();
  let deleted = 0;
  for (const row of rows) {
    if (await remove(row._id).catch(() => false)) deleted += 1;
  }
  return { deleted };
}

async function putImportInput(file = {}, metadata = {}) {
  return putBuffer(file.buffer || Buffer.alloc(0), {
    fileName: file.fileName || file.originalname || 'import.xlsx',
    contentType: file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ttlMs: IMPORT_INPUT_TTL_MS,
    metadata: { ...metadata, artifactKind: 'import_input' }
  });
}

module.exports = {
  BUCKET_NAME,
  DEFAULT_TTL_MS,
  IMPORT_INPUT_TTL_MS,
  putBuffer,
  putImportInput,
  readBuffer,
  openDownloadStream,
  remove,
  removeByJobId,
  cleanupExpired
};
