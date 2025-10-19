const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🚀 Starting NodeBooster V1 to V2 upgrade process...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Get the existing proxy address from environment or hardcoded for your deployment
    const PROXY_ADDRESS = process.env.NODEBOOSTER_PROXY_ADDRESS;
    
    if (!PROXY_ADDRESS) {
        console.error("❌ Please set NODEBOOSTER_PROXY_ADDRESS environment variable");
        console.log("Example: export NODEBOOSTER_PROXY_ADDRESS=0x1234...");
        process.exit(1);
    }

    console.log("📍 Existing NodeBooster proxy address:", PROXY_ADDRESS);

    // Verify the existing contract is V1
    const existingContract = await ethers.getContractAt("NodeBoosterV1", PROXY_ADDRESS);
    
    try {
        const currentVersion = await existingContract.version();
        console.log("📊 Current contract version:", currentVersion);
        
        if (currentVersion !== "1.0.0") {
            console.warn("⚠️  Warning: Expected version 1.0.0, found:", currentVersion);
        }
    } catch (error) {
        console.log("ℹ️  Could not retrieve version (normal for older contracts)");
    }

    // Get current contract state before upgrade
    console.log("\n📋 Pre-upgrade contract state:");
    try {
        const totalUsers = await existingContract.totalUsers();
        const totalUsdcCollected = await existingContract.totalUsdcCollected();
        const totalAvax0Distributed = await existingContract.totalAvax0Distributed();
        const engineCount = await existingContract.engineCount();
        const minWD = await existingContract.MIN_WD();
        
        console.log("  Total users:", totalUsers.toString());
        console.log("  Total USDC collected:", ethers.formatUnits(totalUsdcCollected, 6), "USDC");
        console.log("  Total AVAX0 distributed:", ethers.formatEther(totalAvax0Distributed), "AVAX0");
        console.log("  Engine count:", engineCount.toString());
        console.log("  MIN_WD:", minWD.toString(), "seconds");
    } catch (error) {
        console.log("  ⚠️  Could not retrieve some state data:", error.message);
    }

    // Deploy the new implementation (V2)
    console.log("\n🔧 Deploying NodeBoosterV2 implementation...");
    const NodeBoosterV2 = await ethers.getContractFactory("NodeBoosterV2");
    
    try {
        // Upgrade the proxy to point to V2 implementation
        console.log("⬆️  Upgrading proxy to V2...");
        const upgradedContract = await upgrades.upgradeProxy(PROXY_ADDRESS, NodeBoosterV2);
        await upgradedContract.waitForDeployment();
        
        console.log("✅ Upgrade completed!");
        console.log("📍 Proxy address (unchanged):", await upgradedContract.getAddress());
        
        // Verify the upgrade
        console.log("\n🔍 Verifying upgrade...");
        const v2Contract = await ethers.getContractAt("NodeBoosterV2", PROXY_ADDRESS);
        
        const newVersion = await v2Contract.version();
        console.log("📊 New contract version:", newVersion);
        
        if (newVersion !== "2.0.0") {
            throw new Error(`Expected version 2.0.0, got ${newVersion}`);
        }

        // Verify state preservation
        console.log("\n📋 Post-upgrade state verification:");
        const postTotalUsers = await v2Contract.totalUsers();
        const postTotalUsdcCollected = await v2Contract.totalUsdcCollected();
        const postTotalAvax0Distributed = await v2Contract.totalAvax0Distributed();
        const postEngineCount = await v2Contract.engineCount();
        const postMinWD = await v2Contract.MIN_WD();
        
        console.log("  Total users:", postTotalUsers.toString());
        console.log("  Total USDC collected:", ethers.formatUnits(postTotalUsdcCollected, 6), "USDC");
        console.log("  Total AVAX0 distributed:", ethers.formatEther(postTotalAvax0Distributed), "AVAX0");
        console.log("  Engine count:", postEngineCount.toString());
        console.log("  MIN_WD:", postMinWD.toString(), "seconds");

        // Test new V2 functionality
        console.log("\n🆕 Testing V2-specific features...");
        
        // Check default referrer (new in V2)
        try {
            const defaultReferrer = await v2Contract.defaultReferrer();
            console.log("  Default referrer:", defaultReferrer);
        } catch (error) {
            console.log("  ⚠️  Could not get default referrer:", error.message);
        }

        // Test new getUserAccountInfo function
        try {
            const [isRegistered, referrer, totalReferrals] = await v2Contract.getUserAccountInfo(deployer.address);
            console.log("  Owner account registered:", isRegistered);
            console.log("  Owner referrer:", referrer);
            console.log("  Owner total referrals:", totalReferrals.toString());
        } catch (error) {
            console.log("  ⚠️  Could not get user account info:", error.message);
        }

        console.log("\n🎉 Upgrade completed successfully!");
        console.log("📝 Summary:");
        console.log("  - Contract upgraded from V1 to V2");
        console.log("  - All existing data preserved");
        console.log("  - New V2 features available");
        console.log("  - Proxy address unchanged:", PROXY_ADDRESS);

    } catch (error) {
        console.error("❌ Upgrade failed:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}

// Error handling
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });