# Quant Data

一个基于 Streamlit 的轻量多数据源行情验证工具，支持 Yahoo Finance、Tushare 和 Tiingo。

## 功能

- Yahoo Finance：美股、加密货币，无需密钥
- Tushare：A 股日线数据，需要 `TUSHARE_TOKEN`
- Tiingo：美股数据，需要 `TIINGO_KEY`
- K 线图、收盘价、涨跌幅与成交量展示
- 侧边栏数据源状态检测

## 项目结构

```text
.
├── app.py                  # Streamlit 页面
├── data.py                 # 数据源封装
├── requirements.txt
└── .streamlit/
    └── config.toml         # 页面主题配置
```

## 本地运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

Yahoo Finance 开箱即用。Tushare 和 Tiingo 需要配置密钥，密钥通过 Streamlit Cloud
的 Settings → Secrets 注入，不需要放在代码仓库里。

## 部署到 Streamlit Cloud

1. 将仓库推送到 GitHub。
2. 在 Streamlit Cloud 新建 App，选择该仓库、`main` 分支和 `app.py`。
3. 在 App 的 Settings → Secrets 中配置：

```toml
TIINGO_KEY = "your-tiingo-key"
TUSHARE_TOKEN = "your-tushare-token"
BINANCE_API_KEY = "your-binance-api-key"     # 预留，当前未使用
BINANCE_API_SECRET = "your-binance-secret"   # 预留，当前未使用
```
