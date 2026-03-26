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
                return res.send(renderPage(cachedData.html));
            }
        }

        const stockUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
        const stockResponse = await axios.get(stockUrl);
        const topGainers = stockResponse.data.top_gainers || [];
        const stockSummary = topGainers.slice(0, 10).map(s => `${s.ticker}: ${s.change_percentage}`).join(", ");

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are Quantara Core. For the top 5 stocks, return EXACTLY this HTML for each: 
                    <div class="bento-card">
                        <div class="card-top">
                            <h2 class="ticker">TICKER</h2>
                            <span class="pct">CHANGE_PERCENTAGE</span>
                        </div>
                        <div class="visual-bar"></div>
                        <p class="thesis">1-SENTENCE_THESIS</p>
                        <div class="tag RISK_LEVEL">RISK_LEVEL</div>
                    </div>` 
                },
                { role: "user", content: `Analyze: ${stockSummary}. Pick top 5.` }
            ],
            model: MODEL_NAME,
        });

        const aiHtml = chatCompletion.choices[0]?.message?.content || "";
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: today, html: aiHtml }));
        res.send(renderPage(aiHtml));

    } catch (err) {
        res.status(500).send(renderPage(`<div class="error">System Sync Required. Refreshing...</div>`));
    }
});

function renderPage(content) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Quantara | Terminal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
            :root { --bg: #050505; --card: rgba(17, 25, 40, 0.75); --accent: #00d2ff; }
            body { 
                background: var(--bg); color: #e2e8f0; font-family: 'Inter', sans-serif; 
                margin: 0; padding: 60px 20px; display: flex; flex-direction: column; align-items: center; 
                background-image: radial-gradient(circle at 50% -20%, #1e293b 0%, #050505 80%);
            }
            .container { max-width: 900px; width: 100%; }
            header { border-left: 4px solid var(--accent); padding-left: 20px; margin-bottom: 50px; }
            h1 { font-family: 'Space Grotesk', sans-serif; font-size: 3.5rem; margin: 0; letter-spacing: -3px; text-transform: uppercase; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
            .bento-card { 
                background: var(--card); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); 
                border-radius: 24px; padding: 30px; transition: 0.4s; 
            }
            .bento-card:hover { transform: translateY(-5px); border-color: var(--accent); box-shadow: 0 0 30px rgba(0, 210, 255, 0.2); }
            .ticker { font-family: 'Space Grotesk', sans-serif; font-size: 1.8rem; margin: 0; }
            .pct { color: #10b981; font-weight: 700; }
            .visual-bar { height: 2px; background: var(--accent); margin: 15px 0; opacity: 0.3; }
            .thesis { color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }
            .tag { display: inline-block; margin-top: 20px; font-size: 0.6rem; padding: 4px 10px; border-radius: 100px; border: 1px solid currentColor; text-transform: uppercase; font-weight: 800; }
            .Low { color: #10b981; } .Mid { color: #f59e0b; } .High { color: #ef4444; }
            footer { margin-top: 60px; font-size: 0.7rem; color: #475569; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <header><h1>QUANTARA</h1><div style="letter-spacing:3px; font-size:0.7rem; color:#64748b;">V2.0 // TERMINAL ACTIVE</div></header>
            <div class="grid">${content}</div>
            <footer>QUANTARA CORE // NOT FINANCIAL ADVICE</footer>
        </div>
    </body>
    </html>`;
}

app.listen(port, () => { console.log(`Terminal Online`); });
