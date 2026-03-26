require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const Groq = require("groq-sdk");

const app = express();
const port = 3000;

// UPDATED 2026 MODEL NAME
const MODEL_NAME = "llama-3.3-70b-versatile"; 

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const CACHE_FILE = './daily_picks.json';

app.get('/', async (req, res) => {
    try {
        const today = new Date().toLocaleDateString();

        // 1. Check Memory (Prevents hitting API limits)
        if (fs.existsSync(CACHE_FILE)) {
            const cachedData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cachedData.date === today) {
                console.log("📂 Serving picks from Daily Memory.");
                return res.send(renderPage(cachedData.html));
            }
        }

        console.log("🔄 Fetching Live Market Data...");
        
        // 2. Get Stocks from Alpha Vantage
        const stockUrl = `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
        const stockResponse = await axios.get(stockUrl);
        
        const topGainers = stockResponse.data.top_gainers || [];
        
        // Safety: If Alpha Vantage is empty, use a backup list
        let stockSummary = "NVDA, AAPL, TSLA, MSFT, AMD";
        if (topGainers.length > 0) {
            stockSummary = topGainers.slice(0, 10).map(s => `${s.ticker} (${s.change_percentage})`).join(", ");
        }

        // 3. Ask Groq AI (Llama 3.3)
        console.log(`🤖 Consulting Quantara AI (${MODEL_NAME})...`);
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ 
                role: "system", 
                content: "You are Quantara, a professional stock analyst. Provide responses in clean HTML format with <h2> titles." 
            }, { 
                role: "user", 
                content: `Analyze these moving stocks: ${stockSummary}. Pick the top 5 to watch today. For each, provide: Ticker, Why it's moving, and a Risk Rating.` 
            }],
            model: MODEL_NAME,
        });

        const aiHtml = chatCompletion.choices[0]?.message?.content || "AI Analysis failed to generate.";

        // 4. Save to Memory
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ date: today, html: aiHtml }));
        console.log("✅ Analysis saved to memory.");

        res.send(renderPage(aiHtml));

    } catch (err) {
        console.error("❌ ERROR:", err.message);
        res.status(500).send(`
            <body style="background:#020617; color:white; font-family:sans-serif; padding:50px;">
                <h1 style="color:#f87171;">Quantara Sync Error</h1>
                <p>Message: ${err.message}</p>
                <p>Wait 60 seconds and refresh.</p>
            </body>
        `);
    }
});

function renderPage(content) {
    return `
        <head><title>Quantara | AI Terminal</title></head>
        <body style="background:#020617; color:white; font-family:sans-serif; padding:50px; display:flex; justify-content:center;">
            <div style="max-width:800px; width:100%; background:#0f172a; padding:40px; border-radius:24px; border:1px solid #1e293b; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
                <h1 style="color:#38bdf8; text-align:center; font-size:3rem; margin-bottom:5px;">QUANTARA</h1>
                <p style="text-align:center; color:#64748b; letter-spacing:2px; font-size:0.8rem; margin-bottom:40px;">DAILY AI QUANTITATIVE REPORT</p>
                <div style="line-height:1.8;">${content}</div>
            </div>
        </body>
    `;
}

app.listen(port, () => {
    console.log(`Quantara is active: http://localhost:${port}`);
});