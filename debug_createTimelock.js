const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    
    // Get the deployed contract (Fuji Avax0 proxy address)
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078"; // Fuji Avax0 proxy address
    const avax0 = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    
    const account = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    const amount = "100000000000000000000"; // 100 tokens
    const releaseTime = "1793964048";
    
    console.log("=== Debugging createTimeLock parameters ===");
    console.log("Account:", account);
    console.log("Amount:", amount, "(", hre.ethers.formatEther(amount), "tokens)");
    console.log("Release time:", releaseTime);
    console.log("Release date:", new Date(parseInt(releaseTime) * 1000));
    
    console.log("\n=== Checking conditions ===");
    
    // Check 1: Zero address
    console.log("1. Is account zero address?", account === "0x0000000000000000000000000000000000000000");
    
    // Check 2: Zero amount
    console.log("2. Is amount zero?", amount === "0");
    
    // Check 3: Release time in future
    const currentBlock = await hre.ethers.provider.getBlock('latest');
    const isInFuture = parseInt(releaseTime) > currentBlock.timestamp;
    console.log("3. Is release time in future?", isInFuture);
    console.log("   Current block time:", currentBlock.timestamp, new Date(currentBlock.timestamp * 1000));
    console.log("   Release time:", releaseTime, new Date(parseInt(releaseTime) * 1000));
    
    // Check 4: Account balance and available balance
    try {
        const totalBalance = await avax0.balanceOf(account);
        console.log("4. Account total balance:", hre.ethers.formatEther(totalBalance), "tokens");
        
        const lockedAmount = await avax0.getLockedAmount(account);
        console.log("   Account locked amount:", hre.ethers.formatEther(lockedAmount), "tokens");
        
        const availableBalance = await avax0.getAvailableBalance(account);
        console.log("   Account available balance:", hre.ethers.formatEther(availableBalance), "tokens");
        
        const hasEnoughBalance = availableBalance >= BigInt(amount);
        console.log("   Has enough available balance?", hasEnoughBalance);
        
        if (!hasEnoughBalance) {
            console.log("   ❌ INSUFFICIENT AVAILABLE BALANCE!");
            console.log("   Needed:", hre.ethers.formatEther(amount), "tokens");
            console.log("   Available:", hre.ethers.formatEther(availableBalance), "tokens");
            console.log("   Shortage:", hre.ethers.formatEther(BigInt(amount) - availableBalance), "tokens");
        }
        
    } catch (error) {
        console.log("4. Error checking balances:", error.message);
    }
    
    // Check 5: Caller permissions
    try {
        const owner = await avax0.owner();
        console.log("5. Contract owner:", owner);
        console.log("   Deployer address:", deployer.address);
        console.log("   Is deployer the owner?", owner.toLowerCase() === deployer.address.toLowerCase());
    } catch (error) {
        console.log("5. Error checking owner:", error.message);
    }
    
    // Check 6: Contract status
    try {
        const isPaused = await avax0.paused();
        console.log("6. Is contract paused?", isPaused);
    } catch (error) {
        console.log("6. Error checking pause status:", error.message);
    }
    
    console.log("\n=== Attempting createTimeLock call ===");
    try {
        // Try to estimate gas first
        const gasEstimate = await avax0.createTimeLock.estimateGas(account, amount, releaseTime);
        console.log("Gas estimate:", gasEstimate.toString());
        
        // Try the actual call
        const tx = await avax0.createTimeLock(account, amount, releaseTime);
        console.log("✅ Transaction sent:", tx.hash);
        
        const receipt = await tx.wait();
        console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
        
    } catch (error) {
        console.log("❌ Transaction failed:");
        console.log("Error:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
        }
        
        // Try to decode the error
        if (error.reason) {
            console.log("Error reason:", error.reason);
        }
    }
}

main().catch(console.error);