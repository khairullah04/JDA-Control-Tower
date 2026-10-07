let chart = null;

export function drawScurve(canvas, scurve) {
  if (chart) { chart.destroy(); chart = null; }
  if (!scurve?.months?.length) return;
  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: scurve.months,
      datasets: [
        { label: 'Planned', data: scurve.planned, borderColor: '#8a9a97', borderDash: [4, 3], borderWidth: 2, pointRadius: 0, tension: .35 },
        { label: 'Actual', data: scurve.actual, borderColor: '#00857c', backgroundColor: 'rgba(0,133,124,.1)', borderWidth: 2.5, pointRadius: 3, pointBackgroundColor: '#00857c', fill: true, tension: .35, spanGaps: true }
      ]
    },
    options: { responsive: true, scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } } }
  });
}
