// Auto-dismiss alerts after 5 seconds
    document.addEventListener('DOMContentLoaded', function() {
        const successAlert = document.getElementById('successAlert');
        const errorAlert = document.getElementById('errorAlert');

        if (successAlert) {
            setTimeout(() => {
                const bsAlert = new bootstrap.Alert(successAlert);
                bsAlert.close();
            }, 5000);
        }

        if (errorAlert) {
            setTimeout(() => {
                const bsAlert = new bootstrap.Alert(errorAlert);
                bsAlert.close();
            }, 5000);
        }
    });
