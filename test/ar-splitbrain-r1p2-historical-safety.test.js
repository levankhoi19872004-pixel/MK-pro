'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../scripts/audit-closeout-ar-splitbrain');
const baseCorrection={id:'DCOC-TL-1',code:'DCOC-TL-1',correctionId:'DCOC-TL-1',correctionCode:'DCOC-TL-1',orderId:'SO-TL-1',salesOrderId:'SO-TL-1',orderCode:'B-TL-1',salesOrderCode:'B-TL-1',customerCode:'C-TL',newCloseoutVersion:2};
const opening={id:'OPEN-TL',account:'AR',category:'AR-DEBT-OPEN',ledgerType:'AR-DEBT-OPEN',debit:10000,credit:0,sourceType:'DELIVERY_CLOSEOUT',orderId:'SO-TL-1',salesOrderId:'SO-TL-1',orderCode:'B-TL-1',salesOrderCode:'B-TL-1',customerCode:'C-TL',active:true,status:'posted'};
const ret={id:'RET-TL',account:'AR',category:'AR-RETURN',ledgerType:'AR-RETURN',debit:0,credit:2000,sourceType:'RETURN_ORDER',refType:'RETURN_ORDER',returnOrderId:'RET-1',refId:'RET-1',orderId:'SO-TL-1',salesOrderId:'SO-TL-1',orderCode:'B-TL-1',salesOrderCode:'B-TL-1',customerCode:'C-TL',active:true,status:'posted'};

test('RED R1P2 audit: confirmed AR-RETURN after snapshot is explained subsequent event',()=>{
 const row=audit.classifyTimeline({correction:baseCorrection,canonicalOrderRows:[opening,ret],allArRows:[opening,ret],snapshot:{ok:true,debtRaw:10000}});
 assert.equal(row.classification,'explained_by_subsequent_events');
 assert.equal(row.expectedArFromEventTimeline,8000);
 assert.equal(row.canonicalArDebt,8000);
});

test('R1P2 audit classification: unresolved snapshot is ambiguous',()=>{
 const row=audit.classifyTimeline({correction:baseCorrection,canonicalOrderRows:[opening],allArRows:[opening],snapshot:{ok:false,debtRaw:0}});
 assert.equal(row.classification,'ambiguous');
});
