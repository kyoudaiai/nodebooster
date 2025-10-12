const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// EXAMPLE USAGE:
// To run the script with dry run mode and generate batch files:
// DRY_RUN=true GENERATE_BATCH_FILES=true npx hardhat run scripts/migrate_player_deposits_advanced.js --network mainnet 

// Configuration object
const CONFIG = {
    BATCH_SIZE: 20,
    DRY_RUN: process.env.DRY_RUN === "true", // Set DRY_RUN=true to simulate without executing
    GENERATE_BATCH_FILES: process.env.GENERATE_BATCH_FILES === "true", // Set GENERATE_BATCH_FILES=true to create batch files
    GAS_BUFFER_PERCENT: 10, // 10% gas buffer
    BATCH_DELAY_MS: 2000, // 2 seconds between batches
    
    // Contract addresses for different networks
    CONTRACT_ADDRESSES: {
        "polygonmainnet": "0xaa7e573491C85abc4b2d2D875064618aC19e5412", // Replace with actual contract address
        "bscmainnet": "0xaa7e573491C85abc4b2d2D875064618aC19e5412",     // Replace with actual contract address
        "mainnet": "0xaa7e573491C85abc4b2d2D875064618aC19e5412",        // Replace with actual contract address
        "optimism": "0xaa7e573491C85abc4b2d2D875064618aC19e5412",       // Replace with actual contract address
        "polygontestnet": "0xaa7e573491C85abc4b2d2D875064618aC19e5412", // Replace with actual contract address for testing
        "bsctestnet": "0xaa7e573491C85abc4b2d2D875064618aC19e5412",     // Replace with actual contract address for testing
        "sepolia": "0xaa7e573491C85abc4b2d2D875064618aC19e5412"         // Replace with actual contract address for testing
    },
    
    // Data files for different networks
    DATA_FILES: {
        "polygonmainnet": "polygon-2025-06-14_18-25-43-playerDeposits.json",
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

async function processPlayerBatch(contract, batch, batchIndex, totalBatches, dryRun = false, generateBatchData = null) {
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

    // Store batch data for file generation if requested
    if (generateBatchData && generateBatchData.enabled) {
        generateBatchData.batches.push({
            batchIndex: batchIndex,
            batch: batch,
            multicallData: multicallData,
            batchSummary: batchSummary
        });
    }
    
    if (dryRun) {
        console.log(`  🔍 DRY RUN: Would execute multicall with ${multicallData.length} calls`);
        return { success: true, gasUsed: 0, dryRun: true, multicallData: multicallData };
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

async function generateBatchFiles(network, playersWithDeposits, contract) {
    console.log("\n📁 Generating batch files with multicall input data...");
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const outputDir = path.join(__dirname, "../generated_batches", `${network}-${timestamp}`);
    
    // Create output directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const totalBatches = Math.ceil(playersWithDeposits.length / CONFIG.BATCH_SIZE);
    const batchFiles = [];
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * CONFIG.BATCH_SIZE;
        const endIndex = Math.min(startIndex + CONFIG.BATCH_SIZE, playersWithDeposits.length);
        const batch = playersWithDeposits.slice(startIndex, endIndex);
        
        const multicallData = [];
        const batchInfo = {
            batchNumber: batchIndex + 1,
            totalBatches: totalBatches,
            network: network,
            timestamp: new Date().toISOString(),
            contractAddress: contract.address,
            playerCount: batch.length,
            calls: [],
            multicallData: []
        };
        
        for (const [playerAddress, depositData] of batch) {
            const { amounts, timestamps } = depositData;
            
            // Validate data
            if (amounts.length !== timestamps.length || amounts.length === 0) {
                continue;
            }
            
            // Encode the addPlayerDeposits function call
            const encodedCall = contract.interface.encodeFunctionData("addPlayerDeposits", [
                playerAddress,
                amounts,
                timestamps
            ]);
            
            multicallData.push(encodedCall);
            
            // Store readable call information
            batchInfo.calls.push({
                playerAddress: playerAddress,
                deposits: amounts.length,
                amounts: amounts,
                timestamps: timestamps,
                encodedCall: encodedCall
            });
        }
        
        batchInfo.multicallData = multicallData;
        
        // Save batch file
        const batchFileName = `batch_${String(batchIndex + 1).padStart(3, '0')}_multicall.json`;
        const batchFilePath = path.join(outputDir, batchFileName);
        
        fs.writeFileSync(batchFilePath, JSON.stringify(batchInfo, null, 2));
        batchFiles.push(batchFilePath);
        
        console.log(`  ✅ Generated ${batchFileName} with ${multicallData.length} calls`);
    }
    
    // Generate summary file
    const summaryFile = {
        network: network,
        timestamp: new Date().toISOString(),
        totalPlayers: playersWithDeposits.length,
        totalBatches: totalBatches,
        batchSize: CONFIG.BATCH_SIZE,
        contractAddress: contract.address,
        batchFiles: batchFiles.map(filePath => path.basename(filePath)),
        usage: {
            description: "Use these batch files to execute multicalls manually or with external tools",
            exampleHardhatCall: `await contract.multicall(batchData.multicallData)`,
            gasEstimation: "Estimate gas before execution: await contract.estimateGas.multicall(batchData.multicallData)"
        }
    };
    
    const summaryFilePath = path.join(outputDir, "batch_summary.json");
    fs.writeFileSync(summaryFilePath, JSON.stringify(summaryFile, null, 2));
    
    console.log(`\n📋 Batch files generated in: ${outputDir}`);
    console.log(`📋 Summary file: ${summaryFilePath}`);
    console.log(`📋 Total batch files: ${batchFiles.length}`);
    
    return { outputDir, batchFiles, summaryFilePath };
}

async function main() {
    console.log("🚀 Starting player deposits migration script...");
    console.log(`Network: ${hre.network.name}`);
    console.log(`Batch size: ${CONFIG.BATCH_SIZE}`);
    console.log(`Dry run: ${CONFIG.DRY_RUN ? "YES" : "NO"}`);
    console.log(`Generate batch files: ${CONFIG.GENERATE_BATCH_FILES ? "YES" : "NO"}`);
    
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
    
    const DailyEthRoi = await hre.ethers.getContractFactory("contracts/DailyEthRoi-v1.sol:DailyEthRoiV1");
    const contract = DailyEthRoi.attach(contractAddress);
    
    // Generate batch files if requested
    if (CONFIG.GENERATE_BATCH_FILES) {
        await generateBatchFiles(network, playersWithDeposits, contract);
        
        if (CONFIG.DRY_RUN) {
            console.log("\n✅ Batch files generated. Exiting due to DRY_RUN mode.");
            return;
        }
    }
    
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
    
    // Initialize batch data collection for file generation
    const generateBatchData = CONFIG.GENERATE_BATCH_FILES ? { enabled: true, batches: [] } : null;
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * CONFIG.BATCH_SIZE;
        const endIndex = Math.min(startIndex + CONFIG.BATCH_SIZE, playersWithDeposits.length);
        const batch = playersWithDeposits.slice(startIndex, endIndex);
        
        const result = await processPlayerBatch(contract, batch, batchIndex, totalBatches, CONFIG.DRY_RUN, generateBatchData);
        
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
    console.log(`Batch files generated: ${CONFIG.GENERATE_BATCH_FILES ? "YES" : "NO"}`);
    
    if (failedBatches > 0) {
        console.log("\n⚠️ Some batches failed. Check the logs above for details.");
    } else {
        console.log("\n🎉 All batches completed successfully!");
    }
    
    if (CONFIG.GENERATE_BATCH_FILES) {
        console.log("\n📁 Batch files have been generated and can be used for manual execution or external tools.");
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
