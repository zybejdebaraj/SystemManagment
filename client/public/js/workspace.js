(() => {
  const toggle = document.getElementById('toggleNavigation');
  if (toggle) toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('navigation-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  const dialog = document.getElementById('productDetails');
  if (!dialog) return;
  let returnFocus;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-product-details]');
    if (!button) return;
    let product;
    try { product = JSON.parse(button.dataset.productDetails); } catch { return; }
    if (!Number.isInteger(product.id) || product.id < 1) return;
    for (const [id, value] of Object.entries({
      productDetailsTitle: product.name, productDetailsDescription: product.description || 'No description added.',
      productDetailsSupplier: product.supplier, productDetailsCategory: product.category,
      productDetailsPrice: product.price, productDetailsStock: String(product.stock),
    })) document.getElementById(id).textContent = value;
    document.getElementById('restockProductId').value = product.id;
    document.getElementById('restockQuantity').value = 10;
    document.getElementById('productDetailsEdit').href = `/inventory/products/edit/${product.id}`;
    returnFocus = button;
    dialog.showModal();
  });
  dialog.querySelector('[data-close-details]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => returnFocus?.focus());
})();
