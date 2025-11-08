const { ethers } = require("hardhat");

async function main() {
    console.log("Testing V3 gradual release functionality...");
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
    const token = Avax0TokenV3.attach(proxyAddress);
    
    const [signer] = await ethers.getSigners();
    console.log(`Testing with account: ${signer.address}`);
    
    // Test 1: Create a time lock with gradual release
    console.log("\n=== Test 1: Create lock with gradual release ===");
    
    const lockAmount = ethers.parseEther("1000"); // 1000 tokens
    const releaseTime = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
    
    // Create custom gradual release config: 5 minutes total, 1 minute intervals
    const gradualConfig = {
        duration: 300, // 5 minutes
        interval: 60,  // 1 minute
        enabled: true
    };
    
    console.log(`Creating lock: ${ethers.formatEther(lockAmount)} tokens`);
    console.log(`Release time: ${new Date(releaseTime * 1000)}`);
    console.log(`Gradual release: ${gradualConfig.duration}s duration, ${gradualConfig.interval}s intervals`);
    
    const tx = await token.createTimeLock(signer.address, lockAmount, releaseTime, gradualConfig);
    await tx.wait();
    
    console.log("Lock created successfully!");
    
    // Check lock details
    const lockCount = await token.getTimeLockCount(signer.address);
    console.log(`Total locks: ${lockCount}`);
    
    const lockId = Number(lockCount) - 1;
    const lockDetails = await token.getTimeLockV3(signer.address, lockId);
    
    console.log(`\nLock ${lockId} details:`);
    console.log(`  Amount: ${ethers.formatEther(lockDetails.lock.amount)} AVAX0`);
    console.log(`  Release time: ${new Date(Number(lockDetails.lock.releaseTime) * 1000)}`);
    console.log(`  Released: ${lockDetails.lock.released}`);
    console.log(`  Config duration: ${lockDetails.config.duration}s`);
    console.log(`  Config interval: ${lockDetails.config.interval}s`);
    console.log(`  Config enabled: ${lockDetails.config.enabled}`);
    console.log(`  Already released: ${ethers.formatEther(lockDetails.releasedAmount)} AVAX0`);
    
    // Check gradual release status
    const status = await token.getGradualReleaseStatus(signer.address, lockId);
    console.log(`\nGradual release status:`);
    console.log(`  Available now: ${ethers.formatEther(status.availableNow)} AVAX0`);
    console.log(`  Next release time: ${status.nextReleaseTime > 0 ? new Date(Number(status.nextReleaseTime) * 1000) : 'N/A'}`);
    console.log(`  Total released: ${ethers.formatEther(status.totalReleased)} AVAX0`);
    console.log(`  Total amount: ${ethers.formatEther(status.totalAmount)} AVAX0`);
    
    // Check detailed balance
    const detailed = await token.getDetailedBalance(signer.address);
    console.log(`\nAccount detailed balance:`);
    console.log(`  Total: ${ethers.formatEther(detailed.totalBalance)} AVAX0`);
    console.log(`  Currently locked: ${ethers.formatEther(detailed.currentlyLocked)} AVAX0`);
    console.log(`  Available now: ${ethers.formatEther(detailed.availableNow)} AVAX0`);
    console.log(`  Pending release: ${ethers.formatEther(detailed.pendingRelease)} AVAX0`);
    console.log(`  Next release time: ${detailed.nextReleaseTime > 0 ? new Date(Number(detailed.nextReleaseTime) * 1000) : 'N/A'}`);
    
    console.log("\n=== Test 2: Test with default gradual release ===");
    
    // Create another lock with default config
    const lockAmount2 = ethers.parseEther("500");
    const releaseTime2 = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
    
    const tx2 = await token.createTimeLock(signer.address, lockAmount2, releaseTime2);
    await tx2.wait();
    
    console.log(`Created second lock: ${ethers.formatEther(lockAmount2)} tokens`);
    console.log(`Release time: ${new Date(releaseTime2 * 1000)}`);
    
    // Check all locks
    const allLocks = await token.getTimeLocksV3(signer.address);
    console.log(`\nAll locks (${allLocks.locks.length} total):`);
    
    for (let i = 0; i < allLocks.locks.length; i++) {
        const lock = allLocks.locks[i];
        const config = allLocks.configs[i];
        const released = allLocks.releasedAmounts[i];
        
        console.log(`  Lock ${i}:`);
        console.log(`    Amount: ${ethers.formatEther(lock.amount)} AVAX0`);
        console.log(`    Release time: ${new Date(Number(lock.releaseTime) * 1000)}`);
        console.log(`    Released: ${lock.released}`);
        console.log(`    Gradual config: ${config.enabled ? config.duration + 's duration, ' + config.interval + 's intervals' : 'disabled'}`);
        console.log(`    Already released: ${ethers.formatEther(released)} AVAX0`);
    }
    
    console.log("\nV3 functionality test completed!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});