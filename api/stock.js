// Vercel Serverless Function: 直連 Yahoo API 抓取真實歷史 K 線與個股資料
export default async function handler(req, res) {
  // 設定 CORS 允許前端存取
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol = '2330.TW', range = '5y' } = req.query;

  try {
    // 直連 Yahoo Finance 官方接口 (伺服器對伺服器請求，完全不受瀏覽器 CORS 限制)
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;
    const response = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo API 狀態碼異常: ${response.status}`);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Yahoo 數據抓取失敗:', error);
    return res.status(500).json({ error: '無法取得 Yahoo 歷史數據', details: error.message });
  }
}
