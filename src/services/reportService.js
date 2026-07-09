'use strict';

// Legacy reportService facade kept small: load report modules only when a route calls a facade method.
// The lazy method map lives in the
// report domain to avoid eager loading large report modules at startup.
// Object.defineProperty(facade, method) is intentionally implemented in ReportServiceFacade.
module.exports = require('./reports/ReportServiceFacade');
