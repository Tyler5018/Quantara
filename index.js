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

        // 1. Check Memory
        if (fs.existsSync(CACHE_FILE)) {
            const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cachedData.date === today) {
                return res.send(renderPage(cachedData.html));
            }
        }

        // 2. Fetch Market Data
        const stockUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
        const stockResponse = await axios.get(stockUrl);
        const topGainers = stockResponse.data.top_gainers || [];
        
        let stockSummary = "NVDA, AAPL, TSLA, MSFT, AMD";
        if (topGainers.length > 0) {
            stockSummary = topGainers.slice(0, 10).map(s => `${s.ticker} (${s.change_percentage})`).join(", ");
        }

        // 3. Ask AI (With strict formatting instructions)
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: "You are Quantara. For each of the 5 stocks, output EXACTLY this: <div class='card'><div class='card-row'><h2>TICKER</h2><span class='badge RISK'>RISK</span></div><p>THESIS</p></div>. Use 'Low', 'Mid', or 'High' for risk." 
                },
                { role: "user", content: `Analyze: ${stockSummary}. Pick top 5.` }
            ],
            model: MODEL_NAME,
        });

        const aiHtml = chatCompletion.choices[0]?.message?.content || "";

        // 4. Save and Render
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: today, html: aiHtml }));
        res.send(renderPage(aiHtml));

    } catch (err) {
        res.status(500).send(renderPage(`<p>Quantara is recalibrating. Refresh in 30s. Error: ${err.message}</p>`));
    }
});

function renderPage(content) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Quantara | AI Terminal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
            :root { --bg: #020617; --card: #0f172a; --accent: #38bdf8; --border: #1e293b; }
            body { background: var(--bg); color: #f8fafc; font-family: 'Inter', sans-serif; margin: 0; padding: 40px 20px; display: flex; justify-content: center; }
            .container { max-width: 650px; width: 100%; }
            header { text-align: center; margin-bottom: 40px; }
            h1 { font-size: 3rem; font-weight: 800; letter-spacing: -2px; margin: 0; background: linear-gradient(to right, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .date { color: #64748b; font-size: 0.8rem; letter-spacing: 2px; text-transform: uppercase; margin-top: 8px; }
            
            .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 16px; transition: 0.3s; }
            .card:hover { border-color: var(--accent); transform: translateY(-2px); }
            .card-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            h2 { margin: 0; color: var(--accent); font-size: 1.4rem; }
            p { margin: 0; color: #94a3b8; line-height: 1.5; font-size: 1rem; }
            
            .badge { font-size: 0.65rem; padding: 4px 10px; border-radius: 99px; font-weight: 700; text-transform: uppercase; border: 1px solid currentColor; }
            .Low { color: #34d399; } .Mid { color: #fbbf24; } .High { color: #f87171; }
            
            footer { margin-top: 40px; text-align: center; font-size: 0.7rem; color: #334155; line-height: 1.8; }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>QUANTARA</h1>
                <div class="date">AI Terminal • ${new Date().toLocaleDateString()}</div>
            </header>
            ${content}
            <footer>
                QUANTARA IS AN AI RESEARCH EXPERIMENT. NOT FINANCIAL ADVICE.<br>
                POWERED BY LLAMA 3.3 & ALPHA VANTAGE.
            </footer>
        </div>
    </body>
    </html>`;
}

app.listen(port, () => { console.log(`Live at port ${port}`); });