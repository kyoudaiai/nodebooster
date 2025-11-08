const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("=== Starting Full Upgrade Test: V1 → V2 → V3 ===\n");
    
    const [deployer, user1, user2] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);
    console.log("Network:", await ethers.provider.getNetwork());
    
    // Deploy V1
    console.log("\n=== STEP 1: Deploy Avax0TokenV1 ===");
    const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
    
    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    console.log(`Deploying V1 with initial supply: ${ethers.formatEther(initialSupply)} tokens`);
    
    const tokenV1 = await upgrades.deployProxy(
        Avax0TokenV1,
        ["Avax0Token", "AVAX0", initialSupply],
        { initializer: "initialize" }
    );
    await tokenV1.waitForDeployment();
    
    const proxyAddress = await tokenV1.getAddress();
    console.log("V1 Proxy deployed at:", proxyAddress);
    console.log("V1 Version:", await tokenV1.version());
    
    // Test V1 basic functionality
    console.log("\n--- Testing V1 Basic Functionality ---");
    const v1Balance = await tokenV1.balanceOf(deployer.address);
    console.log(`Deployer V1 balance: ${ethers.formatEther(v1Balance)} AVAX0`);
    
    // Transfer some tokens to users
    await tokenV1.transfer(user1.address, ethers.parseEther("10000"));
    await tokenV1.transfer(user2.address, ethers.parseEther("5000"));
    
    console.log(`User1 balance: ${ethers.formatEther(await tokenV1.balanceOf(user1.address))} AVAX0`);
    console.log(`User2 balance: ${ethers.formatEther(await tokenV1.balanceOf(user2.address))} AVAX0`);
    
    // Upgrade to V2
    console.log("\n=== STEP 2: Upgrade to Avax0TokenV2 ===");
    const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
    
    const tokenV2 = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
    await tokenV2.waitForDeployment();
    
    console.log("Upgraded to V2 successfully!");
    console.log("V2 Version:", await tokenV2.version());
    
    // Verify balances are preserved
    console.log("\n--- Verifying V2 Balance Preservation ---");
    console.log(`Deployer balance: ${ethers.formatEther(await tokenV2.balanceOf(deployer.address))} AVAX0`);
    console.log(`User1 balance: ${ethers.formatEther(await tokenV2.balanceOf(user1.address))} AVAX0`);
    console.log(`User2 balance: ${ethers.formatEther(await tokenV2.balanceOf(user2.address))} AVAX0`);
    
    // Test V2 time lock functionality
    console.log("\n--- Testing V2 Time Lock Functionality ---");
    
    // Create time locks for user1
    const lockAmount1 = ethers.parseEther("5000");
    const releaseTime1 = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    
    await tokenV2.createTimeLock(user1.address, lockAmount1, releaseTime1);
    console.log(`Created lock for User1: ${ethers.formatEther(lockAmount1)} AVAX0, release at ${new Date(releaseTime1 * 1000)}`);
    
    // Check locked amounts
    const user1Available = await tokenV2.getAvailableBalance(user1.address);
    const user1Locked = await tokenV2.totalLockedAmount(user1.address);
    
    console.log(`User1 available balance: ${ethers.formatEther(user1Available)} AVAX0`);
    console.log(`User1 locked amount: ${ethers.formatEther(user1Locked)} AVAX0`);
    
    // Get time locks
    const user1Locks = await tokenV2.getTimeLocks(user1.address);
    console.log(`User1 has ${user1Locks.length} lock(s)`);
    
    if (user1Locks.length > 0) {
        console.log(`  Lock 0: ${ethers.formatEther(user1Locks[0].amount)} AVAX0, release ${new Date(Number(user1Locks[0].releaseTime) * 1000)}, released: ${user1Locks[0].released}`);
    }
    
    // Test transfer with locked balance
    console.log("\n--- Testing V2 Transfer Restrictions ---");
    try {
        await tokenV2.connect(user1).transfer(user2.address, ethers.parseEther("8000")); // Should fail
        console.log("ERROR: Transfer should have failed!");
    } catch (error) {
        console.log("✓ Transfer correctly failed due to insufficient unlocked balance");
    }
    
    // Successful transfer with available balance
    await tokenV2.connect(user1).transfer(user2.address, ethers.parseEther("3000"));
    console.log("✓ Transfer succeeded with available balance");
    
    // Upgrade to V3
    console.log("\n=== STEP 3: Upgrade to Avax0TokenV3 ===");
    const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
    
    const tokenV3 = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
    await tokenV3.waitForDeployment();
    
    console.log("Upgraded to V3 successfully!");
    console.log("V3 Version:", await tokenV3.version());
    
    // Initialize V3 features
    console.log("\n--- Initializing V3 Features ---");
    const HOUR = 3600;
    const DAY = 24 * HOUR;
    
    await tokenV3.initializeV3(30 * DAY, DAY); // 30 days duration, 1 day intervals
    console.log("V3 features initialized with 30-day gradual release, 1-day intervals");
    
    // Check minter status after upgrade
    const isMinter = await tokenV3.minters(deployer.address);
    console.log(`Deployer is minter after V3 upgrade: ${isMinter}`);
    
    const v3Config = await tokenV3.defaultGradualReleaseConfig();
    console.log(`Default config: ${Number(v3Config.duration) / DAY} days duration, ${Number(v3Config.interval) / DAY} day intervals, enabled: ${v3Config.enabled}`);
    
    // Verify V3 balance preservation
    console.log("\n--- Verifying V3 Balance Preservation ---");
    console.log(`Deployer balance: ${ethers.formatEther(await tokenV3.balanceOf(deployer.address))} AVAX0`);
    console.log(`User1 balance: ${ethers.formatEther(await tokenV3.balanceOf(user1.address))} AVAX0`);
    console.log(`User2 balance: ${ethers.formatEther(await tokenV3.balanceOf(user2.address))} AVAX0`);
    
    // Verify existing locks are preserved
    console.log("\n--- Verifying V3 Lock Preservation ---");
    const user1LocksV3 = await tokenV3.getTimeLocks(user1.address);
    console.log(`User1 still has ${user1LocksV3.length} lock(s) after V3 upgrade`);
    
    if (user1LocksV3.length > 0) {
        console.log(`  Lock 0: ${ethers.formatEther(user1LocksV3[0].amount)} AVAX0, release ${new Date(Number(user1LocksV3[0].releaseTime) * 1000)}`);
        
        // Check V3 extended info
        const lockV3Info = await tokenV3.getTimeLockV3(user1.address, 0);
        console.log(`  V3 Config: duration ${lockV3Info.config.duration}s, interval ${lockV3Info.config.interval}s, enabled: ${lockV3Info.config.enabled}`);
        console.log(`  Released amount: ${ethers.formatEther(lockV3Info.releasedAmount)} AVAX0`);
    }
    
    // Test V3 gradual release functionality
    console.log("\n--- Testing V3 Gradual Release Functionality ---");
    
    // Create a new lock with custom gradual release
    const lockAmount3 = ethers.parseEther("2000");
    const releaseTime3 = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
    
    const customConfig = {
        duration: 300, // 5 minutes total
        interval: 60,  // 1 minute intervals
        enabled: true
    };
    
    await tokenV3["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](user2.address, lockAmount3, releaseTime3, customConfig);
    console.log(`Created V3 lock for User2: ${ethers.formatEther(lockAmount3)} AVAX0`);
    console.log(`Custom gradual release: ${customConfig.duration}s duration, ${customConfig.interval}s intervals`);
    
    // Get all locks with V3 info
    const user2LocksV3 = await tokenV3.getTimeLocksV3(user2.address);
    console.log(`\nUser2 V3 locks:`);
    for (let i = 0; i < user2LocksV3.locks.length; i++) {
        const lock = user2LocksV3.locks[i];
        const config = user2LocksV3.configs[i];
        const released = user2LocksV3.releasedAmounts[i];
        
        console.log(`  Lock ${i}: ${ethers.formatEther(lock.amount)} AVAX0`);
        console.log(`    Release time: ${new Date(Number(lock.releaseTime) * 1000)}`);
        console.log(`    Gradual config: ${config.enabled ? config.duration + 's duration, ' + config.interval + 's intervals' : 'disabled'}`);
        console.log(`    Released: ${ethers.formatEther(released)} AVAX0`);
    }
    
    // Test detailed balance
    console.log("\n--- Testing V3 Detailed Balance ---");
    const detailedBalance = await tokenV3.getDetailedBalance(user2.address);
    console.log(`User2 detailed balance:`);
    console.log(`  Total: ${ethers.formatEther(detailedBalance.totalBalance)} AVAX0`);
    console.log(`  Currently locked: ${ethers.formatEther(detailedBalance.currentlyLocked)} AVAX0`);
    console.log(`  Available now: ${ethers.formatEther(detailedBalance.availableNow)} AVAX0`);
    console.log(`  Pending release: ${ethers.formatEther(detailedBalance.pendingRelease)} AVAX0`);
    console.log(`  Next release: ${detailedBalance.nextReleaseTime > 0 ? new Date(Number(detailedBalance.nextReleaseTime) * 1000) : 'N/A'}`);
    
    // Test gradual release status for specific lock
    if (user2LocksV3.locks.length > 0) {
        const lockId = user2LocksV3.locks.length - 1; // Latest lock
        const status = await tokenV3.getGradualReleaseStatus(user2.address, lockId);
        
        console.log(`\nGradual release status for User2 Lock ${lockId}:`);
        console.log(`  Available now: ${ethers.formatEther(status.availableNow)} AVAX0`);
        console.log(`  Next release: ${status.nextReleaseTime > 0 ? new Date(Number(status.nextReleaseTime) * 1000) : 'N/A'}`);
        console.log(`  Total released: ${ethers.formatEther(status.totalReleased)} AVAX0`);
        console.log(`  Total amount: ${ethers.formatEther(status.totalAmount)} AVAX0`);
    }
    
    // Test minting with lock
    console.log("\n--- Testing V3 Mint with Lock ---");
    
    // Check and set minter permission if needed
    const isMinterNow = await tokenV3.minters(deployer.address);
    console.log(`Deployer is minter: ${isMinterNow}`);
    
    if (!isMinterNow) {
        await tokenV3.setMinter(deployer.address, true);
        console.log("Set deployer as minter");
    }
    
    const mintAmount = ethers.parseEther("1000");
    const mintReleaseTime = Math.floor(Date.now() / 1000) + 120; // 2 minutes
    
    await tokenV3["mintWithLock(address,uint256,uint256)"](user1.address, mintAmount, mintReleaseTime);
    console.log(`Minted ${ethers.formatEther(mintAmount)} AVAX0 with lock for User1`);
    
    // Test backward compatibility functions
    console.log("\n--- Testing V3 Backward Compatibility ---");
    
    const tx1 = await tokenV3.getAvailableBalanceWithAutoRelease(user1.address);
    await tx1.wait();
    
    const user1AvailableV3 = await tokenV3.getAvailableBalance(user1.address);
    console.log(`User1 available after auto-release: ${ethers.formatEther(user1AvailableV3)} AVAX0`);
    
    const tx2 = await tokenV3.releaseExpiredLocks(user1.address);
    await tx2.wait();
    console.log(`Called releaseExpiredLocks for User1`);
    
    // Final balance summary
    console.log("\n=== FINAL SUMMARY ===");
    console.log(`Total supply: ${ethers.formatEther(await tokenV3.totalSupply())} AVAX0`);
    console.log(`Deployer final balance: ${ethers.formatEther(await tokenV3.balanceOf(deployer.address))} AVAX0`);
    console.log(`User1 final balance: ${ethers.formatEther(await tokenV3.balanceOf(user1.address))} AVAX0`);
    console.log(`User2 final balance: ${ethers.formatEther(await tokenV3.balanceOf(user2.address))} AVAX0`);
    
    console.log(`\nProxy address: ${proxyAddress}`);
    console.log("✅ Full upgrade test completed successfully!");
    
    return {
        proxyAddress,
        tokenV3,
        deployer,
        user1,
        user2
    };
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});