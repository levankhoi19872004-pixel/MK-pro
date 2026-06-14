'use strict';

const counters = new Map();

function retiredRoute(name, options = {}) {
  const routeName = String(name || 'retired-route');
  const replacement = String(options.replacement || '').trim();
  return (req, res) => {
    const current = counters.get(routeName) || 0;
    counters.set(routeName, current + 1);
    console.warn('[RETIRED_ROUTE_HIT]', {
      route: routeName,
      method: req.method,
      path: req.originalUrl || req.url,
      replacement,
      count: current + 1
    });
    return res.status(410).json({
      ok: false,
      code: 'ROUTE_RETIRED',
      message: options.message || 'API này đã ngừng hoạt động',
      replacement: replacement || undefined
    });
  };
}

function getRetiredRouteMetrics() {
  return Object.fromEntries(counters.entries());
}

module.exports = { retiredRoute, getRetiredRouteMetrics };
