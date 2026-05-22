Cau truc da chia nho server.js:

server.js
- File khoi dong server, nap middleware, nap routes.

config/cors.js
- Cau hinh CORS cho Netlify, localhost, Render.

config/db.js
- Ket noi PostgreSQL, init DB, doc/ghi du lieu, memory fallback khi thieu DATABASE_URL.

data/defaultData.js
- Cau truc du lieu mac dinh va normalizeData.

data/defaultUsers.js
- Tai khoan mac dinh.

utils/text.js
- Ham xu ly text, so sanh ma.

utils/accounts.js
- Tao/sync tai khoan tu nhan vien ban hang va giao hang.

services/orderDebtService.js
- rebuild masterOrders, tinh cong no, trang thai cong no.

services/paymentService.js
- Tao payment tu don va lay nguoi thu.

middleware/auth.js
- Kiem tra JWT token.

routes/healthRoutes.js
- GET /, GET /api, GET /api/health.

routes/authRoutes.js
- POST /api/login, POST /api/logout.

routes/dataRoutes.js
- GET /api/data, POST /api/data.

routes/paymentRoutes.js
- POST /api/pay-order.

routes/reportRoutes.js
- GET /api/debt-report.

Render:
- Start command: npm start hoac node server.js
- Env can co:
  DATABASE_URL=...
  JWT_SECRET=kho_pro_secret_key
