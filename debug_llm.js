import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.OPENROUTER_API_KEY;
const url = "https://openrouter.ai/api/v1/chat/completions";

async function runLogged() {
    console.log("Sending request to OpenRouter...");
    try {
        const res = await axios.post(url, {
            model: process.env.OPENROUTER_MODEL || "amazon/nova-2-lite-v1:free",
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 16
        }, {
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "SmartDine Debug"
            },
            validateStatus: () => true
        });

        const output = `Status: ${res.status} ${res.statusText}\n\n--- Headers ---\n${JSON.stringify(res.headers, null, 2)}\n\n--- Body ---\n${JSON.stringify(res.data, null, 2)}`;
        fs.writeFileSync('debug_output.txt', output);
        console.log("Wrote to debug_output.txt");
    } catch (e) {
        fs.writeFileSync('debug_output.txt', "Error: " + e.message);
        console.log("Error:", e.message);
    }
}
runLogged();
