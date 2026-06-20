'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { runLoop, stop } = require('../src/jobs/backgroundJobWorker');

async function shutdown(code = 0) {
  await stop();
  if (mongoose.connection.readyState) await mongoose.disconnect().catch(() => {});
  process.exit(code);
}
async function main() {
  await connectDB();
  await runLoop({ once: process.argv.includes('--once') });
  await shutdown(0);
}
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
void main().catch((error) => { console.error('[BACKGROUND_WORKER_FATAL]', error); void shutdown(1); });
