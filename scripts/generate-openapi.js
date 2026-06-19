'use strict';

/**
 * Incremental OpenAPI generator.
 *
 * Phase hiện tại: scan Express routes từ src/routes để bảo đảm docs/openapi.json
 * không thiếu path/method. Các schema/example chi tiết hiện có trong
 * docs/openapi.json được giữ nguyên. Route mới chưa có schema sẽ được sinh
 * skeleton an toàn để sau này bổ sung schema dần.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'src', 'routes');
const OPENAPI_PATH = path.join(ROOT, 'docs', 'openapi.json');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function walkJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkJsFiles(fullPath);
    if (entry.isFile() && entry.name.endsWith('.js')) return [fullPath];
    return [];
  });
}

function normalizeRoutePath(routePath) {
  let p = routePath.trim();
  if (!p || p === '/') return '';
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function joinOpenApiPath(mountPath, routePath) {
  const mount = normalizeRoutePath(mountPath);
  const route = normalizeRoutePath(routePath);
  const joined = `${mount}${route}`.replace(/\/+/g, '/');
  return joined || '/';
}

function parseTopLevelMounts() {
  const indexPath = path.join(ROUTES_DIR, 'index.js');
  const mounts = [];
  if (!fs.existsSync(indexPath)) return mounts;

  const code = fs.readFileSync(indexPath, 'utf8');
  const requireMap = new Map();

  const simpleRequireRe = /const\s+(\w+)\s*=\s*require\(['"](\.\/[^'"]+)['"]\)/g;
  for (const match of code.matchAll(simpleRequireRe)) {
    requireMap.set(match[1], path.join(ROUTES_DIR, `${match[2].replace(/^\.\//, '')}.js`));
  }

  const destructuredRequireRe = /const\s+\{([^}]+)\}\s*=\s*require\(['"](\.\/[^'"]+)['"]\)/g;
  for (const match of code.matchAll(destructuredRequireRe)) {
    const filePath = path.join(ROUTES_DIR, `${match[2].replace(/^\.\//, '')}.js`);
    match[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => requireMap.set(name, filePath));
  }

  const useRe = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  for (const match of code.matchAll(useRe)) {
    const mountPath = match[1];
    const variableName = match[2];
    const filePath = requireMap.get(variableName);
    if (filePath) mounts.push({ mountPath, filePath, source: 'src/routes/index.js' });
  }

  // Mobile modular routes are mounted by src/routes/mobile/index.js under
  // explicit sub-namespaces. Keep this map in sync with registerMobileRoutes().
  const mobileDir = path.join(ROUTES_DIR, 'mobile');
  const mobileMountByFile = new Map([
    ['index.js', '/api/mobile'],
    ['auth.routes.js', '/api/mobile/auth'],
    ['catalog.routes.js', '/api/mobile/catalog'],
    ['sales.routes.js', '/api/mobile/sales'],
    ['delivery.routes.js', '/api/mobile/delivery']
  ]);
  if (fs.existsSync(mobileDir)) {
    for (const filePath of walkJsFiles(mobileDir)) {
      const mountPath = mobileMountByFile.get(path.basename(filePath));
      if (mountPath) mounts.push({ mountPath, filePath, source: 'src/routes/mobile modular routes' });
    }
  }

  return mounts;
}

function parseRouterOperations(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const operations = [];
  const routeRe = /router\.(get|post|put|patch|delete)\s*\(\s*['`]([^'`]+)['`]/g;
  for (const match of code.matchAll(routeRe)) {
    operations.push({ method: match[1], routePath: match[2] });
  }
  return operations;
}

function tagFromPath(openApiPath) {
  const parts = openApiPath.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  const first = parts[0] || 'system';
  return first
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function operationIdFrom(method, openApiPath) {
  const clean = openApiPath
    .replace(/^\/api\//, '')
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replace(/-([a-z])/g, (_, c) => c.toUpperCase()))
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
  return `${method}${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

function isPublicOperation(method, openApiPath) {
  const publicPaths = new Set([
    '/api/docs',
    '/api/docs/openapi.json',
    '/api/health',
    '/api/system/status',
    '/api/mobile/auth/login',
    '/api/mobile/auth/refresh'
  ]);
  if (publicPaths.has(openApiPath)) return true;
  if (method === 'get' && openApiPath.startsWith('/api/print/')) return true;
  return false;
}

function skeletonOperation(method, openApiPath) {
  const status = method === 'post' ? '201' : '200';
  const tag = tagFromPath(openApiPath);
  const op = {
    tags: [tag],
    summary: `${method.toUpperCase()} ${openApiPath}`,
    operationId: operationIdFrom(method, openApiPath),
    responses: {
      [status]: {
        description: 'Success response',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ApiSuccessResponse'
            },
            example: {
              ok: true,
              success: true,
              data: {}
            }
          }
        }
      },
      400: {
        $ref: '#/components/responses/BadRequest'
      },
      500: {
        $ref: '#/components/responses/InternalServerError'
      }
    }
  };

  if (!isPublicOperation(method, openApiPath)) {
    op.security = [{ bearerAuth: [] }];
    op.responses[401] = { $ref: '#/components/responses/Unauthorized' };
  }

  return op;
}

function ensureBaseComponents(doc) {
  doc.components = doc.components || {};
  doc.components.schemas = doc.components.schemas || {};
  doc.components.responses = doc.components.responses || {};
  doc.components.securitySchemes = doc.components.securitySchemes || {};

  doc.components.securitySchemes.bearerAuth = doc.components.securitySchemes.bearerAuth || {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  };

  doc.components.schemas.ApiSuccessResponse = doc.components.schemas.ApiSuccessResponse || {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: true },
      success: { type: 'boolean', example: true },
      data: { type: 'object' },
      message: { type: 'string', example: 'OK' }
    }
  };

  doc.components.schemas.ApiErrorResponse = doc.components.schemas.ApiErrorResponse || {
    type: 'object',
    properties: {
      ok: { type: 'boolean', example: false },
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Có lỗi xảy ra' }
    }
  };

  const errorResponse = (description, message) => ({
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorResponse' },
        example: { ok: false, success: false, message }
      }
    }
  });

  doc.components.responses.BadRequest = doc.components.responses.BadRequest || errorResponse('Bad request', 'Dữ liệu không hợp lệ');
  doc.components.responses.Unauthorized = doc.components.responses.Unauthorized || errorResponse('Unauthorized', 'Cần đăng nhập');
  doc.components.responses.InternalServerError = doc.components.responses.InternalServerError || errorResponse('Internal server error', 'Lỗi hệ thống');
}

function sortObjectKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function generateOpenApi() {
  const doc = readJson(OPENAPI_PATH);
  ensureBaseComponents(doc);
  doc.paths = doc.paths || {};
  doc['x-generated-by'] = 'scripts/generate-openapi.js';
  doc['x-generation-mode'] = 'incremental-route-scan-preserve-manual-schemas';

  const mounts = parseTopLevelMounts();
  const scanned = [];
  const added = [];
  const seen = new Set();

  for (const mount of mounts) {
    if (!fs.existsSync(mount.filePath)) continue;
    for (const operation of parseRouterOperations(mount.filePath)) {
      if (!METHODS.has(operation.method)) continue;
      const openApiPath = joinOpenApiPath(mount.mountPath, operation.routePath);
      const key = `${operation.method.toUpperCase()} ${openApiPath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      scanned.push(key);
      doc.paths[openApiPath] = doc.paths[openApiPath] || {};
      if (!doc.paths[openApiPath][operation.method]) {
        doc.paths[openApiPath][operation.method] = skeletonOperation(operation.method, openApiPath);
        added.push(key);
      }
    }
  }

  doc.paths = sortObjectKeys(doc.paths);
  return { doc, scanned, added };
}

function main() {
  const { doc, scanned, added } = generateOpenApi();
  const nextContent = `${JSON.stringify(doc, null, 2)}\n`;
  const currentContent = fs.readFileSync(OPENAPI_PATH, 'utf8');

  if (checkOnly) {
    if (nextContent !== currentContent) {
      console.error('OpenAPI document is stale. Run: npm run docs:generate');
      console.error(`Scanned operations: ${scanned.length}. Missing skeleton operations: ${added.length}.`);
      process.exit(1);
    }
    console.log(`OpenAPI document is up to date. Scanned operations: ${scanned.length}.`);
    return;
  }

  writeJson(OPENAPI_PATH, doc);
  console.log('OpenAPI generated successfully.');
  console.log(`Scanned operations: ${scanned.length}`);
  console.log(`Added skeleton operations: ${added.length}`);
  if (added.length) {
    console.log('New operations:');
    for (const item of added) console.log(`- ${item}`);
  }
}

main();
