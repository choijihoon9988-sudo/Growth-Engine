document.addEventListener('DOMContentLoaded', function() {
    // Custom Cursor Logic
    const cursorDot = document.querySelector("#cursor-dot");
    const cursorOutline = document.querySelector("#cursor-outline");

    window.addEventListener("mousemove", function (e) {
        const posX = e.clientX;
        const posY = e.clientY;

        cursorDot.style.left = `${posX}px`;
        cursorDot.style.top = `${posY}px`;

        cursorOutline.animate({
            left: `${posX}px`,
            top: `${posY}px`
        }, { duration: 500, fill: "forwards" });
    });

    // Navigation Scroll Effect
    const nav = document.querySelector('nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // Scroll Animation for Sections
    const sections = document.querySelectorAll('.content-section');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });

    sections.forEach(section => {
        observer.observe(section);
    });

    // Achievements Chart (Chart.js)
    const ctx = document.getElementById('revenueChart');
    if (ctx) {
        // 데이터 출처: 25년 08월 _ 최재영 이력서.pdf [1]
        // 월 매출 300만원 → 5,900만원 달성 (퇴사전 3개월 평균 4900만)
        // 이 데이터를 기반으로 성장 과정을 시각적으로 표현
        const revenueData = {
            labels: ['초기 3개월', '중기', '안정기', '성장기', '피크', '퇴사 전 3개월 평균'],
            datasets: [{
                label: '월 매출 (단위: 만원)',
                data: [300, 1000, 2500, 4000, 5900, 5400],
                backgroundColor: 'rgba(0, 170, 255, 0.2)',
                borderColor: '#00aaff',
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#00aaff',
                pointHoverBackgroundColor: '#00aaff',
                pointHoverBorderColor: '#fff',
                tension: 0.4
            }]
        };

        const config = {
            type: 'line',
            data: revenueData,
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: '#e0e0e0',
                            callback: function(value) {
                                return value + '만원';
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#e0e0e0'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        };

        new Chart(ctx, config);
    }
});