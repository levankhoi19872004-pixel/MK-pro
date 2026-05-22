const defaultUsers = require('../data/defaultUsers');
const { accountUsernameFromCode, normText, sameCode } = require('./text');

function staffCode(item, index) {
  return item.code || item.ma || item.staffCode || ('NV' + String(index + 1).padStart(3, '0'));
}

function staffName(item) {
  return item.name || item.ten || '';
}

function deliveryCode(item, index) {
  return item.code || item.ma || item.deliveryCode || ('GH' + String(index + 1).padStart(3, '0'));
}

function deliveryName(item) {
  return item.name || item.ten || '';
}

function normalizeLoginUser(user) {
  const role = String(user.role || 'sales').toLowerCase();
  const code = String(user.code || user.staffCode || user.deliveryCode || '').trim();

  return {
    username: String(user.username || accountUsernameFromCode(code)).trim(),
    password: String(user.password || '123456').trim() || '123456',
    role,
    name: String(user.name || '').trim(),
    code,
    staffCode: role === 'sales' || role === 'staff' ? String(user.staffCode || code).trim() : '',
    deliveryCode: role === 'delivery' ? String(user.deliveryCode || code).trim() : '',
    phone: String(user.phone || user.sdt || '').trim(),
    active: user.active !== false
  };
}

function buildLoginUsers(data) {
  const map = new Map();

  function add(user) {
    const fixed = normalizeLoginUser(user);
    if (!fixed.username || !fixed.active) return;
    map.set(normText(fixed.username), fixed);
  }

  defaultUsers.forEach(add);
  (data.users || []).forEach(add);

  (data.staff || []).forEach((item, index) => {
    const code = staffCode(item, index);
    add({
      username: item.username || accountUsernameFromCode(code),
      password: item.password || '123456',
      role: item.role || 'sales',
      name: staffName(item),
      code,
      staffCode: code,
      phone: item.phone || item.sdt || '',
      active: item.active !== false
    });
  });

  (data.deliveryStaff || []).forEach((item, index) => {
    const code = deliveryCode(item, index);
    add({
      username: item.username || accountUsernameFromCode(code),
      password: item.password || '123456',
      role: item.role || 'delivery',
      name: deliveryName(item),
      code,
      deliveryCode: code,
      phone: item.phone || item.sdt || '',
      active: item.active !== false
    });
  });

  return Array.from(map.values());
}

function syncAccountsToStaff(data) {
  data.users = Array.isArray(data.users) ? data.users : [];
  data.staff = Array.isArray(data.staff) ? data.staff : [];
  data.deliveryStaff = Array.isArray(data.deliveryStaff) ? data.deliveryStaff : [];

  data.users = data.users
    .map(user => normalizeLoginUser(user))
    .filter(user => user.username);

  data.users.forEach(user => {
    const role = String(user.role || '').toLowerCase();
    const code = String(user.code || user.staffCode || user.deliveryCode || user.username || '').trim();

    if (!code) return;

    if (role === 'sales' || role === 'staff') {
      const found = data.staff.find(item => sameCode(item.code || item.ma || item.staffCode, code));

      if (found) {
        found.code = found.code || found.ma || found.staffCode || code;
        found.staffCode = found.staffCode || found.code || code;
        found.name = found.name || found.ten || user.name || '';
        found.phone = found.phone || found.sdt || user.phone || '';
        found.username = found.username || user.username;
        found.password = found.password || user.password || '123456';
        found.role = found.role || 'sales';
        if (found.active === undefined) found.active = true;
      } else {
        data.staff.push({
          code,
          staffCode: code,
          name: user.name || '',
          phone: user.phone || '',
          username: user.username || accountUsernameFromCode(code),
          password: user.password || '123456',
          role: 'sales',
          active: true
        });
      }
    }

    if (role === 'delivery') {
      const found = data.deliveryStaff.find(item => sameCode(item.code || item.ma || item.deliveryCode, code));

      if (found) {
        found.code = found.code || found.ma || found.deliveryCode || code;
        found.deliveryCode = found.deliveryCode || found.code || code;
        found.name = found.name || found.ten || user.name || '';
        found.phone = found.phone || found.sdt || user.phone || '';
        found.username = found.username || user.username;
        found.password = found.password || user.password || '123456';
        found.role = found.role || 'delivery';
        if (found.active === undefined) found.active = true;
      } else {
        data.deliveryStaff.push({
          code,
          deliveryCode: code,
          name: user.name || '',
          phone: user.phone || '',
          username: user.username || accountUsernameFromCode(code),
          password: user.password || '123456',
          role: 'delivery',
          active: true
        });
      }
    }
  });

  data.staff.forEach((item, index) => {
    const code = String(staffCode(item, index)).trim();
    if (!code) return;

    const exists = data.users.some(user =>
      sameCode(user.username, item.username || accountUsernameFromCode(code)) ||
      sameCode(user.code || user.staffCode, code)
    );

    if (!exists) {
      data.users.push(normalizeLoginUser({
        username: item.username || accountUsernameFromCode(code),
        password: item.password || '123456',
        role: item.role || 'sales',
        name: staffName(item),
        code,
        staffCode: code,
        phone: item.phone || item.sdt || '',
        active: item.active !== false
      }));
    }
  });

  data.deliveryStaff.forEach((item, index) => {
    const code = String(deliveryCode(item, index)).trim();
    if (!code) return;

    const exists = data.users.some(user =>
      sameCode(user.username, item.username || accountUsernameFromCode(code)) ||
      sameCode(user.code || user.deliveryCode, code)
    );

    if (!exists) {
      data.users.push(normalizeLoginUser({
        username: item.username || accountUsernameFromCode(code),
        password: item.password || '123456',
        role: item.role || 'delivery',
        name: deliveryName(item),
        code,
        deliveryCode: code,
        phone: item.phone || item.sdt || '',
        active: item.active !== false
      }));
    }
  });

  const uniqueUsers = new Map();

  data.users.forEach(user => {
    const fixed = normalizeLoginUser(user);
    if (!fixed.username) return;
    uniqueUsers.set(normText(fixed.username), fixed);
  });

  data.users = Array.from(uniqueUsers.values());

  return data;
}

module.exports = {
  staffCode,
  staffName,
  deliveryCode,
  deliveryName,
  normalizeLoginUser,
  buildLoginUsers,
  syncAccountsToStaff
};
