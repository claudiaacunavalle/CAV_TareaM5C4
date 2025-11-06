const parseDate = d3.timeParse('%Y-%m-%d');
const formatDate = d3.timeFormat('%Y-%m-%d');

// Desviación estándar móvil (volatilidad)
function movingStd(values, window){
  const out = new Array(values.length).fill(NaN);
  const w = Math.max(1, Math.floor(window));
  let sum=0, sumSq=0;
  for(let i=0;i<values.length;i++){
    sum += values[i]; sumSq += values[i]*values[i];
    if(i>=w){ sum -= values[i-w]; sumSq -= values[i-w]*values[i-w]; }
    const n = Math.min(w, i+1);
    const mean = sum/n;
    const varr = (sumSq/n) - mean*mean;
    out[i] = varr>0?Math.sqrt(varr):0;
  }
  return out;
}

// === FUNCIÓN PRINCIPAL ===
(async function(){
  // --- CARGA DE DATOS ---
  const data = await d3.csv('data/ExchangeRateHistorical.csv', d => ({
    date: parseDate(d.date),
    rate: +d.rate
  }));

  const clean = data.filter(d => d.date && !isNaN(d.rate))
                    .sort((a,b) => a.date - b.date);
  const rates = clean.map(d => d.rate);


  document.getElementById('count').textContent = clean.length;
  document.getElementById('mean').textContent = d3.mean(rates).toFixed(4);
  document.getElementById('median').textContent = d3.median(rates).toFixed(4);
  document.getElementById('std').textContent = d3.deviation(rates).toFixed(4);
  document.getElementById('period').textContent =
    formatDate(clean[0].date) + ' → ' + formatDate(clean[clean.length - 1].date);

  // === GRÁFICO DE TENDENCIA PRINCIPAL ===
  const margin = {top: 12, right: 18, bottom: 40, left: 60};
  const width = 800;
  const height = 300;

  const svg = d3.select('#trend-chart')
    .append('svg')
    .attr('width', '100%')
    .attr('height', 360)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime().range([0, width]);
  const y = d3.scaleLinear().range([height, 0]);

  const xAxis = svg.append('g').attr('transform', `translate(0,${height})`);
  const yAxis = svg.append('g');

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.rate));

  const path = svg.append('path')
    .attr('fill', 'none')
    .attr('stroke', 'steelblue')
    .attr('stroke-width', 1.6);

  // --- FUNCIÓN DE ACTUALIZACIÓN ---
  function update(range) {
    let filtered = clean;
    const lastDate = d3.max(clean, d => d.date);
    const cutoff = {
      '10y': d3.timeYear.offset(lastDate, -10),
      '5y': d3.timeYear.offset(lastDate, -5),
      '1y': d3.timeYear.offset(lastDate, -1),
      'all': d3.min(clean, d => d.date)
    };

    if (range !== 'all') {
      filtered = clean.filter(d => d.date >= cutoff[range]);
    }

    x.domain(d3.extent(filtered, d => d.date));
    y.domain([d3.min(filtered, d => d.rate), d3.max(filtered, d => d.rate)]).nice();

    xAxis.transition().duration(750).call(d3.axisBottom(x));
    yAxis.transition().duration(750).call(d3.axisLeft(y));

    path.datum(filtered)
      .transition()
      .duration(750)
      .attr('d', line);
  }

  // --- INICIALIZAR ---
  update('all');

  // --- COMBO DE RANGO ---
  document.getElementById('range-select').addEventListener('change', e => {
    const range = e.target.value;
    update(range);
  });

  // --- RESET ZOOM ---
  document.getElementById('reset-btn').addEventListener('click', () => update('all'));

  // === GRÁFICO DE VOLATILIDAD ===
  function drawVolatility(window){
    d3.select('#volatility-chart').selectAll('*').remove();
    const vsvg = d3.select('#volatility-chart')
      .append('svg')
      .attr('width', '100%')
      .attr('height', 140);

    const vols = movingStd(rates, window);
    const vx = d3.scaleTime().domain(d3.extent(clean, d=>d.date)).range([50, width]);
    const vy = d3.scaleLinear().domain([0, d3.max(vols)]).range([100, 0]);

    vsvg.append('path')
      .datum(clean.map((d,i)=>({date:d.date,vol:vols[i]})))
      .attr('fill','none')
      .attr('stroke','#111827')
      .attr('stroke-width',1.2)
      .attr('d',d3.line().x(d=>vx(d.date)).y(d=>vy(d.vol)));
  }

  drawVolatility(+document.getElementById('rolling-window').value);
  document.getElementById('apply-rolling').addEventListener('click',()=> 
    drawVolatility(+document.getElementById('rolling-window').value));

  // === ESTACIONALIDAD — PROMEDIO POR MES ===
  function drawSeasonality() {
    d3.select("#seasonality-chart").selectAll("*").remove();
    
    const data2025 = clean.filter(d => d.date.getFullYear() === 2025);

    // Agrupamos por mes (1–12)
    const grouped = d3.rollup(
      data2025,
      v => d3.mean(v, d => d.rate),
      d => d.date.getMonth() + 1
    );

    // Convertimos a array ordenado
    const seasonData = Array.from(grouped, ([month, meanRate]) => ({
      month,
      meanRate
    })).sort((a,b)=>a.month-b.month);

    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

    const w = 800, h = 300, margin = {top:30,right:20,bottom:40,left:60};

    const svg = d3.select("#seasonality-chart")
      .append("svg")
      .attr("width","100%")
      .attr("height",h+margin.top+margin.bottom)
      .append("g")
      .attr("transform",`translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(seasonData.map(d => months[d.month-1]))
      .range([0,w])
      .padding(0.15);

    const y = d3.scaleLinear()
      .domain([d3.min(seasonData, d => d.meanRate)-0.5, d3.max(seasonData, d => d.meanRate)+0.5])
      .range([h,0])
      .nice();

    svg.append("g")
      .attr("transform",`translate(0,${h})`)
      .call(d3.axisBottom(x));

    svg.append("g")
      .call(d3.axisLeft(y));


    const color = d3.scaleSequential()
      .domain([d3.min(seasonData,d=>d.meanRate), d3.max(seasonData,d=>d.meanRate)])
      .interpolator(d3.interpolateBlues);

    // Dibujar barras
    svg.selectAll(".bar")
      .data(seasonData)
      .enter()
      .append("rect")
      .attr("class","bar")
      .attr("x", d => x(months[d.month-1]))
      .attr("y", d => y(d.meanRate))
      .attr("width", x.bandwidth())
      .attr("height", d => h - y(d.meanRate))
      .attr("fill", d => color(d.meanRate));

    // Etiquetas
    svg.selectAll(".label")
      .data(seasonData)
      .enter()
      .append("text")
      .attr("x", d => x(months[d.month-1]) + x.bandwidth()/2)
      .attr("y", d => y(d.meanRate) - 5)
      .attr("text-anchor","middle")
      .attr("font-size","12px")
      .attr("fill","#374151")
      .text(d => d.meanRate.toFixed(2));

    // Título opcional
    svg.append("text")
      .attr("x", w/2)
      .attr("y", -10)
      .attr("text-anchor","middle")
      .style("font-weight","600")
      .text("Promedio del tipo de cambio por mes en 2025");
  }

  drawSeasonality();

})();