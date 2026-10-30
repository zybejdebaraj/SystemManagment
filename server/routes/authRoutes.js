const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { text, email, password } = require('../src/utils/validation');

module.exports = ({ db, passport, google }) => {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
    message: 'Too many sign-in attempts. Try again in 15 minutes.' });
  router.get(['/', '/login'], (req, res) => res.render('login', { layout: false }));
  router.get('/signup', (req, res) => res.render('signup', { layout: false }));
  router.post('/signup', limiter, async (req, res, next) => {
    try {
      if (!text(req.body.name, 255) || !email(req.body.email) || !password(req.body.password)) return res.status(400).render('signup', { layout: false, errorMessage: 'Enter your name, a valid email, and a password of at least 8 characters (up to 72 bytes).' });
      const hash = await bcrypt.hash(req.body.password, 12);
      const user = (await db.query('INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING id,name,email', [req.body.name.trim(), req.body.email.trim().toLowerCase(), hash])).rows[0];
      req.login(user, error => error ? next(error) : req.session.save(error => error ? next(error) : res.redirect('/dashboard')));
    } catch (error) {
      if (error.code === '23505') return res.status(409).render('signup', { layout: false, errorMessage: 'This email is already registered. Please sign in.' });
      next(error);
    }
  });
  router.post('/login', limiter, (req, res, next) => {
    if (!email(req.body.email) || typeof req.body.password !== 'string' || Buffer.byteLength(req.body.password) > 72) return res.status(400).render('login', { layout: false, errorMessage: 'Enter a valid email and password.' });
    passport.authenticate('local', (error, user) => {
      if (error) return next(error);
      if (!user) return res.status(401).render('login', { layout: false, errorMessage: 'Invalid email or password.' });
      req.login(user, error => error ? next(error) : req.session.save(error => error ? next(error) : res.redirect('/dashboard')));
    })(req, res, next);
  });
  if (google) {
    router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], state: true }));
    router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res, next) => {
      req.session.save(error => error ? next(error) : res.redirect('/dashboard'));
    });
  } else router.get(['/auth/google', '/auth/google/callback'], (req, res) => res.status(503).render('login', { layout: false, errorMessage: 'Google sign-in is not configured. Please use email and password.' }));
  router.post('/logout', (req, res, next) => {
    req.logout(error => {
      if (error) return next(error);
      req.session.destroy(error => { if (error) return next(error); res.clearCookie('inventory.sid'); res.redirect('/'); });
    });
  });
  return router;
};
