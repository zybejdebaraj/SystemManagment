document.getElementById('signupForm').addEventListener('submit', function(event) {
      const nameInput = document.getElementById('name');
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      let isValid = true;

      nameInput.classList.remove('is-invalid');
      emailInput.classList.remove('is-invalid');
      passwordInput.classList.remove('is-invalid');

      if (!nameInput.value.trim()) {
        nameInput.classList.add('is-invalid');
        isValid = false;
      }

      if (!emailInput.value.trim()) {
        emailInput.classList.add('is-invalid');
        isValid = false;
      }

      if (!passwordInput.value.trim()) {
        passwordInput.classList.add('is-invalid');
        isValid = false;
      }

      if (!isValid) {
        event.preventDefault();
      }
    });
