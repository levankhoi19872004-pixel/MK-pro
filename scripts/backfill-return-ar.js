'use strict';
const ReturnOrder=require('../src/models/ReturnOrder');
const { postReturnOrderArIfNeeded }=require('../src/services/returnOrderService');
(async()=>{
 const rows=await ReturnOrder.find({ arPosted:{ $ne:true }});
 for(const row of rows){ await postReturnOrderArIfNeeded(row); }
 console.log('DONE',rows.length);
 process.exit(0);
})();
