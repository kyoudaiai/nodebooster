const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Manual Proxy Upgrade Script ===");
    console.log("This script performs a manual upgrade to a pre-deployed implementation");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Addresses
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    
    // ✅ New implementation address
    const newImplementationAddress = "0xA4d332f1D568bB87C07B131faf81164B501FD6D7";
    
    if (newImplementationAddress === "PASTE_NEW_IMPLEMENTATION_ADDRESS_HERE") {
        console.error("❌ Please update the newImplementationAddress in this script first!");
        console.log("Deploy a new implementation using: npx hardhat run scripts/Avax0TokenV3-deploy-fuji-implementationOnly.js --network fuji");
        process.exit(1);
    }
    
    console.log("Proxy address:", proxyAddress);
    console.log("New implementation:", newImplementationAddress);
    
    try {
        // Method 1: Direct upgradeTo call
        console.log("\n=== Method 1: Direct upgradeTo Call ===");
        const proxy = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        console.log("Current version:", await proxy.version());
        
        console.log("Calling upgradeTo...");
        const upgradeTx = await proxy.upgradeTo(newImplementationAddress);
        console.log("Transaction hash:", upgradeTx.hash);
        
        console.log("Waiting for confirmation...");
        await upgradeTx.wait();
        console.log("✅ Upgrade transaction confirmed");
        
        // Verify the upgrade
        console.log("\n=== Verification ===");
        const newVersion = await proxy.version();
        console.log("New version:", newVersion);
        
        if (newVersion === "3.0.3") {
            console.log("✅ Version updated successfully!");
            
            // Test new functions
            console.log("\n=== Testing New Functions ===");
            
            try {
                const cleanupConfig = await proxy.getAutoCleanupConfig();
                console.log("✅ getAutoCleanupConfig works:", cleanupConfig);
            } catch (error) {
                console.log("❌ getAutoCleanupConfig failed:", error.message);
            }
            
            try {
                const completedCount = await proxy.getCompletedLockCount(deployer.address);
                console.log("✅ getCompletedLockCount works:", completedCount.toString());
            } catch (error) {
                console.log("❌ getCompletedLockCount failed:", error.message);
            }
            
            console.log("\n✅ Manual upgrade completed successfully!");
            
        } else {
            console.log("❌ Version still incorrect:", newVersion);
        }
        
    } catch (error) {
        console.error("❌ Manual upgrade failed:", error.message);
        
        // Try alternative method
        console.log("\n=== Trying Alternative Method ===");
        try {
            const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
            await upgrades.forceImport(proxyAddress, Avax0TokenV3);
            const upgraded = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
            await upgraded.waitForDeployment();
            console.log("✅ Alternative upgrade method succeeded");
        } catch (altError) {
            console.error("❌ Alternative method also failed:", altError.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });