// Keep one-time messages in the existing PostgreSQL-backed session.
module.exports = () => (req, res, next) => {
  req.flash = (type, message) => {
    const messages = req.session.flash || (req.session.flash = {});
    if (message !== undefined) {
      if (!Object.hasOwn(messages, type)) messages[type] = [];
      messages[type].push(message);
      return messages[type].length;
    }
    const result = Object.hasOwn(messages, type) ? messages[type] : [];
    delete messages[type];
    return result;
  };
  next();
};
