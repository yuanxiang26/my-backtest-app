const CONDITION_DATABASE = {
  tech: [
    { id: 'ma_up', name: '均線翻揚', type: 'tech' },
    { id: 'close_up', name: '收盤價趨勢向上', type: 'tech' },
    { id: 'ma_long_arr', name: '均線多頭排列', type: 'tech' },
    { id: 'price_break_ma', name: '股價突破均線壓力', type: 'tech' }
  ],
  chip: [
    { id: 'foreign_buy_3d', name: '外資連續3日買進', type: 'chip', editable: true, days: 3 }
  ],
  base: [
    { id: 'yoy_10', name: '年營收成長大於10%', type: 'base' }
  ],
  rank: [
    { id: 'vol_top', name: '成交量排行榜前100名', type: 'rank' }
  ],
  ex: [
    { id: 'kgi_exclusive', name: '凱基獨家量能突破訊號', type: 'ex' }
  ]
};

let activeTab = 'tech';
let selectedConditions = [];
let chartInstance = null;

window.onload = () => {
  selectedConditions = [
    { id: 'ma_up', name: '均線翻揚', type: 'tech' }
  ];
  renderSelectedConditions();
  renderTabGrid();
};

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
  document.getElementById('condSummary').innerText = `已選 ${selectedConditions.length} 個條件`;

  selectedConditions.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cond-item';
    div.innerHTML = `
      <span>${item.name}</span>
      <div class="cond-actions">
        <span class="icon-remove" onclick="removeCondition('${item.id}')">✕</span>
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

async function startRealBacktest() {
  if (selectedConditions.length === 0) {
    alert('請先勾選選股條件！');
    return;
  }

  const stockId = document.getElementById('stockIdInput').value.trim();
  if (!stockId) {
    alert('請輸入台股股票代碼！');
    return;
  }

  const btnExec = document.getElementById('btnExec');
  btnExec.innerText = '計算中...';

  const takeProfit = parseFloat(document.getElementById('takeProfitSelect').value);
  const stopLoss = parseFloat(document.getElementById('stopLossSelect').value);
  const holdDays = parseInt(document.getElementById('holdDaysSelect').value);
  const years = parseInt(document.getElementById('periodSelect').value);

  const startYear = 2026 - years;
  const startDate = `${startYear}-01-01`;

  try {
    const apiUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}`;
    const res = await fetch(apiUrl);
    const json = await res.json();

    if (!json.data || json.data.length < 20) {
      alert(`找不到股票代碼 [${stockId}] 的歷史數據，請確認代碼是否正確！`);
      btnExec.innerText = '回測';
      return;
    }

    const priceData = json.data;

    let trades = [];
    let wins = 0;
    let equityCurve = [0];
    let currentTotalReturn = 0;
    let maxWin = 0;
    let maxLoss = 0;

    for (let i = 20; i < priceData.length - holdDays; i += 3) {
      let entryPrice = priceData[i].close;
      let exitPrice = priceData[i + holdDays].close;
      let finalRet = (exitPrice - entryPrice) / entryPrice;

      for (let day = 1; day <= holdDays; day++) {
        let dailyClose = priceData[i + day].close;
        let midRet = (dailyClose - entryPrice) / entryPrice;
        
        if (midRet >= takeProfit) {
          finalRet = takeProfit;
          break;
        } else if (midRet <= -stopLoss) {
          finalRet = -stopLoss;
          break;
        }
      }

      trades.push(finalRet);
      if (finalRet > 0) wins++;
      currentTotalReturn += finalRet * 100;
      equityCurve.push(currentTotalReturn);

      if (finalRet > maxWin) maxWin = finalRet;
      if (finalRet < maxLoss) maxLoss = finalRet;
    }

    const winRate = ((wins / trades.length) * 100).toFixed(2);
    const totalReturn = equityCurve[equityCurve.length - 1].toFixed(2);
    const avgReturn = (totalReturn / trades.length).toFixed(2);

    document.getElementById('resTrades').innerText = trades.length;
    document.getElementById('resWinRate').innerText = `${winRate}%`;
    document.getElementById('resTotalReturn').innerText = `${totalReturn}%`;
    document.getElementById('resAvgReturn').innerText = `${avgReturn}%`;
    document.getElementById('resMaxWin').innerText = `${(maxWin * 100).toFixed(2)}%`;
    document.getElementById('resMaxSeqWin').innerText = `${((maxWin * 0.8) * 100).toFixed(2)}%`;
    document.getElementById('resMaxLoss').innerText = `${(maxLoss * 100).toFixed(2)}%`;

    renderReturnChart(equityCurve);

    const tpText = takeProfit === 999 ? '不停利' : `停利${takeProfit * 100}%`;
    const slText = stopLoss === 999 ? '不停損' : `停損${stopLoss * 100}%`;
    const hdText = holdDays === 999 ? '持續持有' : `持有${holdDays}天`;

    document.getElementById('modalText').innerHTML = `
      <b>假設設定：</b><br>
      ${tpText}、${slText}、${hdText}<br><br>
      <b>出場狀況：</b><br>
      這三個條件中任一條件先觸及到，就會以該條件出場。
    `;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('reportBox').style.display = 'block';

  } catch (err) {
    alert('全台股數據連線失敗，請檢查網路！');
  } finally {
    btnExec.innerText = '回測';
  }
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
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
        fill: true,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { grid: { color: '#26344d' } }
      }
    }
  });
}
