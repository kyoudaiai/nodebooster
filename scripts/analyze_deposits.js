const fs = require("fs");
const path = require("path");

// Utility functions for analyzing player deposits data

function analyzePlayerDeposits(dataFile) {
    const dataPath = path.join(__dirname, "../migration_arrays", dataFile);
    
    if (!fs.existsSync(dataPath)) {
        console.error(`Data file not found: ${dataPath}`);
        return;
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    const players = Object.entries(data);
    const playersWithDeposits = players.filter(([_, depositData]) => 
        depositData.amounts && depositData.amounts.length > 0
    );
    
    const stats = {
        totalPlayers: players.length,
        playersWithDeposits: playersWithDeposits.length,
        playersWithoutDeposits: players.length - playersWithDeposits.length,
        totalDeposits: 0,
        averageDepositsPerPlayer: 0,
        maxDepositsPerPlayer: 0,
        minDepositsPerPlayer: Infinity,
        totalValue: BigInt(0),
        depositCounts: {}
    };
    
    playersWithDeposits.forEach(([address, depositData]) => {
        const depositCount = depositData.amounts.length;
        stats.totalDeposits += depositCount;
        stats.maxDepositsPerPlayer = Math.max(stats.maxDepositsPerPlayer, depositCount);
        stats.minDepositsPerPlayer = Math.min(stats.minDepositsPerPlayer, depositCount);
        
        // Count players by number of deposits
        stats.depositCounts[depositCount] = (stats.depositCounts[depositCount] || 0) + 1;
        
        // Sum total value
        depositData.amounts.forEach(amount => {
            stats.totalValue += BigInt(amount);
        });
    });
    
    stats.averageDepositsPerPlayer = stats.totalDeposits / playersWithDeposits.length;
    if (stats.minDepositsPerPlayer === Infinity) stats.minDepositsPerPlayer = 0;
    
    return stats;
}

function printAnalysis(dataFile) {
    console.log(`\n📊 ANALYSIS FOR: ${dataFile}`);
    console.log("=".repeat(60));
    
    const stats = analyzePlayerDeposits(dataFile);
    if (!stats) return;
    
    console.log(`Total players in file: ${stats.totalPlayers}`);
    console.log(`Players with deposits: ${stats.playersWithDeposits}`);
    console.log(`Players without deposits: ${stats.playersWithoutDeposits}`);
    console.log(`Total deposits: ${stats.totalDeposits}`);
    console.log(`Average deposits per player: ${stats.averageDepositsPerPlayer.toFixed(2)}`);
    console.log(`Max deposits per player: ${stats.maxDepositsPerPlayer}`);
    console.log(`Min deposits per player: ${stats.minDepositsPerPlayer}`);
    console.log(`Total value: ${stats.totalValue.toString()} wei`);
    console.log(`Total value (ETH): ${(Number(stats.totalValue) / 1e18).toFixed(6)} ETH`);
    
    console.log("\n📈 Deposit count distribution:");
    const sortedCounts = Object.entries(stats.depositCounts)
        .sort(([a], [b]) => parseInt(a) - parseInt(b));
    
    sortedCounts.forEach(([count, players]) => {
        console.log(`  ${count} deposits: ${players} players`);
    });
    
    // Calculate batch information
    const BATCH_SIZE = 20;
    const totalBatches = Math.ceil(stats.playersWithDeposits / BATCH_SIZE);
    console.log(`\n📦 Batch information (batch size: ${BATCH_SIZE}):`);
    console.log(`Total batches needed: ${totalBatches}`);
    console.log(`Estimated time (2s between batches): ${totalBatches * 2} seconds`);
}

function generateBatchPreview(dataFile, batchSize = 20) {
    const dataPath = path.join(__dirname, "../migration_arrays", dataFile);
    
    if (!fs.existsSync(dataPath)) {
        console.error(`Data file not found: ${dataPath}`);
        return;
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const playersWithDeposits = Object.entries(data).filter(([_, depositData]) => 
        depositData.amounts && depositData.amounts.length > 0
    );
    
    const totalBatches = Math.ceil(playersWithDeposits.length / batchSize);
    
    console.log(`\n📋 BATCH PREVIEW FOR: ${dataFile}`);
    console.log("=".repeat(60));
    console.log(`Total players with deposits: ${playersWithDeposits.length}`);
    console.log(`Batch size: ${batchSize}`);
    console.log(`Total batches: ${totalBatches}`);
    
    for (let i = 0; i < Math.min(totalBatches, 5); i++) {
        const startIndex = i * batchSize;
        const endIndex = Math.min(startIndex + batchSize, playersWithDeposits.length);
        const batch = playersWithDeposits.slice(startIndex, endIndex);
        
        console.log(`\nBatch ${i + 1}:`);
        batch.forEach(([address, depositData], index) => {
            console.log(`  ${startIndex + index + 1}. ${address} (${depositData.amounts.length} deposits)`);
        });
    }
    
    if (totalBatches > 5) {
        console.log(`\n... and ${totalBatches - 5} more batches`);
    }
}

// Main execution
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const dataFile = args[1];
    
    const availableFiles = [
        "polygon-2025-05-31_12-09-11-playerDeposits.json",
        "bsc-2025-05-31_13-03-27-playerDeposits.json",
        "ethereumplayerDeposits.json",
        "optimism-2025-05-31_11-58-31-playerDeposits.json"
    ];
    
    if (!command) {
        console.log("📚 PLAYER DEPOSITS ANALYSIS UTILITY");
        console.log("=".repeat(50));
        console.log("Usage:");
        console.log("  node analyze_deposits.js analyze <datafile>");
        console.log("  node analyze_deposits.js preview <datafile>");
        console.log("  node analyze_deposits.js all");
        console.log("");
        console.log("Available data files:");
        availableFiles.forEach(file => console.log(`  - ${file}`));
        return;
    }
    
    if (command === "all") {
        availableFiles.forEach(file => {
            if (fs.existsSync(path.join(__dirname, "../migration_arrays", file))) {
                printAnalysis(file);
            }
        });
        return;
    }
    
    if (!dataFile) {
        console.error("Please specify a data file");
        return;
    }
    
    switch (command) {
        case "analyze":
            printAnalysis(dataFile);
            break;
        case "preview":
            generateBatchPreview(dataFile);
            break;
        default:
            console.error(`Unknown command: ${command}`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    analyzePlayerDeposits,
    printAnalysis,
    generateBatchPreview
};
