'use strict';

function argvIncludes(args, flag) {
  return (args || process.argv.slice(2)).includes(flag);
}

function requireDeprecatedOverride(options = {}) {
  const args = options.args || process.argv.slice(2);
  const flag = options.flag || '--i-understand-this-script-is-deprecated';
  if (argvIncludes(args, flag)) return true;
  const scriptName = options.scriptName || 'deprecated-script';
  const replacement = options.replacement || 'Use the newer dry-run/plan/apply workflow.';
  const message = [
    `[${scriptName}] DEPRECATED_AND_BLOCKED_BY_DEFAULT`,
    `This script is retained for historical reference only and is blocked unless ${flag} is passed.`,
    replacement
  ].join('\n');
  const error = new Error(message);
  error.code = 'DEPRECATED_SCRIPT_BLOCKED';
  throw error;
}

function requireDangerousConfirmation(options = {}) {
  const args = options.args || process.argv.slice(2);
  const scriptName = options.scriptName || 'dangerous-script';
  const requiredFlags = options.requiredFlags || [];
  const missing = requiredFlags.filter((flag) => !argvIncludes(args, flag));
  if (!missing.length) return true;
  const danger = options.danger || 'This script can modify production data.';
  const replacement = options.replacement || 'Run dry-run/audit first, then rerun with explicit confirmation flags only after backup.';
  const message = [
    `[${scriptName}] DANGEROUS_OPERATION_BLOCKED`,
    danger,
    `Missing required confirmation flag(s): ${missing.join(', ')}`,
    replacement
  ].join('\n');
  const error = new Error(message);
  error.code = 'DANGEROUS_OPERATION_BLOCKED';
  throw error;
}

function requireApplyConfirmation(options = {}) {
  const args = options.args || process.argv.slice(2);
  const applyFlags = options.applyFlags || ['--apply', '--write', '--fix'];
  const isApply = applyFlags.some((flag) => argvIncludes(args, flag));
  if (!isApply) return false;
  requireDangerousConfirmation({
    ...options,
    args,
    requiredFlags: options.requiredFlags || ['--confirm-apply']
  });
  return true;
}

module.exports = {
  argvIncludes,
  requireDeprecatedOverride,
  requireDangerousConfirmation,
  requireApplyConfirmation
};
