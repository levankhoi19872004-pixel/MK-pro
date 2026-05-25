const { createCashTransaction } = require('../models/cashModel');

function ensure(data){
  if(!data.cashLedger) data.cashLedger = [];
  return data;
}

function addCash(data, input){
  ensure(data);
  const tx = createCashTransaction(input);
  data.cashLedger.push(tx);
  return tx;
}

function listCash(data){
  ensure(data);
  return data.cashLedger;
}

function getBalance(data){
  ensure(data);
  let balance = 0;
  data.cashLedger.forEach(tx=>{
    if(tx.type === 'IN') balance += tx.amount;
    else balance -= tx.amount;
  });
  return balance;
}

module.exports = {
  addCash,
  listCash,
  getBalance
};