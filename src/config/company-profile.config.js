'use strict';

const { readString } = require('./env');

const DEFAULT_COMPANY_PROFILE = Object.freeze({
  code: '3293',
  name: 'Công Ty TNHH MTV Minh Khai',
  address: 'Cầu Cánh Sẻ, Quang Bình, Kiến Xương, Thái Bình',
  phone: '',
  taxCode: ''
});

function getCompanyProfile(env = process.env) {
  return Object.freeze({
    code: readString(env, 'PRINT_COMPANY_CODE', { defaultValue: DEFAULT_COMPANY_PROFILE.code, maxLength: 64 }),
    name: readString(env, 'PRINT_COMPANY_NAME', { defaultValue: DEFAULT_COMPANY_PROFILE.name, maxLength: 240 }),
    address: readString(env, 'PRINT_COMPANY_ADDRESS', { defaultValue: DEFAULT_COMPANY_PROFILE.address, maxLength: 500 }),
    phone: readString(env, 'PRINT_COMPANY_PHONE', { defaultValue: DEFAULT_COMPANY_PROFILE.phone, maxLength: 64 }),
    taxCode: readString(env, 'PRINT_COMPANY_TAX', { defaultValue: DEFAULT_COMPANY_PROFILE.taxCode, maxLength: 64 })
  });
}

module.exports = { DEFAULT_COMPANY_PROFILE, getCompanyProfile };
