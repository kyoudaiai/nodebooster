const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Configuration object
const CONFIG = {
    BATCH_SIZE: 20,
    DRY_RUN: process.env.DRY_RUN === "true", // Set DRY_RUN=true to simulate without executing
    GAS_BUFFER_PERCENT: 10, // 10% gas buffer
    BATCH_DELAY_MS: 2000, // 2 seconds between batches
    
    // Contract addresses for different networks
    CONTRACT_ADDRESSES: {
        "polygonmainnet": "0xD90B67C0084B15Ae5B22FE783c43c7916e65f9aa", // Replace with actual contract address
        "bscmainnet": "0x...",     // Replace with actual contract address
        "mainnet": "0x...",        // Replace with actual contract address
        "optimism": "0x...",       // Replace with actual contract address
        "polygontestnet": "0x...", // Replace with actual contract address for testing
        "bsctestnet": "0x...",     // Replace with actual contract address for testing
        "sepolia": "0x..."         // Replace with actual contract address for testing
    },
    
    // Data files for different networks
    DATA_FILES: {
        "polygonmainnet": "polygon-2025-05-31_12-09-11-playerDeposits.json",
        "bscmainnet": "bsc-2025-05-31_13-03-27-playerDeposits.json",
        "mainnet": "ethereumplayerDeposits.json",
        "optimism": "optimism-2025-05-31_11-58-31-playerDeposits.json"
    }
};

async function loadPlayerDepositsData(network) {
    const dataFileName = CONFIG.DATA_FILES[network];
    if (!dataFileName) {
        throw new Error(`No data file configured for network: ${network}`);
    }
    
    const dataFilePath = path.join(__dirname, "../migration_arrays", dataFileName);
    
    if (!fs.existsSync(dataFilePath)) {
        throw new Error(`Data file not found: ${dataFilePath}`);
    }
    
    console.log(`Loading player deposits data from: ${dataFilePath}`);
    return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
}

async function validateContract(contract, deployerAddress) {
    try {
        const owner = await contract.owner();
        console.log(`Contract owner: ${owner}`);
        
        if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
            throw new Error(`Deployer ${deployerAddress} is not the contract owner ${owner}`);
        }
        
        return true;
    } catch (error) {
        console.warn(`Warning: Could not verify contract owner: ${error.message}`);
        return false;
    }
}

async function processPlayerBatch(contract, batch, batchIndex, totalBatches, dryRun = false) {
    console.log(`\nProcessing batch ${batchIndex + 1}/${totalBatches} (${batch.length} players)`);
    
    // Prepare multicall data
    const multicallData = [];
    const batchSummary = [];
    
    for (const [playerAddress, depositData] of batch) {
        const { amounts, timestamps } = depositData;
        
        // Validate data
        if (amounts.length !== timestamps.length) {
            console.warn(`  ⚠️ Skipping ${playerAddress}: amounts and timestamps length mismatch`);
            continue;
        }
        
        if (amounts.length === 0) {
            console.warn(`  ⚠️ Skipping ${playerAddress}: no deposits`);
            continue;
        }
        
        console.log(`  - ${playerAddress}: ${amounts.length} deposits`);
        batchSummary.push({ address: playerAddress, deposits: amounts.length });
        
        // Encode the addPlayerDeposits function call
        const encodedCall = contract.interface.encodeFunctionData("addPlayerDeposits", [
            playerAddress,
            amounts,
            timestamps
        ]);
        
        multicallData.push(encodedCall);
    }
    
    if (multicallData.length === 0) {
        console.log(`  ⚠️ No valid calls in batch ${batchIndex + 1}, skipping...`);
        return { success: true, gasUsed: 0, skipped: true };
    }
    
    if (dryRun) {
        console.log(`  🔍 DRY RUN: Would execute multicall with ${multicallData.length} calls`);
        return { success: true, gasUsed: 0, dryRun: true };
    }
    
    try {
        // Estimate gas first
        console.log(`  Estimating gas for ${multicallData.length} calls...`);
        const gasEstimate = await contract.estimateGas.multicall(multicallData);
        console.log(`  Estimated gas: ${gasEstimate.toString()}`);
        
        // Execute multicall
        console.log(`  Executing multicall...`);
        const gasLimit = gasEstimate.mul(100 + CONFIG.GAS_BUFFER_PERCENT).div(100);
        
        const tx = await contract.multicall(multicallData, {
            gasLimit: gasLimit
        });
        
        console.log(`  Transaction hash: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log(`  ✅ Batch ${batchIndex + 1} completed! Gas used: ${receipt.gasUsed.toString()}`);
        
        return { success: true, gasUsed: receipt.gasUsed, txHash: tx.hash };
        
    } catch (error) {
        console.error(`  ❌ Multicall failed for batch ${batchIndex + 1}:`, error.message);
        
        // Try individual calls as fallback
        console.log(`  🔄 Attempting individual calls for batch ${batchIndex + 1}...`);
        
        let individualSuccesses = 0;
        let totalGasUsed = 0;
        
        for (const { address, deposits } of batchSummary) {
            try {
                const playerData = batch.find(([addr]) => addr === address)[1];
                const { amounts, timestamps } = playerData;
                
                const tx = await contract.addPlayerDeposits(address, amounts, timestamps);
                const receipt = await tx.wait();
                
                console.log(`    ✅ ${address}: ${deposits} deposits added`);
                individualSuccesses++;
                totalGasUsed += receipt.gasUsed.toNumber();
                
            } catch (individualError) {
                console.error(`    ❌ Failed for ${address}:`, individualError.message);
            }
        }
        
        return { 
            success: individualSuccesses > 0, 
            gasUsed: totalGasUsed,
            individualFallback: true,
            successCount: individualSuccesses,
            totalCount: batchSummary.length
        };
    }
}

async function main() {
    console.log("🚀 Starting player deposits migration script...");
    console.log(`Network: ${hre.network.name}`);
    console.log(`Batch size: ${CONFIG.BATCH_SIZE}`);
    console.log(`Dry run: ${CONFIG.DRY_RUN ? "YES" : "NO"}`);
    
    const network = hre.network.name;
    
    // Get contract address
    const contractAddress = CONFIG.CONTRACT_ADDRESSES[network];
    if (!contractAddress || contractAddress === "0x...") {
        throw new Error(`Contract address not configured for network: ${network}`);
    }
    console.log(`Contract address: ${contractAddress}`);
    
    // Load player deposits data
    const playerDepositsData = await loadPlayerDepositsData(network);
    
    // Filter out players with no deposits
    const playersWithDeposits = Object.entries(playerDepositsData).filter(
        ([address, data]) => data.amounts && data.amounts.length > 0
    );
    
    console.log(`Found ${playersWithDeposits.length} players with deposits`);
    
    if (playersWithDeposits.length === 0) {
        console.log("No players with deposits found. Exiting.");
        return;
    }
    
    // Get signer and contract instance
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using deployer address: ${deployer.address}`);
    
    const DailyEthRoi = await hre.ethers.getContractFactory("DailyEthRoiV1");
    const contract = DailyEthRoi.attach(contractAddress);
    
    // Validate contract access
    if (!CONFIG.DRY_RUN) {
        await validateContract(contract, deployer.address);
    }
    
    // Process players in batches
    const totalBatches = Math.ceil(playersWithDeposits.length / CONFIG.BATCH_SIZE);
    console.log(`\n📦 Processing ${playersWithDeposits.length} players in ${totalBatches} batches`);
    
    let totalGasUsed = 0;
    let successfulBatches = 0;
    let failedBatches = 0;
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * CONFIG.BATCH_SIZE;
        const endIndex = Math.min(startIndex + CONFIG.BATCH_SIZE, playersWithDeposits.length);
        const batch = playersWithDeposits.slice(startIndex, endIndex);
        
        const result = await processPlayerBatch(contract, batch, batchIndex, totalBatches, CONFIG.DRY_RUN);
        
        if (result.success) {
            successfulBatches++;
            totalGasUsed += result.gasUsed || 0;
        } else {
            failedBatches++;
        }
        
        // Delay between batches (except for the last one)
        if (batchIndex < totalBatches - 1 && !CONFIG.DRY_RUN && !result.skipped) {
            console.log(`  ⏳ Waiting ${CONFIG.BATCH_DELAY_MS / 1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY_MS));
        }
    }
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Network: ${network}`);
    console.log(`Total players processed: ${playersWithDeposits.length}`);
    console.log(`Total batches: ${totalBatches}`);
    console.log(`Successful batches: ${successfulBatches}`);
    console.log(`Failed batches: ${failedBatches}`);
    if (!CONFIG.DRY_RUN) {
        console.log(`Total gas used: ${totalGasUsed}`);
    }
    console.log(`Dry run: ${CONFIG.DRY_RUN ? "YES" : "NO"}`);
    
    if (failedBatches > 0) {
        console.log("\n⚠️ Some batches failed. Check the logs above for details.");
    } else {
        console.log("\n🎉 All batches completed successfully!");
    }
}

// Error handling and execution
main()
    .then(() => {
        console.log("\n✅ Script completed");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\n❌ Script failed:", error);
        process.exit(1);
    });
