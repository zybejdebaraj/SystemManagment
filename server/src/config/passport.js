const { Passport } = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const bcrypt = require('bcryptjs');
const fields = 'id,name,email,google_id,profile_pic,theme,language,email_notifications,sms_notifications,session_timeout';

function createPassport(db, google) {
  const passport = new Passport();
  passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = (await db.query(`SELECT ${fields},password FROM users WHERE email=$1`, [email.trim().toLowerCase()])).rows[0];
      if (!user?.password || !await bcrypt.compare(password, user.password)) return done(null, false, { message: 'Invalid email or password' });
      delete user.password;
      done(null, user);
    } catch (error) { done(error); }
  }));
  if (google) passport.use(new GoogleStrategy(google, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.trim().toLowerCase();
      if (!email || profile._json?.email_verified !== true) return done(null, false, { message: 'A verified Google email is required' });
      let user = (await db.query(`SELECT ${fields} FROM users WHERE google_id=$1 OR email=$2`, [profile.id, email])).rows[0];
      if (!user) user = (await db.query(`INSERT INTO users(name,email,google_id) VALUES($1,$2,$3) RETURNING ${fields}`, [profile.displayName || email, email, profile.id])).rows[0];
      else if (!user.google_id) await db.query('UPDATE users SET google_id=$1 WHERE id=$2', [profile.id, user.id]);
      else if (user.google_id !== profile.id) return done(null, false);
      done(null, user);
    } catch (error) { done(error); }
  }));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, (await db.query(`SELECT ${fields} FROM users WHERE id=$1`, [id])).rows[0] || false); }
    catch (error) { done(error); }
  });
  return passport;
}
module.exports = { createPassport };
