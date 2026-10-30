document.addEventListener('DOMContentLoaded', function() {
            const dashboardData = JSON.parse(document.getElementById('dashboard-data').textContent);
            // Category Distribution Chart
            const categoryCtx = document.getElementById('categoryChart').getContext('2d');
            new Chart(categoryCtx, {
                type: 'doughnut',
                data: {
                    labels: dashboardData.categoryDistribution.map(c => c.category),
                    datasets: [{
                        data: dashboardData.categoryDistribution.map(c => c.count),
                        backgroundColor: [
                            '#4361ee',
                            '#3f37c9',
                            '#4cc9f0',
                            '#4895ef',
                            '#f72585'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            });

            // Stock Level Distribution Chart
            const stockLevelCtx = document.getElementById('stockLevelChart').getContext('2d');
            const stockLevels = {
                good: dashboardData.stockLevels.good,
                low: dashboardData.stockLevels.low,
                critical: dashboardData.stockLevels.critical
            };

            new Chart(stockLevelCtx, {
                type: 'bar',
                data: {
                    labels: ['Good', 'Low', 'Critical'],
                    datasets: [{
                        label: 'Number of Products',
                        data: [stockLevels.good, stockLevels.low, stockLevels.critical],
                        backgroundColor: [
                            '#28a745',
                            '#ffc107',
                            '#dc3545'
                        ],
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                display: false
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        });
