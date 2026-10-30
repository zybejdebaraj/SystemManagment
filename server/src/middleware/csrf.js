const crypto = require('node:crypto');

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}
function verifyCsrf(req, res, next) {
  const supplied = req.get('X-CSRF-Token') || req.body?._csrf;
  const expected = req.session.csrfToken;
  if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied) || typeof expected !== 'string' || supplied.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(403).send('Your form has expired. Reload the page and try again.');
  next();
}
module.exports = { csrfToken, verifyCsrf };
