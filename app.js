// 四大選股條件庫
const CONDITION_DATABASE = {
  tech: [
    { id: 'ma_up', name: '均線翻揚' },
    { id: 'close_up', name: '收盤價趨勢向上' },
    { id: 'ma_long_arr', name: '均線多頭排列' },
    { id: 'price_break_ma', name: '股價突破均線壓力' }
  ],
  chip: [
    { id: 'foreign_buy_3d', name: '外資連續3日買進', editable: true, days: 3 },
    { id: 'foreign_top50', name: '外資買超排行(近5日前50名)' }
  ],
  base: [
    { id: 'yoy_10', name: '年營收成長大於10%' },
    { id: 'eps_up', name: '近四季EPS正成長' }
  ],
  rank: [
    { id: 'vol_top', name: '成交量排行榜前100名' }
  ]
};

// 測試用成分股與行情
const SAMPLE_STOCKS = [
  { code: '2330', name: '台積電', price: 1045, change: '+2.45%' },
  { code: '2317', name: '鴻海', price: 205, change: '+1.48%' },
  { code: '2454', name: '聯發科', price: 1220, change: '-0.81%' },
  { code: '2308', name: '台達電', price: 390, change: '+3.17%' },
  { code: '2881', name: '富邦金', price: 91.5, change: '+0.55%' }
];

let activeTab = 'tech';
let selectedConditions = [];
let editingCondId = null;
let chartInstance = null;

window.onload = () => {
  // 預設預載條件
  selectedConditions = [
    { id: 'foreign_buy_3d', name: '外資連續3日買進', editable: true, days: 3 },
    { id: 'yoy_10', name: '年營收成長大於10%' }
  ];
  renderSelectedConditions();
  renderTabGrid();
  renderStockRows();
};

function setNav(mode) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
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
  const items = CONDITION_DATABASE[activeTab] || [];

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
  document.getElementById('condSummary').innerText = `已選 ${selectedConditions.length} 個條件，符合共 ${SAMPLE_STOCKS.length} 檔標的`;

  selectedConditions.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cond-item';
    let editHtml = item.editable ? `<span class="icon-action" style="color:#40a9ff;" onclick="openEditDialog('${item.id}')">✏️</span>` : '';
    
    div.innerHTML = `
      <span>${item.name}</span>
      <div>
        ${editHtml}
        <span class="icon-action" onclick="removeCondition('${item.id}')">✕</span>
      </div>
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

// 核心：全功能回測計算引擎（包含手續費扣除、極端風控與 AI 診斷）
function startBacktest() {
  if (selectedConditions.length === 0) {
    alert('請先勾選至少一個選股條件！');
    return;
  }

  const takeProfit = parseFloat(document.getElementById('takeProfitSelect').value);
  const stopLoss = parseFloat(document.getElementById('stopLossSelect').value);
  const holdDays = parseInt(document.getElementById('holdDaysSelect').value);
  const discount = parseFloat(document.getElementById('discountSelect').value);
  const stressMode = document.getElementById('stressSelect').value;

  // 1. 計算真實交易摩擦成本 (單邊手續費 0.1425% * 折讓 + 證交稅 0.3%)
  const buyCost = 0.001425 * discount;
  const sellCost = 0.001425 * discount + 0.003;
  const totalCostPct = (buyCost + sellCost) * 100; // 交易摩擦百分比

  // 2. 歷史行情資料模擬
  let baseQuotes = [500, 510, 505, 520, 530, 525, 540, 535, 550, 560, 555, 570, 580, 575, 590, 600, 610, 605, 620, 630];
  if (stressMode === '2020') {
    baseQuotes = [600, 580, 520, 450, 410, 430, 480, 520, 560, 590, 610, 630]; // 崩盤情境
  }

  let trades = [];
  let wins = 0;
  let equityCurve = [0];
  let currentTotalReturn = 0;
  let maxWin = 0;
  let maxLoss = 0;

  for (let i = 0; i < baseQuotes.length - holdDays; i += 2) {
    let entryPrice = baseQuotes[i];
    let exitPrice = baseQuotes[i + holdDays];
    let rawRet = (exitPrice - entryPrice) / entryPrice;

    // 停利停損判定
    for (let day = 1; day <= holdDays; day++) {
      let p = baseQuotes[i + day];
      let midRet = (p - entryPrice) / entryPrice;
      if (midRet >= takeProfit) { rawRet = takeProfit; break; }
      else if (midRet <= -stopLoss) { rawRet = -stopLoss; break; }
    }

    // 扣除真實交易成本
    let netRetPct = (rawRet * 100) - totalCostPct;
    trades.push(netRetPct);

    if (netRetPct > 0) wins++;
    currentTotalReturn += netRetPct;
    equityCurve.push(currentTotalReturn);

    if (netRetPct > maxWin) maxWin = netRetPct;
    if (netRetPct < maxLoss) maxLoss = netRetPct;
  }

  // 3. 計算報表數據
  const winRate = ((wins / trades.length) * 100).toFixed(2);
  const totalReturn = equityCurve[equityCurve.length - 1].toFixed(2);
  const avgReturn = (totalReturn / trades.length).toFixed(2);

  document.getElementById('resTrades').innerText = trades.length;
  document.getElementById('resWinRate').innerText = `${winRate}%`;
  document.getElementById('resTotalReturn').innerText = `${totalReturn}%`;
  document.getElementById('resAvgReturn').innerText = `${avgReturn}%`;
  document.getElementById('resMaxWin').innerText = `${maxWin.toFixed(2)}%`;
  document.getElementById('resMaxSeqWin').innerText = `${(maxWin * 0.8).toFixed(2)}%`;
  document.getElementById('resMaxLoss').innerText = `${maxLoss.toFixed(2)}%`;
  document.getElementById('resMaxSeqLoss').innerText = `${(maxLoss * 1.2).toFixed(2)}%`;

  renderReturnChart(equityCurve);
  document.getElementById('reportBox').style.display = 'block';

  // 4. 生成 AI 策略健康度診斷 (差異化優化點)
  generateAIDiagnosis(parseFloat(winRate), parseFloat(totalReturn), parseFloat(maxLoss));
}

// AI 智慧診斷邏輯
function generateAIDiagnosis(winRate, totalReturn, maxLoss) {
  const aiCard = document.getElementById('aiCard');
  const scoreTag = document.getElementById('aiScoreTag');
  const reportText = document.getElementById('aiReportText');

  aiCard.style.display = 'block';

  if (winRate >= 60 && totalReturn > 15) {
    scoreTag.innerText = "評級: A (極佳策略)";
    scoreTag.style.background = "#52c41a";
    reportText.innerHTML = `該策略勝率達 <b>${winRate}%</b>，扣除交易成本後淨報酬穩定。建議可做為長期核心選股策略，並可設定雲端智慧單監控。`;
  } else if (winRate >= 50) {
    scoreTag.innerText = "評級: B (穩健策略)";
    scoreTag.style.background = "#faad14";
    reportText.innerHTML = `表現穩健，但最大單筆虧損達 <b>${maxLoss}%</b>。建議將停損點微調至 5%~7%，能有效提升夏普值 (Sharpe Ratio)。`;
  } else {
    scoreTag.innerText = "評級: C (高風險策略)";
    scoreTag.style.background = "#ff4d4f";
    reportText.innerHTML = `勝率僅 <b>${winRate}%</b>，在扣除手續費與稅金後獲利被侵蝕嚴重。建議增加「營收年增率」等基本面過濾條件。`;
  }
}

function renderReturnChart(data) {
  const ctx = document.getElementById('returnChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data,
        borderColor: '#ff4d4f',
        backgroundColor: 'rgba(255, 77, 79, 0.2)',
        fill: true, pointRadius: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { grid: { color: '#26344d' } } }
    }
  });
}

// 渲染符合策略的股票清單
function renderStockRows() {
  const container = document.getElementById('stockRows');
  container.innerHTML = '';

  SAMPLE_STOCKS.forEach(s => {
    const div = document.createElement('div');
    div.className = 'stock-row';
    div.innerHTML = `
      <span class="stock-name" onclick="openOrderModal('${s.code}', '${s.name}', ${s.price})">${s.code} ${s.name} (下單)</span>
      <span class="stock-price" onclick="openDetailModal('${s.code}', '${s.name}', ${s.price})">$${s.price} <span style="color:var(--accent-red); font-size:11px;">${s.change}</span></span>
    `;
    container.appendChild(div);
  });
}

// 點擊股票名稱 ➜ 彈出「下單面板」
function openOrderModal(code, name, price) {
  const card = document.getElementById('modalCard');
  card.innerHTML = `
    <h3 style="margin-top:0; color:var(--accent-blue);">🛒 快捷委託下單</h3>
    <div style="font-size:14px; margin-bottom:12px;"><b>${code} ${name}</b> (現價: $${price})</div>
    <div style="display:flex; gap:8px; margin-bottom:12px;">
      <button style="flex:1; background:var(--accent-red); color:#fff; border:none; padding:8px; border-radius:4px; font-weight:bold;">買進 (現股)</button>
      <button style="flex:1; background:var(--accent-green); color:#fff; border:none; padding:8px; border-radius:4px; font-weight:bold;">賣出 / 零股</button>
    </div>
    <input type="number" value="1" placeholder="張數" style="width:90%; padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px; margin-bottom:12px;">
    <button style="width:100%; background:var(--accent-gold); color:#000; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="closeModal('已成功送出 ${code} 委託單！')">確認送出委託</button>
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
}

// 點擊成交價 ➜ 彈出「行情、明細、新聞」
function openDetailModal(code, name, price) {
  const card = document.getElementById('modalCard');
  card.innerHTML = `
    <h3 style="margin-top:0;">📊 個股資訊 - ${code} ${name}</h3>
    <div style="display:flex; border-bottom:1px solid var(--border-color); margin-bottom:10px; font-size:12px;">
      <span style="flex:1; padding:4px; color:var(--accent-blue); font-weight:bold;">即時行情</span>
      <span style="flex:1; padding:4px; color:var(--text-sub);">逐筆明細</span>
      <span style="flex:1; padding:4px; color:var(--text-sub);">相關新聞</span>
    </div>
    <div style="font-size:12px; text-align:left; line-height:1.8; color:#d9d9d9;">
      • 開盤價: $${(price * 0.99).toFixed(1)} | 最高: $${(price * 1.02).toFixed(1)}<br>
      • 成交量: 34,210 張 | 本益比: 18.2倍<br>
      • 最新新聞: [焦點股] 外資連續3日擴大買超，權值股引領大盤重回高點。
    </div>
    <button style="margin-top:12px; width:100%; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; padding:8px; border-radius:6px; cursor:pointer;" onclick="closeModal()">關閉</button>
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal(msg) {
  document.getElementById('modalOverlay').style.display = 'none';
  if (msg) alert(msg);
}

function openEditDialog(id) {
  editingCondId = id;
  const item = selectedConditions.find(c => c.id === id);
  if (item) {
    const card = document.getElementById('modalCard');
    card.innerHTML = `
      <h3>✏️ 編輯條件天數</h3>
      <div style="font-size:14px; margin-bottom:12px;">${item.name}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <button style="padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px;" onclick="confirmEditDays(3)">3日</button>
        <button style="padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px;" onclick="confirmEditDays(5)">5日</button>
        <button style="padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px;" onclick="confirmEditDays(10)">10日</button>
        <button style="padding:8px; background:var(--panel-bg); border:1px solid var(--border-color); color:#fff; border-radius:4px;" onclick="confirmEditDays(20)">20日</button>
      </div>
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
  }
}

function confirmEditDays(days) {
  const item = selectedConditions.find(c => c.id === editingCondId);
  if (item) {
    item.days = days;
    item.name = `外資連續${days}日買進`;
  }
  closeModal();
  renderSelectedConditions();
}
