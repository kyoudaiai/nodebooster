const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0TokenV3 - Gradual Release Core Functionality", function () {
    let token, owner, user1, user2;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const DAY = 24 * 60 * 60;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        
        // Deploy with V2 initialization first
        token = await upgrades.deployProxy(
            Avax0TokenV3,
            ["Avax0Token", "AVAX0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await token.waitForDeployment();
        
        // Then initialize V3 features (30 day gradual release, daily intervals)
        await token.initializeV3(MONTH, DAY);
        
        // Setup test balance
        await token.transfer(user1.address, ethers.parseEther("100000"));
    });
    
    describe("Configuration and Setup", function () {
        it("Should set default gradual release configuration", async function () {
            const config = await token.defaultGradualReleaseConfig();
            expect(config.duration).to.equal(MONTH);
            expect(config.interval).to.equal(DAY);
            expect(config.enabled).to.be.true;
        });
        
        it("Should allow owner to update gradual release configuration", async function () {
            const newDuration = WEEK * 2; // 2 weeks
            const newInterval = DAY * 3; // 3 days
            
            await expect(
                token.setDefaultGradualReleaseConfig(newDuration, newInterval, true)
            ).to.emit(token, "GradualReleaseConfigUpdated")
             .withArgs(newDuration, newInterval, true);
            
            const config = await token.defaultGradualReleaseConfig();
            expect(config.duration).to.equal(newDuration);
            expect(config.interval).to.equal(newInterval);
            expect(config.enabled).to.be.true;
        });
        
        it("Should reject invalid gradual release configuration", async function () {
            // Duration = 0
            await expect(
                token.setDefaultGradualReleaseConfig(0, DAY, true)
            ).to.be.revertedWithCustomError(token, "InvalidGradualReleaseConfig");
            
            // Interval = 0
            await expect(
                token.setDefaultGradualReleaseConfig(MONTH, 0, true)
            ).to.be.revertedWithCustomError(token, "InvalidGradualReleaseConfig");
            
            // Interval > Duration
            await expect(
                token.setDefaultGradualReleaseConfig(DAY, WEEK, true)
            ).to.be.revertedWithCustomError(token, "InvalidGradualReleaseConfig");
        });
    });
    
    describe("Time Lock Creation with Gradual Release", function () {
        it("Should create time lock with custom gradual release config", async function () {
            const lockAmount = ethers.parseEther("15000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + WEEK;
            
            const customConfig = {
                duration: WEEK * 2, // 2 weeks
                interval: DAY * 2,  // 2 days
                enabled: true
            };
            
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](
                user1.address, lockAmount, releaseTime, customConfig
            );
            
            const lock = await token.getTimeLock(user1.address, 0);
            expect(lock.gradualConfig.duration).to.equal(customConfig.duration);
            expect(lock.gradualConfig.interval).to.equal(customConfig.interval);
            expect(lock.gradualConfig.enabled).to.equal(customConfig.enabled);
        });
        
        it("Should mint with lock and gradual release", async function () {
            const mintAmount = ethers.parseEther("50000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + WEEK;
            
            const customConfig = {
                duration: WEEK,     // 1 week
                interval: DAY,      // 1 day
                enabled: true
            };
            
            const initialBalance = await token.balanceOf(user2.address);
            
            await token.connect(owner)["mintWithLock(address,uint256,uint256,(uint256,uint256,bool))"](
                user2.address, mintAmount, releaseTime, customConfig
            );
            
            expect(await token.balanceOf(user2.address)).to.equal(initialBalance + mintAmount);
            expect(await token.getLockedAmount(user2.address)).to.equal(mintAmount);
            
            const lock = await token.getTimeLock(user2.address, 0);
            expect(lock.gradualConfig.duration).to.equal(WEEK);
            expect(lock.gradualConfig.interval).to.equal(DAY);
        });
    });
    
    describe("Gradual Release Mechanics", function () {
        beforeEach(async function () {
            // Create a lock that will expire soon for testing
            const lockAmount = ethers.parseEther("30000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 10; // Expires in 10 seconds
            
            // Custom config: 10 days duration, 2 day intervals (5 releases total)
            const customConfig = {
                duration: 10 * DAY,
                interval: 2 * DAY,
                enabled: true
            };
            
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](
                user1.address, lockAmount, releaseTime, customConfig
            );
        });
        
        it("Should calculate correct gradual release amounts", async function () {
            const lockAmount = ethers.parseEther("30000");
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            // Check initial release (first interval)
            let status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.availableNow).to.equal(ethers.parseEther("6000")); // 30000 / 5 = 6000
            expect(status.totalReleased).to.equal(0);
            
            // Process first release
            await token.releaseSpecificLock(user1.address, 0);
            
            status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.totalReleased).to.equal(ethers.parseEther("6000"));
            expect(status.availableNow).to.equal(0); // Nothing more available yet
            
            // Advance 2 more days (second interval)
            await ethers.provider.send("evm_increaseTime", [2 * DAY]);
            await ethers.provider.send("evm_mine");
            
            status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.availableNow).to.equal(ethers.parseEther("6000")); // Another 6000
        });
        
        it("Should release all tokens after gradual period ends", async function () {
            const lockAmount = ethers.parseEther("30000");
            
            // Wait for lock to expire and entire gradual period to pass
            await ethers.provider.send("evm_increaseTime", [15 + 10 * DAY]);
            await ethers.provider.send("evm_mine");
            
            // Should be able to release entire amount
            const status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.availableNow).to.equal(lockAmount);
            
            await token.releaseSpecificLock(user1.address, 0);
            
            const finalStatus = await token.getGradualReleaseStatus(user1.address, 0);
            expect(finalStatus.totalReleased).to.equal(lockAmount);
            
            const lock = await token.getTimeLock(user1.address, 0);
            expect(lock.released).to.be.true;
        });
        
        it("Should automatically process gradual releases on transfer", async function () {
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            const transferAmount = ethers.parseEther("5000"); // Less than first release amount
            
            // Transfer should automatically process gradual release
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensGraduallyReleased");
            
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Check that gradual release was processed
            const status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.totalReleased).to.equal(ethers.parseEther("6000"));
        });
        
        it("Should prevent transfer when insufficient gradual release available", async function () {
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const largeTransferAmount = ethers.parseEther("80000"); // More than available
            
            // Should fail with detailed error message
            await expect(
                token.connect(user1).transfer(user2.address, largeTransferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientGraduallyReleasedBalance");
        });
        
        it("Should provide detailed balance information", async function () {
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const balanceInfo = await token.getDetailedBalance(user1.address);
            
            expect(balanceInfo.totalBalance).to.equal(ethers.parseEther("100000"));
            expect(balanceInfo.currentlyLocked).to.equal(ethers.parseEther("30000"));
            expect(balanceInfo.availableNow).to.equal(ethers.parseEther("70000"));
            expect(balanceInfo.pendingRelease).to.equal(ethers.parseEther("6000")); // First interval
            expect(balanceInfo.nextReleaseTime).to.be.gt(0);
        });
    });
    
    describe("Multiple Locks with Different Configs", function () {
        it("Should handle multiple locks with different gradual release configs", async function () {
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 10;
            const releaseTime2 = currentBlock.timestamp + 20;
            
            // First lock: quick release (2 days, daily)
            const config1 = {
                duration: 2 * DAY,
                interval: DAY,
                enabled: true
            };
            
            // Second lock: slower release (4 days, every 2 days)
            const config2 = {
                duration: 4 * DAY,
                interval: 2 * DAY,
                enabled: true
            };
            
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](user1.address, ethers.parseEther("10000"), releaseTime1, config1);
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](user1.address, ethers.parseEther("20000"), releaseTime2, config2);
            
            // Wait for both locks to expire
            await ethers.provider.send("evm_increaseTime", [25]);
            await ethers.provider.send("evm_mine");
            
            // Process gradual releases
            await token.releaseGradualUnlocks(user1.address);
            
            // Check that both locks are being processed correctly
            const status1 = await token.getGradualReleaseStatus(user1.address, 0);
            const status2 = await token.getGradualReleaseStatus(user1.address, 1);
            
            expect(status1.totalReleased).to.equal(ethers.parseEther("5000")); // 10000 / 2 = 5000
            expect(status2.totalReleased).to.equal(ethers.parseEther("10000")); // 20000 / 2 = 10000
        });
        
        it("Should handle locks with disabled gradual release", async function () {
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 10;
            
            // Disabled gradual release config
            const disabledConfig = {
                duration: 0,
                interval: 0,
                enabled: false
            };
            
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](user1.address, ethers.parseEther("15000"), releaseTime, disabledConfig);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            // Should release entire amount immediately
            const status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.availableNow).to.equal(ethers.parseEther("15000"));
            
            await token.releaseSpecificLock(user1.address, 0);
            
            const lock = await token.getTimeLock(user1.address, 0);
            expect(lock.released).to.be.true;
        });
    });
    
    describe("Edge Cases", function () {
        it("Should handle single interval gradual release", async function () {
            const lockAmount = ethers.parseEther("12000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 10;
            
            // Single interval config
            const singleConfig = {
                duration: DAY,
                interval: DAY,
                enabled: true
            };
            
            await token.connect(owner)["createTimeLock(address,uint256,uint256,(uint256,uint256,bool))"](user1.address, lockAmount, releaseTime, singleConfig);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const status = await token.getGradualReleaseStatus(user1.address, 0);
            expect(status.availableNow).to.equal(lockAmount); // Should release all at once
        });
        
        it("Should prevent releasing non-existent locks", async function () {
            await expect(
                token.getGradualReleaseStatus(user1.address, 999)
            ).to.be.revertedWithCustomError(token, "LockNotFound");
            
            await expect(
                token.releaseSpecificLock(user1.address, 999)
            ).to.be.revertedWithCustomError(token, "LockNotFound");
        });
    });
    
    describe("Contract Version and Backward Compatibility", function () {
        it("Should report correct contract version", async function () {
            const version = await token.version();
            expect(version).to.equal("3.0.0");
        });
        
        it("Should maintain key V2 compatible functions", async function () {
            // Test that V2 compatible functions exist and work
            expect(await token.totalLockedAmount(user1.address)).to.equal(0);
            
            // Test getting available balance (this should work without throwing)
            const availableBalance = await token.getAvailableBalance(user1.address);
            expect(availableBalance).to.equal(ethers.parseEther("100000"));
        });
    });
});