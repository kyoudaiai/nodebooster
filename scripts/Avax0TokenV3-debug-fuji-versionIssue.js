const { ethers } = require("hardhat");

async function main() {
    console.log("=== Version Function Analysis ===");
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    
    try {
        // Get the contract instance
        const contract = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        // Check version using different methods
        console.log("Method 1 - Direct call:");
        const version1 = await contract.version();
        console.log("Version:", version1);
        
        console.log("\nMethod 2 - Static call:");
        const version2 = await contract.version.staticCall();
        console.log("Version:", version2);
        
        console.log("\nMethod 3 - Raw call:");
        const versionSelector = ethers.id("version()").slice(0, 10);
        const rawResult = await ethers.provider.call({
            to: proxyAddress,
            data: versionSelector
        });
        
        if (rawResult !== "0x") {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], rawResult);
            console.log("Raw version:", decoded[0]);
        }
        
        // Test one of the new functions to see if they work
        console.log("\n=== Testing New Functions ===");
        try {
            const completedCount = await contract.getCompletedLockCount("0x5D2588D514A27942933bCB081d01343245a4B1C8");
            console.log("✅ getCompletedLockCount works, result:", completedCount.toString());
        } catch (error) {
            console.log("❌ getCompletedLockCount failed:", error.message);
        }
        
        try {
            const cleanupConfig = await contract.getAutoCleanupConfig();
            console.log("✅ getAutoCleanupConfig works:", cleanupConfig);
        } catch (error) {
            console.log("❌ getAutoCleanupConfig failed:", error.message);
        }
        
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });