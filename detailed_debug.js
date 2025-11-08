const hre = require("hardhat");

async function main() {
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const avax0 = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    
    const account = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    const amount = "100000000000000000000";
    const releaseTime = "1793964048";
    
    console.log("=== Step by step debugging ===");
    
    // Check each parameter individually
    console.log("Account:", account);
    console.log("Is account zero?", account === "0x0000000000000000000000000000000000000000");
    console.log("Amount:", amount);
    console.log("Release time:", releaseTime);
    
    // Test each validation condition
    console.log("\n=== Manual validations ===");
    
    // 1. Zero address check
    const isZeroAddress = account === "0x0000000000000000000000000000000000000000" || account === "0x0";
    console.log("1. Zero address:", isZeroAddress);
    
    // 2. Zero amount check
    const isZeroAmount = amount === "0";
    console.log("2. Zero amount:", isZeroAmount);
    
    // 3. Release time check
    const currentBlock = await hre.ethers.provider.getBlock('latest');
    const isInFuture = parseInt(releaseTime) > currentBlock.timestamp;
    console.log("3. Release time in future:", isInFuture);
    console.log("   Current block time:", currentBlock.timestamp);
    console.log("   Release time:", releaseTime);
    
    // 4. Available balance check
    const availableBalance = await avax0.getAvailableBalance(account);
    const hasEnoughBalance = availableBalance >= BigInt(amount);
    console.log("4. Has enough balance:", hasEnoughBalance);
    console.log("   Available:", hre.ethers.formatEther(availableBalance));
    console.log("   Needed:", hre.ethers.formatEther(amount));
    
    // Try calling with explicit types
    console.log("\n=== Testing with explicit parameter types ===");
    
    try {
        // Convert parameters to proper types
        const accountAddr = hre.ethers.getAddress(account);
        const amountBigInt = BigInt(amount);
        const releaseTimeBigInt = BigInt(releaseTime);
        
        console.log("Converted types:");
        console.log("  Account:", accountAddr);
        console.log("  Amount:", amountBigInt.toString());
        console.log("  Release time:", releaseTimeBigInt.toString());
        
        // Try the call with converted parameters
        const tx = await avax0.createTimeLock(accountAddr, amountBigInt, releaseTimeBigInt);
        console.log("✅ Success with explicit types! TX:", tx.hash);
        
    } catch (error) {
        console.log("❌ Still failed with explicit types:");
        console.log("Error:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
            
            // Try to decode the error
            const errorSelector = error.data.slice(0, 10);
            console.log("Error selector:", errorSelector);
            
            // Known error selectors
            const knownErrors = {
                "0x118cdaa7": "ZeroAddress()",
                "0x3f6cc768": "InvalidLockAmount(uint256)",
                "0x6f7eac26": "InvalidReleaseTime(uint256)",
                "0x356680b7": "InsufficientUnlockedBalance(address,uint256,uint256)"
            };
            
            if (knownErrors[errorSelector]) {
                console.log("Known error:", knownErrors[errorSelector]);
            }
        }
    }
    
    // Also try with the overloaded version (3 parameters with gradual config)
    console.log("\n=== Testing overloaded version ===");
    try {
        // Create empty gradual config
        const emptyConfig = {
            duration: 0,
            interval: 0,
            enabled: false
        };
        
        const tx = await avax0['createTimeLock(address,uint256,uint256,tuple)'](
            account, 
            amount, 
            releaseTime, 
            emptyConfig
        );
        console.log("✅ Success with overloaded version! TX:", tx.hash);
        
    } catch (error) {
        console.log("❌ Overloaded version also failed:");
        console.log("Error:", error.message);
    }
}

main().catch(console.error);