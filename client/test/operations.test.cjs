const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const run = (name, context) => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8'), context);
function element(extra = {}) {
  return { listeners: {}, attributes: {}, value: '', textContent: '', hidden: false,
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; }, ...extra };
}
test('overview search and attention toggle combine, count matches, and expose empty results', () => {
  const controls = Object.fromEntries(['overviewSearch','attentionFilter','overviewCount','noMatchingProducts'].map(id => [id, element()]));
  controls.overviewCount.dataset = { total: '12' };
  const rows = [element({ textContent: 'Keyboard North Supplier', dataset: { stock: '10' } }), element({ textContent: 'Mouse North Supplier', dataset: { stock: '4' } }), element({ textContent: 'Cable South Supplier', dataset: { stock: '0' } })];
  run('overview.js', { document: { getElementById: id => controls[id], querySelectorAll: () => rows } });
  controls.overviewSearch.value = ' north ';
  controls.overviewSearch.listeners.input();
  assert.deepEqual(rows.map(row => row.hidden), [false, false, true]);
  controls.attentionFilter.listeners.click();
  assert.deepEqual(rows.map(row => row.hidden), [true, false, true]);
  assert.equal(controls.attentionFilter.attributes['aria-pressed'], 'true');
  assert.equal(controls.overviewCount.textContent, '1 of 12 products');
  controls.overviewSearch.value = 'missing'; controls.overviewSearch.listeners.input();
  assert.equal(controls.noMatchingProducts.hidden, false);
  controls.overviewSearch.value = ''; controls.overviewSearch.listeners.input();
  assert.deepEqual(rows.map(row => row.hidden), [true, false, false]);
  controls.attentionFilter.listeners.click();
  assert(rows.every(row => !row.hidden));
  assert.equal(controls.noMatchingProducts.hidden, true);
});
test('product details use plain text, target the selected record, and restore focus', () => {
  const controls = Object.fromEntries(['toggleNavigation','productDetails','productDetailsTitle','productDetailsDescription','productDetailsSupplier','productDetailsCategory','productDetailsPrice','productDetailsStock','restockProductId','restockQuantity','productDetailsEdit'].map(id => [id, element()]));
  const close = element();
  controls.productDetails.querySelector = () => close;
  controls.productDetails.showModal = () => { controls.productDetails.open = true; };
  controls.productDetails.close = () => { controls.productDetails.open = false; controls.productDetails.listeners.close(); };
  const document = element({ getElementById: id => controls[id], body: { classList: { toggle: () => true } } });
  run('workspace.js', { document });
  const button = element({ dataset: { productDetails: JSON.stringify({ id: 7, name: '<img src=x onerror=alert(1)>', supplier: 'North', category: 'Accessories', stock: 0, price: '$0.00' }) }, focus() { this.focused = true; } });
  document.listeners.click({ target: { closest: () => button } });
  assert.equal(controls.productDetails.open, true);
  assert.equal(controls.productDetailsTitle.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(controls.productDetailsDescription.textContent, 'No description added.');
  assert.equal(controls.productDetailsStock.textContent, '0');
  assert.equal(controls.restockProductId.value, 7);
  assert.equal(controls.productDetailsEdit.href, '/inventory/products/edit/7');
  close.listeners.click(); assert.equal(button.focused, true);
  button.dataset.productDetails = '{invalid';
  assert.doesNotThrow(() => document.listeners.click({ target: { closest: () => button } }));
  assert.equal(controls.productDetails.open, false);
  controls.toggleNavigation.listeners.click();
  assert.equal(controls.toggleNavigation.attributes['aria-expanded'], 'true');
});
