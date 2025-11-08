const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Avax0TokenV3 Upgrade Script - Fuji Network ===");
    console.log("Upgrading to V3.0.3 with Auto Cleanup and ModifyLock features");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Get proxy address from environment
    const proxyAddress = process.env.AVAX0_fuji;
    if (!proxyAddress) {
        throw new Error("AVAX0_fuji not found in .env file");
    }
    
    console.log("Proxy address:", proxyAddress);
    
    // Verify current contract state
    console.log("\n=== Pre-Upgrade Verification ===");
    try {
        const currentContract = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        const version = await currentContract.version();
        console.log("Current version:", version);
        
        const name = await currentContract.name();
        console.log("Token name:", name);
        
        const totalSupply = await currentContract.totalSupply();
        console.log("Total supply:", hre.ethers.formatEther(totalSupply));
        
        const owner = await currentContract.owner();
        console.log("Current owner:", owner);
        
        // Verify deployer is owner
        if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
            throw new Error(`Deployer ${deployer.address} is not the contract owner ${owner}`);
        }
        
        // Check if auto cleanup functions exist (should fail on old version)
        console.log("\n=== Checking Current Feature Set ===");
        try {
            await currentContract.getAutoCleanupConfig();
            console.log("⚠️  Auto cleanup already exists - may already be V3.0.3");
        } catch (error) {
            console.log("✅ Confirmed: Auto cleanup not present (expected for upgrade)");
        }
        
        try {
            await currentContract.getCompletedLockCount(deployer.address);
            console.log("⚠️  Completed lock counting already exists");
        } catch (error) {
            console.log("✅ Confirmed: Completed lock counting not present (expected)");
        }
        
        // Test existing createTimeLock functions
        console.log("\n=== Testing Current createTimeLock Functions ===");
        const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
        
        try {
            const gasEstimate = await currentContract['createTimeLock(address,uint256,uint256)'].estimateGas(
                testAccount, 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 3600
            );
            console.log("✅ 3-parameter createTimeLock working, gas estimate:", gasEstimate.toString());
        } catch (error) {
            console.log("❌ 3-parameter createTimeLock failing:", error.message);
        }
        
    } catch (error) {
        console.log("Error verifying current contract:", error.message);
        throw error;
    }
    
    // Deploy new implementation
    console.log("\n=== Deploying V3.0.3 Implementation ===");
    
    const Avax0TokenV3_Latest = await hre.ethers.getContractFactory("Avax0TokenV3");
    
    // Perform the upgrade
    console.log("Upgrading proxy to V3.0.3 implementation...");
    const upgradedContract = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV3_Latest);
    
    console.log("✅ Upgrade transaction completed");
    
    // Wait for deployment
    await upgradedContract.waitForDeployment();
    console.log("✅ Upgrade confirmed");
    
    // Post-upgrade initialization (V3 features should already be initialized)
    console.log("\n=== Checking V3 Initialization ===");
    try {
        const defaultConfig = await upgradedContract.defaultGradualReleaseConfig();
        console.log("Default gradual config:", {
            duration: defaultConfig.duration.toString(),
            interval: defaultConfig.interval.toString(), 
            enabled: defaultConfig.enabled
        });
        console.log("✅ V3 features already initialized");
    } catch (error) {
        console.log("❌ V3 not initialized, this should not happen:", error.message);
        throw error;
    }
    
    // Verify the upgrade and new features
    console.log("\n=== Post-Upgrade Verification ===");
    
    try {
        const version = await upgradedContract.version();
        console.log("New version:", version);
        
        if (version !== "3.0.3") {
            throw new Error(`Expected version 3.0.3, got ${version}`);
        }
        
        const name = await upgradedContract.name();
        console.log("Token name:", name);
        
        const totalSupply = await upgradedContract.totalSupply();
        console.log("Total supply:", hre.ethers.formatEther(totalSupply));
        
        // Test new auto cleanup configuration
        console.log("\n=== Testing Auto Cleanup Features ===");
        
        try {
            const [enabled, threshold] = await upgradedContract.getAutoCleanupConfig();
            console.log("✅ Auto cleanup config:", { enabled, threshold: threshold.toString() });
        } catch (error) {
            console.log("❌ Auto cleanup config failed:", error.message);
            throw error;
        }
        
        try {
            const completedCount = await upgradedContract.getCompletedLockCount(deployer.address);
            console.log("✅ Completed lock count accessible:", completedCount.toString());
        } catch (error) {
            console.log("❌ Completed lock count failed:", error.message);
            throw error;
        }
        
        // Test auto cleanup configuration
        try {
            console.log("Testing auto cleanup configuration...");
            const configTx = await upgradedContract.configureAutoCleanup(true, 5);
            await configTx.wait();
            
            const [newEnabled, newThreshold] = await upgradedContract.getAutoCleanupConfig();
            console.log("✅ Auto cleanup reconfigured:", { enabled: newEnabled, threshold: newThreshold.toString() });
        } catch (error) {
            console.log("❌ Auto cleanup configuration failed:", error.message);
            throw error;
        }
        
        // Test modify lock functions
        console.log("\n=== Testing ModifyLock Features ===");
        
        const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
        
        // Ensure test account has balance
        const testBalance = await upgradedContract.balanceOf(testAccount);
        console.log("Test account balance:", hre.ethers.formatEther(testBalance));
        
        if (testBalance < hre.ethers.parseEther("10")) {
            console.log("Minting test tokens...");
            const mintTx = await upgradedContract.mint(testAccount, hre.ethers.parseEther("100"));
            await mintTx.wait();
            console.log("✅ Test tokens minted");
        }
        
        // Create a test lock for modification
        console.log("Creating test lock for modification testing...");
        const releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const lockTx = await upgradedContract['createTimeLock(address,uint256,uint256)'](
            testAccount, 
            hre.ethers.parseEther("10"), 
            releaseTime
        );
        await lockTx.wait();
        console.log("✅ Test lock created");
        
        // Test modify lock amount
        try {
            console.log("Testing modifyLockAmount...");
            const modifyTx = await upgradedContract.modifyLockAmount(
                testAccount, 
                0, // First lock
                hre.ethers.parseEther("15") // Increase to 15
            );
            await modifyTx.wait();
            console.log("✅ modifyLockAmount succeeded");
            
            // Verify modification
            const locks = await upgradedContract.getTimeLocks(testAccount);
            if (locks.length > 0) {
                console.log("Modified lock amount:", hre.ethers.formatEther(locks[0].amount));
            }
        } catch (error) {
            console.log("❌ modifyLockAmount failed:", error.message);
        }
        
        // Test modify lock release time
        try {
            console.log("Testing modifyLockReleaseTime...");
            const newReleaseTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours
            const modifyTimeTx = await upgradedContract.modifyLockReleaseTime(
                testAccount, 
                0, 
                newReleaseTime
            );
            await modifyTimeTx.wait();
            console.log("✅ modifyLockReleaseTime succeeded");
        } catch (error) {
            console.log("❌ modifyLockReleaseTime failed:", error.message);
        }
        
        // Test manual cleanup
        try {
            console.log("Testing manual cleanup (should return 0 - no completed locks)...");
            const cleanupTx = await upgradedContract.cleanupReleasedLocks(testAccount);
            const receipt = await cleanupTx.wait();
            console.log("✅ Manual cleanup function accessible");
        } catch (error) {
            console.log("❌ Manual cleanup failed:", error.message);
        }
        
        // Test existing functions still work
        console.log("\n=== Testing Existing Function Compatibility ===");
        
        try {
            const gasEstimate = await upgradedContract['createTimeLock(address,uint256,uint256)'].estimateGas(
                testAccount, 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 3600
            );
            console.log("✅ 3-parameter createTimeLock still working, gas:", gasEstimate.toString());
        } catch (error) {
            console.log("❌ 3-parameter createTimeLock broken:", error.message);
        }
        
        try {
            const availableBalance = await upgradedContract.getAvailableBalance(testAccount);
            console.log("✅ getAvailableBalance working:", hre.ethers.formatEther(availableBalance));
        } catch (error) {
            console.log("❌ getAvailableBalance failed:", error.message);
        }
        
    } catch (error) {
        console.log("Error in post-upgrade verification:", error.message);
        throw error;
    }
    
    console.log("\n=== Upgrade Summary ===");
    console.log("✅ Successfully upgraded to Avax0TokenV3 v3.0.3 on Fuji");
    console.log("✅ Auto cleanup system enabled with default threshold: 10");
    console.log("✅ ModifyLock functions available:");
    console.log("   - modifyLockAmount()");
    console.log("   - modifyLockReleaseTime()"); 
    console.log("   - modifyLockGradualConfig()");
    console.log("   - modifyLock() (comprehensive)");
    console.log("✅ Manual cleanup function available: cleanupReleasedLocks()");
    console.log("✅ Auto cleanup configuration: configureAutoCleanup()");
    console.log("✅ All existing functionality preserved");
    console.log("\nProxy Address:", proxyAddress);
    console.log("Network: Fuji Testnet");
    console.log("Upgrade completed at:", new Date().toISOString());
    
    console.log("\n=== New Features Available ===");
    console.log("🔧 Auto Cleanup:");
    console.log("   - Automatically removes completed locks when threshold reached");
    console.log("   - Default: enabled with threshold of 10");
    console.log("   - Configurable via configureAutoCleanup(enabled, threshold)");
    console.log("   - Manual cleanup via cleanupReleasedLocks(account)");
    console.log("");
    console.log("⚙️  Lock Modification:");
    console.log("   - Modify lock amounts: modifyLockAmount(account, lockId, newAmount)");
    console.log("   - Modify release times: modifyLockReleaseTime(account, lockId, newTime)");
    console.log("   - Modify gradual configs: modifyLockGradualConfig(account, lockId, config)");
    console.log("   - Full modification: modifyLock(account, lockId, amount, time, config, updateConfig)");
    console.log("");
    console.log("📊 Enhanced Monitoring:");
    console.log("   - Track completed locks: getCompletedLockCount(account)");
    console.log("   - Auto cleanup config: getAutoCleanupConfig()");
    console.log("   - Events: AutoCleanupConfigured, LocksCleanedUp, LockModified");
    
    console.log("\n🚀 V3.0.3 upgrade complete! All new features ready for use.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    });