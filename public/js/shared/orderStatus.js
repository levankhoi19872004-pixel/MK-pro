(function(){
  function clean(v){return String(v||'').trim().toLowerCase();}
  function normalizeOrderStatus(o){
    const raw=clean(o&& (o.status||o.lifecycleStatus||o.deliveryStatus));
    if(['cancelled','canceled','void','deleted','removed'].includes(raw))return 'cancelled';
    if(['delivered','success','completed','done'].includes(raw)||clean(o&&o.deliveryStatus)==='delivered')return 'delivered';
    if(o&&(o.masterOrderId||o.masterOrderCode||['merged','mastered','grouped'].includes(clean(o.mergeStatus))))return 'assigned';
    return 'pending';
  }
  function normalizeMergeStatus(o){return o&&(o.masterOrderId||o.masterOrderCode||['merged','mastered','grouped'].includes(clean(o.mergeStatus)))?'merged':'unmerged';}
  function normalizeAccountingStatus(o){const raw=clean(o&&(o.accountingStatus||o.arStatus));return (o&&o.accountingConfirmed)||['confirmed','locked','posted'].includes(raw)?'confirmed':'pending';}
  function isInactiveOrder(o){return normalizeOrderStatus(o)==='cancelled'||Boolean(o&&(o.deletedAt||o.deleted||o.isDeleted));}
  window.OrderStatusUtil={normalizeOrderStatus,normalizeMergeStatus,normalizeAccountingStatus,isInactiveOrder};
})();
