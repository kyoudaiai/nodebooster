const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Force Upgrade to V3.0.3 ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    console.log("Proxy address:", proxyAddress);
    
    try {
        // Get current state
        const contract = await ethers.getContractAt("Avax0TokenV3", proxyAddress);
        const currentVersion = await contract.version();
        console.log("Current version:", currentVersion);
        
        // Deploy new implementation
        console.log("\n=== Deploying New Implementation ===");
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        
        console.log("Upgrading proxy to new implementation...");
        const upgraded = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
        console.log("✅ Upgrade transaction completed");
        
        // Wait for deployment
        await upgraded.waitForDeployment();
        console.log("✅ Deployment confirmed");
        
        // Verify the upgrade
        console.log("\n=== Post-Upgrade Verification ===");
        const newVersion = await upgraded.version();
        console.log("New version:", newVersion);
        
        if (newVersion === "3.0.3") {
            console.log("✅ Version updated successfully!");
            
            // Test new functions
            console.log("\n=== Testing New Functions ===");
            
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
            
        } else {
            console.log("❌ Version still incorrect:", newVersion);
            console.log("Expected: 3.0.3");
        }
        
    } catch (error) {
        console.error("Upgrade failed:", error.message);
        console.error("Full error:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });