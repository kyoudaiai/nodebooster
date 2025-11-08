const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Auto Cleanup Functionality", function () {
    let token;
    let owner;
    let addr1;
    let addr2;
    let proxyAddress;
    
    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();
        
        // Deploy V1
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0Token");
        const tokenV1 = await upgrades.deployProxy(
            Avax0TokenV1,
            ["Auto Cleanup Test", "ACT", ethers.parseEther("1000000")],
            { initializer: 'initialize' }
        );
        await tokenV1.waitForDeployment();
        
        proxyAddress = await tokenV1.getAddress();
        
        // Upgrade to V2
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
        
        // Upgrade to V3
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        token = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
        
        // Initialize V3 with auto cleanup enabled (default: threshold = 10)
        await token.initializeV3(30 * 24 * 60 * 60, 24 * 60 * 60);
        
        // Mint tokens to test address
        await token.mint(addr1.address, ethers.parseEther("1000"));
    });
    
    describe("Auto Cleanup Configuration", function () {
        it("Should initialize with default auto cleanup settings", async function () {
            const [enabled, threshold] = await token.getAutoCleanupConfig();
            expect(enabled).to.be.true;
            expect(threshold).to.equal(10);
        });
        
        it("Should allow owner to configure auto cleanup", async function () {
            await expect(token.configureAutoCleanup(true, 5))
                .to.emit(token, "AutoCleanupConfigured")
                .withArgs(true, 5);
            
            const [enabled, threshold] = await token.getAutoCleanupConfig();
            expect(enabled).to.be.true;
            expect(threshold).to.equal(5);
        });
        
        it("Should allow disabling auto cleanup", async function () {
            await token.configureAutoCleanup(false, 0);
            
            const [enabled, threshold] = await token.getAutoCleanupConfig();
            expect(enabled).to.be.false;
            expect(threshold).to.equal(0);
        });
        
        it("Should reject invalid threshold when enabled", async function () {
            await expect(
                token.configureAutoCleanup(true, 0)
            ).to.be.revertedWithCustomError(token, "InvalidCleanupThreshold");
        });
        
        it("Should only allow owner to configure auto cleanup", async function () {
            await expect(
                token.connect(addr1).configureAutoCleanup(true, 5)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });
    
    describe("Completed Lock Tracking", function () {
        it("Should track completed locks", async function () {
            // Create some locks with short release times
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60; // 1 minute from now
            
            await token.createTimeLock(addr1.address, ethers.parseEther("10"), releaseTime);
            await token.createTimeLock(addr1.address, ethers.parseEther("20"), releaseTime);
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
            await ethers.provider.send("evm_mine");
            
            // Release the locks
            await token.releaseSpecificLock(addr1.address, 0);
            await token.releaseSpecificLock(addr1.address, 1);
            
            // Check completed count
            const completedCount = await token.getCompletedLockCount(addr1.address);
            expect(completedCount).to.equal(2);
        });
        
        it("Should track completed locks from gradual releases", async function () {
            // Set cleanup threshold to 3 to avoid auto cleanup during test
            await token.configureAutoCleanup(true, 3);
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60;
            await token.createTimeLock(addr1.address, ethers.parseEther("10"), releaseTime);
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            // Process gradual releases (should mark lock as completed)
            await token.releaseExpiredLocks(addr1.address);
            
            const completedCount = await token.getCompletedLockCount(addr1.address);
            expect(completedCount).to.equal(1);
        });
    });
    
    describe("Manual Cleanup", function () {
        beforeEach(async function () {
            // Disable auto cleanup for manual testing
            await token.configureAutoCleanup(false, 0);
            
            // Create and release some locks
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60;
            
            for (let i = 0; i < 5; i++) {
                await token.createTimeLock(addr1.address, ethers.parseEther("10"), releaseTime);
            }
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            // Release all locks
            for (let i = 0; i < 5; i++) {
                await token.releaseSpecificLock(addr1.address, i);
            }
        });
        
        it("Should manually clean up released locks", async function () {
            const locksBefore = await token.getTimeLocks(addr1.address);
            expect(locksBefore.length).to.equal(5);
            
            await expect(token.cleanupReleasedLocks(addr1.address))
                .to.emit(token, "LocksCleanedUp")
                .withArgs(addr1.address, 5, 0);
            
            const locksAfter = await token.getTimeLocks(addr1.address);
            expect(locksAfter.length).to.equal(0);
            
            // Completed count should be reset
            const completedCount = await token.getCompletedLockCount(addr1.address);
            expect(completedCount).to.equal(0);
        });
        
        it("Should preserve active locks during cleanup", async function () {
            // Add some active locks
            const currentBlock = await ethers.provider.getBlock('latest');
            const futureTime = currentBlock.timestamp + 7200; // 2 hours from now
            await token.createTimeLock(addr1.address, ethers.parseEther("30"), futureTime);
            await token.createTimeLock(addr1.address, ethers.parseEther("40"), futureTime);
            
            const locksBefore = await token.getTimeLocks(addr1.address);
            expect(locksBefore.length).to.equal(7); // 5 released + 2 active
            
            await token.cleanupReleasedLocks(addr1.address);
            
            const locksAfter = await token.getTimeLocks(addr1.address);
            expect(locksAfter.length).to.equal(2); // Only active locks remain
            
            // Check that active locks are properly preserved
            expect(locksAfter[0].amount).to.equal(ethers.parseEther("30"));
            expect(locksAfter[1].amount).to.equal(ethers.parseEther("40"));
            expect(locksAfter[0].released).to.be.false;
            expect(locksAfter[1].released).to.be.false;
        });
        
        it("Should handle cleanup when no locks exist", async function () {
            // Clean up first
            await token.cleanupReleasedLocks(addr1.address);
            
            // Try to clean up again (should return 0)
            const removedCount = await token.cleanupReleasedLocks.staticCall(addr1.address);
            expect(removedCount).to.equal(0);
        });
        
        it("Should only allow owner to manually clean up", async function () {
            await expect(
                token.connect(addr1).cleanupReleasedLocks(addr1.address)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });
    
    describe("Auto Cleanup Behavior", function () {
        it("Should automatically clean up when threshold is reached", async function () {
            // Set threshold to 3
            await token.configureAutoCleanup(true, 3);
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60;
            
            // Create 3 locks
            for (let i = 0; i < 3; i++) {
                await token.createTimeLock(addr1.address, ethers.parseEther("10"), releaseTime);
            }
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            // Release first 2 locks (should not trigger cleanup)
            await token.releaseSpecificLock(addr1.address, 0);
            await token.releaseSpecificLock(addr1.address, 1);
            
            let locks = await token.getTimeLocks(addr1.address);
            expect(locks.length).to.equal(3); // No cleanup yet
            
            // Release third lock (should trigger auto cleanup)
            await expect(token.releaseSpecificLock(addr1.address, 2))
                .to.emit(token, "LocksCleanedUp")
                .withArgs(addr1.address, 3, 0);
            
            locks = await token.getTimeLocks(addr1.address);
            expect(locks.length).to.equal(0); // All cleaned up
            
            const completedCount = await token.getCompletedLockCount(addr1.address);
            expect(completedCount).to.equal(0); // Reset after cleanup
        });
        
        it("Should not auto cleanup when disabled", async function () {
            await token.configureAutoCleanup(false, 2);
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60;
            
            for (let i = 0; i < 3; i++) {
                await token.createTimeLock(addr1.address, ethers.parseEther("10"), releaseTime);
            }
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            for (let i = 0; i < 3; i++) {
                await token.releaseSpecificLock(addr1.address, i);
            }
            
            const locks = await token.getTimeLocks(addr1.address);
            expect(locks.length).to.equal(3); // No cleanup
            
            const completedCount = await token.getCompletedLockCount(addr1.address);
            expect(completedCount).to.equal(3); // Still counting
        });
        
        it("Should preserve mixed locks during auto cleanup", async function () {
            await token.configureAutoCleanup(true, 2);
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const pastReleaseTime = currentBlock.timestamp + 60;
            const futureReleaseTime = currentBlock.timestamp + 7200; // 2 hours from now
            
            // Create mix of past and future locks
            await token.createTimeLock(addr1.address, ethers.parseEther("10"), pastReleaseTime);
            await token.createTimeLock(addr1.address, ethers.parseEther("20"), futureReleaseTime);
            await token.createTimeLock(addr1.address, ethers.parseEther("30"), pastReleaseTime);
            await token.createTimeLock(addr1.address, ethers.parseEther("40"), futureReleaseTime);
            
            // Fast forward time past the first release time but not the future ones
            await ethers.provider.send("evm_increaseTime", [3600]); // 1 hour
            await ethers.provider.send("evm_mine");
            
            // Release the past locks (should trigger cleanup after 2)
            await token.releaseSpecificLock(addr1.address, 0);
            await token.releaseSpecificLock(addr1.address, 2);
            
            const locks = await token.getTimeLocks(addr1.address);
            expect(locks.length).to.equal(2); // Only future locks remain
            
            // Check that the right locks remain
            expect(locks[0].amount).to.equal(ethers.parseEther("20"));
            expect(locks[1].amount).to.equal(ethers.parseEther("40"));
            expect(locks[0].released).to.be.false;
            expect(locks[1].released).to.be.false;
        });
    });
    
    describe("Gas Optimization Benefits", function () {
        it("Should reduce gas costs for operations after cleanup", async function () {
            // Disable auto cleanup to manually control
            await token.configureAutoCleanup(false, 0);
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 60;
            
            // Create many released locks
            for (let i = 0; i < 10; i++) {
                await token.createTimeLock(addr1.address, ethers.parseEther("5"), releaseTime);
            }
            
            // Fast forward time past release time
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            // Release all locks
            for (let i = 0; i < 10; i++) {
                await token.releaseSpecificLock(addr1.address, i);
            }
            
            // Check operations before cleanup
            await token.getAvailableBalance(addr1.address);
            
            // Clean up
            await token.cleanupReleasedLocks(addr1.address);
            
            // Create a new lock and measure operations
            const futureTime = currentBlock.timestamp + 7200;
            await token.createTimeLock(addr1.address, ethers.parseEther("10"), futureTime);
            
            // Operations should be more gas efficient now
            const locks = await token.getTimeLocks(addr1.address);
            expect(locks.length).to.equal(1); // Only the new lock
        });
    });
});