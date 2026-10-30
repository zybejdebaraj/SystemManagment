class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !value.includes('\0');
const email = value => text(value, 255) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const password = value => typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value) <= 72;
const id = value => ['string','number'].includes(typeof value) && /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const integer = (value, min = 0) => ['string','number'].includes(typeof value) && String(value).trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= 2147483647;
function requireId(value) { if (!id(value)) throw new RequestError(400, 'Invalid record ID'); return Number(value); }
function product(body) {
  const { name, description = '', price, stock, category, supplier_id } = body;
  if (!text(name, 255) || typeof description !== 'string' || description.length > 5000 || description.includes('\0')
    || !text(category, 50) || !['number','string'].includes(typeof price) || !/^\d+(?:\.\d{1,2})?$/.test(String(price))
    || Number(price) > 99999999.99 || !integer(stock)) throw new RequestError(400, 'Enter a product name, category, non-negative price (up to 2 decimals), and whole stock quantity');
  if (supplier_id !== undefined && supplier_id !== '' && supplier_id !== null && !id(supplier_id)) throw new RequestError(400, 'Choose a valid supplier');
  return [name.trim(), description.trim(), String(price), Number(stock), category.trim(), supplier_id ? Number(supplier_id) : null];
}
function supplier(body) {
  if (!text(body.name, 255) || !text(body.contact, 255) || !email(body.email) || !text(body.address, 5000)) throw new RequestError(400, 'Enter a supplier name, contact, valid email, and address');
  return [body.name.trim(), body.contact.trim(), body.email.trim().toLowerCase(), body.address.trim()];
}
module.exports = { RequestError, text, email, password, id, integer, requireId, product, supplier };
