/* Công nợ chuẩn: đầu kỳ, phát sinh tăng/giảm, thu tiền, số dư theo khách/nhân viên. */
(function(){
  window.KHO_DEBT_LEDGER_UI = {
    balance(rows, customerCode){
      return (rows || []).filter(x => String(x.customerCode || '') === String(customerCode || '')).reduce((s,x)=>s+Number(x.debit||0)-Number(x.credit||0),0);
    },
    summarize(rows){
      const map = new Map();
      (rows || []).forEach(x => {
        const key = x.customerCode || '';
        if(!map.has(key)) map.set(key, { customerCode:key, customerName:x.customerName || '', debit:0, credit:0, balance:0 });
        const r = map.get(key); r.debit += Number(x.debit||0); r.credit += Number(x.credit||0); r.balance = r.debit - r.credit;
      });
      return Array.from(map.values()).sort((a,b)=>b.balance-a.balance);
    }
  };
})();
