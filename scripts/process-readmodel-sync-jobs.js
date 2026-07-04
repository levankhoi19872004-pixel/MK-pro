#!/usr/bin/env node
'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const readModelSyncJobService = require('../src/services/readModelSyncJob.service');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI or MONGO_URI');
  const once = process.argv.includes('--once') || true;
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50;
  await mongoose.connect(uri);
  const result = await readModelSyncJobService.drainPendingJobs({ limit, force: true, workerId: `script-${process.pid}` });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  if (!once) process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
