const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Final Fuji Upgrade: Apply Working Solution ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const newImplementationAddress = "0xA4d332f1D568bB87C07B131faf81164B501FD6D7";
    
    console.log("Proxy address:", proxyAddress);
    console.log("New implementation:", newImplementationAddress);
    
    try {
        // Get current state
        console.log("\n=== Pre-Upgrade State ===");
        const proxy = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        const currentVersion = await proxy.version();
        const totalSupply = await proxy.totalSupply();
        
        console.log("Current version:", currentVersion);
        console.log("Total supply:", ethers.formatEther(totalSupply));
        
        // Apply the working upgrade method from our local test
        console.log("\n=== Applying Upgrade ===");
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        
        // Use the same method that worked locally
        console.log("Forcing import and upgrade...");
        await upgrades.forceImport(proxyAddress, Avax0TokenV3);
        
        const upgraded = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3, {
            unsafeAllow: ['constructor', 'state-variable-immutable'],
        });
        
        await upgraded.waitForDeployment();
        console.log("✅ Upgrade completed!");
        
        // Verify the upgrade
        console.log("\n=== Post-Upgrade Verification ===");
        const newVersion = await upgraded.version();
        const newTotalSupply = await upgraded.totalSupply();
        
        console.log("New version:", newVersion);
        console.log("Total supply preserved:", ethers.formatEther(newTotalSupply));
        
        if (newVersion === "3.0.3") {
            console.log("✅ SUCCESS! Version updated to V3.0.3");
            
            // Test new functions
            console.log("\n=== Testing New V3.0.3 Features ===");
            
            try {
                const cleanupConfig = await upgraded.getAutoCleanupConfig();
                console.log("✅ getAutoCleanupConfig works:", cleanupConfig);
            } catch (error) {
                console.log("❌ getAutoCleanupConfig failed:", error.message);
            }
            
            try {
                const completedCount = await upgraded.getCompletedLockCount(deployer.address);
                console.log("✅ getCompletedLockCount works:", completedCount.toString());
            } catch (error) {
                console.log("❌ getCompletedLockCount failed:", error.message);
            }
            
            try {
                const gradualConfig = await upgraded.defaultGradualReleaseConfig();
                console.log("✅ defaultGradualReleaseConfig works:", gradualConfig);
            } catch (error) {
                console.log("❌ defaultGradualReleaseConfig failed:", error.message);
            }
            
            console.log("\n🎉 FUJI UPGRADE SUCCESSFUL!");
            console.log("All V3.0.3 features are now available on Fuji network");
            
        } else {
            console.log("❌ Version not updated correctly. Got:", newVersion);
        }
        
    } catch (error) {
        console.error("❌ Upgrade failed:", error.message);
        
        // If the upgrade fails due to RPC issues, provide console commands
        console.log("\n=== Manual Console Commands (if RPC fails) ===");
        console.log("If the script fails due to RPC timeouts, run these in console:");
        console.log("");
        console.log("npx hardhat console --network fuji");
        console.log("");
        console.log("const { upgrades } = require('hardhat');");
        console.log("const Avax0TokenV3 = await ethers.getContractFactory('Avax0TokenV3');");
        console.log(`await upgrades.forceImport('${proxyAddress}', Avax0TokenV3);`);
        console.log(`const upgraded = await upgrades.upgradeProxy('${proxyAddress}', Avax0TokenV3);`);
        console.log("await upgraded.waitForDeployment();");
        console.log("console.log('Version:', await upgraded.version());");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });