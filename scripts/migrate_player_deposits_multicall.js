const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("Starting player deposits migration script...");
    
    // Configuration
    const BATCH_SIZE = 10;
    const NETWORK = hre.network.name;
    const DATA_FILE = path.join(__dirname, "../migration_arrays/polygon-2025-05-31_12-09-11-playerDeposits.json");
    
    // You'll need to update this with your actual contract address for the target network
    const CONTRACT_ADDRESSES = {
        "polygonmainnet": "0xD90B67C0084B15Ae5B22FE783c43c7916e65f9aa", // Replace with actual contract address
        "bscmainnet": "0x...",     // Replace with actual contract address
        "mainnet": "0x...",        // Replace with actual contract address
        "optimism": "0x..."        // Replace with actual contract address
    };
    
    const contractAddress = CONTRACT_ADDRESSES[NETWORK];
    if (!contractAddress || contractAddress === "0x...") {
        throw new Error(`Contract address not configured for network: ${NETWORK}`);
    }
    
    // Load player deposits data
    console.log(`Loading player deposits data from: ${DATA_FILE}`);
    const playerDepositsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    // Filter out players with no deposits
    const playersWithDeposits = Object.entries(playerDepositsData).filter(
        ([address, data]) => data.amounts && data.amounts.length > 0
    );
    
    console.log(`Found ${playersWithDeposits.length} players with deposits`);
    
    // Get contract instance
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Using deployer address: ${deployer.address}`);
    
    // Get contract factory and attach to deployed contract
    const DailyEthRoi = await hre.ethers.getContractFactory("DailyEthRoiV1");
    const contract = DailyEthRoi.attach(contractAddress);
    
    // Verify we can call the contract (optional check)
    try {
        const owner = await contract.owner();
        console.log(`Contract owner: ${owner}`);
        if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
            throw new Error(`Deployer ${deployer.address} is not the contract owner ${owner}`);
        }
    } catch (error) {
        console.warn(`Warning: Could not verify contract owner: ${error.message}`);
    }
    
    // Process players in batches
    const totalBatches = Math.ceil(playersWithDeposits.length / BATCH_SIZE);
    console.log(`Processing ${playersWithDeposits.length} players in ${totalBatches} batches of ${BATCH_SIZE}`);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIndex = batchIndex * BATCH_SIZE;
        const endIndex = Math.min(startIndex + BATCH_SIZE, playersWithDeposits.length);
        const batch = playersWithDeposits.slice(startIndex, endIndex);
        
        console.log(`\nProcessing batch ${batchIndex + 1}/${totalBatches} (players ${startIndex + 1}-${endIndex})`);
        
        // Prepare multicall data
        const multicallData = [];
        
        for (const [playerAddress, depositData] of batch) {
            const { amounts, timestamps } = depositData;
            
            console.log(`  - ${playerAddress}: ${amounts.length} deposits`);
            
            // Encode the addPlayerDeposits function call
            const encodedCall = contract.interface.encodeFunctionData("addPlayerDeposits", [
                playerAddress,
                amounts,
                timestamps
            ]);
            
            multicallData.push(encodedCall);
        }
        
        try {
            // Execute multicall
            console.log(`  Executing multicall with ${multicallData.length} calls...`);
            
            // Estimate gas first
            const gasEstimate = await contract.estimateGas.multicall(multicallData);
            console.log(`  Estimated gas: ${gasEstimate.toString()}`);
            
            const tx = await contract.multicall(multicallData, {
                gasLimit: gasEstimate.mul(110).div(100) // Add 10% buffer
            });
            
            console.log(`  Transaction hash: ${tx.hash}`);
            
            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(`  ✓ Batch ${batchIndex + 1} completed! Gas used: ${receipt.gasUsed.toString()}`);
            
            // Small delay between batches to avoid overwhelming the network
            if (batchIndex < totalBatches - 1) {
                console.log("  Waiting 2 seconds before next batch...");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
        } catch (error) {
            console.error(`  ❌ Error in batch ${batchIndex + 1}:`, error.message);
            
            // If multicall fails, try individual calls for this batch
            console.log(`  Attempting individual calls for batch ${batchIndex + 1}...`);
            
            for (const [playerAddress, depositData] of batch) {
                try {
                    const { amounts, timestamps } = depositData;
                    const tx = await contract.addPlayerDeposits(playerAddress, amounts, timestamps);
                    await tx.wait();
                    console.log(`    ✓ Individual call for ${playerAddress} completed`);
                } catch (individualError) {
                    console.error(`    ❌ Individual call failed for ${playerAddress}:`, individualError.message);
                }
            }
        }
    }
    
    console.log("\n🎉 Player deposits migration completed!");
}

// Error handling and execution
main()
    .then(() => {
        console.log("Script completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Script failed:", error);
        process.exit(1);
    });
