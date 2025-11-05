const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0TokenV2 - Automatic Lock Release", function () {
    let token, owner, user1, user2;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        token = await upgrades.deployProxy(
            Avax0TokenV2,
            ["Avax0Token", "AVAX0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await token.waitForDeployment();
        
        // Setup test balance
        await token.transfer(user1.address, ethers.parseEther("100000"));
    });
    
    describe("Automatic Lock Release Functionality", function () {
        it("Should automatically release expired locks on transfer", async function () {
            const lockAmount = ethers.parseEther("30000");
            const transferAmount = ethers.parseEther("50000");
            
            // Create a lock that expires in 10 seconds
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Verify lock is active
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("70000"));
            
            // Should fail initially due to insufficient unlocked balance
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            // Now transfer should work and automatically release the expired lock
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
            expect(await token.totalLockedAmount(user1.address)).to.equal(0);
            
            const [, , released] = await token.getTimeLock(user1.address, 0);
            expect(released).to.be.true;
        });
        
        it("Should automatically release expired locks on transferFrom", async function () {
            const lockAmount = ethers.parseEther("30000");
            const transferAmount = ethers.parseEther("50000");
            
            // Create a lock that expires in 10 seconds
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Approve user2 to transfer
            await token.connect(user1).approve(user2.address, transferAmount);
            
            // Should fail initially due to insufficient unlocked balance
            await expect(
                token.connect(user2).transferFrom(user1.address, user2.address, transferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            // Now transferFrom should work and automatically release the expired lock
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            await expect(
                token.connect(user2).transferFrom(user1.address, user2.address, transferAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
        });
        
        it("Should automatically release expired locks on burn", async function () {
            const lockAmount = ethers.parseEther("30000");
            const burnAmount = ethers.parseEther("50000");
            
            // Create a lock that expires in 10 seconds
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Should fail initially due to insufficient unlocked balance
            await expect(
                token.connect(user1).burn(burnAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const initialSupply = await token.totalSupply();
            
            // Now burn should work and automatically release the expired lock
            await expect(
                token.connect(user1).burn(burnAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            // Verify burn succeeded
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
            
            // Verify lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
        });
        
        it("Should handle multiple expired locks automatically", async function () {
            const lock1Amount = ethers.parseEther("20000");
            const lock2Amount = ethers.parseEther("15000");
            const transferAmount = ethers.parseEther("50000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const release1Time = currentBlock.timestamp + 10;
            const release2Time = currentBlock.timestamp + 12;
            
            // Create two locks
            await token.createTimeLock(user1.address, lock1Amount, release1Time);
            await token.createTimeLock(user1.address, lock2Amount, release2Time);
            
            // Verify both locks are active
            expect(await token.getLockedAmount(user1.address)).to.equal(lock1Amount + lock2Amount);
            
            // Wait for both locks to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            // Transfer should automatically release both expired locks
            const tx = token.connect(user1).transfer(user2.address, transferAmount);
            
            await expect(tx).to.emit(token, "TokensUnlocked").withArgs(user1.address, lock1Amount, 0);
            await expect(tx).to.emit(token, "TokensUnlocked").withArgs(user1.address, lock2Amount, 1);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify both locks were released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
            expect(await token.totalLockedAmount(user1.address)).to.equal(0);
        });
        
        it("Should only release expired locks, not active ones", async function () {
            const expiredLockAmount = ethers.parseEther("20000");
            const activeLockAmount = ethers.parseEther("10000");
            const transferAmount = ethers.parseEther("20000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const expiredReleaseTime = currentBlock.timestamp + 10;
            const activeReleaseTime = currentBlock.timestamp + 3600; // 1 hour
            
            // Create one expired and one active lock
            await token.createTimeLock(user1.address, expiredLockAmount, expiredReleaseTime);
            await token.createTimeLock(user1.address, activeLockAmount, activeReleaseTime);
            
            // Wait only for first lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            // Transfer should only release expired lock
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, expiredLockAmount, 0);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify only expired lock was released, active lock remains
            expect(await token.getLockedAmount(user1.address)).to.equal(activeLockAmount);
            expect(await token.totalLockedAmount(user1.address)).to.equal(activeLockAmount);
            
            const [, , released1] = await token.getTimeLock(user1.address, 0);
            const [, , released2] = await token.getTimeLock(user1.address, 1);
            expect(released1).to.be.true;  // Expired lock released
            expect(released2).to.be.false; // Active lock not released
        });
        
        it("Should work with getAvailableBalanceWithAutoRelease function", async function () {
            const lockAmount = ethers.parseEther("30000");
            
            // Create a lock that expires in 10 seconds
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Initially available balance should be reduced by lock
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("70000"));
            expect(await token.getAvailableBalanceWithAutoRelease(user1.address)).to.equal(ethers.parseEther("70000"));
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            // getAvailableBalance (view function) should show reduced balance until auto-release
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("100000"));
            
            // getAvailableBalanceWithAutoRelease should automatically release and show full balance
            const tx = token.getAvailableBalanceWithAutoRelease(user1.address);
            await expect(tx).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            const result = await tx;
            expect(result).to.equal(ethers.parseEther("100000"));
            
            // After auto-release, available balance should be full
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("100000"));
        });
        
        it("Should not release locks that are not yet expired", async function () {
            const lockAmount = ethers.parseEther("30000");
            const transferAmount = ethers.parseEther("20000");
            
            // Create a lock that expires in 1 hour
            const currentBlock = await ethers.provider.getBlock('latest');
            const futureReleaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, futureReleaseTime);
            
            // Transfer within available balance should work without releasing the lock
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            await token.connect(user1).transfer(user2.address, transferAmount);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify lock is still active (not released)
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
            expect(await token.totalLockedAmount(user1.address)).to.equal(lockAmount);
            
            const [, , released] = await token.getTimeLock(user1.address, 0);
            expect(released).to.be.false;
        });
    });
});