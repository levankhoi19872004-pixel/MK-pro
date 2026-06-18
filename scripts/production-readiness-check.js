'use strict';

function text(value) {
  return String(value || '').trim();
}

function enabled(value) {
  return text(value).toLowerCase() === 'true';
}

function disabled(value) {
  return ['false', '0', 'off', 'no'].includes(text(value).toLowerCase());
}

function secretOk(value) {
  const valueText = text(value);
  return valueText.length >= 32 && !/(change|secret|password|example|your[-_ ]?)/i.test(valueText);
}

function evaluateProductionReadiness(env = process.env) {
  const errors = [];
  const warnings = [];
  const jwtSecret = text(env.JWT_SECRET || env.MOBILE_JWT_SECRET);
  const refreshSecret = text(env.JWT_REFRESH_SECRET || env.MOBILE_REFRESH_TOKEN_SECRET);
  const mongoUri = text(env.MONGO_URI || env.MONGODB_URI);

  if (text(env.NODE_ENV) !== 'production') warnings.push('NODE_ENV chưa đặt production');
  if (!secretOk(jwtSecret)) errors.push('JWT_SECRET phải là secret ngẫu nhiên tối thiểu 32 ký tự');
  if (!secretOk(refreshSecret)) errors.push('JWT_REFRESH_SECRET phải là secret ngẫu nhiên tối thiểu 32 ký tự');
  if (jwtSecret && refreshSecret && jwtSecret === refreshSecret) errors.push('Access token và refresh token không được dùng chung secret');
  if (!/^mongodb(\+srv)?:\/\//i.test(mongoUri)) errors.push('Thiếu MONGO_URI/MONGODB_URI hợp lệ');

  if (enabled(env.CORS_ALLOW_ALL)) errors.push('CORS_ALLOW_ALL không được bật ở production');
  if (enabled(env.CORS_ALLOW_CREDENTIALS) && !text(env.CORS_ORIGIN)) errors.push('CORS_ORIGIN phải có allowlist khi bật credentials');
  if (disabled(env.ACCESS_TOKEN_COOKIE_SECURE)) errors.push('ACCESS_TOKEN_COOKIE_SECURE không được tắt ở production');
  if (disabled(env.REFRESH_TOKEN_COOKIE_SECURE)) errors.push('REFRESH_TOKEN_COOKIE_SECURE không được tắt ở production');
  if (!text(env.PUBLIC_APP_ORIGIN)) warnings.push('Nên khai báo PUBLIC_APP_ORIGIN để kiểm tra CSRF chính xác sau reverse proxy');

  const unsafeFlags = [
    ['ALLOW_SYSTEM_RESET', 'Không được bật reset hệ thống'],
    ['ALLOW_SYSTEM_DATA_EXPORT', 'Không được bật API xuất toàn bộ dữ liệu'],
    ['ALLOW_REFRESH_TOKEN_IN_BODY', 'Không được trả refresh token trong body'],
    ['ALLOW_LEGACY_UNTYPED_TOKENS', 'Không được chấp nhận token legacy không có tokenType'],
    ['AUTO_BACKFILL_ARLEDGERS', 'Không được tự backfill AR từ journals khi production']
  ];
  for (const [key, message] of unsafeFlags) if (enabled(env[key])) errors.push(`${message} (${key})`);

  if (disabled(env.AUTO_RECONCILIATION_JOB)) errors.push('AUTO_RECONCILIATION_JOB phải bật để phát hiện lệch ledger');
  if (disabled(env.AUTO_ENSURE_MONGO_INDEXES)) warnings.push('AUTO_ENSURE_MONGO_INDEXES đang tắt; phải bảo đảm index đã được tạo bởi pipeline');
  if (!text(env.TRUST_PROXY)) warnings.push('Nên khai báo TRUST_PROXY phù hợp với Render/nginx');
  if (!text(env.BACKUP_DIR)) warnings.push('Nên khai báo BACKUP_DIR trên volume bền vững hoặc dùng Atlas PITR');

  const enterpriseModules = [
    'ENABLE_PURCHASING',
    'ENABLE_WAREHOUSE_ADVANCED',
    'ENABLE_ANALYTICS_PROJECTIONS',
    'ENABLE_MOBILE_OFFLINE_SYNC',
    'ENABLE_FIELD_OPERATIONS',
    'ENABLE_DELIVERY_PLANNING',
    'ENABLE_INTEGRATIONS'
  ];
  const enabledEnterpriseModules = enterpriseModules.filter((key) => enabled(env[key]));
  if (enabledEnterpriseModules.length && !enabled(env.ENABLE_ENTERPRISE_CORE)) {
    errors.push('ENABLE_ENTERPRISE_CORE phải bật trước các module Phase80');
  }
  if (enabledEnterpriseModules.length && !enabled(env.ENABLE_OUTBOX_WORKER)) {
    warnings.push('Nên bật ENABLE_OUTBOX_WORKER sau khi smoke test để xử lý sự kiện nền');
  }
  if (enabled(env.ENABLE_INTEGRATIONS) && !text(env.INTEGRATION_ALLOWED_HOSTS)) {
    errors.push('INTEGRATION_ALLOWED_HOSTS phải có allowlist khi bật tích hợp ngoài');
  }
  if (enabled(env.ENABLE_INTEGRATION_WORKER) && !enabled(env.ENABLE_INTEGRATIONS)) {
    errors.push('Không bật ENABLE_INTEGRATION_WORKER khi ENABLE_INTEGRATIONS=false');
  }
  if (text(env.TENANT_MODE).toLowerCase() === 'multi') {
    if (!enabled(env.TENANT_MIGRATION_CONFIRMED)) {
      errors.push('TENANT_MODE=multi yêu cầu TENANT_MIGRATION_CONFIRMED=true sau backup, backfill và audit index');
    }
    if (enabled(env.ALLOW_ADMIN_TENANT_OVERRIDE)) {
      warnings.push('ALLOW_ADMIN_TENANT_OVERRIDE chỉ nên bật trong cửa sổ migration có kiểm soát');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString()
  };
}

function main() {
  const result = evaluateProductionReadiness(process.env);
  console.log(`PRODUCTION_READINESS_${result.ok ? 'OK' : 'FAILED'}`);
  for (const warning of result.warnings) console.warn(`WARN: ${warning}`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { evaluateProductionReadiness, secretOk };
