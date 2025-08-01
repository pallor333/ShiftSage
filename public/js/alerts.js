
// Auto-dismiss alerts after 5 seconds
document.addEventListener('DOMContentLoaded', () => {
    const alerts = document.querySelectorAll('.alert');

    alerts.forEach(alert => {
        // Initialize Bootstrap alert (important for dismiss functionality)
        const bsAlert = new bootstrap.Alert(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            bsAlert.close(); // Use Bootstrap's native close method
        }, 5000);
    });
});
