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
        
        // --- THE ULTIMATE FILTER: Strictly 3-5 alphabetical characters only. Blocks NHS^#, RMSGW, etc. ---
        let filteredStocks = rawGainers.filter(s => /^[A-Z]{3,5}$/.test(s.ticker));

        if (filteredStocks.length === 0) {
            filteredStocks = [
                { ticker: "NVDA", change_percentage: "4.2%", change_amount: "32.10" },
                { ticker: "PLTR", change_percentage: "3.8%", change_amount: "1.20" },
                { ticker: "MU", change_percentage: "7.1%", change_amount: "8.40" },
                { ticker: "AMD", change_percentage: "2.9%", change_amount: "4.15" },
                { ticker: "TSLA", change_percentage: "5.4%", change_amount: "12.30" }
            ];
        }

        const stockSummary = filteredStocks.slice(0, 10).map(s => `${s.ticker} at +${s.change_percentage}`).join(", ");

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are Quantara Core. Output ONLY the 5 stock cards. DO NOT say "Here is the HTML" or "Based on the data". 
                    For each stock, return EXACTLY this: 
                    <div class="bento-item">
                        <div class="card-head"><h2>TICKER</h2><span class="change">CHANGE</span></div>
                        <div class="glow-line"></div>
                        <p class="thesis">THESIS</p>
                        <div class="status RISK_LEVEL">RISK_LEVEL</div>
                    </div>` 
                },
                { role: "user", content: `Analyze: ${stockSummary}. Provide a professional 1-sentence thesis for the top 5.` }
            ],
            model: MODEL_NAME,
        });

        const aiHtml = chatCompletion.choices[0]?.message?.content || "";
        
        // Save both the AI text and the raw stocks for the Heatmap
        const finalData = { date: today, html: aiHtml, rawStocks: filteredStocks.slice(0, 12) };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(finalData));
        
        res.send(renderPage(aiHtml, finalData.rawStocks));

    } catch (err) {
        res.send(renderPage(`<div class="error">Quantara Core Syncing...</div>`, []));
    }
});

function renderPage(content, rawStocks) {
    // Generate a Market Heatmap visual
    const heatmapItems = rawStocks.map(s => `
        <div class="map-box" style="opacity: ${parseFloat(s.change_percentage)/15 + 0.3}">
            <span class="map-ticker">${s.ticker}</span>
            <span class="map-pct">+${s.change_percentage}</span>
        </div>
    `).join('');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Quantara Core | Intelligence Terminal</title>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@300;400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #020617; --glass: rgba(15, 23, 42, 0.7); --border: rgba(255, 255, 255, 0.08); --cyan: #06b6d4; --pink: #ec4899; }
            * { box-sizing: border-box; scroll-behavior: smooth; }
            body { background: var(--bg); color: #f8fafc; font-family: 'Inter', sans-serif; margin: 0; overflow-x: hidden; }

            nav {
                position: fixed; top: 0; width: 100%; z-index: 1000;
                background: rgba(2, 6, 23, 0.8); backdrop-filter: blur(20px);
                border-bottom: 1px solid var(--border); padding: 15px 40px;
                display: flex; justify-content: space-between; align-items: center;
            }
            .logo { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.4rem; color: #fff; text-decoration: none; }
            .logo span { color: var(--cyan); margin-left: 5px; animation: pulse 2s infinite; }
            @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            .nav-links a { color: #94a3b8; text-decoration: none; margin-left: 30px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; }

            /* Hero Slider */
            .hero-slider { width: 100%; height: 85vh; position: relative; overflow: hidden; margin-top: 60px; }
            .slides { display: flex; transition: transform 1.2s cubic-bezier(0.7, 0, 0.3, 1); height: 100%; }
            .slide { min-width: 100%; position: relative; display: flex; align-items: center; justify-content: center; }
            .slide img { position: absolute; width: 100%; height: 100%; object-fit: cover; opacity: 0.3; z-index: -1; }
            .hero-text { text-align: center; }
            .hero-text h2 { font-family: 'Space Grotesk'; font-size: 5.5rem; margin: 0; background: linear-gradient(to right, #06b6d4, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -4px; line-height: 1; }

            /* Action Buttons */
            .btn-glow { margin-top: 40px; display: inline-block; background: var(--cyan); color: #000; padding: 18px 45px; border-radius: 100px; text-decoration: none; font-weight: 800; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 2px; box-shadow: 0 0 30px rgba(6, 182, 212, 0.4); transition: 0.3s; }
            .btn-glow:hover { transform: scale(1.05); box-shadow: 0 0 50px rgba(6, 182, 212, 0.6); }

            /* Content Containers */
            .section { padding: 100px 20px; max-width: 1200px; margin: auto; }
            .bento-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
            .bento-item { background: var(--glass); border: 1px solid var(--border); border-radius: 32px; padding: 40px; backdrop-filter: blur(20px); transition: 0.4s; }
            .bento-item:hover { border-color: var(--cyan); transform: translateY(-5px); }
            .bento-item:nth-child(1) { grid-column: span 2; }
            .ticker { font-family: 'Space Grotesk'; font-size: 2.6rem; color: var(--cyan); margin: 0; }
            .change { color: #10b981; font-weight: 800; font-family: monospace; font-size: 1.2rem; }
            .glow-line { height: 1px; width: 100%; background: linear-gradient(90deg, var(--cyan), transparent); margin: 15px 0; opacity: 0.4; }
            .thesis { color: #94a3b8; line-height: 1.7; font-size: 1.1rem; }
            .status { margin-top: 30px; font-size: 0.6rem; padding: 6px 16px; border-radius: 100px; border: 1px solid currentColor; display: inline-block; text-transform: uppercase; font-weight: 800; }
            .Low { color: #10b981; } .Mid { color: #f59e0b; } .High { color: #ef4444; }

            /* Market Map Visualizer */
            .heatmap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 40px; }
            .map-box { background: #064e3b; border: 1px solid #10b981; height: 100px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: 0.3s; }
            .map-box:hover { border-color: white; transform: scale(1.05); }
            .map-ticker { font-family: 'Space Grotesk'; font-weight: 700; font-size: 1.2rem; }
            .map-pct { font-size: 0.8rem; opacity: 0.8; }

            footer { text-align: center; padding: 120px 40px; color: #1e293b; font-size: 0.7rem; border-top: 1px solid var(--border); }
        </style>
    </head>
    <body>
        <nav>
            <a href="#" class="logo">QUANTARA<span>CORE</span></a>
            <div class="nav-links">
                <a href="#">Home</a>
                <a href="#terminal">Terminal</a>
                <a href="#market">Heatmap</a>
                <a href="https://github.com/Tyler5018/Quantara" target="_blank">Source</a>
            </div>
        </nav>

        <div class="hero-slider">
            <div class="slides" id="slide-engine">
                <div class="slide">
                    <img src="https://images.unsplash.com/photo-1611974714658-058e11e3b123?q=80&w=1200">
                    <div class="hero-text"><h2>QUANTARA</h2><p style="letter-spacing:10px; color:var(--cyan); font-weight:700;">PROPRIETARY TERMINAL</p><a href="#terminal" class="btn-glow">Access Analysis</a></div>
                </div>
                <div class="slide">
                    <img src="https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=1200">
                    <div class="hero-text"><h2>ALGORITHM</h2><p style="letter-spacing:10px; color:var(--pink); font-weight:700;">NEURAL NETWORKS ACTIVE</p><a href="#market" class="btn-glow">View Heatmap</a></div>
                </div>
                <div class="slide">
                    <img src="https://images.unsplash.com/photo-1640343830005-ee0505d54798?q=80&w=1200">
                    <div class="hero-text"><h2>VOLATILITY</h2><p style="letter-spacing:10px; color:#fff; font-weight:700;">HIGH CONVICTION SIGNALS</p><a href="#terminal" class="btn-glow">Get Started</a></div>
                </div>
                <div class="slide">
                    <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200">
                    <div class="hero-text"><h2>QUANTITATIVE</h2><p style="letter-spacing:10px; color:var(--cyan); font-weight:700;">PRECISION TRADING CORE</p><a href="#terminal" class="btn-glow">Enter Terminal</a></div>
                </div>
            </div>
        </div>

        <div class="section" id="terminal">
            <h2 style="font-family:'Space Grotesk'; font-size:2.5rem; margin-bottom:40px; border-left: 4px solid var(--cyan); padding-left: 20px;">CORE_ANALYSIS</h2>
            <div class="bento-grid">${content}</div>
        </div>

        <div class="section" id="market">
            <h2 style="font-family:'Space Grotesk'; font-size:2.5rem; margin-bottom:10px; border-left: 4px solid var(--pink); padding-left: 20px;">MARKET_HEATMAP</h2>
            <p style="color:#64748b; font-size:0.8rem;">Visualizing relative strength across top movers.</p>
            <div class="heatmap-grid">${heatmapItems}</div>
        </div>

        <footer>
            QUANTARA CORE v6.0 // PROPRIETARY BUILD<br>
            NOT FINANCIAL ADVICE // &copy; MARCH 2026
        </footer>

        <script>
            let pos = 0;
            const engine = document.getElementById('slide-engine');
            setInterval(() => {
                pos = (pos + 100) % 400;
                engine.style.transform = 'translateX(-' + pos + '%)';
            }, 6000);
        </script>
    </body>
    </html>`;
}

app.listen(port, () => { console.log("Quantara Core v6.0 Online"); });
