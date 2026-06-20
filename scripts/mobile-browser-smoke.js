'use strict';

/**
 * Real Chromium smoke test for the mobile sales UI.
 * Uses only a local static server and mock read APIs. It never connects to MongoDB
 * or production and does not claim to replace testing on a physical Android device.
 */

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const VIEWPORTS = [320, 360, 390, 412];

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function mockApi(req, res, pathname) {
  if (pathname === '/api/mobile/runtime-config') {
    return json(res, 200, {
      ok: true,
      success: true,
      config: {
        onlineFirst: true,
        offlineQueueEnabled: false,
        legacySyncDrainEnabled: true,
        clientTelemetryEnabled: false,
        clientTelemetrySampleRate: 0,
        clientTelemetryBatchSize: 20,
        clientTelemetryFlushMs: 60000,
        apiTimeoutMs: 15000,
        commandTimeoutMs: 30000
      }
    });
  }
  if (pathname === '/api/mobile/telemetry') return json(res, 202, { ok: true, accepted: 1 });
  if (pathname === '/api/mobile/customers' || pathname === '/api/mobile/catalog/customers') {
    return json(res, 200, {
      ok: true,
      items: [{
        id: 'C001', code: '000001', customerCode: '000001', name: 'Cửa hàng Kiểm thử Mobile',
        phone: '0900000001', address: 'Số 1 đường Kiểm thử', currentDebt: 1250000, monthlySales: 5300000
      }],
      pagination: { page: 1, limit: 40, totalRows: 1, totalPages: 1, hasMore: false }
    });
  }
  if (pathname === '/api/mobile/product-groups' || pathname === '/api/mobile/catalog/product-groups') {
    return json(res, 200, { ok: true, items: ['Chăm sóc gia đình'] });
  }
  if (pathname === '/api/mobile/products' || pathname === '/api/mobile/catalog/products') {
    return json(res, 200, {
      ok: true,
      items: [{
        id: 'P001', code: '000101', productCode: '000101', name: 'Sản phẩm kiểm thử',
        baseUnit: 'Gói', conversionRate: 24, salePrice: 10000, availableQty: 240, maxOrderQty: 240
      }],
      pagination: { page: 1, limit: 50, totalRows: 1, totalPages: 1, hasMore: false }
    });
  }
  if (pathname === '/api/mobile/sales/orders') {
    return json(res, 200, {
      ok: true,
      items: [],
      totals: { totalOrders: 0, totalRevenue: 0, totalPaid: 0, totalDebt: 0 },
      pagination: { page: 1, limit: 30, totalRows: 0, totalPages: 0, hasMore: false }
    });
  }
  if (pathname === '/api/mobile/debts') {
    return json(res, 200, {
      ok: true,
      items: [],
      totals: { totalDebt: 0, customerCount: 0, pendingAmount: 0 },
      pagination: { page: 1, limit: 30, totalRows: 0, totalPages: 0, hasMore: false }
    });
  }
  if (pathname === '/api/promotions/calculate') return json(res, 200, { ok: true, items: [], totalAmount: 0 });
  if (pathname === '/api/auth/logout') return json(res, 200, { ok: true });
  return false;
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

function instrumentSalesHtml(source) {
  const identityScript = `<script>localStorage.setItem('v43_mobile_user', JSON.stringify({id:'U1',username:'nvbh01',name:'NVBH Kiểm thử',role:'sales',salesStaffCode:'NV01',salesStaffName:'NVBH Kiểm thử'}));</script>`;
  const auditScript = `<script>
  (() => {
    const started = Date.now();
    const collect = () => {
      const customerCards = document.querySelectorAll('.customer-card').length;
      if (!customerCards && Date.now() - started < 4500) return setTimeout(collect, 100);
      const nav = document.querySelector('.mobile-bottom-nav');
      const buttons = [...document.querySelectorAll('button')].filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden' && !node.hidden;
      });
      const undersized = buttons.filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.height < 40;
      }).map((node) => ({ id: node.id, text: node.textContent.trim().slice(0, 40), height: Math.round(node.getBoundingClientRect().height) }));
      document.querySelector('[data-tab="orderTab"]')?.click();
      setTimeout(() => {
        const metrics = {
          title: document.title,
          width: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          navVisible: !!nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height >= 44,
          navButtons: nav ? nav.querySelectorAll('button').length : 0,
          customerCards,
          networkText: document.getElementById('networkStatus')?.textContent || '',
          orderTabActive: document.getElementById('orderTab')?.classList.contains('active') || false,
          undersized
        };
        document.documentElement.dataset.mobileAuditResult = btoa(unescape(encodeURIComponent(JSON.stringify(metrics))));
      }, 100);
    };
    setTimeout(collect, 100);
  })();
  </script>`;
  return source
    .replace('<body>', `<body>${identityScript}`)
    .replace('</body>', `${auditScript}</body>`);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      if (mockApi(req, res, url.pathname) !== false) return;
      return json(res, 404, { ok: false, message: 'Mock API not found' });
    }

    const requested = url.pathname === '/' ? '/mobile/sales.html' : url.pathname;
    const relative = decodeURIComponent(requested).replace(/^\/+/, '');
    const absolute = path.resolve(PUBLIC_ROOT, relative);
    if (!absolute.startsWith(`${PUBLIC_ROOT}${path.sep}`) && absolute !== PUBLIC_ROOT) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(absolute, (error, data) => {
      if (error) { res.writeHead(404); res.end('Not found'); return; }
      const body = relative === 'mobile/sales.html' ? Buffer.from(instrumentSalesHtml(data.toString('utf8'))) : data;
      res.writeHead(200, { 'Content-Type': contentType(absolute), 'Cache-Control': 'no-store' });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      origin: `http://127.0.0.1:${server.address().port}`
    }));
  });
}

function runChromium(binary, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const terminate = () => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`Chromium smoke timeout: ${stderr.slice(-600)}`));
      if (code !== 0) return reject(new Error(`Chromium exited ${code}: ${stderr.slice(-1000)}`));
      resolve(stdout);
    });
  });
}

function decodeAuditResult(html) {
  const match = String(html).match(/data-mobile-audit-result="([A-Za-z0-9+/=]+)"/);
  if (!match) throw new Error('Chromium DOM không chứa mobile audit result');
  return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
}

function validateMetrics(metrics, width) {
  if (metrics.documentWidth > width + 1 || metrics.bodyWidth > width + 1) {
    throw new Error(`Viewport ${width}: horizontal overflow document=${metrics.documentWidth}, body=${metrics.bodyWidth}`);
  }
  if (!metrics.navVisible || metrics.navButtons !== 4) throw new Error(`Viewport ${width}: bottom navigation invalid`);
  if (metrics.customerCards !== 1) throw new Error(`Viewport ${width}: customer list did not render`);
  if (!metrics.orderTabActive) throw new Error(`Viewport ${width}: order tab cannot be activated`);
  if (metrics.undersized.length) throw new Error(`Viewport ${width}: undersized visible buttons ${JSON.stringify(metrics.undersized)}`);
}


async function removeDirectoryEventually(directory) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code) || attempt === 7) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function main() {
  const binary = process.env.CHROMIUM_BIN || ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(fs.existsSync);
  if (!binary) {
    const message = 'Chromium not found; browser smoke skipped.';
    if (process.env.MOBILE_E2E_REQUIRED === '1') throw new Error(message);
    console.log(JSON.stringify({ skipped: true, reason: message }, null, 2));
    return;
  }

  const { server, origin } = await startServer();
  const results = [];
  try {
    for (const width of VIEWPORTS) {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `mkpro-mobile-${width}-`));
      try {
        let html;
        try {
          html = await runChromium(binary, [
            '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
            '--disable-background-networking', '--disable-component-update', '--no-first-run',
            `--user-data-dir=${userDataDir}`, `--window-size=${width},800`,
            '--virtual-time-budget=7000', '--dump-dom', `${origin}/mobile/sales.html`
          ], Number(process.env.MOBILE_BROWSER_SMOKE_TIMEOUT_MS || 10000));
        } catch (error) {
          if (process.env.MOBILE_E2E_REQUIRED === '1') throw error;
          console.log(JSON.stringify({
            skipped: true,
            browser: 'Chromium',
            productionData: false,
            androidDevice: false,
            reason: `Chromium execution unavailable in this environment: ${error.message}`
          }, null, 2));
          return;
        }
        const metrics = decodeAuditResult(html);
        validateMetrics(metrics, width);
        results.push(metrics);
      } finally {
        await removeDirectoryEventually(userDataDir);
      }
    }
    console.log(JSON.stringify({ ok: true, browser: 'Chromium', productionData: false, androidDevice: false, results }, null, 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (require.main === module) main().catch((error) => {
  console.error('[mobile-browser-smoke]', error.stack || error.message || error);
  process.exitCode = 1;
});

module.exports = { VIEWPORTS, mockApi, contentType, instrumentSalesHtml, decodeAuditResult, validateMetrics };
