'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { FakeModel } = require('./helpers/phase79FakeModels');
const searchServicePath = require.resolve(path.join(__dirname, '..', 'src/services/searchService.js'));
const prev = require.cache[searchServicePath];
require.cache[searchServicePath] = {id:searchServicePath,filename:searchServicePath,loaded:true,exports:{async searchStaffs(){return[];}}};
const debtNew = require('../src/services/v2/debtNew.service');
const arReadService = require('../src/services/arLedgerRead.service');
const arPostingService = require('../src/services/arPosting.service');
const eventDeltaService = require('../src/services/accounting/CloseoutCorrectionArEventDeltaPostingService');

const order = {id:'SO-B0041181',orderId:'SO-B0041181',salesOrderId:'SO-B0041181',code:'B0041181',orderCode:'B0041181',salesOrderCode:'B0041181',customerCode:'4499499',customerName:'Đinh Mười',salesStaffCode:'33949',deliveryStaffCode:'ghth',accountingConfirmed:true,accountingStatus:'confirmed'};
function opening(){return {id:'OPEN-B0041181',code:'OPEN-B0041181',account:'AR',category:'AR-DEBT-OPEN',ledgerType:'AR-DEBT-OPEN',entryType:'normal',type:'ar-debt-open',date:'2026-08-09',sourceType:'DELIVERY_CLOSEOUT',sourceId:order.id,sourceCode:order.code,refType:'DELIVERY_CLOSEOUT',refId:'REF-OPEN',refCode:'REF-OPEN',orderId:order.id,orderCode:order.code,salesOrderId:order.id,salesOrderCode:order.code,customerCode:order.customerCode,customerName:order.customerName,debit:23800085,credit:0,amount:23800085,direction:'debit',amountField:'debit',status:'posted',active:true,reversed:false,deleted:false,isDeleted:false,accountingConfirmed:true,accountingStatus:'confirmed',createdAt:'2026-08-09T00:00:00.000Z',updatedAt:'2026-08-09T00:00:00.000Z'};}
const correction={id:'DCOC-B0041181-2',code:'DCOC-B0041181-2',correctionId:'DCOC-B0041181-2',correctionCode:'DCOC-B0041181-2',newCloseoutVersion:2,salesOrderId:order.id,salesOrderCode:order.code,orderId:order.id,orderCode:order.code,customerCode:order.customerCode,customerName:order.customerName,cashDeltaAmount:22140000,rewardDeltaAmount:1660000,createdBy:'r1p2-test',createdAt:'2026-08-09T00:10:00.000Z'};
let rows;
function install(){rows=[opening()];const model=new FakeModel(rows);const empty=new FakeModel([]);debtNew.setModelsForTest({ArLedger:model,DebtCollection:empty,OrderPaymentAllocation:empty});arReadService.setModelsForTest({ArLedger:model});arPostingService.setModelsForTest({ArLedger:model,SalesOrder:{},AuditLog:{}});}
test.afterEach(()=>{debtNew.setModelsForTest(null);arReadService.setModelsForTest(null);arPostingService.setModelsForTest(null);});
test.after(()=>{if(prev)require.cache[searchServicePath]=prev;else delete require.cache[searchServicePath];});

test('RED R1P2: B0041181 suggestion must preserve normalized zero instead of fallback raw 85', async()=>{
 install();
 await eventDeltaService.postCorrectionEventDelta({order,correction,version:{closeoutVersion:2}},{actor:'r1p2-test',now:'2026-08-09T00:10:00.000Z',zeroTolerance:1000});
 const list=await debtNew.listCustomers({customerCode:'4499499',status:'all'},{disableAggregation:true});
 const projected=list.orders.find(r=>r.orderCode==='B0041181');
 assert.ok(projected);
 assert.equal(projected.debt,0); assert.equal(projected.debtAmount,0); assert.equal(projected.remainingDebt,0);
 const sug=await debtNew.suggestions({q:'B0041181',type:'order',limit:10},{});
 const item=sug.items.find(r=>r.orderCode==='B0041181');
 assert.ok(item);
 assert.equal(item.debtAmount,0);
 assert.equal(String(item.subLabel).includes('85'),false);
});
