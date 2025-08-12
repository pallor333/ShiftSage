// Helper for timeOff tab in edit.ejs
// Modifies action attribute in 'Add Timeoff' form 
// document.getElementById('add-vaca-button').addEventListener('click', function() {
//     document.getElementById('timeOffForm').action = this.dataset.targetUrl;
// });

// document.getElementById('add-sick-button').addEventListener('click', function() {
//     document.getElementById('timeOffForm').action = this.dataset.targetUrl;
// });

document.getElementById('add-vaca-button').addEventListener('click', function(e) {
    document.getElementById('timeOffType').value = 'vacation';
    document.getElementById('timeOffForm').action = this.dataset.targetUrl;
});
document.getElementById('add-sick-button').addEventListener('click', function(e) {
    document.getElementById('timeOffType').value = 'sick';
    document.getElementById('timeOffForm').action = this.dataset.targetUrl;
});