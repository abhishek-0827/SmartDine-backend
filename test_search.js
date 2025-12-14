import axios from 'axios';
import fs from 'fs';
import util from 'util';

const API_URL = 'http://localhost:4000/api/query';

const logFile = fs.createWriteStream('search_results.log', { flags: 'w' });
const logStdout = process.stdout;

console.log = function (d) {
    logFile.write(util.format(d) + '\n');
    logStdout.write(util.format(d) + '\n');
};

async function testSearch(query, userLocation = null) {
    console.log(`\n--- Testing Query: "${query}" ---`);
    try {
        const requestBody = { text: query };
        if (userLocation) {
            requestBody.userLocation = userLocation;
            console.log(`  User Location: Lat ${userLocation.lat}, Lon ${userLocation.lon}`);
        }

        const response = await axios.post(API_URL, requestBody);
        const { analysis, results, similar_results } = response.data;

        console.log(`Analysis: ${analysis}`);

        if (results && results.length > 0) {
            console.log('Results:');
            results.forEach(r => {
                console.log(`- ${r.name} (ID: ${r.id})`);
                console.log(`  Reason: ${r.short_reason}`);
                console.log(`  Suggested: ${r.suggested_item}`);
                console.log(`  Dietary Tags: ${r.cuisines.join(', ')} | ${r.tags.join(', ')}`);
                if (r.distance) {
                    console.log(`  Distance: ${r.distance}, Duration: ${r.trip_duration}`);
                }
            });
        } else {
            console.log('No direct results.');
        }

        if (similar_results && similar_results.length > 0) {
            console.log('Similar Results:');
            similar_results.forEach(r => {
                console.log(`- ${r.name} (${r.cuisines.join(', ')})`);
                if (r.suggested_item) {
                    console.log(`  Suggested: ${r.suggested_item}`);
                }
                if (r.distance) {
                    console.log(`  Distance: ${r.distance}, Duration: ${r.trip_duration}`);
                }
            });
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) console.error(error.response.data);
    }
}

async function runTests() {
    await testSearch("Veg Biryani");
    await testSearch("Egg Biryani");
    await testSearch("Pure Veg Options");
    await testSearch("Mutton Biryani");

    // Test OSRM Distance (Coimbatore Location)
    console.log("\n--- Testing OSRM Distance ---");
    await testSearch("Vegetarian", { lat: 11.0168, lon: 76.9558 });
}

runTests();
