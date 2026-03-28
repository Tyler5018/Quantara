require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const Groq = require("groq-sdk");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CACHE_FILE = './daily_picks.json';
const MODEL_NAME = "llama-3.3-70b-versatile";

app.get('/', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString();

        if (fs.existsSync(CACHE_FILE)) {
            const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cachedData.date === today) {
                return res.send(renderPage(cachedData.html, cachedData.rawStocks, cachedData.updatedAt));
            }
        }

        const stockUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
        const stockResponse = await axios.get(stockUrl);
        let rawGainers = stockResponse.data.top_gainers || [];
        
        let filteredStocks = rawGainers.filter(s => /^[A-Z]{1,5}$/.test(s.ticker));

        if (filteredStocks.length === 0) {
            filteredStocks = [
                { ticker: "NVDA", change_percentage: "4.2%" },
                { ticker: "PLTR", change_percentage: "3.8%" },
                { ticker: "MU",   change_percentage: "7.1%" },
                { ticker: "AMD",  change_percentage: "2.9%" },
                { ticker: "TSLA", change_percentage: "5.4%" },
                { ticker: "SMCI", change_percentage: "6.1%" },
                { ticker: "ARM",  change_percentage: "3.3%" },
                { ticker: "MSTR", change_percentage: "8.7%" },
                { ticker: "COIN", change_percentage: "5.9%" },
                { ticker: "INTC", change_percentage: "2.1%" },
                { ticker: "AAPL", change_percentage: "1.8%" },
                { ticker: "META", change_percentage: "2.4%" },
                { ticker: "AMZN", change_percentage: "1.6%" },
                { ticker: "MSFT", change_percentage: "1.2%" },
                { ticker: "GOOGL",change_percentage: "1.9%" },
                { ticker: "NFLX", change_percentage: "3.1%" },
                { ticker: "UBER", change_percentage: "2.7%" },
                { ticker: "SHOP", change_percentage: "4.5%" }
            ];
        }

        const stockSummary = filteredStocks.slice(0, 10).map(s => `${s.ticker} (+${s.change_percentage})`).join(", ");

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are Quantara Core. Output ONLY exactly 5 cards. 
                    Structure: <div class="bento-item"><div class="card-head"><h2>TICKER</h2><span class="change">CHANGE</span></div><div class="glow-line"></div><p class="thesis">THESIS</p><div class="card-footer"><div class="status RISK_LEVEL">RISK_LEVEL</div><a href="https://www.tradingview.com/symbols/TICKER/" target="_blank" class="chart-btn">Analysis</a></div></div>` 
                },
                { role: "user", content: `Analyze: ${stockSummary}.` }
            ],
            model: MODEL_NAME,
        });

        const aiHtml = chatCompletion.choices[0]?.message?.content || "";
        const updatedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
        const finalData = { date: today, html: aiHtml, rawStocks: filteredStocks.slice(0, 18), updatedAt };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(finalData));
        
        res.send(renderPage(aiHtml, finalData.rawStocks, updatedAt));

    } catch (err) {
        res.send(renderPage(`<div class="error">Quantara Core: Updating Live Feeds...</div>`, [], null));
    }
});

// Ticker search endpoint
app.post('/search', async (req, res) => {
    const { ticker } = req.body;

    if (!ticker || !/^[A-Za-z]{1,5}$/.test(ticker.trim())) {
        return res.json({ error: 'Invalid ticker symbol.' });
    }

    const symbol = ticker.trim().toUpperCase();

    try {
        const quoteUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
        const quoteResponse = await axios.get(quoteUrl);
        const quote = quoteResponse.data['Global Quote'];

        let price = null;
        let isPositive = true;
        let changeDisplay = null;

        if (quote && quote['05. price']) {
            price = parseFloat(quote['05. price']).toFixed(2);
            const changeRaw = parseFloat(quote['09. change']);
            const changePct = parseFloat(quote['10. change percent']).toFixed(2);
            isPositive = changeRaw >= 0;
            changeDisplay = `${isPositive ? '+' : ''}${changePct}%`;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are Quantara Core, an institutional-grade market intelligence system. 
                    Provide a concise, sharp analysis of the stock in 2-3 sentences. 
                    Also provide a risk level: Low, Mid, or High.
                    Respond ONLY in this exact JSON format, no markdown, no extra text:
                    {"thesis":"your analysis here","risk":"Low"}`
                },
                {
                    role: "user",
                    content: price
                        ? `Analyze ${symbol}. Price: $${price}. Change today: ${changeDisplay}.`
                        : `Provide a general institutional-grade analysis of ${symbol} as a stock.`
                }
            ],
            model: MODEL_NAME,
        });

        const raw = chatCompletion.choices[0]?.message?.content || '{}';
        let parsed = {};
        try {
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch {
            parsed = { thesis: "Analysis unavailable at this time.", risk: "Mid" };
        }

        const thesis = parsed.thesis || "Analysis unavailable.";
        const risk = ['Low', 'Mid', 'High'].includes(parsed.risk) ? parsed.risk : 'Mid';

        res.json({
            ticker: symbol,
            price: price || 'N/A',
            change: changeDisplay || 'N/A',
            isPositive,
            thesis,
            risk
        });

    } catch (err) {
        res.json({ error: 'Failed to fetch data. Please try again.' });
    }
});

function renderPage(content, rawStocks, updatedAt) {
    const tickerHtml = rawStocks.slice(0,10).map(s => `
        <span class="ticker-item"><span class="t-sym">${s.ticker}</span> <span class="t-pct">+${s.change_percentage}</span></span>
    `).join(' • ');

    const heatmapItems = rawStocks.map(s => {
        const val = parseFloat(s.change_percentage);
        return `
            <div class="map-box" onclick="heatmapSearch('${s.ticker}')" style="background: linear-gradient(145deg, rgba(16, 185, 129, ${val/20 + 0.1}), rgba(6, 78, 59, 0.4)); border-color: rgba(16, 185, 129, ${val/15})">
                <span class="map-ticker">${s.ticker}</span>
                <span class="map-pct">+${s.change_percentage}</span>
                <div class="map-glow"></div>
            </div>
        `;
    }).join('');

    const updatedAtHtml = updatedAt
        ? `<p class="updated-at">// ANALYSIS UPDATED: ${updatedAt}</p>`
        : '';

    const year = new Date().getFullYear();
    const month = new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase();

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quantara Core | Intelligence Terminal</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #010409; --glass: rgba(13, 17, 23, 0.8); --border: rgba(255, 255, 255, 0.08); --cyan: #00d2ff; --pink: #ff007f; --green: #00ff9d; }
            * { box-sizing: border-box; scroll-behavior: smooth; }
            body { background: var(--bg); color: #f0f6fc; font-family: 'Inter', sans-serif; margin: 0; overflow-x: hidden; }

            /* ── TICKER BAR ── */
            .top-ticker { position: fixed; top: 0; width: 100%; height: 35px; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); z-index: 1001; overflow: hidden; display: flex; align-items: center; }
            .ticker-move { display: flex; white-space: nowrap; animation: tickerScroll 35s linear infinite; }
            .ticker-item { padding: 0 30px; font-family: monospace; font-size: 0.7rem; letter-spacing: 1px; }
            .t-sym { color: #fff; font-weight: bold; }
            .t-pct { color: var(--green); text-shadow: 0 0 10px rgba(0, 255, 157, 0.3); }
            @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

            /* ── NAV ── */
            nav { position: fixed; top: 35px; width: 100%; z-index: 1000; background: rgba(1, 4, 9, 0.7); backdrop-filter: blur(15px); border-bottom: 1px solid var(--border); padding: 15px 40px; display: flex; justify-content: space-between; align-items: center; }
            .logo { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.4rem; color: #fff; text-decoration: none; cursor: pointer; }
            .logo span { background: linear-gradient(to right, var(--cyan), var(--pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-left: 5px; }
            .nav-links { display: flex; align-items: center; }
            .nav-links a { color: #8b949e; text-decoration: none; margin-left: 30px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; transition: 0.3s; }
            .nav-links a:hover { color: var(--cyan); }
            .hamburger { display: none; flex-direction: column; gap: 5px; cursor: pointer; padding: 5px; }
            .hamburger span { display: block; width: 22px; height: 2px; background: #fff; transition: 0.3s; }

            /* ── PAGES ── */
            .page { display: none; padding-top: 110px; min-height: 100vh; }
            .active-page { display: block; }

            /* ── HERO ── */
            .hero-slider { width: 100%; height: 85vh; position: relative; overflow: hidden; background: #000; }
            .slides { display: flex; transition: transform 1.2s cubic-bezier(0.7, 0, 0.3, 1); height: 100%; }
            .slide { min-width: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
            .slide img { position: absolute; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; z-index: -1; }
            .hero-text { text-align: center; max-width: 900px; padding: 0 20px; }
            .hero-text h2 { font-family: 'Space Grotesk'; font-size: clamp(2.5rem, 10vw, 6.5rem); margin: 0; background: linear-gradient(135deg, #fff 30%, var(--cyan) 70%, var(--pink) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -3px; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5)); }
            .hero-text p { letter-spacing: 8px; font-weight: 700; margin-top: 20px; font-size: 0.75rem; }
            .btn-glow { margin-top: 50px; display: inline-block; background: transparent; color: #fff; border: 1px solid var(--cyan); padding: 18px 50px; border-radius: 4px; text-decoration: none; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 3px; transition: 0.4s; cursor: pointer; }
            .btn-glow:hover { background: var(--cyan); color: #000; box-shadow: 0 0 40px var(--cyan); }

            /* ── PAGE LOAD OVERLAY ── */
            .init-overlay { position: fixed; inset: 0; background: var(--bg); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; transition: opacity 0.6s ease; }
            .init-overlay.hidden { opacity: 0; pointer-events: none; }
            .init-logo { font-family: 'Space Grotesk'; font-size: 2rem; font-weight: 700; color: #fff; letter-spacing: -1px; }
            .init-logo span { background: linear-gradient(to right, var(--cyan), var(--pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .init-text { font-family: monospace; font-size: 0.75rem; letter-spacing: 3px; color: var(--cyan); }
            .init-bar { width: 200px; height: 1px; background: var(--border); position: relative; overflow: hidden; }
            .init-bar::after { content: ''; position: absolute; left: -100%; top: 0; height: 100%; width: 100%; background: linear-gradient(90deg, transparent, var(--cyan), transparent); animation: initScan 1.2s ease-in-out forwards; }
            @keyframes initScan { 0% { left: -100%; } 100% { left: 100%; } }

            /* ── CONTAINER & GRID ── */
            .container { max-width: 1200px; margin: 50px auto; padding: 0 20px; }
            .bento-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 25px; }
            .bento-item { background: var(--glass); border: 1px solid var(--border); border-radius: 24px; padding: 40px; backdrop-filter: blur(20px); transition: 0.4s; position: relative; }
            .bento-item:hover { border-color: var(--cyan); transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }

            /* ── CARDS ── */
            .card-head { display: flex; justify-content: space-between; align-items: flex-start; }
            .ticker-text { font-family: 'Space Grotesk'; font-size: 2.8rem; color: #fff; margin: 0; letter-spacing: -2px; }
            .change { color: var(--green); font-weight: 800; font-family: monospace; font-size: 1.3rem; }
            .change.negative { color: var(--pink); }
            .glow-line { height: 1px; width: 100%; background: linear-gradient(90deg, var(--cyan), transparent); margin: 20px 0; }
            .thesis { color: #8b949e; line-height: 1.8; font-size: 1.1rem; font-weight: 300; }
            .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 35px; }
            .status { font-size: 0.65rem; padding: 6px 16px; border-radius: 4px; border: 1px solid currentColor; font-weight: 800; text-transform: uppercase; }
            .Low { color: var(--green); } .Mid { color: #f59e0b; } .High { color: var(--pink); }
            .chart-btn { color: #fff; font-size: 0.7rem; text-decoration: none; opacity: 0.5; transition: 0.3s; }
            .chart-btn:hover { opacity: 1; text-decoration: underline; }

            /* ── UPDATED AT ── */
            .updated-at { font-family: monospace; font-size: 0.7rem; letter-spacing: 2px; color: #30363d; margin-bottom: 40px; margin-top: -20px; }

            /* ── HEATMAP ── */
            .heatmap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; margin-top: 40px; }
            .map-box { height: 140px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; transition: 0.3s; cursor: pointer; }
            .map-box:hover { transform: scale(1.03); border-color: #fff; z-index: 5; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
            .map-ticker { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.6rem; color: #fff; }
            .map-pct { font-size: 0.85rem; font-weight: bold; margin-top: 8px; color: var(--green); }

            /* ── SEARCH ── */
            .search-section { margin-bottom: 60px; background: var(--glass); border: 1px solid var(--border); border-radius: 24px; padding: 40px; backdrop-filter: blur(20px); }
            .search-label { font-family: 'Space Grotesk'; font-size: 0.7rem; letter-spacing: 3px; color: var(--cyan); text-transform: uppercase; margin-bottom: 20px; display: block; }
            .search-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
            .search-input { flex: 1; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 8px; padding: 16px 24px; color: #fff; font-family: 'Space Grotesk'; font-size: 1.4rem; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; outline: none; transition: 0.3s; max-width: 280px; min-width: 140px; }
            .search-input::placeholder { color: #30363d; letter-spacing: 3px; font-size: 1rem; }
            .search-input:focus { border-color: var(--cyan); box-shadow: 0 0 20px rgba(0,210,255,0.15); }
            .search-btn { background: transparent; color: #fff; border: 1px solid var(--cyan); padding: 16px 36px; border-radius: 8px; font-family: 'Space Grotesk'; font-size: 0.75rem; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: 0.3s; white-space: nowrap; }
            .search-btn:hover:not(:disabled) { background: var(--cyan); color: #000; box-shadow: 0 0 30px rgba(0,210,255,0.4); }
            .search-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .search-result { margin-top: 30px; display: none; }
            .search-result.visible { display: block; }
            .result-card { background: rgba(0,0,0,0.3); border: 1px solid var(--cyan); border-radius: 16px; padding: 35px; position: relative; animation: fadeSlideIn 0.4s ease; }
            @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            .result-card .card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0; }
            .result-card h2 { font-family: 'Space Grotesk'; font-size: 2.8rem; color: #fff; margin: 0; letter-spacing: -2px; }
            .result-meta { text-align: right; }
            .result-price { font-family: monospace; font-size: 1.4rem; color: #fff; font-weight: bold; }
            .search-error { color: var(--pink); font-family: monospace; font-size: 0.85rem; letter-spacing: 1px; padding: 16px 0 0; }
            .scanning { display: none; align-items: center; gap: 12px; color: var(--cyan); font-family: monospace; font-size: 0.75rem; letter-spacing: 2px; margin-top: 20px; }
            .scanning.active { display: flex; }
            .scan-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan); animation: pulse 1s ease-in-out infinite; }
            .scan-dot:nth-child(2) { animation-delay: 0.2s; }
            .scan-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes pulse { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }

            /* ── WATCHLIST ── */
            .watchlist-section { margin-bottom: 60px; background: var(--glass); border: 1px solid var(--border); border-radius: 24px; padding: 40px; backdrop-filter: blur(20px); }
            .watchlist-label { font-family: 'Space Grotesk'; font-size: 0.7rem; letter-spacing: 3px; color: var(--pink); text-transform: uppercase; margin-bottom: 20px; display: block; }
            .watchlist-empty { font-family: monospace; font-size: 0.75rem; color: #30363d; letter-spacing: 2px; }
            .watchlist-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
            .watchlist-chip { display: flex; align-items: center; gap: 8px; background: rgba(255,0,127,0.08); border: 1px solid rgba(255,0,127,0.3); border-radius: 6px; padding: 8px 14px; font-family: 'Space Grotesk'; font-size: 0.85rem; font-weight: 700; color: #fff; cursor: pointer; transition: 0.2s; }
            .watchlist-chip:hover { background: rgba(255,0,127,0.15); border-color: var(--pink); }
            .watchlist-chip .remove { color: #30363d; font-size: 0.7rem; margin-left: 4px; transition: 0.2s; }
            .watchlist-chip:hover .remove { color: var(--pink); }
            .watchlist-add-btn { background: transparent; border: 1px dashed #30363d; border-radius: 6px; padding: 8px 14px; color: #30363d; font-family: monospace; font-size: 0.75rem; letter-spacing: 1px; cursor: pointer; transition: 0.2s; }
            .watchlist-add-btn:hover { border-color: var(--pink); color: var(--pink); }

            /* ── FOOTER ── */
            footer { text-align: center; padding: 120px 40px; color: #30363d; font-size: 0.75rem; border-top: 1px solid var(--border); letter-spacing: 2px; }

            /* ── MOBILE ── */
            @media (max-width: 768px) {
                nav { padding: 12px 20px; }
                .nav-links { display: none; flex-direction: column; position: absolute; top: 100%; left: 0; width: 100%; background: rgba(1,4,9,0.98); border-bottom: 1px solid var(--border); padding: 20px; gap: 16px; }
                .nav-links.open { display: flex; }
                .nav-links a { margin-left: 0; font-size: 0.85rem; }
                .hamburger { display: flex; }
                .page { padding-top: 95px; }
                .container { margin: 30px auto; }
                .bento-grid { grid-template-columns: 1fr; }
                .heatmap-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
                .search-input { max-width: 100%; font-size: 1.1rem; }
                .search-btn { width: 100%; }
                .result-card h2 { font-size: 2rem; }
                .hero-text h2 { letter-spacing: -2px; }
                .btn-glow { padding: 14px 30px; font-size: 0.7rem; }
                .watchlist-section, .search-section { padding: 24px; }
            }
        </style>
    </head>
    <body>

        <!-- PAGE LOAD OVERLAY -->
        <div class="init-overlay" id="initOverlay">
            <div class="init-logo">QUANTARA<span>CORE</span></div>
            <div class="init-bar"></div>
            <div class="init-text">INITIALIZING FEED...</div>
        </div>

        <div class="top-ticker">
            <div class="ticker-move">
                ${tickerHtml} • ${tickerHtml} • ${tickerHtml}
            </div>
        </div>

        <nav>
            <a onclick="showPage('home')" class="logo">QUANTARA<span>CORE</span></a>
            <div class="nav-links" id="navLinks">
                <a onclick="showPage('home')">Home</a>
                <a onclick="showPage('terminal')">Terminal</a>
                <a onclick="showPage('market')">Market Map</a>
                <a onclick="showPage('watchlist')">Watchlist</a>
                <a href="https://github.com/Tyler5018/Quantara" target="_blank">Source</a>
            </div>
            <div class="hamburger" id="hamburger" onclick="toggleNav()">
                <span></span><span></span><span></span>
            </div>
        </nav>

        <!-- HOME -->
        <div id="home" class="page active-page">
            <div class="hero-slider">
                <div class="slides" id="slide-engine">
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1611974714658-058e11e3b123?auto=format&fit=crop&q=80&w=800">
                        <div class="hero-text">
                            <p style="color:var(--cyan)">SYSTEM v11.0 ACTIVE</p>
                            <h2>QUANTARA CORE</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Initialize Analysis</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=800">
                        <div class="hero-text">
                            <p style="color:var(--green)">REAL-TIME MARKET FEED</p>
                            <h2>ALGORITHMIC EDGE</h2>
                            <a onclick="showPage('market')" class="btn-glow">View Heatmap</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800">
                        <div class="hero-text">
                            <p style="color:var(--pink)">NEURAL ANALYSIS</p>
                            <h2>HEDGE FUND DATA</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Access Terminal</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1639754390580-2e7437267698?auto=format&fit=crop&q=80&w=800">
                        <div class="hero-text">
                            <p style="color:#fff">PREDICTIVE MODELING</p>
                            <h2>QUANTUM POWER</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Start Deep Dive</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TERMINAL -->
        <div id="terminal" class="page">
            <div class="container">
                <div class="search-section">
                    <span class="search-label">// Ticker Intelligence Search</span>
                    <div class="search-row">
                        <input
                            class="search-input"
                            id="tickerInput"
                            type="text"
                            placeholder="e.g. AAPL"
                            maxlength="5"
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <button class="search-btn" id="searchBtn" onclick="searchTicker()">Run Analysis</button>
                    </div>
                    <div class="scanning" id="scanningIndicator">
                        <div class="scan-dot"></div>
                        <div class="scan-dot"></div>
                        <div class="scan-dot"></div>
                        <span>SCANNING MARKETS...</span>
                    </div>
                    <div class="search-result" id="searchResult"></div>
                </div>

                <h2 style="font-family:'Space Grotesk'; font-size:3rem; margin-bottom:10px; letter-spacing:-2px;">CORE_ANALYSIS</h2>
                ${updatedAtHtml}
                <div class="bento-grid">${content}</div>
            </div>
        </div>

        <!-- MARKET MAP -->
        <div id="market" class="page">
            <div class="container">
                <h2 style="font-family:'Space Grotesk'; font-size:3rem; margin-bottom:10px; letter-spacing:-2px;">MARKET_HEATMAP</h2>
                <p style="color:#8b949e; margin-bottom:40px;">Visualizing intensity of daily price action. Click any box to analyze.</p>
                <div class="heatmap-grid">${heatmapItems}</div>
            </div>
        </div>

        <!-- WATCHLIST -->
        <div id="watchlist" class="page">
            <div class="container">
                <h2 style="font-family:'Space Grotesk'; font-size:3rem; margin-bottom:40px; letter-spacing:-2px;">WATCHLIST</h2>
                <div class="watchlist-section">
                    <span class="watchlist-label">// Saved Tickers</span>
                    <div id="watchlistChips" class="watchlist-chips"></div>
                    <p id="watchlistEmpty" class="watchlist-empty" style="display:none;">// NO TICKERS SAVED — search a ticker on the Terminal page and save it</p>
                    <button class="watchlist-add-btn" style="margin-top:20px;" onclick="showPage('terminal')">+ ADD VIA SEARCH</button>
                </div>
            </div>
        </div>

        <footer>&copy; ${month} ${year} // QUANTARA CORE INSTITUTIONAL // NO FINANCIAL ADVICE</footer>

        <script>
            // ── INIT OVERLAY ──
            window.addEventListener('load', () => {
                setTimeout(() => {
                    document.getElementById('initOverlay').classList.add('hidden');
                }, 1400);
            });

            // ── NAV ──
            function toggleNav() {
                document.getElementById('navLinks').classList.toggle('open');
            }

            function showPage(pageId) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
                document.getElementById(pageId).classList.add('active-page');
                document.getElementById('navLinks').classList.remove('open');
                window.scrollTo(0, 0);
                if (pageId === 'watchlist') renderWatchlist();
            }

            // ── HERO SLIDER ──
            let idx = 0;
            const engine = document.getElementById('slide-engine');
            setInterval(() => {
                idx = (idx + 1) % 4;
                engine.style.transform = 'translateX(-' + (idx * 100) + '%)';
            }, 7000);

            // ── HEATMAP CLICK ──
            function heatmapSearch(ticker) {
                showPage('terminal');
                document.getElementById('tickerInput').value = ticker;
                searchTicker();
            }

            // ── SEARCH ──
            const tickerInput = document.getElementById('tickerInput');
            const searchBtn = document.getElementById('searchBtn');
            const scanningIndicator = document.getElementById('scanningIndicator');
            const searchResult = document.getElementById('searchResult');

            tickerInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') searchTicker();
            });

            async function searchTicker() {
                const raw = tickerInput.value.trim().toUpperCase();
                if (!raw || !/^[A-Z]{1,5}$/.test(raw)) {
                    showSearchError('Enter a valid ticker symbol (1-5 letters).');
                    return;
                }

                searchBtn.disabled = true;
                scanningIndicator.classList.add('active');
                searchResult.classList.remove('visible');
                searchResult.innerHTML = '';

                try {
                    const response = await fetch('/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ticker: raw })
                    });
                    const data = await response.json();

                    if (data.error) {
                        showSearchError(data.error);
                        return;
                    }

                    const changeClass = data.isPositive ? '' : 'negative';
                    const riskClass = data.risk;
                    const isSaved = getWatchlist().includes(data.ticker);

                    searchResult.innerHTML = \`
                        <div class="result-card">
                            <div class="card-head">
                                <h2>\${data.ticker}</h2>
                                <div class="result-meta">
                                    <div class="result-price">$\${data.price}</div>
                                    <div class="change \${changeClass}" style="font-size:1rem; margin-top:4px;">\${data.change}</div>
                                </div>
                            </div>
                            <div class="glow-line"></div>
                            <p class="thesis">\${data.thesis}</p>
                            <div class="card-footer">
                                <div class="status \${riskClass}">\${riskClass}</div>
                                <div style="display:flex;gap:16px;align-items:center;">
                                    <button id="wlBtn_\${data.ticker}" onclick="toggleWatchlist('\${data.ticker}')" style="background:transparent;border:1px solid \${isSaved ? 'var(--pink)' : '#30363d'};color:\${isSaved ? 'var(--pink)' : '#8b949e'};border-radius:4px;padding:6px 14px;font-size:0.65rem;font-weight:800;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:0.3s;">
                                        \${isSaved ? '★ SAVED' : '☆ WATCHLIST'}
                                    </button>
                                    <a href="https://www.tradingview.com/symbols/\${data.ticker}/" target="_blank" class="chart-btn">Analysis</a>
                                </div>
                            </div>
                        </div>
                    \`;
                    searchResult.classList.add('visible');

                } catch (err) {
                    showSearchError('Network error. Please try again.');
                } finally {
                    searchBtn.disabled = false;
                    scanningIndicator.classList.remove('active');
                }
            }

            function showSearchError(msg) {
                searchResult.innerHTML = \`<div class="search-error">// ERROR: \${msg}</div>\`;
                searchResult.classList.add('visible');
                searchBtn.disabled = false;
                scanningIndicator.classList.remove('active');
            }

            // ── WATCHLIST ──
            function getWatchlist() {
                return JSON.parse(localStorage.getItem('quantara_watchlist') || '[]');
            }

            function saveWatchlist(list) {
                localStorage.setItem('quantara_watchlist', JSON.stringify(list));
            }

            function toggleWatchlist(ticker) {
                let list = getWatchlist();
                const btn = document.getElementById('wlBtn_' + ticker);
                if (list.includes(ticker)) {
                    list = list.filter(t => t !== ticker);
                    if (btn) { btn.textContent = '☆ WATCHLIST'; btn.style.borderColor = '#30363d'; btn.style.color = '#8b949e'; }
                } else {
                    list.push(ticker);
                    if (btn) { btn.textContent = '★ SAVED'; btn.style.borderColor = 'var(--pink)'; btn.style.color = 'var(--pink)'; }
                }
                saveWatchlist(list);
            }

            function removeFromWatchlist(ticker) {
                saveWatchlist(getWatchlist().filter(t => t !== ticker));
                renderWatchlist();
            }

            function renderWatchlist() {
                const list = getWatchlist();
                const chips = document.getElementById('watchlistChips');
                const empty = document.getElementById('watchlistEmpty');
                if (list.length === 0) {
                    chips.innerHTML = '';
                    empty.style.display = 'block';
                    return;
                }
                empty.style.display = 'none';
                chips.innerHTML = list.map(ticker => \`
                    <div class="watchlist-chip" onclick="watchlistAnalyze('\${ticker}')">
                        \${ticker}
                        <span class="remove" onclick="event.stopPropagation(); removeFromWatchlist('\${ticker}')" title="Remove">✕</span>
                    </div>
                \`).join('');
            }

            function watchlistAnalyze(ticker) {
                showPage('terminal');
                document.getElementById('tickerInput').value = ticker;
                searchTicker();
            }
        </script>
    </body>
    </html>`;
}

app.listen(port, () => { console.log("Quantara Core v11.0 Active"); });
