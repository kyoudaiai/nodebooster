const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("ModifyLock Functionality", function () {
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
            ["Test Token", "TEST", ethers.parseEther("1000000")],
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
        
        // Initialize V3
        await token.initializeV3(30 * 24 * 60 * 60, 24 * 60 * 60);
        
        // Mint tokens to test address
        await token.mint(addr1.address, ethers.parseEther("1000"));
    });
    
    describe("Modify Lock Functions", function () {
        let lockIndex;
        const initialAmount = ethers.parseEther("100");
        let releaseTime;
        
        beforeEach(async function () {
            // Create a time lock first
            releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            await token.createTimeLock(addr1.address, initialAmount, releaseTime);
            lockIndex = 0;
        });
        
        it("Should modify lock amount successfully", async function () {
            const newAmount = ethers.parseEther("150");
            
            // Get the default config to check event
            const defaultConfig = await token.defaultGradualReleaseConfig();
            
            await expect(token.modifyLockAmount(addr1.address, lockIndex, newAmount))
                .to.emit(token, "LockModified");
            
            const locks = await token.getTimeLocks(addr1.address);
            expect(locks[0].amount).to.equal(newAmount);
        });
        
        it("Should modify lock release time successfully", async function () {
            const newReleaseTime = Math.floor(Date.now() / 1000) + 7200; // 2 hours
            
            await expect(token.modifyLockReleaseTime(addr1.address, lockIndex, newReleaseTime))
                .to.emit(token, "LockModified");
            
            const locks = await token.getTimeLocks(addr1.address);
            expect(locks[0].releaseTime).to.equal(newReleaseTime);
        });
        
        it("Should modify gradual release config successfully", async function () {
            const newConfig = {
                duration: 7 * 24 * 60 * 60,
                interval: 24 * 60 * 60,
                enabled: true
            };
            
            await token.modifyLockGradualConfig(addr1.address, lockIndex, newConfig);
            
            const [lock, config] = await token.getTimeLockV3(addr1.address, lockIndex);
            expect(config.duration).to.equal(newConfig.duration);
            expect(config.interval).to.equal(newConfig.interval);
            expect(config.enabled).to.equal(newConfig.enabled);
        });
        
        it("Should perform full modification successfully", async function () {
            const newAmount = ethers.parseEther("200");
            const newReleaseTime = Math.floor(Date.now() / 1000) + 10800;
            const newConfig = {
                duration: 14 * 24 * 60 * 60,
                interval: 12 * 60 * 60,
                enabled: true
            };
            
            await token.modifyLock(
                addr1.address, 
                lockIndex, 
                newAmount, 
                newReleaseTime, 
                newConfig, 
                true
            );
            
            const [lock, config] = await token.getTimeLockV3(addr1.address, lockIndex);
            expect(lock.amount).to.equal(newAmount);
            expect(lock.releaseTime).to.equal(newReleaseTime);
            expect(config.duration).to.equal(newConfig.duration);
            expect(config.interval).to.equal(newConfig.interval);
            expect(config.enabled).to.equal(newConfig.enabled);
        });
        
        it("Should reject invalid modifications", async function () {
            // Try to modify non-existent lock
            await expect(
                token.modifyLockAmount(addr1.address, 999, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(token, "LockNotFound");
            
            // Try to set release time in the past
            const pastTime = Math.floor(Date.now() / 1000) - 3600;
            await expect(
                token.modifyLockReleaseTime(addr1.address, lockIndex, pastTime)
            ).to.be.revertedWithCustomError(token, "InvalidReleaseTime");
        });
        
        it("Should only allow owner to modify locks", async function () {
            const newAmount = ethers.parseEther("150");
            
            await expect(
                token.connect(addr2).modifyLockAmount(addr1.address, lockIndex, newAmount)
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });
});