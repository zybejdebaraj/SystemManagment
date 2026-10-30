(() => {
  const search = document.getElementById('overviewSearch');
  const attention = document.getElementById('attentionFilter');
  const count = document.getElementById('overviewCount');
  const empty = document.getElementById('noMatchingProducts');
  const rows = document.querySelectorAll('[data-product-row]');
  let needsAttention = false;
  function apply() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      row.hidden = !(row.textContent.toLowerCase().includes(query) && (!needsAttention || Number(row.dataset.stock) < 10));
      if (!row.hidden) visible++;
    }
    attention.setAttribute('aria-pressed', String(needsAttention));
    count.textContent = `${visible} of ${count.dataset.total} products`;
    empty.hidden = visible > 0 || rows.length === 0;
  }
  search.addEventListener('input', apply);
  attention.addEventListener('click', () => { needsAttention = !needsAttention; apply(); });
})();
