function ensureLock(data) {
  if (!data.system) data.system = {};
  if (!data.system.lockDate) data.system.lockDate = null;
  return data;
}

function setLockDate(data, date) {
  ensureLock(data);
  data.system.lockDate = date;
  return data.system.lockDate;
}

function getLockDate(data) {
  ensureLock(data);
  return data.system.lockDate;
}

function checkLock(date, lockDate) {
  if (!lockDate) return true;
  return new Date(date) >= new Date(lockDate);
}

function validateBeforeWrite(docDate, lockDate) {
  if (!checkLock(docDate, lockDate)) {
    throw new Error("Dữ liệu đã bị khóa sổ, không thể sửa");
  }
}

module.exports = {
  setLockDate,
  getLockDate,
  validateBeforeWrite
};