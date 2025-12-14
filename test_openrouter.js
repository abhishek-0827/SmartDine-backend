import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

async function testOpenRouter() {
    console.log(`Testing OpenRouter with model: ${OPENROUTER_MODEL}`);
    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: OPENROUTER_MODEL,
                messages: [
                    { role: "user", content: "Say hello in JSON format: { \"message\": \"hello\" }" }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'http://localhost:4000',
                    'X-Title': 'Smart Dine Test',
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("Response Status:", response.status);
        console.log("Response Data:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error:", error.message);
        if (error.response) {
            console.error("Error Data:", error.response.data);
        }
    }
}

testOpenRouter();
