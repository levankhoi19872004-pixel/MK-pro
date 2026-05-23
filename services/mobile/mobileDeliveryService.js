'use strict';

const { readKhoData, saveKhoData } = require('../../config/db');
function today(){return new Date().toISOString().slice(0,10);}
function num(v){return Number(v)||0;}
function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();}
function userCode(u){return String(u.maNhanVien||u.code||u.username||'').trim();}
function orderDate(o){return String(o.isoDate||o.date||o.createdAt||'').slice(0,10);}
function debt(o){return Math.max(0,num(o.total)-num(o.paid)-num(o.cashPaid)-num(o.bankPaid)-num(o.collectedAmount));}
function belongs(o, user){
  const c=norm(userCode(user));
  if(!c) return true;
  return norm(o.deliveryCode||o.driverCode||o.deliveryStaffCode||o.shipperCode)===c || norm(o.deliveryStaff||o.driver||'')===norm(user.tenNhanVien||'');
}

module.exports = {
  async getDashboard(user){
    const data=await readKhoData();
    const orders=(data.orders||[]).filter(o=>orderDate(o)===today()&&belongs(o,user));
    return {user,tongDonCanGiao:orders.length,tongTienCanThu:orders.reduce((a,o)=>a+debt(o),0),tongCongNo:(data.orders||[]).filter(o=>belongs(o,user)).reduce((a,o)=>a+debt(o),0)};
  },
  async getTodayOrders(user){
    const data=await readKhoData();
    return (data.orders||[]).filter(o=>orderDate(o)===today()&&belongs(o,user));
  },
  async getDebts(user){
    const data=await readKhoData();
    return (data.orders||[]).filter(o=>belongs(o,user)&&debt(o)>0).map(o=>({orderId:o.id,date:orderDate(o),customer:o.customer,total:num(o.total),debt:debt(o)}));
  },
  async confirmDelivery(user, body){
    const data=await readKhoData();
    const id=body.orderId||body.id;
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    if(!o) throw new Error('Không tìm thấy đơn giao');

    const returnedAmount=num(body.returnedAmount||body.returnValue);
    const displayReward=num(body.displayReward||body.tienTrungBay);

    o.deliveryStatus=body.status||'delivered';
    o.deliveredAt=new Date().toISOString();
    o.deliveryNote=body.note||o.deliveryNote||'';

    if(returnedAmount>0){
      data.returns=data.returns||[];
      data.returns.push({
        id:'RT-'+Date.now(),
        orderId:o.id,
        customerCode:o.customerCode||o.cCode||'',
        customerName:o.customer||o.customerName||'',
        amount:returnedAmount,
        date:new Date().toISOString(),
        source:'delivery-app',
        note:body.note||''
      });
      o.returnGoodsAmount=num(o.returnGoodsAmount)+returnedAmount;
      o.returnedGoodsAmount=num(o.returnedGoodsAmount)+returnedAmount;
    }

    if(displayReward>0){
      o.displayReward=num(o.displayReward)+displayReward;
      o.tienTrungBay=num(o.tienTrungBay)+displayReward;
    }

    o.debt=debt(o);
    o.status=o.debt>0?'Đã giao còn nợ':'Đã giao đủ tiền';
    await saveKhoData(data);
    return o;
  },
  async collectDebt(user, body){
    const data=await readKhoData();
    const id=body.orderId||body.id;
    const o=(data.orders||[]).find(x=>String(x.id)===String(id));
    if(!o) throw new Error('Không tìm thấy đơn thu nợ');
    const cash=num(body.cash||body.amount);
    const bank=num(body.bank);
    o.cashPaid=num(o.cashPaid)+cash;
    o.bankPaid=num(o.bankPaid)+bank;
    o.collectedBy=user.tenNhanVien||userCode(user);
    o.debt=debt(o);
    data.payments=data.payments||[];
    data.payments.push({
      id:'PT'+Date.now(),
      orderId:o.id,
      date:new Date().toISOString(),
      customerCode:o.customerCode||o.cCode||'',
      customerName:o.customer||'',
      cash,bank,total:cash+bank,amount:cash+bank,
      type:bank?'bank':'cash',
      method:bank?'Chuyển khoản':'Tiền mặt',
      note:body.note||'Thu từ app giao hàng'
    });
    await saveKhoData(data);
    return o;
  },
  async createReport(user, body){
    const data=await readKhoData();
    data.deliveryReports=data.deliveryReports||[];
    const report={
      id:body.id||'RP-'+Date.now(),
      date:body.date||new Date().toISOString(),
      deliveryCode:body.deliveryCode||userCode(user),
      deliveryName:body.deliveryName||user.tenNhanVien||userCode(user),
      cash:num(body.cash),
      bank:num(body.bank),
      debt:num(body.debt),
      returnGoods:num(body.returnGoods),
      displayReward:num(body.displayReward),
      note:body.note||''
    };
    data.deliveryReports.push(report);
    await saveKhoData(data);
    return report;
  }
};
