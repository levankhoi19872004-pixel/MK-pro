'use strict';

function createFeatureDisabledResponse(featureName) {
  return {
    ok: false,
    success: false,
    code: 'FEATURE_DISABLED',
    message: `Tính năng ${featureName || 'này'} chưa được bật`
  };
}

function createFeatureDisabledHandler(featureName) {
  return function featureDisabledHandler(req, res) {
    return res.status(404).json(createFeatureDisabledResponse(featureName));
  };
}

function requireFeature(flagGetter, featureName) {
  const disabledHandler = createFeatureDisabledHandler(featureName);
  return function featureFlagGuard(req, res, next) {
    if (typeof flagGetter === 'function' && flagGetter()) return next();
    return disabledHandler(req, res, next);
  };
}

module.exports = {
  createFeatureDisabledResponse,
  createFeatureDisabledHandler,
  requireFeature
};
