const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('dashboard charts read the escaped JSON data and render both series', () => {
  const charts = [];
  const data = { categoryDistribution: [{ category: '</script>test', count: 2 }], stockLevels: { good: 3, low: 2, critical: 1 } };
  const context = {
    Chart: class { constructor(canvas, options) { charts.push(options); } },
    document: {
      addEventListener(event, handler) { assert.equal(event, 'DOMContentLoaded'); handler(); },
      getElementById(id) {
        return id === 'dashboard-data' ? { textContent: JSON.stringify(data) } : { getContext: () => ({}) };
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/dashboard.js'), 'utf8'), context);
  assert.equal(charts.length, 2);
  assert.equal(charts[0].data.labels[0], '</script>test');
  assert.deepEqual(Array.from(charts[1].data.datasets[0].data), [3, 2, 1]);
});
