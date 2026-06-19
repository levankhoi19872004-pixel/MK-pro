'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { registerDefaultOutboxHandlers } = require('../src/services/outbox/registerDefaultHandlers');
const { drain } = require('../src/jobs/outboxJob');

async function main() {
  registerDefaultOutboxHandlers();
  await connectDB();
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 100;
  console.log(await drain({ limit }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
