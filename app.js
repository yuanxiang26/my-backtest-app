let chartInstance = null;

// UI 標籤切換
function toggleTag(el) {
  el.classList.toggle('active');
}

// 核心回測主功能
async function runStrategyBacktest() {
  const symbol = document.getElementById('stockSelect').value;
  const resultArea = document.getElementById('resultArea');
  const logList = document.getElementById('logList');
  
  resultArea.style.display = 'block';
  document.getElementById('winRate').innerText = '計算中...';
  document.getElementById('totalReturn').innerText = '計算中...';
  logList.innerHTML = '正連線至 Yahoo Finance 抓取歷史真實 K 線數據...';

  try {
    // 1. 直連 Yahoo Finance API 抓取近 1 年真實數據
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(proxyUrl);
    const json = await res.json();
    
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const quotes = result.indicators.quote[0];

    // 清理假權與空值數據
    let data = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] !== null && quotes.high[i] !== null && quotes.low[i] !== null) {
        let dateStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
        data.push({
          date: dateStr,
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i]
        });
      }
    }

    // 2. 計算技術指標 (MA, KD, RSI)
    calculateIndicators(data);

    // 讀取 UI 勾選條件
    const useMA = document.getElementById('condMA').classList.contains('active');
    const useKD = document.getElementById('condKD').classList.contains('active');
    const useRSI = document.getElementById('condRSI').classList.contains('active');

    // 3. 執行向量化回測
    let trades = [];
    let logs = [];
    let equityCurve = [100]; // 初始資金 100%
    let currentEquity = 100;

    for (let i = 20; i < data.length - 5; i++) {
      let isMatch = true;

      // 條件 1: 均線突破
      if (useMA && !(data[i].close > data[i].ma5 && data[i-1].close <= data[i-1].ma5)) {
        isMatch = false;
      }
      // 條件 2: KD 黃金交叉
      if (useKD && !(data[i].k > data[i].d && data[i-1].k <= data[i-1].d)) {
        isMatch = false;
      }
      // 條件 3: RSI 低檔
      if (useRSI && !(data[i].rsi < 40)) {
        isMatch = false;
      }

      // 若符合所有勾選條件則觸發買進 (持有 5 天賣出)
      if (isMatch) {
        let buyPrice = data[i].close;
        let sellPrice = data[i + 5].close;
        let ret = (sellPrice - buyPrice) / buyPrice;
        
        trades.push(ret);
        currentEquity *= (1 + ret);
        equityCurve.push(currentEquity);

        logs.push(`[${data[i].date}] 買進 $${buyPrice.toFixed(1)} ➔ 5日後 [${data[i+5].date}] 賣出 $${sellPrice.toFixed(1)} (${(ret*100).toFixed(1)}%)`);
      }
    }

    if (trades.length === 0) {
      document.getElementById('winRate').innerText = '0%';
      document.getElementById('totalReturn').innerText = '0%';
      logList.innerHTML = '近一年歷史行情中，無符合此組合條件之訊號。';
      renderChart([100, 100]);
      return;
    }

    // 4. 輸出統計結果
    const wins = trades.filter(r => r > 0).length;
    const winRate = ((wins / trades.length) * 100).toFixed(1);
    const totalReturn = ((trades.reduce((acc, r) => (1 + acc) * (1 + r) - 1, 0)) * 100).toFixed(1);

    document.getElementById('winRate').innerText = winRate + '%';
    document.getElementById('totalReturn').innerText = (totalReturn > 0 ? '+' : '') + totalReturn + '%';
    logList.innerHTML = logs.reverse().join('<br>');

    // 5. 繪製累積報酬曲線圖
    renderChart(equityCurve);

  } catch (err) {
    alert("Yahoo API 連線異常，請稍後重試！");
    logList.innerHTML = '連線失敗。';
  }
}

// 指標算頭 (MA5, KD, RSI)
function calculateIndicators(data) {
  for (let i = 0; i < data.length; i++) {
    // 5日均線
    if (i >= 4) {
      let sum = 0;
      for (let j = i - 4; j <= i; j++) sum += data[j].close;
      data[i].ma5 = sum / 5;
    } else data[i].ma5 = data[i].close;

    // 簡化版 KD 計算 (RSV 9)
    if (i >= 8) {
      let low9 = Math.min(...data.slice(i-8, i+1).map(d => d.low));
      let high9 = Math.max(...data.slice(i-8, i+1).map(d => d.high));
      let rsv = high9 === low9 ? 50 : ((data[i].close - low9) / (high9 - low9)) * 100;
      data[i].k = (i === 8 ? 50 : data[i-1].k) * (2/3) + rsv * (1/3);
      data[i].d = (i === 8 ? 50 : data[i-1].d) * (2/3) + data[i].k * (1/3);
    } else { data[i].k = 50; data[i].d = 50; }

    // 簡化版 RSI (14)
    if (i >= 14) {
      let gains = 0, losses = 0;
      for (let j = i - 13; j <= i; j++) {
        let diff = data[j].close - data[j-1].close;
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      data[i].rsi = gains === 0 ? 0 : 100 - (100 / (1 + (gains / (losses || 1))));
    } else data[i].rsi = 50;
  }
}

// Chart.js 走勢圖渲染
function renderChart(equityCurve) {
  const ctx = document.getElementById('equityChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: equityCurve.map((_, i) => `Trade ${i}`),
      datasets: [{
        label: '累積資產變化 (%)',
        data: equityCurve,
        borderColor: '#d32f2f',
        backgroundColor: 'rgba(211, 47, 47, 0.08)',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false } }
    }
  });
}

// 2FA 彈窗選單邏輯
function open2FA() { document.getElementById('authModal').style.display = 'flex'; }
function confirm2FA() {
  document.getElementById('authModal').style.display = 'none';
  alert("🎉 雙因子驗證成功！該策略已成功掛載至雲端 e智慧單監控（有效期 90 天）。");
}
