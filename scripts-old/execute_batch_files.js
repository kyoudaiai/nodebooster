const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Script to execute pre-generated batch files with multicall data
 * Usage: npx hardhat run scripts/execute_batch_files.js --network <network>
 * Environment variables:
 * - BATCH_DIR: Directory containing the batch files (default: latest generated)
 * - BATCH_RANGE: Range of batches to execute (e.g., "1-5" or "3" for single batch)
 * - DRY_RUN: Set to "true" to simulate execution without sending transactions
 * - GAS_BUFFER_PERCENT: Gas estimation buffer percentage (default: 10)
 */

const CONFIG = {
    DRY_RUN: process.env.DRY_RUN === "true",
    BATCH_DIR: process.env.BATCH_DIR || null, // Auto-detect if not specified
    BATCH_RANGE: process.env.BATCH_RANGE || null, // Execute specific batch range
    GAS_BUFFER_PERCENT: parseInt(process.env.GAS_BUFFER_PERCENT) || 10,
    DELAY_BETWEEN_BATCHES: 2000 // 2 seconds
};

function parseBatchRange(rangeStr) {
    if (!rangeStr) return null;
    
    if (rangeStr.includes('-')) {
        const [start, end] = rangeStr.split('-').map(n => parseInt(n.trim()));
        return { start, end };
    } else {
        const single = parseInt(rangeStr.trim());
        return { start: single, end: single };
    }
}

function findLatestBatchDirectory(network) {
    const generatedDir = path.join(__dirname, "../generated_batches");
    
    if (!fs.existsSync(generatedDir)) {
        throw new Error(`No generated_batches directory found at: ${generatedDir}`);
    }
    
    const directories = fs.readdirSync(generatedDir)
        .filter(item => {
            const fullPath = path.join(generatedDir, item);
            return fs.statSync(fullPath).isDirectory() && item.startsWith(network);
        })
        .sort()
        .reverse(); // Latest first
    
    if (directories.length === 0) {
        throw new Error(`No batch directories found for network: ${network}`);
    }
    
    return path.join(generatedDir, directories[0]);
}

function loadBatchFiles(batchDir) {
    if (!fs.existsSync(batchDir)) {
        throw new Error(`Batch directory not found: ${batchDir}`);
    }
    
    const summaryPath = path.join(batchDir, "batch_summary.json");
    if (!fs.existsSync(summaryPath)) {
        throw new Error(`Batch summary file not found: ${summaryPath}`);
    }
    
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    
    const batchFiles = summary.batchFiles
        .map(fileName => path.join(batchDir, fileName))
        .filter(filePath => fs.existsSync(filePath))
        .sort(); // Ensure correct order
    
    return { summary, batchFiles };
}

async function executeBatchFile(contract, batchFilePath, dryRun = false) {
    const batchData = JSON.parse(fs.readFileSync(batchFilePath, 'utf8'));
    const fileName = path.basename(batchFilePath);
    
    console.log(`\n📦 Processing ${fileName}`);
    console.log(`  Players: ${batchData.playerCount}`);
    console.log(`  Calls: ${batchData.multicallData.length}`);
    
    if (batchData.multicallData.length === 0) {
        console.log(`  ⚠️ No calls in ${fileName}, skipping...`);
        return { success: true, skipped: true };
    }
    
    if (dryRun) {
        console.log(`  🔍 DRY RUN: Would execute multicall with ${batchData.multicallData.length} calls`);
        return { success: true, dryRun: true };
    }
    
    try {
        // Estimate gas
        console.log(`  ⛽ Estimating gas...`);
        const gasEstimate = await contract.estimateGas.multicall(batchData.multicallData);
        const gasLimit = gasEstimate.mul(100 + CONFIG.GAS_BUFFER_PERCENT).div(100);
        
        console.log(`  ⛽ Estimated gas: ${gasEstimate.toString()}`);
        console.log(`  ⛽ Gas limit (with ${CONFIG.GAS_BUFFER_PERCENT}% buffer): ${gasLimit.toString()}`);
        
        // Execute multicall
        console.log(`  🚀 Executing multicall...`);
        const tx = await contract.multicall(batchData.multicallData, {
            gasLimit: gasLimit
        });
        
        console.log(`  📝 Transaction hash: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log(`  ✅ ${fileName} completed! Gas used: ${receipt.gasUsed.toString()}`);
        
        return { 
            success: true, 
            gasUsed: receipt.gasUsed, 
            txHash: tx.hash,
            fileName: fileName 
        };
        
    } catch (error) {
        console.error(`  ❌ Failed to execute ${fileName}:`, error.message);
        
        // Try individual calls as fallback
        console.log(`  🔄 Attempting individual calls for ${fileName}...`);
        
        let successCount = 0;
        let totalGasUsed = 0;
        
        for (let i = 0; i < batchData.calls.length; i++) {
            const call = batchData.calls[i];
            try {
                const tx = await contract.addPlayerDeposits(
                    call.playerAddress,
                    call.amounts,
                    call.timestamps
                );
                const receipt = await tx.wait();
                
                console.log(`    ✅ ${call.playerAddress}: ${call.deposits} deposits`);
                successCount++;
                totalGasUsed += receipt.gasUsed.toNumber();
                
            } catch (individualError) {
                console.error(`    ❌ Failed for ${call.playerAddress}:`, individualError.message);
            }
        }
        
        return {
            success: successCount > 0,
            gasUsed: totalGasUsed,
            individualFallback: true,
            successCount: successCount,
            totalCount: batchData.calls.length,
            fileName: fileName
        };
    }
}

async function main() {
    console.log("🚀 Starting batch file execution script...");
    console.log(`Network: ${hre.network.name}`);
    console.log(`Dry run: ${CONFIG.DRY_RUN ? "YES" : "NO"}`);
    
    const network = hre.network.name;
    
    // Determine batch directory
    const batchDir = CONFIG.BATCH_DIR || findLatestBatchDirectory(network);
    console.log(`Batch directory: ${batchDir}`);
    
    // Load batch files
    const { summary, batchFiles } = loadBatchFiles(batchDir);
    
    console.log(`\n📋 Batch Summary:`);
    console.log(`  Network: ${summary.network}`);
    console.log(`  Total players: ${summary.totalPlayers}`);
    console.log(`  Total batches: ${summary.totalBatches}`);
    console.log(`  Contract address: ${summary.contractAddress}`);
    console.log(`  Available batch files: ${batchFiles.length}`);
    
    // Parse batch range if specified
    const range = parseBatchRange(CONFIG.BATCH_RANGE);
    let filesToExecute = batchFiles;
    
    if (range) {
        const startIndex = range.start - 1; // Convert to 0-based index
        const endIndex = range.end; // End is inclusive
        filesToExecute = batchFiles.slice(startIndex, endIndex);
        console.log(`\n🎯 Executing batches ${range.start} to ${range.end} (${filesToExecute.length} files)`);
    } else {
        console.log(`\n🎯 Executing all ${filesToExecute.length} batch files`);
    }
    
    if (filesToExecute.length === 0) {
        console.log("No batch files to execute. Exiting.");
        return;
    }
    
    // Get contract instance
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using deployer address: ${deployer.address}`);
    
    const DailyEthRoi = await hre.ethers.getContractFactory("DailyEthRoiV1");
    const contract = DailyEthRoi.attach(summary.contractAddress);
    
    // Validate contract access (if not dry run)
    if (!CONFIG.DRY_RUN) {
        try {
            const owner = await contract.owner();
            console.log(`Contract owner: ${owner}`);
            
            if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
                throw new Error(`Deployer ${deployer.address} is not the contract owner ${owner}`);
            }
        } catch (error) {
            console.warn(`Warning: Could not verify contract owner: ${error.message}`);
        }
    }
    
    // Execute batch files
    let totalGasUsed = 0;
    let successfulBatches = 0;
    let failedBatches = 0;
    const results = [];
    
    for (let i = 0; i < filesToExecute.length; i++) {
        const batchFilePath = filesToExecute[i];
        
        const result = await executeBatchFile(contract, batchFilePath, CONFIG.DRY_RUN);
        results.push(result);
        
        if (result.success) {
            successfulBatches++;
            totalGasUsed += result.gasUsed || 0;
        } else {
            failedBatches++;
        }
        
        // Delay between batches (except for the last one)
        if (i < filesToExecute.length - 1 && !CONFIG.DRY_RUN && !result.skipped) {
            console.log(`  ⏳ Waiting ${CONFIG.DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
        }
    }
    
    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 EXECUTION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Network: ${network}`);
    console.log(`Batch directory: ${path.basename(batchDir)}`);
    console.log(`Batch files executed: ${filesToExecute.length}`);
    console.log(`Successful batches: ${successfulBatches}`);
    console.log(`Failed batches: ${failedBatches}`);
    if (!CONFIG.DRY_RUN) {
        console.log(`Total gas used: ${totalGasUsed}`);
    }
    console.log(`Dry run: ${CONFIG.DRY_RUN ? "YES" : "NO"}`);
    
    if (failedBatches > 0) {
        console.log("\n⚠️ Some batches failed. Check the logs above for details.");
    } else {
        console.log("\n🎉 All batches executed successfully!");
    }
    
    // Show successful transactions
    const successfulTxs = results.filter(r => r.txHash);
    if (successfulTxs.length > 0) {
        console.log("\n📝 Transaction hashes:");
        successfulTxs.forEach(result => {
            console.log(`  ${result.fileName}: ${result.txHash}`);
        });
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
