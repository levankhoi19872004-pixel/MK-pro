'use strict';
window.addEventListener('load', function initSwaggerUi() {
  if (typeof window.SwaggerUIBundle !== 'function') return;
  window.ui = window.SwaggerUIBundle({
    url: '/api/docs/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [window.SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout'
  });
});
