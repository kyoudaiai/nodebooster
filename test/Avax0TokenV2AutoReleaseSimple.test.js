const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0TokenV2 - Automatic Lock Release (Simplified)", function () {
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
    
    describe("Automatic Lock Release on Operations", function () {
        it("Should release expired locks when transferring", async function () {
            const lockAmount = ethers.parseEther("20000");
            const transferAmount = ethers.parseEther("50000");
            
            // Create a lock that expires in a few seconds
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 5;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Verify lock is active initially
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            // Transfer should automatically release the expired lock
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
        });
        
        it("Should only release expired locks, keeping active ones", async function () {
            const expiredLockAmount = ethers.parseEther("15000");
            const activeLockAmount = ethers.parseEther("10000");
            const transferAmount = ethers.parseEther("20000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const expiredReleaseTime = currentBlock.timestamp + 5;
            const activeReleaseTime = currentBlock.timestamp + 3600; // 1 hour
            
            // Create two locks - one that will expire soon, one active
            await token.createTimeLock(user1.address, expiredLockAmount, expiredReleaseTime);
            await token.createTimeLock(user1.address, activeLockAmount, activeReleaseTime);
            
            // Wait for first lock to expire
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            // Transfer should only release the expired lock
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, expiredLockAmount, 0);
            
            // Verify transfer succeeded
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            
            // Verify only expired lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(activeLockAmount);
            
            const [, , released1] = await token.getTimeLock(user1.address, 0);
            const [, , released2] = await token.getTimeLock(user1.address, 1);
            expect(released1).to.be.true;  // Expired lock should be released
            expect(released2).to.be.false; // Active lock should remain
        });
        
        it("Should work with manual release function", async function () {
            const lockAmount = ethers.parseEther("20000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 5;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");
            
            // Manual release should work
            await expect(
                token.releaseExpiredLocks(user1.address)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
        });
        
        it("Should show correct available balance with auto-release function", async function () {
            const lockAmount = ethers.parseEther("20000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 5;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Initially should show reduced balance
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("80000"));
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");
            
            // Auto-release function should release lock and return full balance
            await token.getAvailableBalanceWithAutoRelease(user1.address);
            const availableWithAutoRelease = await token.getAvailableBalance(user1.address);
            expect(availableWithAutoRelease).to.equal(ethers.parseEther("100000"));
            
            // Now regular available balance should also show full amount
            expect(await token.getAvailableBalance(user1.address)).to.equal(ethers.parseEther("100000"));
        });
        
        it("Should not affect transfers when no locks exist", async function () {
            const transferAmount = ethers.parseEther("30000");
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            // Transfer without any locks should work normally
            await token.connect(user1).transfer(user2.address, transferAmount);
            
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
        });
        
        it("Should work correctly with burn operation", async function () {
            const lockAmount = ethers.parseEther("20000");
            const burnAmount = ethers.parseEther("30000");
            
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 5;
            
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");
            
            const initialSupply = await token.totalSupply();
            
            // Burn should automatically release the expired lock
            await expect(
                token.connect(user1).burn(burnAmount)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            // Verify burn succeeded
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
            
            // Verify lock was released
            expect(await token.getLockedAmount(user1.address)).to.equal(0);
        });
    });
});