const { ethers } = require("hardhat");

async function main() {
    console.log("=== Contract State Verification ===");
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    console.log("Checking contract at:", proxyAddress);
    
    try {
        // Get contract instance
        const contract = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        // Check basic info
        console.log("\n=== Basic Contract Info ===");
        const name = await contract.name();
        const symbol = await contract.symbol();
        const totalSupply = await contract.totalSupply();
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Total Supply:", ethers.formatEther(totalSupply));
        
        // Check version
        console.log("\n=== Version Check ===");
        const version = await contract.version();
        console.log("Version:", version);
        
        // Check if new functions exist
        console.log("\n=== Function Availability Check ===");
        
        try {
            // Check if modifyLockAmount exists
            await contract.modifyLockAmount.staticCall(0, ethers.parseEther("1"));
            console.log("✅ modifyLockAmount function exists");
        } catch (error) {
            if (error.message.includes("function does not exist")) {
                console.log("❌ modifyLockAmount function NOT found");
            } else {
                console.log("✅ modifyLockAmount function exists (error expected for test call)");
            }
        }
        
        try {
            // Check if auto cleanup functions exist
            await contract.getCompletedLockCount.staticCall("0x0000000000000000000000000000000000000000");
            console.log("✅ getCompletedLockCount function exists");
        } catch (error) {
            if (error.message.includes("function does not exist")) {
                console.log("❌ getCompletedLockCount function NOT found");
            } else {
                console.log("✅ getCompletedLockCount function exists");
            }
        }
        
        try {
            // Check if auto cleanup is available
            await contract.getAutoCleanupConfig.staticCall();
            console.log("✅ getAutoCleanupConfig function exists");
        } catch (error) {
            if (error.message.includes("function does not exist")) {
                console.log("❌ getAutoCleanupConfig function NOT found");
            } else {
                console.log("✅ getAutoCleanupConfig function exists");
            }
        }
        
        // Check storage layout - look for gradual release config
        console.log("\n=== Storage Layout Check ===");
        try {
            const gradualConfig = await contract.defaultGradualReleaseConfig();
            console.log("✅ defaultGradualReleaseConfig exists:", gradualConfig);
        } catch (error) {
            console.log("❌ defaultGradualReleaseConfig not found:", error.message);
        }
        
    } catch (error) {
        console.error("Error checking contract:", error.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });