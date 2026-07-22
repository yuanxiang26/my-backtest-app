// 核心回測主功能 (修正代理連線版)
async function runStrategyBacktest() {
  const symbol = document.getElementById('stockSelect').value;
  const resultArea = document.getElementById('resultArea');
  const logList = document.getElementById('logList');
  
  resultArea.style.display = 'block';
  document.getElementById('winRate').innerText = '計算中...';
  document.getElementById('totalReturn').innerText = '計算中...';
  logList.innerHTML = '正連線至 Yahoo Finance 抓取歷史真實 K 線數據...';

  try {
    // 使用 corsproxy.io 替代原本不穩定的代理通道
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('網絡響應異常');
    
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
    let equityCurve = [100];
    let currentEquity = 100;

    for (let i = 20; i < data.length - 5; i++) {
      let isMatch = true;

      if (useMA && !(data[i].close > data[i].ma5 && data[i-1].close <= data[i-1].ma5)) isMatch = false;
      if (useKD && !(data[i].k > data[i].d && data[i-1].k <= data[i-1].d)) isMatch = false;
      if (useRSI && !(data[i].rsi < 40)) isMatch = false;

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
    console.error(err);
    alert("Yahoo API 連線異常，請確認網路連線或切換標的重試！");
    logList.innerHTML = '連線失敗。';
  }
}
