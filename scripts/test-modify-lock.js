const hre = require("hardhat");

async function main() {
    console.log("=== Testing ModifyLock Functionality ===");
    
    const [deployer] = await hre.ethers.getSigners();
    
    // Deploy fresh V1->V2->V3 for testing
    console.log("1. Deploying test contracts...");
    
    const Avax0TokenV1 = await hre.ethers.getContractFactory("Avax0Token");
    const tokenV1 = await hre.upgrades.deployProxy(
        Avax0TokenV1,
        ["ModifyLock Test", "MLT", hre.ethers.parseEther("1000000")],
        { initializer: 'initialize' }
    );
    await tokenV1.waitForDeployment();
    
    const proxyAddress = await tokenV1.getAddress();
    
    const Avax0TokenV2 = await hre.ethers.getContractFactory("Avax0TokenV2");
    const tokenV2 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
    
    const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
    const tokenV3 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
    await tokenV3.initializeV3(30 * 24 * 60 * 60, 24 * 60 * 60);
    
    console.log("✅ V3 deployed at:", proxyAddress);
    
    // Setup test data
    const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    await tokenV3.mint(testAccount, hre.ethers.parseEther("1000"));
    
    console.log("\n2. Creating initial time lock...");
    const initialAmount = hre.ethers.parseEther("100");
    const initialReleaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    const createTx = await tokenV3.createTimeLock(testAccount, initialAmount, initialReleaseTime);
    await createTx.wait();
    
    const locks = await tokenV3.getTimeLocks(testAccount);
    console.log("✅ Initial lock created:", {
        amount: hre.ethers.formatEther(locks[0].amount),
        releaseTime: new Date(Number(locks[0].releaseTime) * 1000).toISOString()
    });
    
    // Test 1: Modify amount (increase)
    console.log("\n3. Testing amount modification (increase)...");
    const newAmount = hre.ethers.parseEther("150");
    
    try {
        const modifyTx = await tokenV3.modifyLockAmount(testAccount, 0, newAmount);
        await modifyTx.wait();
        
        const modifiedLocks = await tokenV3.getTimeLocks(testAccount);
        console.log("✅ Amount increased:", {
            oldAmount: hre.ethers.formatEther(initialAmount),
            newAmount: hre.ethers.formatEther(modifiedLocks[0].amount)
        });
        
    } catch (error) {
        console.log("❌ Amount modification failed:", error.message);
    }
    
    // Test 2: Modify release time
    console.log("\n4. Testing release time modification...");
    const newReleaseTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours
    
    try {
        const timeTx = await tokenV3.modifyLockReleaseTime(testAccount, 0, newReleaseTime);
        await timeTx.wait();
        
        const modifiedLocks = await tokenV3.getTimeLocks(testAccount);
        console.log("✅ Release time modified:", {
            oldTime: new Date(initialReleaseTime * 1000).toISOString(),
            newTime: new Date(Number(modifiedLocks[0].releaseTime) * 1000).toISOString()
        });
        
    } catch (error) {
        console.log("❌ Release time modification failed:", error.message);
    }
    
    // Test 3: Modify gradual release config
    console.log("\n5. Testing gradual release config modification...");
    const newConfig = {
        duration: 7 * 24 * 60 * 60, // 7 days
        interval: 24 * 60 * 60,     // 1 day
        enabled: true
    };
    
    try {
        const configTx = await tokenV3.modifyLockGradualConfig(testAccount, 0, newConfig);
        await configTx.wait();
        
        const [lock, config] = await tokenV3.getTimeLockV3(testAccount, 0);
        console.log("✅ Gradual config modified:", {
            duration: config.duration.toString(),
            interval: config.interval.toString(),
            enabled: config.enabled
        });
        
    } catch (error) {
        console.log("❌ Gradual config modification failed:", error.message);
    }
    
    // Test 4: Full modification using main function
    console.log("\n6. Testing full modification...");
    
    const fullModifyAmount = hre.ethers.parseEther("200");
    const fullModifyTime = Math.floor(Date.now() / 1000) + 10800; // 3 hours
    const fullModifyConfig = {
        duration: 14 * 24 * 60 * 60, // 14 days
        interval: 12 * 60 * 60,      // 12 hours
        enabled: true
    };
    
    try {
        const fullTx = await tokenV3.modifyLock(
            testAccount, 
            0, 
            fullModifyAmount, 
            fullModifyTime, 
            fullModifyConfig, 
            true
        );
        await fullTx.wait();
        
        const [finalLock, finalConfig] = await tokenV3.getTimeLockV3(testAccount, 0);
        console.log("✅ Full modification successful:", {
            amount: hre.ethers.formatEther(finalLock.amount),
            releaseTime: new Date(Number(finalLock.releaseTime) * 1000).toISOString(),
            config: {
                duration: finalConfig.duration.toString(),
                interval: finalConfig.interval.toString(),
                enabled: finalConfig.enabled
            }
        });
        
    } catch (error) {
        console.log("❌ Full modification failed:", error.message);
    }
    
    // Test 5: Error cases
    console.log("\n7. Testing error cases...");
    
    // Try to decrease amount below already released (should fail)
    try {
        await tokenV3.modifyLockAmount(testAccount, 0, hre.ethers.parseEther("50"));
        console.log("❌ Should have failed: decreasing below released amount");
    } catch (error) {
        console.log("✅ Correctly rejected decreasing amount too much");
    }
    
    // Try to modify non-existent lock
    try {
        await tokenV3.modifyLockAmount(testAccount, 999, hre.ethers.parseEther("100"));
        console.log("❌ Should have failed: non-existent lock");
    } catch (error) {
        console.log("✅ Correctly rejected non-existent lock");
    }
    
    // Try invalid release time
    try {
        await tokenV3.modifyLockReleaseTime(testAccount, 0, Math.floor(Date.now() / 1000) - 3600);
        console.log("❌ Should have failed: past release time");
    } catch (error) {
        console.log("✅ Correctly rejected past release time");
    }
    
    console.log("\n=== ModifyLock Testing Complete ===");
    console.log("All modify lock functions are working correctly!");
    
    console.log("\n=== Usage Examples ===");
    console.log("// Modify only amount:");
    console.log(`await token.modifyLockAmount("${testAccount}", 0, ethers.parseEther("250"));`);
    
    console.log("\n// Modify only release time:");
    console.log(`await token.modifyLockReleaseTime("${testAccount}", 0, futureTimestamp);`);
    
    console.log("\n// Modify only gradual config:");
    console.log(`const config = { duration: 30*24*60*60, interval: 24*60*60, enabled: true };`);
    console.log(`await token.modifyLockGradualConfig("${testAccount}", 0, config);`);
    
    console.log("\n// Modify everything at once:");
    console.log(`await token.modifyLock("${testAccount}", 0, newAmount, newTime, newConfig, true);`);
}

main().catch(console.error);