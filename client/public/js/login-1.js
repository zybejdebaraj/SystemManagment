document.getElementById('loginForm').addEventListener('submit', function(event) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    let isValid = true;

    // Reset previous states
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');

    if (!emailInput.value.trim()) {
      emailInput.classList.add('is-invalid');
      isValid = false;
    }

    if (!passwordInput.value.trim()) {
      passwordInput.classList.add('is-invalid');
      isValid = false;
    }

    if (!isValid) {
      event.preventDefault(); // Stop form submission
    }
  });
