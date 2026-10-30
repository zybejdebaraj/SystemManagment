(() => {
  const search = document.getElementById('searchInput');
  const category = document.getElementById('categoryFilter');
  const stock = document.getElementById('stockFilter');
  const rows = document.querySelectorAll('[data-product-row]');
  const empty = document.getElementById('noMatchingProducts');

  function applyFilters() {
    const query = search.value.trim().toLowerCase();
    for (const row of rows) {
      const quantity = Number(row.dataset.stock);
      const status = quantity >= 10 ? 'in-stock' : quantity > 0 ? 'low-stock' : 'out-of-stock';
      const matches = (!query || row.textContent.toLowerCase().includes(query))
        && (!category.value || row.dataset.category === category.value)
        && (!stock.value || status === stock.value);
      row.hidden = !matches;
    }
    if (empty) empty.hidden = rows.length === 0 || [...rows].some(row => !row.hidden);
  }

  search.addEventListener('input', applyFilters);
  category.addEventListener('change', applyFilters);
  stock.addEventListener('change', applyFilters);
  document.getElementById('resetFilters').addEventListener('click', () => {
    search.value = ''; category.value = ''; stock.value = '';
    applyFilters();
  });
  window.confirmDelete = (productId, productName) => {
    document.getElementById('productName').textContent = productName;
    document.getElementById('deleteForm').action = `/inventory/products/delete/${productId}`;
    new bootstrap.Modal(document.getElementById('deleteModal')).show();
  };
})();
