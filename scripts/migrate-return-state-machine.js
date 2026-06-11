'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ReturnOrder = require('../src/models/ReturnOrder');
const ReturnStateMachine = require('../src/domain/lifecycle/ReturnStateMachine');

async function main() {
  await connectDB();

  const rows = await ReturnOrder.find({}).lean();
  let updated = 0;

  for (const row of rows) {
    const state = ReturnStateMachine.getReturnState(row);
    const patch = ReturnStateMachine.patchForState(row, state);

    await ReturnOrder.updateOne(
      { _id: row._id },
      {
        $set: {
          ...patch,
          returnState: state,
          stateChangedAt: row.stateChangedAt || row.updatedAt || row.createdAt || new Date().toISOString()
        }
      }
    );

    updated += 1;
  }

  console.log(JSON.stringify({ ok: true, updated }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
