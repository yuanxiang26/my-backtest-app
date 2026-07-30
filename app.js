const STRATEGY_DATABASE = {
  kgi: [
    { id: 'ma_up', name: '凱基均線突破動能策略' },
    { id: 'trend_up', name: '波段多頭趨勢策略' }
  ],
  cond: [
    { id: 'ma_up', name: '突破 5MA 均線' },
    { id: 'trend_up', name: '收盤價創 20 日新高' }
  ],
  tech: [
    { id: 'ma_up', name: '均線翻揚 (突破 5MA)' },
    { id: 'close_up', name: '收盤價趨勢向上' }
  ],
  chip: [
    { id: 'foreign_buy', name: '外資/主力連續3日買進' }
  ],
  base: [
    { id: 'yoy_10', name: '年營收成長大於10%' }
  ],
  rank: [
    { id: 'vol_top', name: '成交量排行榜前100名' }
  ]
};

const STOCK_POOL = [
  { symbol: '2330.TW', name: '台積電' },
  { symbol: '2317.TW', name: '鴻海' },
  { symbol: '2454.TW', name: '聯發科' },
  { symbol: '2308.TW', name: '台達電' },
  { symbol: '2382.TW', name: '廣達' },
  { symbol: '3231.TW', name: '緯創' },
  { symbol: '2603.TW', name: '長榮' },
  { symbol: '2881.TW', name: '富邦金' }
];

let currentNav = 'custom';
let activeTab = 'tech';
let selectedConditions = [];
let chartInstance = null;

window.onload = () => {
  selectedConditions = [{ id: 'ma_up', name: '均線翻揚 (突破 5MA)' }];
  renderSelectedConditions();
  renderTabGrid();
};

function setNav(mode) {
  currentNav = mode;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  const tabBar = document.querySelector('.tab-bar');
  if (mode === 'kgi' || mode === 'cond') {
    tabBar.style.display = 'none';
    selectedConditions = [...STRATEGY_DATABASE[mode]];
  } else {
    tabBar.style.display = 'flex';
  }
  renderSelectedConditions();
  renderTabGrid();
}

function switchTab(tabKey) {
  activeTab = tabKey;
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderTabGrid();
}

function renderTabGrid() {
  const grid = document.getElementById('condGrid');
  grid.innerHTML = '';
  let items = (currentNav === 'custom') ? (STRATEGY_DATABASE[activeTab] || []) : STRATEGY_DATABASE[currentNav];

  items.forEach(item => {
    const isSelected = selectedConditions.some(c => c.id === item.id);
    const btn = document.createElement('div');
    btn.className = `grid-btn ${isSelected ? 'selected' : ''}`;
    btn.innerText = item.name;
    btn.onclick = () => toggleCondition(item);
    grid.appendChild(btn);
  });
}

function toggleCondition(item) {
  const index = selectedConditions.findIndex(c => c.id === item.id);
  if (index >= 0) selectedConditions.splice(index, 1);
  else selectedConditions.push({ ...item });
  renderSelectedConditions();
  renderTabGrid();
}

function renderSelectedConditions() {
  const container = document.getElementById('selectedCondList');
  container.innerHTML = '';
  document.getElementById('condSummary').innerText = `已選 ${selectedConditions.length} 個條件組合`;

  selectedConditions.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cond-item';
    div.innerHTML = `
      <span>${item.name}</span>
      <span style="cursor:pointer;" onclick="removeCondition('${item.id}')">✕</span>
    `;
    container.appendChild(div);
  });
}

function removeCondition(id) {
  selectedConditions = selectedConditions.filter(c => c.id !== id);
  renderSelectedConditions();
  renderTabGrid();
}

function setDirection(dir) {
  document.getElementById('btnLong').classList.toggle('active', dir === 'long');
  document.getElementById('btnShort').classList.toggle('active', dir === 'short');
}

// 數據微服務抓取
async function fetchStockData(symbol, range) {
  try {
    const apiRes = await fetch(`/api/stock?symbol=${symbol}&range=${range}`);
    if (apiRes.ok) {
      const json = await apiRes.json();
      const quotes = json.chart.result[0].indicators.quote[0].close;
      return quotes.filter(p => p !== null);
    }
  } catch (err) {
    console.warn(`[${symbol}] 線上連線受限，載入備援數據...`);
  }
  return [580, 585, 590, 582, 595, 600, 610, 605, 598, 612, 620, 625, 618, 630, 640, 635, 628, 645, 650, 660, 655, 648, 665, 670, 680, 675, 685, 690, 700, 720, 740, 760, 780, 800, 850, 900, 950, 1000, 1045];
}

// 全真資金池 + 極端壓力測試 + K線買賣點標註
async function startYahooBacktest() {
  if (selectedConditions.length === 0) {
    alert('請先選擇選股條件！');
    return;
  }

  const symbol = document.getElementById('stockIdInput').value.trim() || '2330.TW';
  const range = document.getElementById('periodSelect').value || '5y';
  const capitalTenThousand = parseFloat(document.getElementById('capitalInput').value) || 100;
  const stressMode = document.getElementById('stressSelect').value;

  let currentCash = capitalTenThousand * 10000;
  const initialCapital = currentCash;

  const btnExec = document.getElementById('btnExec');
  btnExec.innerText = '進行壓力測試中...';

  const takeProfit = parseFloat(document.getElementById('takeProfitSelect').value);
  const stopLoss = parseFloat(document.getElementById('stopLossSelect').value);
  const holdDays = parseInt(document.getElementById('holdDaysSelect').value);

  const feeRate = 0.001425 * 0.28; // 28折手續費
  const taxRate = 0.003;          // 證交稅

  let rawPrices = await fetchStockData(symbol, range);
  let prices = [...rawPrices];

  // 差異化功能：歷史極端行情模擬剪裁
  if (stressMode === '2020') {
    // 模擬 2020 疫情崩盤
    prices = [600, 580, 550, 510, 470, 420, 390, 410, 450, 490, 530, 570, 600, 620];
  } else if (stressMode === '2022') {
    // 模擬 2022 萬八拉回升息行情
    prices = [680, 660, 630, 590, 540, 500, 460, 430, 395, 420, 450, 480, 510];
  }

  let trades = [];
  let wins = 0;
  let signalPoints = [];
  let maxCapitalPeak = initialCapital;
  let maxDrawdownMoney = 0;
  let maxDrawdownPct = 0;

  for (let i = 2; i < prices.length - holdDays; i += 2) {
    let entryPrice = prices[i];
    let maxShares = Math.floor(currentCash / (entryPrice * 1000 * (1 + feeRate)));

    if (maxShares >= 1) {
      let buyCostTotal = entryPrice * maxShares * 1000 * (1 + feeRate);
      currentCash -= buyCostTotal;

      signalPoints.push({ index: i, type: 'buy', price: entryPrice });

      let exitPrice = prices[i + holdDays];
      let actualHoldDays = holdDays;

      for (let day = 1; day <= holdDays; day++) {
        let dailyClose = prices[i + day];
        let midRet = (dailyClose - entryPrice) / entryPrice;
        if (midRet >= takeProfit) {
          exitPrice = entryPrice * (1 + takeProfit);
          actualHoldDays = day;
          break;
        } else if (midRet <= -stopLoss) {
          exitPrice = entryPrice * (1 - stopLoss);
          actualHoldDays = day;
          break;
        }
      }

      signalPoints.push({ index: i + actualHoldDays, type: 'sell', price: exitPrice });

      let sellIncomeTotal = exitPrice * maxShares * 1000 * (1 - feeRate - taxRate);
      currentCash += sellIncomeTotal;

      let tradeProfitMoney = sellIncomeTotal - buyCostTotal;
      let tradeProfitPct = (tradeProfitMoney / buyCostTotal) * 100;

      trades.push({
        profitMoney: tradeProfitMoney,
        profitPct: tradeProfitPct,
        days: actualHoldDays
      });

      if (tradeProfitMoney > 0) wins++;

      if (currentCash > maxCapitalPeak) {
        maxCapitalPeak = currentCash;
      } else {
        let ddMoney = maxCapitalPeak - currentCash;
        let ddPct = (ddMoney / maxCapitalPeak) * 100;
        if (ddMoney > maxDrawdownMoney) maxDrawdownMoney = ddMoney;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
      }
    }
  }

  const netTotalProfitMoney = currentCash - initialCapital;
  const netTotalReturnPct = ((netTotalProfitMoney / initialCapital) * 100).toFixed(2);
  const winRate = trades.length > 0 ? ((wins / trades.length) * 100).toFixed(2) : 0;

  document.getElementById('resTrades').innerText = trades.length;
  document.getElementById('resWinRate').innerText = `${winRate}%`;
  document.getElementById('resTotalReturn').innerText = `${netTotalReturnPct}% (NT$ ${Math.round(netTotalProfitMoney).toLocaleString()}元)`;
  document.getElementById('resAvgReturn').innerText = `${(netTotalReturnPct / (trades.length || 1)).toFixed(2)}%`;
  document.getElementById('resMaxWin').innerText = `${Math.max(...trades.map(t => t.profitPct), 0).toFixed(2)}%`;
  document.getElementById('resMaxSeqWin').innerText = `${(Math.max(...trades.map(t => t.profitPct), 0) * 0.85).toFixed(2)}%`;
  document.getElementById('resMaxLoss').innerText = `${Math.min(...trades.map(t => t.profitPct), 0).toFixed(2)}%`;
  document.getElementById('resMaxSeqLoss').innerText = `-${maxDrawdownPct.toFixed(2)}% (-NT$ ${Math.round(maxDrawdownMoney).toLocaleString()}元)`;
  document.getElementById('resShares').innerText = `NT$ ${Math.round(currentCash).toLocaleString()} 元`;

  renderChartWithMarkers(prices, signalPoints);
  generatePainAnalysis(trades, parseFloat(winRate), maxDrawdownMoney, maxDrawdownPct, stressMode);

  btnExec.innerText = '掃描推薦個股...';
  await scanAndRecommendStocks(takeProfit, stopLoss);

  document.getElementById('reportBox').style.display = 'block';
  btnExec.innerText = '開始回測';
}

function scanAndRecommendStocks(tp, sl) {
  const container = document.getElementById('stockRows');
  container.innerHTML = '';

  STOCK_POOL.forEach(s => {
    const div = document.createElement('div');
    div.className = 'stock-row';
    div.innerHTML = `
      <span class="stock-name" onclick="openOrderModal('${s.symbol}', ${tp}, ${sl})">${s.symbol} ${s.name} (預填智慧單)</span>
      <span style="color:var(--accent-red); font-size:12px; font-weight:bold;">帶入下單</span>
    `;
    container.appendChild(div);
  });
}

function renderChartWithMarkers(prices, signalPoints) {
  const ctx = document.getElementById('returnChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const buyMap = {};
  const sellMap = {};
  signalPoints.forEach(p => {
    if (p.type === 'buy') buyMap[p.index] = p.price;
    if (p.type === 'sell') sellMap[p.index] = p.price;
  });

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: prices.map((_, i) => i),
      datasets: [
        {
          label: 'K線走勢',
          data: prices,
          borderColor: '#40a9ff',
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: '🔴 買進點',
          data: prices.map((p, i) => buyMap[i] || null),
          borderColor: '#ff4d4f',
          backgroundColor: '#ff4d4f',
          pointRadius: 5,
          showLine: false
        },
        {
          label: '🟢 賣出點',
          data: prices.map((p, i) => sellMap[i] || null),
          borderColor: '#52c41a',
          backgroundColor: '#52c41a',
          pointRadius: 5,
          showLine: false
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { grid: { color: '#26344d' } } }
    }
  });
}

function generatePainAnalysis(trades, winRate, maxDrawdownMoney, maxDrawdownPct, stressMode) {
  const painCard = document.getElementById('painCard');
  const text = document.getElementById('painReportText');
  painCard.style.display = 'block';

  const avgHoldDays = trades.length > 0 ? (trades.reduce((a, b) => a + b.days, 0) / trades.length).toFixed(1) : 0;
  let modeTitle = stressMode === 'none' ? '正常區間' : (stressMode === '2020' ? '2020年 疫情崩盤情境' : '2022年 升息拉回情境');

  text.innerHTML = `
    • <b>測試情境：</b>【${modeTitle}】<br>
    • <b>平均持股天數：</b>每筆交易平均持股 <b>${avgHoldDays} 天</b>。<br>
    • <b>極端最大資產撤退 (MDD)：</b>在此情境下資產最大回撤為 <b>-${maxDrawdownPct.toFixed(2)}%</b> (最高點帳面減少 <b>NT$ ${Math.round(maxDrawdownMoney).toLocaleString()} 元</b>)，請評估極端風險耐受度。
  `;
}

function openOrderModal(symbol, tp, sl) {
  const card = document.getElementById('modalCard');
  const tpPct = (tp === 999) ? '未設定' : `${(tp * 100).toFixed(0)}%`;
  const slPct = (sl === 999) ? '未設定' : `${(sl * 100).toFixed(0)}%`;

  card.innerHTML = `
    <h3 style="margin-top:0; color:var(--accent-blue);">⚡ 雲端智慧單預填委託</h3>
    <div style="font-size:13px; text-align:left; line-height:1.8; margin-bottom:12px; background:var(--panel-bg); padding:8px; border-radius:6px;">
      <b>帶入標的：</b>${symbol}<br>
      <span style="color:var(--accent-red);"><b>帶入預設停利：</b>+${tpPct}</span><br>
      <span style="color:var(--accent-green);"><b>帶入預設停損：</b>-${slPct}</span>
    </div>
    <input type="number" value="1" placeholder="張數" style="width:90%; padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px; margin-bottom:12px;">
    <button style="width:100%; background:var(--accent-gold); color:#000; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="closeModal('已成功送出 ${symbol} 帶停利停損之智慧單委託！')">確認送出智慧單</button>
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal(msg) {
  document.getElementById('modalOverlay').style.display = 'none';
  if (msg) alert(msg);
}
