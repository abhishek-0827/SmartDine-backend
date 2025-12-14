const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.HF_API_KEY;

async function testUrl(url, modelName) {
    console.log(`Testing URL: ${url} with model: ${modelName}`);
    try {
        const response = await axios.post(
            url,
            { inputs: "Hello", parameters: { max_new_tokens: 10 } },
            { headers: { Authorization: `Bearer ${API_KEY}` } }
        );
        console.log(`SUCCESS: ${url} - Status: ${response.status}`);
        console.log('Response:', JSON.stringify(response.data));
        return true;
    } catch (error) {
        console.log(`FAILED: ${url} - Status: ${error.response ? error.response.status : error.message}`);
        if (error.response && error.response.data) {
            console.log('Error data:', JSON.stringify(error.response.data).substring(0, 200));
        }
        return false;
    }
}

async function runTests() {
    const model = "google/flan-t5-large";
    await testUrl(`https://router.huggingface.co/${model}`, model);
}

runTests();
