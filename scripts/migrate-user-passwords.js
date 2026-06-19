'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const { isBcryptHash } = require('../src/security/passwordPolicy');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');

  const dryRun = process.argv.includes('--dry-run');

  await mongoose.connect(uri);

  const users = await User.find({}).lean();
  let migrated = 0;
  let skipped = 0;
  let invalid = 0;

  for (const user of users) {
    const raw = String(user.password || '').trim();

    if (!raw) {
      invalid += 1;
      console.log(`[INVALID] ${user.username || user.staffCode || user._id}: missing password`);
      continue;
    }

    if (isBcryptHash(raw)) {
      skipped += 1;
      continue;
    }

    const hash = bcrypt.hashSync(raw, BCRYPT_ROUNDS);
    migrated += 1;

    console.log(`[MIGRATE] ${user.username || user.staffCode || user._id}`);

    if (!dryRun) {
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            password: hash,
            passwordMigratedAt: new Date(),
            passwordPolicyVersion: 2
          },
          $unset: {
            pass: '',
            pin: ''
          }
        }
      );
    }
  }

  console.log({ dryRun, migrated, skipped, invalid });

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
