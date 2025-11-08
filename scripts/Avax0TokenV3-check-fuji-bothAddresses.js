const { ethers } = require("hardhat");

async function main() {
    console.log("=== Implementation Direct Check ===");
    
    const implementationAddress = "0xA4d332f1D568bB87C07B131faf81164B501FD6D7";
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    
    try {
        // Check implementation directly
        console.log("Implementation address:", implementationAddress);
        const implementation = await ethers.getContractAt("Avax0TokenV3", implementationAddress);
        
        console.log("Direct implementation version:");
        const implVersion = await implementation.version();
        console.log("✅ Implementation version:", implVersion);
        
        // Check proxy
        console.log("\nProxy address:", proxyAddress);
        const proxy = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        console.log("Proxy version:");
        const proxyVersion = await proxy.version();
        console.log("📍 Proxy version:", proxyVersion);
        
        // Test new functions on both
        console.log("\n=== Function Testing ===");
        
        console.log("Testing getAutoCleanupConfig on proxy:");
        try {
            const cleanupConfig = await proxy.getAutoCleanupConfig();
            console.log("✅ Proxy getAutoCleanupConfig works:", cleanupConfig);
        } catch (error) {
            console.log("❌ Proxy getAutoCleanupConfig failed:", error.message);
        }
        
        console.log("\nTesting getAutoCleanupConfig on implementation:");
        try {
            const cleanupConfig = await implementation.getAutoCleanupConfig();
            console.log("✅ Implementation getAutoCleanupConfig works:", cleanupConfig);
        } catch (error) {
            console.log("❌ Implementation getAutoCleanupConfig failed:", error.message);
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