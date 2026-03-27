require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const Groq = require("groq-sdk");

const app = express();
const port = process.env.PORT || 3000;

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CACHE_FILE = './daily_picks.json';
const MODEL_NAME = "llama-3.3-70b-versatile";

app.get('/', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString();

        if (fs.existsSync(CACHE_FILE)) {
            const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cachedData.date === today) {
                return res.send(renderPage(cachedData.html, cachedData.rawStocks));
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
                { ticker: "MU", change_percentage: "7.1%" },
                { ticker: "AMD", change_percentage: "2.9%" },
                { ticker: "TSLA", change_percentage: "5.4%" }
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
        const finalData = { date: today, html: aiHtml, rawStocks: filteredStocks.slice(0, 18) };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(finalData));
        
        res.send(renderPage(aiHtml, finalData.rawStocks));

    } catch (err) {
        res.send(renderPage(`<div class="error">Quantara Core: Updating Live Feeds...</div>`, []));
    }
});

function renderPage(content, rawStocks) {
    const tickerHtml = rawStocks.slice(0,10).map(s => `
        <span class="ticker-item"><span class="t-sym">${s.ticker}</span> <span class="t-pct">+${s.change_percentage}</span></span>
    `).join(' • ');

    const heatmapItems = rawStocks.map(s => {
        const val = parseFloat(s.change_percentage);
        return `
            <div class="map-box" style="background: linear-gradient(145deg, rgba(16, 185, 129, ${val/20 + 0.1}), rgba(6, 78, 59, 0.4)); border-color: rgba(16, 185, 129, ${val/15})">
                <span class="map-ticker">${s.ticker}</span>
                <span class="map-pct">+${s.change_percentage}</span>
                <div class="map-glow"></div>
            </div>
        `;
    }).join('');

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

            .top-ticker { position: fixed; top: 0; width: 100%; height: 35px; background: rgba(0,0,0,0.8); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); z-index: 1001; overflow: hidden; display: flex; align-items: center; }
            .ticker-move { display: flex; white-space: nowrap; animation: tickerScroll 35s linear infinite; }
            .ticker-item { padding: 0 30px; font-family: monospace; font-size: 0.7rem; letter-spacing: 1px; }
            .t-sym { color: #fff; font-weight: bold; }
            .t-pct { color: var(--green); text-shadow: 0 0 10px rgba(0, 255, 157, 0.3); }
            @keyframes tickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

            nav {
                position: fixed; top: 35px; width: 100%; z-index: 1000;
                background: rgba(1, 4, 9, 0.7); backdrop-filter: blur(15px);
                border-bottom: 1px solid var(--border); padding: 15px 40px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .logo { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.4rem; color: #fff; text-decoration: none; }
            .logo span { background: linear-gradient(to right, var(--cyan), var(--pink)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-left: 5px; }

            .nav-links a { color: #8b949e; text-decoration: none; margin-left: 30px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; cursor: pointer; transition: 0.3s; }
            .nav-links a:hover { color: var(--cyan); }

            .page { display: none; padding-top: 110px; min-height: 100vh; }
            .active-page { display: block; }

            .hero-slider { width: 100%; height: 85vh; position: relative; overflow: hidden; background: #000; }
            .slides { display: flex; transition: transform 1.2s cubic-bezier(0.7, 0, 0.3, 1); height: 100%; }
            .slide { min-width: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
            .slide img { position: absolute; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; z-index: -1; }
            
            .hero-text { text-align: center; max-width: 900px; }
            .hero-text h2 { 
                font-family: 'Space Grotesk'; font-size: clamp(3.5rem, 10vw, 6.5rem); margin: 0; 
                background: linear-gradient(135deg, #fff 30%, var(--cyan) 70%, var(--pink) 100%);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent; 
                letter-spacing: -5px; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5));
            }
            .hero-text p { letter-spacing: 12px; font-weight: 700; margin-top: 20px; font-size: 0.8rem; }

            .btn-glow { margin-top: 50px; display: inline-block; background: transparent; color: #fff; border: 1px solid var(--cyan); padding: 18px 50px; border-radius: 4px; text-decoration: none; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 3px; transition: 0.4s; position: relative; overflow: hidden; }
            .btn-glow:hover { background: var(--cyan); color: #000; box-shadow: 0 0 40px var(--cyan); }

            .container { max-width: 1200px; margin: 50px auto; padding: 0 20px; }
            .bento-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; }
            .bento-item { background: var(--glass); border: 1px solid var(--border); border-radius: 24px; padding: 40px; backdrop-filter: blur(20px); transition: 0.4s; position: relative; }
            .bento-item:hover { border-color: var(--cyan); transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
            
            .ticker-text { font-family: 'Space Grotesk'; font-size: 2.8rem; color: #fff; margin: 0; letter-spacing: -2px; }
            .change { color: var(--green); font-weight: 800; font-family: monospace; font-size: 1.3rem; }
            .glow-line { height: 1px; width: 100%; background: linear-gradient(90deg, var(--cyan), transparent); margin: 20px 0; }
            .thesis { color: #8b949e; line-height: 1.8; font-size: 1.1rem; font-weight: 300; }
            
            .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 35px; }
            .status { font-size: 0.65rem; padding: 6px 16px; border-radius: 4px; border: 1px solid currentColor; font-weight: 800; text-transform: uppercase; }
            .Low { color: var(--green); } .Mid { color: #f59e0b; } .High { color: var(--pink); }
            .chart-btn { color: #fff; font-size: 0.7rem; text-decoration: none; opacity: 0.5; transition: 0.3s; }
            .chart-btn:hover { opacity: 1; text-decoration: underline; }

            /* Elite Heatmap */
            .heatmap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 40px; }
            .map-box { 
                height: 140px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);
                display: flex; flex-direction: column; align-items: center; justify-content: center; 
                position: relative; overflow: hidden; transition: 0.3s; cursor: crosshair;
            }
            .map-box:hover { transform: scale(1.03); border-color: #fff; z-index: 5; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
            .map-ticker { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.6rem; color: #fff; }
            .map-pct { font-size: 0.85rem; font-weight: bold; margin-top: 8px; color: var(--green); }

            footer { text-align: center; padding: 120px 40px; color: #30363d; font-size: 0.75rem; border-top: 1px solid var(--border); letter-spacing: 2px; }
        </style>
    </head>
    <body>
        <div class="top-ticker">
            <div class="ticker-move">
                ${tickerHtml} • ${tickerHtml} • ${tickerHtml}
            </div>
        </div>

        <nav>
            <a onclick="showPage('home')" class="logo">QUANTARA<span>CORE</span></a>
            <div class="nav-links">
                <a onclick="showPage('home')">Home</a>
                <a onclick="showPage('terminal')">Terminal</a>
                <a onclick="showPage('market')">Market Map</a>
                <a href="https://github.com/Tyler5018/Quantara" target="_blank">Source</a>
            </div>
        </nav>

        <div id="home" class="page active-page">
            <div class="hero-slider">
                <div class="slides" id="slide-engine">
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1611974714658-058e11e3b123?auto=format&fit=crop&q=80&w=1600">
                        <div class="hero-text">
                            <p style="color:var(--cyan)">SYSTEM v11.0 ACTIVE</p>
                            <h2>QUANTARA CORE</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Initialize Analysis</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1600">
                        <div class="hero-text">
                            <p style="color:var(--green)">REAL-TIME MARKET FEED</p>
                            <h2>ALGORITHMIC EDGE</h2>
                            <a onclick="showPage('market')" class="btn-glow">View Heatmap</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1600">
                        <div class="hero-text">
                            <p style="color:var(--pink)">NEURAL ANALYSIS</p>
                            <h2>HEDGE FUND DATA</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Access Terminal</a>
                        </div>
                    </div>
                    <div class="slide">
                        <img src="https://images.unsplash.com/photo-1639754390580-2e7437267698?auto=format&fit=crop&q=80&w=1600">
                        <div class="hero-text">
                            <p style="color:#fff">PREDICTIVE MODELING</p>
                            <h2>QUANTUM POWER</h2>
                            <a onclick="showPage('terminal')" class="btn-glow">Start Deep Dive</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div id="terminal" class="page">
            <div class="container">
                <h2 style="font-family:'Space Grotesk'; font-size:3rem; margin-bottom:40px; letter-spacing:-2px;">CORE_ANALYSIS</h2>
                <div class="bento-grid">${content}</div>
            </div>
        </div>

        <div id="market" class="page">
            <div class="container">
                <h2 style="font-family:'Space Grotesk'; font-size:3rem; margin-bottom:10px; letter-spacing:-2px;">MARKET_HEATMAP</h2>
                <p style="color:#8b949e; margin-bottom:40px;">Visualizing intensity of daily price action.</p>
                <div class="heatmap-grid">${heatmapItems}</div>
            </div>
        </div>

        <footer>&copy; MARCH 2026 // QUANTARA CORE INSTITUTIONAL // NO FINANCIAL ADVICE</footer>

        <script>
            function showPage(pageId) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
                document.getElementById(pageId).classList.add('active-page');
                window.scrollTo(0,0);
            }

            let idx = 0;
            const engine = document.getElementById('slide-engine');
            setInterval(() => {
                idx = (idx + 1) % 4;
                engine.style.transform = 'translateX(-' + (idx * 100) + '%)';
            }, 7000);
        </script>
    </body>
    </html>`;
}

app.listen(port, () => { console.log("Quantara Core v11.0 Active"); });
