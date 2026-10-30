const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function page() {
  const controls = Object.fromEntries(['searchInput','categoryFilter','stockFilter','resetFilters','productName','deleteForm','deleteModal'].map(id => [id, {
    value: '', listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; },
  }]));
  const rows = [
    { textContent: 'Travel laptop', dataset: { category: 'laptops', stock: '10' }, hidden: false },
    { textContent: 'Travel phone', dataset: { category: 'smartphones', stock: '4' }, hidden: false },
    { textContent: 'Office laptop', dataset: { category: 'laptops', stock: '0' }, hidden: false },
  ];
  const context = { window: {}, bootstrap: { Modal: class { show() {} } }, document: {
    getElementById: id => controls[id], querySelectorAll: () => rows,
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/products.js'), 'utf8'), context);
  return { controls, rows, context };
}

test('search, category, and stock filters apply together', () => {
  const { controls, rows } = page();
  controls.categoryFilter.value = 'laptops'; controls.categoryFilter.listeners.change();
  controls.searchInput.value = 'Travel'; controls.searchInput.listeners.input();
  assert.deepEqual(rows.map(row => row.hidden), [false, true, true]);
  controls.stockFilter.value = 'out-of-stock'; controls.stockFilter.listeners.change();
  assert(rows.every(row => row.hidden));
});

test('stock values match filter options and ten units is in stock', () => {
  const { controls, rows } = page();
  for (const [value, expected] of [['in-stock', [false,true,true]], ['low-stock', [true,false,true]], ['out-of-stock', [true,true,false]]]) {
    controls.stockFilter.value = value; controls.stockFilter.listeners.change();
    assert.deepEqual(rows.map(row => row.hidden), expected);
  }
});

test('reset clears all filters and restores every product', () => {
  const { controls, rows } = page();
  controls.searchInput.value = 'missing'; controls.searchInput.listeners.input();
  controls.resetFilters.listeners.click();
  assert(rows.every(row => !row.hidden));
  assert.equal(controls.searchInput.value, '');
});

test('delete labels remain plain text and target the selected product', () => {
  const { context, controls } = page();
  context.window.confirmDelete(7, "<img src=x onerror=alert(1)>'");
  assert.equal(controls.productName.textContent, "<img src=x onerror=alert(1)>'");
  assert.equal(controls.deleteForm.action, '/inventory/products/delete/7');
});
