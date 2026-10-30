const { Router } = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { transaction } = require('../src/utils/database');
const { RequestError, text, email, password, integer, requireId, product, supplier } = require('../src/utils/validation');
const { verifyCsrf } = require('../src/middleware/csrf');

const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

module.exports = ({ db, uploadDir }) => {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
    fileFilter(req, file, done) {
      if (!['image/png', 'image/jpeg'].includes(file.mimetype)) return done(new RequestError(400, 'Choose a PNG or JPEG image'));
      done(null, true);
    } });
  router.get('/', (req, res) => res.redirect('/dashboard'));
  router.get('/products', wrap(async (req, res) => {
    res.render('products/index', { title: 'Products', products: (await db.query('SELECT * FROM products ORDER BY id DESC')).rows });
  }));
  router.get('/products/add', wrap(async (req, res) => {
    res.render('products/add', { title: 'Add Product', suppliers: (await db.query('SELECT id,name FROM suppliers ORDER BY name,id')).rows });
  }));
  router.post('/products/add', wrap(async (req, res) => {
    const values = product(req.body);
    await db.query('INSERT INTO products(name,description,price,stock,category,supplier_id) VALUES($1,$2,$3,$4,$5,$6)', values);
    req.flash('success', 'Product added successfully!'); res.redirect('/inventory/products');
  }));
  router.get('/products/edit/:id', wrap(async (req, res) => {
    const item = (await db.query('SELECT * FROM products WHERE id=$1', [requireId(req.params.id)])).rows[0];
    if (!item) throw new RequestError(404, 'Product not found');
    res.render('products/edit', { title: 'Edit Product', product: item });
  }));
  router.post('/products/edit/:id', wrap(async (req, res) => {
    const values = product(req.body);
    const id = requireId(req.params.id);
    const hasSupplier = Object.hasOwn(req.body, 'supplier_id');
    const result = await db.query(`UPDATE products SET name=$1,description=$2,price=$3,stock=$4,category=$5,
      supplier_id=CASE WHEN $7::boolean THEN $6::integer ELSE supplier_id END,updated_at=NOW() WHERE id=$8 RETURNING id`, [...values, hasSupplier, id]);
    if (!result.rowCount) throw new RequestError(404, 'Product not found');
    req.flash('success', 'Product updated successfully!'); res.redirect('/inventory/products');
  }));
  router.post('/products/delete/:id', wrap(async (req, res) => {
    const result = await db.query('DELETE FROM products WHERE id=$1 RETURNING id', [requireId(req.params.id)]);
    if (!result.rowCount) throw new RequestError(404, 'Product not found');
    req.flash('success', 'Product deleted successfully!'); res.redirect('/inventory/products');
  }));
  router.get('/suppliers', wrap(async (req, res) => {
    res.render('suppliers/index', { title: 'Suppliers', suppliers: (await db.query('SELECT * FROM suppliers ORDER BY id DESC')).rows });
  }));
  router.get('/suppliers/add', (req, res) => res.render('suppliers/add', { title: 'Add Supplier' }));
  router.post('/suppliers/add', wrap(async (req, res) => {
    await db.query('INSERT INTO suppliers(name,contact,email,address) VALUES($1,$2,$3,$4)', supplier(req.body));
    req.flash('success', 'Supplier added successfully!'); res.redirect('/inventory/suppliers');
  }));
  router.get('/suppliers/edit/:id', wrap(async (req, res) => {
    const item = (await db.query('SELECT * FROM suppliers WHERE id=$1', [requireId(req.params.id)])).rows[0];
    if (!item) throw new RequestError(404, 'Supplier not found');
    res.render('suppliers/edit', { title: 'Edit Supplier', supplier: item });
  }));
  router.post('/suppliers/edit/:id', wrap(async (req, res) => {
    const result = await db.query('UPDATE suppliers SET name=$1,contact=$2,email=$3,address=$4 WHERE id=$5 RETURNING id', [...supplier(req.body), requireId(req.params.id)]);
    if (!result.rowCount) throw new RequestError(404, 'Supplier not found');
    req.flash('success', 'Supplier updated successfully!'); res.redirect('/inventory/suppliers');
  }));
  router.post('/suppliers/delete/:id', wrap(async (req, res) => {
    const result = await db.query('DELETE FROM suppliers WHERE id=$1 RETURNING id', [requireId(req.params.id)]);
    if (!result.rowCount) throw new RequestError(404, 'Supplier not found');
    req.flash('success', 'Supplier deleted successfully! Products have been kept.'); res.redirect('/inventory/suppliers');
  }));
  router.get('/restock', wrap(async (req, res) => {
    res.render('restock', { title: 'Restock', products: (await db.query('SELECT id,name FROM products ORDER BY name,id')).rows });
  }));
  router.post('/restock', wrap(async (req, res) => {
    const id = requireId(req.body.product_id);
    if (!integer(req.body.restock_quantity, 1)) throw new RequestError(400, 'Restock quantity must be a positive whole number');
    const quantity = Number(req.body.restock_quantity);
    await transaction(db, async client => {
      const result = await client.query('UPDATE products SET stock=stock+$1,updated_at=NOW() WHERE id=$2 RETURNING id', [quantity, id]);
      if (!result.rowCount) throw new RequestError(404, 'Product not found');
      await client.query('INSERT INTO restock_logs(product_id,restock_quantity,restocked_by) VALUES($1,$2,$3)', [id, quantity, req.user.id]);
    });
    req.flash('success', 'Product restocked successfully!'); res.redirect('/inventory/products');
  }));
  router.get('/reports', wrap(async (req, res) => {
    const lowStockProducts = (await db.query(`SELECT p.*,s.name AS supplier_name FROM products p
      LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.stock<10 ORDER BY p.stock,p.id`)).rows;
    const recentUpdates = (await db.query('SELECT id,name,stock,updated_at AS created_at FROM products ORDER BY updated_at DESC,id DESC LIMIT 10')).rows;
    const products = (await db.query('SELECT id,name FROM products ORDER BY name,id')).rows;
    res.render('reports/index', { title: 'Reports', dashboardData: { lowStockProducts, recentUpdates }, products });
  }));
  router.get('/sales', wrap(async (req, res) => {
    const salesList = (await db.query('SELECT id,product_id,product_name,quantity,total_price,created_at FROM sales ORDER BY created_at DESC,id DESC')).rows;
    res.render('sales/index', { title: 'Sales', salesList });
  }));
  router.get('/profile', (req, res) => res.render('profile/index', { title: 'Profile' }));
  router.get('/settings/profile', (req, res) => res.render('settings/profile', { title: 'Profile Settings' }));
  router.get('/settings/security', (req, res) => res.render('settings/security', { title: 'Security Settings' }));
  router.get('/settings/preferences', (req, res) => res.render('settings/preferences', { title: 'Preferences' }));
  router.post('/settings/update-email', wrap(async (req, res) => {
    if (!email(req.body.email)) throw new RequestError(400, 'Enter a valid email');
    await db.query('UPDATE users SET email=$1 WHERE id=$2', [req.body.email.trim().toLowerCase(), req.user.id]);
    req.flash('success', 'Email updated successfully!'); res.redirect('/inventory/settings/profile');
  }));
  router.post('/settings/update-name', wrap(async (req, res) => {
    if (!text(req.body.name, 255)) throw new RequestError(400, 'Enter a name up to 255 characters');
    await db.query('UPDATE users SET name=$1 WHERE id=$2', [req.body.name.trim(), req.user.id]);
    req.flash('success', 'Name updated successfully!'); res.redirect('/inventory/settings/profile');
  }));
  router.post(['/settings/change-password', '/settings/update-password'], wrap(async (req, res) => {
    const current = req.body['current-password'], next = req.body['new-password'];
    if (typeof current !== 'string' || Buffer.byteLength(current) > 72 || !password(next) || next !== req.body['confirm-password']) throw new RequestError(400, 'Use matching passwords of at least 8 characters (up to 72 bytes)');
    const user = (await db.query('SELECT password FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!user?.password || !await bcrypt.compare(current, user.password)) throw new RequestError(400, 'Current password is incorrect or this is a Google-only account');
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [await bcrypt.hash(next, 12), req.user.id]);
    req.flash('success', 'Password updated successfully!'); res.redirect('/inventory/settings/profile');
  }));
  router.post('/settings/update-preferences', wrap(async (req, res) => {
    if (!['light','dark'].includes(req.body.theme) || !['en','es','fr'].includes(req.body.language)) throw new RequestError(400, 'Choose a supported theme and language');
    await db.query('UPDATE users SET theme=$1,language=$2,email_notifications=$3,sms_notifications=$4 WHERE id=$5', [req.body.theme, req.body.language, req.body.email_notifications === 'on', req.body.sms_notifications === 'on', req.user.id]);
    req.flash('success', 'Preferences saved. Translation and message delivery are not enabled.'); res.redirect('/inventory/settings/preferences');
  }));
  router.post('/settings/update-session-timeout', wrap(async (req, res) => {
    const minutes = req.body['session-timeout'];
    if (!integer(minutes, 5) || Number(minutes) > 1440) throw new RequestError(400, 'Session duration must be between 5 and 1440 minutes');
    await db.query('UPDATE users SET session_timeout=$1 WHERE id=$2', [Number(minutes), req.user.id]);
    req.session.cookie.maxAge = Number(minutes) * 60 * 1000;
    req.flash('success', 'Session duration saved.'); res.redirect('/inventory/settings/security');
  }));
  router.post('/settings/upload-profile-pic', upload.single('profilePic'), verifyCsrf, wrap(async (req, res) => {
    if (!req.file) throw new RequestError(400, 'Choose a PNG or JPEG image');
    const buffer = req.file.buffer;
    const png = buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (!png && !jpeg) throw new RequestError(400, 'The file is not a PNG or JPEG image');
    const filename = `${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    try {
      await db.query('UPDATE users SET profile_pic=$1 WHERE id=$2', [`/uploads/${filename}`, req.user.id]);
    } catch (error) {
      await fs.unlink(path.join(uploadDir, filename)).catch(() => {});
      throw error;
    }
    req.flash('success', 'Profile image updated.'); res.redirect('/inventory/settings/profile');
  }));
  return router;
};
