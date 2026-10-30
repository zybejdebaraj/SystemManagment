const express = require('express');
const path = require('node:path');
const session = require('express-session');
const flash = require('./src/middleware/flash');
const PgSession = require('connect-pg-simple')(session);
const { createPassport } = require('./src/config/passport');
const { csrfToken, verifyCsrf } = require('./src/middleware/csrf');
const { RequestError } = require('./src/utils/validation');
const auth = require('./src/middleware/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');

function createApp({ db, config, sessionStore, uploadDir = path.join(__dirname, 'uploads') }) {
  const app = express();
  const passport = createPassport(db, config.google);
  const store = sessionStore || new PgSession({ pool: db, tableName: 'user_sessions' });
  app.locals.sessionStore = store;
  app.disable('x-powered-by');
  if (config.production) app.set('trust proxy', 1);
  app.set('views', path.join(__dirname, '../client/views'));
  app.set('view engine', 'ejs');
  app.use(require('express-ejs-layouts'));
  app.set('layout', 'layouts/inventory');
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(express.static(path.join(__dirname, '../client/public')));
  app.use('/uploads', express.static(uploadDir));
  const chartBundle = path.join(path.dirname(require.resolve('chart.js', { paths: [path.join(__dirname, '../client')] })), 'chart.umd.js');
  app.get('/vendor/chart.js', (req, res) => res.sendFile(chartBundle));
  app.get('/health', async (req, res, next) => { try { await db.query('SELECT 1'); res.json({ status: 'ok', database: 'postgresql' }); } catch (error) { next(error); } });
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(session({ store, name: 'inventory.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.production, maxAge: 30 * 60 * 1000 } }));
  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(csrfToken);
  app.use((req, res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if (req.path === '/inventory/settings/upload-profile-pic' && req.is('multipart/form-data')) return next();
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).send('A form or JSON object is required');
      // Multipart bodies are checked after the bounded in-memory upload parser.
      return verifyCsrf(req, res, next);
    }
    next();
  });
  app.use((req, res, next) => {
    res.locals.user = req.user || null;
    res.locals.title = 'Inventory Management';
    res.locals.successMessage = req.flash('success')[0] || null;
    res.locals.errorMessage = req.flash('error')[0] || null;
    res.locals.googleEnabled = Boolean(config.google);
    res.locals.lowStockCount = 0;
    res.locals.jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c');
    if (req.user) req.session.cookie.maxAge = req.user.session_timeout * 60 * 1000;
    next();
  });
  app.use(authRoutes({ db, passport, google: config.google }));
  app.get('/dashboard', auth, async (req, res, next) => {
    try {
      const totals = (await db.query(`SELECT (SELECT COUNT(*)::int FROM products) AS total_products,
        (SELECT COUNT(*)::int FROM suppliers) AS total_suppliers,
        (SELECT COALESCE(SUM(stock),0)::bigint FROM products) AS total_stock,
        (SELECT COUNT(DISTINCT category)::int FROM products) AS total_categories`)).rows[0];
      const categoryDistribution = (await db.query('SELECT category,COUNT(*)::int AS count FROM products GROUP BY category ORDER BY count DESC,category LIMIT 5')).rows;
      const lowStockProducts = (await db.query('SELECT * FROM products WHERE stock < 10 ORDER BY stock,id')).rows;
      const stockLevels = (await db.query(`SELECT COUNT(*) FILTER (WHERE stock>=10)::int AS good,
        COUNT(*) FILTER (WHERE stock BETWEEN 5 AND 9)::int AS low,COUNT(*) FILTER (WHERE stock<5)::int AS critical FROM products`)).rows[0];
      res.locals.lowStockCount = lowStockProducts.length;
      res.render('inventory-dashboard', { dashboardData: { ...totals, categoryDistribution, lowStockProducts, stockLevels } });
    } catch (error) { next(error); }
  });
  app.use('/inventory', auth, async (req, res, next) => {
    try { res.locals.lowStockCount = (await db.query('SELECT COUNT(*)::int AS count FROM products WHERE stock<10')).rows[0].count; next(); }
    catch (error) { next(error); }
  }, inventoryRoutes({ db, uploadDir }));
  app.use((req, res) => res.status(404).send('Page not found'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof RequestError) return res.status(error.status).send(error.message);
    if (error.code === '23503') return res.status(400).send('The linked record does not exist or is still in use.');
    if (error.code === '23505') return res.status(409).send('This record already exists.');
    if (error.code === '22003') return res.status(400).send('The value is too large.');
    if (error.code?.startsWith('LIMIT_')) return res.status(400).send('Choose one PNG or JPEG image up to 5 MB.');
    if (error.type === 'entity.too.large') return res.status(413).send('The request is too large.');
    if (error.type === 'entity.parse.failed') return res.status(400).send('Invalid JSON body.');
    console.error('Request failed:', error.code || error.name);
    res.status(500).send('An unexpected error occurred. Please try again.');
  });
  return app;
}
module.exports = { createApp };
