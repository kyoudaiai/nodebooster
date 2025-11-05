const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Node0TokenV2", function () {
    let token;
    let owner;
    let user1;
    let user2;
    let user3;
    let minter;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
    const MAX_SUPPLY = ethers.parseEther("100000000"); // 100M tokens
    
    beforeEach(async function () {
        [owner, user1, user2, user3, minter] = await ethers.getSigners();
        
        const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
        const proxy = await upgrades.deployProxy(
            Node0TokenV2,
            ["Node0Token", "NODE0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await proxy.waitForDeployment();
        
        token = await ethers.getContractAt("Node0TokenV2", await proxy.getAddress());
        
        // Set up additional minter
        await token.setMinter(minter.address, true);
    });
    
    describe("Deployment and Basic Functionality", function () {
        it("Should deploy with correct parameters", async function () {
            expect(await token.name()).to.equal("Node0Token");
            expect(await token.symbol()).to.equal("NODE0");
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
            expect(await token.version()).to.equal("2.0.0");
        });
        
        it("Should have correct MAX_SUPPLY", async function () {
            expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
        });
        
        it("Should set owner as initial minter", async function () {
            expect(await token.minters(owner.address)).to.be.true;
        });
    });
    
    describe("Time Lock Functionality", function () {
        it("Should create time lock correctly", async function () {
            // First transfer tokens to user1
            await token.transfer(user1.address, ethers.parseEther("5000"));
            
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600; // 1 hour from now
            
            await expect(token.createTimeLock(user1.address, lockAmount, releaseTime))
                .to.emit(token, "TokensLocked")
                .withArgs(user1.address, lockAmount, releaseTime, 0);
            
            const lockCount = await token.getTimeLockCount(user1.address);
            expect(lockCount).to.equal(1);
            
            const [amount, releaseTimeReturned, released] = await token.getTimeLock(user1.address, 0);
            expect(amount).to.equal(lockAmount);
            expect(releaseTimeReturned).to.equal(releaseTime);
            expect(released).to.be.false;
        });
        
        it("Should not allow creating lock with zero amount", async function () {
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.createTimeLock(user1.address, 0, releaseTime))
                .to.be.revertedWithCustomError(token, "InvalidLockAmount");
        });
        
        it("Should not allow creating lock with past release time", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const pastTime = currentBlock.timestamp - 3600; // 1 hour ago
            
            await expect(token.createTimeLock(user1.address, lockAmount, pastTime))
                .to.be.revertedWithCustomError(token, "InvalidReleaseTime");
        });
        
        it("Should not allow creating lock for zero address", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.createTimeLock(ethers.ZeroAddress, lockAmount, releaseTime))
                .to.be.revertedWithCustomError(token, "ZeroAddress");
        });
        
        it("Should not allow non-owner to create time lock", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.connect(user1).createTimeLock(user1.address, lockAmount, releaseTime))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
        
        it("Should not allow creating lock for more than available balance", async function () {
            // First transfer some tokens to user1
            await token.transfer(user1.address, ethers.parseEther("500"));
            
            const lockAmount = ethers.parseEther("1000"); // More than user1's balance
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.createTimeLock(user1.address, lockAmount, releaseTime))
                .to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
    });
    
    describe("Multiple Time Locks", function () {
        beforeEach(async function () {
            // Transfer tokens to user1 for testing
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should create multiple time locks for same address", async function () {
            const lockAmount1 = ethers.parseEther("1000");
            const lockAmount2 = ethers.parseEther("500");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 3600;
            const releaseTime2 = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
            
            const lockCount = await token.getTimeLockCount(user1.address);
            expect(lockCount).to.equal(2);
            
            const [amount1, , ] = await token.getTimeLock(user1.address, 0);
            const [amount2, , ] = await token.getTimeLock(user1.address, 1);
            
            expect(amount1).to.equal(lockAmount1);
            expect(amount2).to.equal(lockAmount2);
        });
        
        it("Should correctly calculate locked amount with multiple locks", async function () {
            const lockAmount1 = ethers.parseEther("1000");
            const lockAmount2 = ethers.parseEther("500");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 3600;
            const releaseTime2 = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
            
            const lockedAmount = await token.getLockedAmount(user1.address);
            expect(lockedAmount).to.equal(lockAmount1 + lockAmount2);
        });
        
        it("Should correctly calculate available balance with multiple locks", async function () {
            const user1Balance = await token.balanceOf(user1.address);
            const lockAmount1 = ethers.parseEther("1000");
            const lockAmount2 = ethers.parseEther("500");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 3600;
            const releaseTime2 = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
            
            const availableBalance = await token.getAvailableBalance(user1.address);
            const expectedAvailable = user1Balance - lockAmount1 - lockAmount2;
            expect(availableBalance).to.equal(expectedAvailable);
        });
    });
    
    describe("Lock Release Functionality", function () {
        beforeEach(async function () {
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should release expired locks", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 100; // 100 seconds from now
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            
            await expect(token.releaseExpiredLocks(user1.address))
                .to.emit(token, "TokensUnlocked")
                .withArgs(user1.address, lockAmount, 0);
            
            const [, , released] = await token.getTimeLock(user1.address, 0);
            expect(released).to.be.true;
            
            const lockedAmount = await token.getLockedAmount(user1.address);
            expect(lockedAmount).to.equal(0);
        });
        
        it("Should release specific lock when expired", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 100;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            
            await expect(token.releaseSpecificLock(user1.address, 0))
                .to.emit(token, "TokensUnlocked")
                .withArgs(user1.address, lockAmount, 0);
        });
        
        it("Should not release non-expired lock", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600; // 1 hour from now
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            await expect(token.releaseSpecificLock(user1.address, 0))
                .to.be.revertedWith("Node0: lock not yet expired");
        });
        
        it("Should not release already released lock", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 100;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Wait for lock to expire and release it
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            
            await token.releaseSpecificLock(user1.address, 0);
            
            await expect(token.releaseSpecificLock(user1.address, 0))
                .to.be.revertedWith("Node0: lock already released");
        });
        
        it("Should not release non-existent lock", async function () {
            await expect(token.releaseSpecificLock(user1.address, 0))
                .to.be.revertedWithCustomError(token, "LockNotFound");
        });
    });
    
    describe("Lock Extension Functionality", function () {
        beforeEach(async function () {
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should extend lock release time", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const originalReleaseTime = currentBlock.timestamp + 3600;
            const newReleaseTime = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount, originalReleaseTime);
            
            await expect(token.extendLock(user1.address, 0, newReleaseTime))
                .to.emit(token, "LockExtended")
                .withArgs(user1.address, 0, newReleaseTime);
            
            const [, releaseTime, ] = await token.getTimeLock(user1.address, 0);
            expect(releaseTime).to.equal(newReleaseTime);
        });
        
        it("Should not allow non-owner to extend lock", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const originalReleaseTime = currentBlock.timestamp + 3600;
            const newReleaseTime = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount, originalReleaseTime);
            
            await expect(token.connect(user1).extendLock(user1.address, 0, newReleaseTime))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
        
        it("Should not extend lock with past time", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const originalReleaseTime = currentBlock.timestamp + 3600;
            const pastTime = currentBlock.timestamp - 3600;
            
            await token.createTimeLock(user1.address, lockAmount, originalReleaseTime);
            
            await expect(token.extendLock(user1.address, 0, pastTime))
                .to.be.revertedWithCustomError(token, "InvalidReleaseTime");
        });
        
        it("Should not extend lock with earlier time than current", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const originalReleaseTime = currentBlock.timestamp + 7200;
            const earlierTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, originalReleaseTime);
            
            await expect(token.extendLock(user1.address, 0, earlierTime))
                .to.be.revertedWith("Node0: new release time must be later");
        });
        
        it("Should not extend released lock", async function () {
            const lockAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const originalReleaseTime = currentBlock.timestamp + 100;
            const newReleaseTime = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount, originalReleaseTime);
            
            // Wait and release lock
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            await token.releaseSpecificLock(user1.address, 0);
            
            await expect(token.extendLock(user1.address, 0, newReleaseTime))
                .to.be.revertedWith("Node0: cannot extend released lock");
        });
    });
    
    describe("Transfer Restrictions", function () {
        beforeEach(async function () {
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should allow transfer of unlocked tokens", async function () {
            const transferAmount = ethers.parseEther("1000");
            
            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.not.be.reverted;
            
            expect(await token.balanceOf(user2.address)).to.equal(transferAmount);
        });
        
        it("Should prevent transfer of locked tokens", async function () {
            const lockAmount = ethers.parseEther("3000");
            const transferAmount = ethers.parseEther("4000"); // More than available
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should allow transfer after lock expires", async function () {
            const lockAmount = ethers.parseEther("3000");
            const transferAmount = ethers.parseEther("4000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 100;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            
            // Release the lock
            await token.releaseExpiredLocks(user1.address);
            
            await expect(token.connect(user1).transfer(user2.address, transferAmount))
                .to.not.be.reverted;
        });
        
        it("Should prevent transferFrom of locked tokens", async function () {
            const lockAmount = ethers.parseEther("3000");
            const transferAmount = ethers.parseEther("4000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            // Approve user2 to spend user1's tokens
            await token.connect(user1).approve(user2.address, transferAmount);
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            await expect(token.connect(user2).transferFrom(user1.address, user3.address, transferAmount))
                .to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
    });
    
    describe("Burn Restrictions", function () {
        beforeEach(async function () {
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should allow burning unlocked tokens", async function () {
            const burnAmount = ethers.parseEther("1000");
            const initialSupply = await token.totalSupply();
            
            await expect(token.connect(user1).burn(burnAmount))
                .to.not.be.reverted;
            
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
        });
        
        it("Should prevent burning locked tokens", async function () {
            const lockAmount = ethers.parseEther("3000");
            const burnAmount = ethers.parseEther("4000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            await expect(token.connect(user1).burn(burnAmount))
                .to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should prevent burnFrom of locked tokens", async function () {
            const lockAmount = ethers.parseEther("3000");
            const burnAmount = ethers.parseEther("4000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            // Approve user2 to burn user1's tokens
            await token.connect(user1).approve(user2.address, burnAmount);
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            await expect(token.connect(user2).burnFrom(user1.address, burnAmount))
                .to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
    });
    
    describe("Mint with Lock", function () {
        it("Should mint tokens with time lock", async function () {
            const mintAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            const initialBalance = await token.balanceOf(user1.address);
            
            await expect(token.connect(minter).mintWithLock(user1.address, mintAmount, releaseTime))
                .to.emit(token, "TokensLocked")
                .withArgs(user1.address, mintAmount, releaseTime, 0);
            
            expect(await token.balanceOf(user1.address)).to.equal(initialBalance + mintAmount);
            expect(await token.getLockedAmount(user1.address)).to.equal(mintAmount);
        });
        
        it("Should not allow non-minter to mint with lock", async function () {
            const mintAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.connect(user1).mintWithLock(user1.address, mintAmount, releaseTime))
                .to.be.revertedWith("Node0: caller is not a minter");
        });
        
        it("Should not mint with lock for past release time", async function () {
            const mintAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const pastTime = currentBlock.timestamp - 3600;
            
            await expect(token.connect(minter).mintWithLock(user1.address, mintAmount, pastTime))
                .to.be.revertedWith("Node0: release time must be in future");
        });
        
        it("Should not mint with lock for zero amount", async function () {
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await expect(token.connect(minter).mintWithLock(user1.address, 0, releaseTime))
                .to.be.revertedWith("Node0: amount must be greater than zero");
        });
    });
    
    describe("View Functions", function () {
        beforeEach(async function () {
            await token.transfer(user1.address, ethers.parseEther("5000"));
        });
        
        it("Should return correct time locks array", async function () {
            const lockAmount1 = ethers.parseEther("1000");
            const lockAmount2 = ethers.parseEther("500");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 3600;
            const releaseTime2 = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
            
            const locks = await token.getTimeLocks(user1.address);
            expect(locks.length).to.equal(2);
            expect(locks[0].amount).to.equal(lockAmount1);
            expect(locks[0].releaseTime).to.equal(releaseTime1);
            expect(locks[1].amount).to.equal(lockAmount2);
            expect(locks[1].releaseTime).to.equal(releaseTime2);
        });
        
        it("Should return correct locked amount excluding expired locks", async function () {
            const lockAmount1 = ethers.parseEther("1000");
            const lockAmount2 = ethers.parseEther("500");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 100; // Expires soon
            const releaseTime2 = currentBlock.timestamp + 7200; // Future
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
            
            // Before first lock expires
            let lockedAmount = await token.getLockedAmount(user1.address);
            expect(lockedAmount).to.equal(lockAmount1 + lockAmount2);
            
            // After first lock expires
            await ethers.provider.send("evm_increaseTime", [101]);
            await ethers.provider.send("evm_mine");
            
            lockedAmount = await token.getLockedAmount(user1.address);
            expect(lockedAmount).to.equal(lockAmount2); // Only second lock remains
        });
        
        it("Should return zero for getTimeLock on non-existent lock", async function () {
            await expect(token.getTimeLock(user1.address, 0))
                .to.be.revertedWithCustomError(token, "LockNotFound");
        });
    });
    
    describe("Standard ERC20 Functionality", function () {
        it("Should handle minting within max supply", async function () {
            const mintAmount = ethers.parseEther("1000");
            const initialSupply = await token.totalSupply();
            
            await expect(token.connect(minter).mint(user1.address, mintAmount))
                .to.not.be.reverted;
            
            expect(await token.totalSupply()).to.equal(initialSupply + mintAmount);
            expect(await token.balanceOf(user1.address)).to.equal(mintAmount);
        });
        
        it("Should prevent minting beyond max supply", async function () {
            const remainingSupply = MAX_SUPPLY - await token.totalSupply();
            const excessAmount = remainingSupply + ethers.parseEther("1");
            
            await expect(token.connect(minter).mint(user1.address, excessAmount))
                .to.be.revertedWith("Node0: minting would exceed max supply");
        });
        
        it("Should allow setting and removing minters", async function () {
            expect(await token.minters(user1.address)).to.be.false;
            
            await expect(token.setMinter(user1.address, true))
                .to.emit(token, "MinterUpdated")
                .withArgs(user1.address, true);
            
            expect(await token.minters(user1.address)).to.be.true;
            
            await token.setMinter(user1.address, false);
            expect(await token.minters(user1.address)).to.be.false;
        });
        
        it("Should handle pause and unpause correctly", async function () {
            await token.pause();
            expect(await token.paused()).to.be.true;
            
            await expect(token.connect(minter).mint(user1.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(token, "EnforcedPause");
            
            await token.unpause();
            expect(await token.paused()).to.be.false;
            
            await expect(token.connect(minter).mint(user1.address, ethers.parseEther("100")))
                .to.not.be.reverted;
        });
    });
});