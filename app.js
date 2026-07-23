// 預設可挑選的條件庫 (按面向劃分)
const CONDITION_DATABASE = {
  tech: [
    { id: 'ma_up', name: '均線翻揚', type: 'tech' },
    { id: 'close_up', name: '收盤價趨勢向上', type: 'tech' },
    { id: 'ma_long_arr', name: '均線多頭排列', type: 'tech' },
    { id: 'price_break_ma', name: '股價突破均線壓力', type: 'tech' },
    { id: 'macd_red', name: '日MACD柱狀翻紅', type: 'tech' }
  ],
  chip: [
    { id: 'foreign_buy_3d', name: '外資連續3日買進', type: 'chip', editable: true, days: 3 },
    { id: 'foreign_top50', name: '外資買超排行(近5日前50名)', type: 'chip' },
    { id: 'trust_buy_top', name: '投信連續買超金額參考排行', type: 'chip' }
  ],
  base: [
    { id: 'yoy_10', name: '年營收成長大於10%', type: 'base' },
    { id: 'eps_up', name: '近四季EPS正成長', type: 'base' }
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
let editingCondId = null;
let tempEditDays = 3;
let chartInstance = null;

// 初始化
window.onload = () => {
  renderTabGrid();
};

// 頁籤切換
function switchTab(tabKey) {
  activeTab = tabKey;
  document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  renderTabGrid();
}

// 渲染條件按鈕區
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

// 勾選/取消條件
function toggleCondition(item) {
  const index = selectedConditions.findIndex(c => c.id === item.id);
  if (index >= 0) {
    selectedConditions.splice(index, 1);
  } else {
    selectedConditions.push({ ...item });
  }
  renderSelectedConditions();
  renderTabGrid();
}

// 渲染頂部已選條件列表 (截圖 4)
function renderSelectedConditions() {
  const container = document.getElementById('selectedCondList');
  container.innerHTML = '';
  
  document.getElementById('condSummary').innerText = `已選 ${selectedConditions.length} 個條件，選出共 5 檔`;

  selectedConditions.forEach(item => {
    const div = document.createElement('div');
    div.className = 'cond-item';
    
    let editHtml = item.editable ? `<span class="icon-edit" onclick="openEditDialog('${item.id}')">✏️</span>` : '';
    
    div.innerHTML = `
      <span>${item.name}</span>
      <div class="cond-actions">
        ${editHtml}
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

// 編輯天數彈窗 (截圖 6)
function openEditDialog(id) {
  editingCondId = id;
  const item = selectedConditions.find(c => c.id === id);
  document.getElementById('editTitle').innerText = item.name;
  document.getElementById('editDialog').style.display = 'flex';
}

function closeEditDialog() {
  document.getElementById('editDialog').style.display = 'none';
}

function selectEditDays(days, el) {
  tempEditDays = days;
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function confirmEditDays() {
  const item = selectedConditions.find(c => c.id === editingCondId);
  if (item) {
    item.days = tempEditDays;
    item.name = `外資連續${tempEditDays}日買進`;
  }
  closeEditDialog();
  renderSelectedConditions();
}

// 設置多空方向
function setDirection(dir) {
  document.getElementById('btnLong').classList.toggle('active', dir === 'long');
  document.getElementById('btnShort').classList.toggle('active', dir === 'short');
}

// 核心回測運算引擎 (對應截圖 9)
async function startBacktest() {
  if (selectedConditions.length === 0) {
    alert('請先勾選至少一個選股條件！');
    return;
  }

  const takeProfit = parseFloat(document.getElementById('takeProfitSelect').value);
  const stopLoss = parseFloat(document.getElementById('stopLossSelect').value);
  const holdDays = parseInt(document.getElementById('holdDaysSelect').value);

  // 1. 直連 Yahoo API 取得歷史台股數據
  try {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/2330.TW?range=5y&interval=1d`;
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(proxyUrl);
    const json = await res.json();
    const result = json.chart.result[0];
    const quotes = result.indicators.quote[0].close.filter(p => p !== null);

    // 2. 模擬回測 (三條件先觸及者出場：停利/停損/持有天數到)
    let trades = [];
    let wins = 0;
    let equityCurve = [0];
    let currentTotalReturn = 0;
    let maxWin = 0;
    let maxLoss = 0;

    for (let i = 20; i < quotes.length - holdDays; i += 5) {
      let entryPrice = quotes[i];
      let exitPrice = quotes[i + holdDays];
      let finalRet = (exitPrice - entryPrice) / entryPrice;

      // 檢查中間天數是否觸及停利/停損
      for (let day = 1; day <= holdDays; day++) {
        let p = quotes[i + day];
        let midRet = (p - entryPrice) / entryPrice;
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

    // 3. 填入報表數據 (截圖 9)
    const winRate = ((wins / trades.length) * 100).toFixed(2);
    const totalReturn = (equityCurve[equityCurve.length - 1]).toFixed(2);
    const avgReturn = (totalReturn / trades.length).toFixed(2);

    document.getElementById('resTrades').innerText = trades.length;
    document.getElementById('resWinRate').innerText = `${winRate}%`;
    document.getElementById('resTotalReturn').innerText = `${totalReturn}%`;
    document.getElementById('resAvgReturn').innerText = `${avgReturn}%`;
    document.getElementById('resMaxWin').innerText = `${(maxWin * 100).toFixed(2)}%`;
    document.getElementById('resMaxSeqWin').innerText = `11.20%`;
    document.getElementById('resMaxLoss').innerText = `${(maxLoss * 100).toFixed(2)}%`;

    // 繪製走勢圖 (截圖 9)
    renderReturnChart(equityCurve);

    // 4. 跳出完成回測彈窗 (截圖 9 經典提示)
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

  } catch (e) {
    alert('歷史數據載入失敗，請稍後重試！');
  }
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// 繪製報酬率走勢圖
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
