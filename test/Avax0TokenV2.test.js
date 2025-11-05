const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0TokenV2 with Time Locks", function () {
    let token, owner, minter, user1, user2, user3;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
    const MAX_SUPPLY = ethers.parseEther("100000000"); // 100M tokens
    
    beforeEach(async function () {
        [owner, minter, user1, user2, user3] = await ethers.getSigners();
        
        // Deploy Avax0TokenV2 with time lock functionality
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        token = await upgrades.deployProxy(
            Avax0TokenV2,
            ["Avax0Token", "AVAX0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await token.waitForDeployment();
        
        // Setup test balances and minter
        await token.setMinter(minter.address, true);
        await token.transfer(user1.address, ethers.parseEther("50000"));
        await token.transfer(user2.address, ethers.parseEther("10000"));
    });
    
    describe("Basic Functionality", function () {
        it("Should deploy with correct initial values", async function () {
            expect(await token.name()).to.equal("Avax0Token");
            expect(await token.symbol()).to.equal("AVAX0");
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await token.owner()).to.equal(owner.address);
            expect(await token.version()).to.equal("2.0.0");
            expect(await token.decimals()).to.equal(18);
        });
        
        it("Should have correct MAX_SUPPLY", async function () {
            expect(await token.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
        });
        
        it("Should set owner as initial minter", async function () {
            expect(await token.minters(owner.address)).to.be.true;
            expect(await token.minters(minter.address)).to.be.true;
        });
    });
    
    describe("Minting Functionality", function () {
        it("Should allow minters to mint tokens", async function () {
            const mintAmount = ethers.parseEther("1000");
            const initialBalance = await token.balanceOf(user3.address);
            
            await token.connect(minter).mint(user3.address, mintAmount);
            
            expect(await token.balanceOf(user3.address)).to.equal(initialBalance + mintAmount);
            expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY + mintAmount);
        });
        
        it("Should not allow non-minters to mint", async function () {
            const mintAmount = ethers.parseEther("1000");
            
            await expect(
                token.connect(user1).mint(user3.address, mintAmount)
            ).to.be.revertedWith("Avax0: caller is not a minter");
        });
        
        it("Should not allow minting beyond MAX_SUPPLY", async function () {
            const tooMuchMint = MAX_SUPPLY;
            
            await expect(
                token.connect(minter).mint(user3.address, tooMuchMint)
            ).to.be.revertedWith("Avax0: minting would exceed max supply");
        });
        
        it("Should allow batch minting", async function () {
            const recipients = [user1.address, user2.address, user3.address];
            const amounts = [ethers.parseEther("100"), ethers.parseEther("200"), ethers.parseEther("300")];
            
            const initialBalances = await Promise.all(
                recipients.map(addr => token.balanceOf(addr))
            );
            
            await token.connect(minter).batchMint(recipients, amounts);
            
            for (let i = 0; i < recipients.length; i++) {
                expect(await token.balanceOf(recipients[i])).to.equal(initialBalances[i] + amounts[i]);
            }
        });
        
        it("Should mint with time lock", async function () {
            const mintAmount = ethers.parseEther("1000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600; // 1 hour
            
            const initialBalance = await token.balanceOf(user3.address);
            
            await expect(
                token.connect(minter).mintWithLock(user3.address, mintAmount, releaseTime)
            ).to.emit(token, "TokensLocked")
             .withArgs(user3.address, mintAmount, releaseTime, 0);
            
            expect(await token.balanceOf(user3.address)).to.equal(initialBalance + mintAmount);
            expect(await token.getLockedAmount(user3.address)).to.equal(mintAmount);
            expect(await token.getAvailableBalance(user3.address)).to.equal(initialBalance);
        });
    });
    
    describe("Time Lock Functionality", function () {
        let lockAmount, releaseTime;
        
        beforeEach(async function () {
            lockAmount = ethers.parseEther("20000");
            const currentBlock = await ethers.provider.getBlock('latest');
            releaseTime = currentBlock.timestamp + 3600;
        });
        
        it("Should create time lock successfully", async function () {
            await expect(
                token.createTimeLock(user1.address, lockAmount, releaseTime)
            ).to.emit(token, "TokensLocked")
             .withArgs(user1.address, lockAmount, releaseTime, 0);
            
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
            expect(await token.totalLockedAmount(user1.address)).to.equal(lockAmount);
        });
        
        it("Should not allow creating lock with zero amount", async function () {
            await expect(
                token.createTimeLock(user1.address, 0, releaseTime)
            ).to.be.revertedWithCustomError(token, "InvalidLockAmount");
        });
        
        it("Should not allow creating lock with past release time", async function () {
            const pastTime = releaseTime - 7200; // 2 hours ago
            
            await expect(
                token.createTimeLock(user1.address, lockAmount, pastTime)
            ).to.be.revertedWithCustomError(token, "InvalidReleaseTime");
        });
        
        it("Should not allow creating lock exceeding available balance", async function () {
            const tooMuchLock = ethers.parseEther("60000"); // More than user1's balance
            
            await expect(
                token.createTimeLock(user1.address, tooMuchLock, releaseTime)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should allow multiple locks per address", async function () {
            const lock1Amount = ethers.parseEther("10000");
            const lock2Amount = ethers.parseEther("15000");
            const release1Time = releaseTime;
            const release2Time = releaseTime + 3600;
            
            await token.createTimeLock(user1.address, lock1Amount, release1Time);
            await token.createTimeLock(user1.address, lock2Amount, release2Time);
            
            expect(await token.getTimeLockCount(user1.address)).to.equal(2);
            expect(await token.getLockedAmount(user1.address)).to.equal(lock1Amount + lock2Amount);
            
            const [amount1, release1, released1] = await token.getTimeLock(user1.address, 0);
            const [amount2, release2, released2] = await token.getTimeLock(user1.address, 1);
            
            expect(amount1).to.equal(lock1Amount);
            expect(release1).to.equal(release1Time);
            expect(released1).to.be.false;
            
            expect(amount2).to.equal(lock2Amount);
            expect(release2).to.equal(release2Time);
            expect(released2).to.be.false;
        });
        
        it("Should extend lock release time", async function () {
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            const newReleaseTime = releaseTime + 3600; // 1 hour later
            
            await expect(
                token.extendLock(user1.address, 0, newReleaseTime)
            ).to.emit(token, "LockExtended")
             .withArgs(user1.address, 0, newReleaseTime);
            
            const [, updatedReleaseTime,] = await token.getTimeLock(user1.address, 0);
            expect(updatedReleaseTime).to.equal(newReleaseTime);
        });
        
        it("Should release expired locks", async function () {
            // Create a lock that expires soon
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Verify lock is initially active
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            const lockedAmountAfterExpiry = await token.getLockedAmount(user1.address);
            expect(lockedAmountAfterExpiry).to.equal(0); // Should be 0 since lock expired
            
            await expect(
                token.releaseExpiredLocks(user1.address)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
            
            expect(await token.totalLockedAmount(user1.address)).to.equal(0);
            
            const [, , released] = await token.getTimeLock(user1.address, 0);
            expect(released).to.be.true;
        });
        
        it("Should release specific lock when expired", async function () {
            // Create a lock that expires soon
            const currentBlock = await ethers.provider.getBlock('latest');
            const shortReleaseTime = currentBlock.timestamp + 10;
            await token.createTimeLock(user1.address, lockAmount, shortReleaseTime);
            
            // Wait for lock to expire
            await ethers.provider.send("evm_increaseTime", [15]);
            await ethers.provider.send("evm_mine");
            
            await expect(
                token.releaseSpecificLock(user1.address, 0)
            ).to.emit(token, "TokensUnlocked")
             .withArgs(user1.address, lockAmount, 0);
        });
    });
    
    describe("Transfer Restrictions with Time Locks", function () {
        beforeEach(async function () {
            const lockAmount = ethers.parseEther("20000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
        });
        
        it("Should prevent transfer of locked tokens", async function () {
            const transferAmount = ethers.parseEther("40000"); // More than available
            
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should allow transfer of unlocked tokens", async function () {
            const transferAmount = ethers.parseEther("10000"); // Less than available
            const initialUser2Balance = await token.balanceOf(user2.address);
            
            await token.connect(user1).transfer(user2.address, transferAmount);
            
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
        });
        
        it("Should prevent transferFrom of locked tokens", async function () {
            // Approve first
            await token.connect(user1).approve(user2.address, ethers.parseEther("40000"));
            
            const transferAmount = ethers.parseEther("40000"); // More than available
            
            await expect(
                token.connect(user2).transferFrom(user1.address, user3.address, transferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should prevent burning locked tokens", async function () {
            const burnAmount = ethers.parseEther("40000"); // More than available
            
            await expect(
                token.connect(user1).burn(burnAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
        });
        
        it("Should allow burning unlocked tokens", async function () {
            const burnAmount = ethers.parseEther("10000"); // Less than available
            const initialSupply = await token.totalSupply();
            
            await token.connect(user1).burn(burnAmount);
            
            expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
        });
    });
    
    describe("Administrative Functions", function () {
        it("Should allow owner to set minter status", async function () {
            await expect(
                token.setMinter(user3.address, true)
            ).to.emit(token, "MinterUpdated")
             .withArgs(user3.address, true);
            
            expect(await token.minters(user3.address)).to.be.true;
            
            // Test minting with new minter
            await token.connect(user3).mint(user1.address, ethers.parseEther("100"));
        });
        
        it("Should allow owner to pause/unpause", async function () {
            await token.pause();
            
            await expect(
                token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(token, "EnforcedPause");
            
            await token.unpause();
            
            await expect(
                token.connect(user1).transfer(user2.address, ethers.parseEther("100"))
            ).to.not.be.reverted;
        });
        
        it("Should allow emergency token recovery", async function () {
            // Deploy a mock ERC20 token to simulate accidental transfer
            const MockToken = await ethers.getContractFactory("MockERC20");
            const mockToken = await MockToken.deploy("Mock", "MOCK", 18);
            await mockToken.waitForDeployment();
            
            // Mint some tokens to owner first
            await mockToken.mint(owner.address, ethers.parseEther("1000"));
            
            // Send mock tokens to the contract
            await mockToken.transfer(await token.getAddress(), ethers.parseEther("100"));
            
            const initialOwnerBalance = await mockToken.balanceOf(owner.address);
            
            // Recover the tokens
            await token.recoverToken(await mockToken.getAddress(), ethers.parseEther("100"));
            
            expect(await mockToken.balanceOf(owner.address)).to.equal(initialOwnerBalance + ethers.parseEther("100"));
        });
        
        it("Should not allow recovering own tokens", async function () {
            await expect(
                token.recoverToken(await token.getAddress(), ethers.parseEther("100"))
            ).to.be.revertedWith("Avax0: cannot recover own tokens");
        });
    });
    
    describe("View Functions", function () {
        beforeEach(async function () {
            const lockAmount1 = ethers.parseEther("10000");
            const lockAmount2 = ethers.parseEther("15000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime1 = currentBlock.timestamp + 3600;
            const releaseTime2 = currentBlock.timestamp + 7200;
            
            await token.createTimeLock(user1.address, lockAmount1, releaseTime1);
            await token.createTimeLock(user1.address, lockAmount2, releaseTime2);
        });
        
        it("Should return correct available balance", async function () {
            const totalBalance = await token.balanceOf(user1.address);
            const lockedAmount = await token.getLockedAmount(user1.address);
            const availableBalance = await token.getAvailableBalance(user1.address);
            
            expect(availableBalance).to.equal(totalBalance - lockedAmount);
        });
        
        it("Should return all time locks for an address", async function () {
            const timeLocks = await token.getTimeLocks(user1.address);
            
            expect(timeLocks.length).to.equal(2);
            expect(timeLocks[0].amount).to.equal(ethers.parseEther("10000"));
            expect(timeLocks[1].amount).to.equal(ethers.parseEther("15000"));
        });
        
        it("Should return correct time lock count", async function () {
            expect(await token.getTimeLockCount(user1.address)).to.equal(2);
        });
        
        it("Should handle non-existent lock queries", async function () {
            await expect(
                token.getTimeLock(user1.address, 5)
            ).to.be.revertedWithCustomError(token, "LockNotFound");
        });
    });
    
    describe("Upgrade Safety", function () {
        it("Should preserve state during upgrade simulation", async function () {
            // This test simulates upgrading from a theoretical V1 contract
            // Create some state first
            const lockAmount = ethers.parseEther("10000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Capture current state
            const preUpgradeState = {
                totalSupply: await token.totalSupply(),
                user1Balance: await token.balanceOf(user1.address),
                lockedAmount: await token.getLockedAmount(user1.address),
                lockCount: await token.getTimeLockCount(user1.address),
                owner: await token.owner(),
                version: await token.version()
            };
            
            // Simulate upgrade by redeploying with same proxy
            const Avax0TokenV2New = await ethers.getContractFactory("Avax0TokenV2");
            const upgradedToken = await upgrades.upgradeProxy(
                await token.getAddress(),
                Avax0TokenV2New
            );
            
            // Verify state preservation
            expect(await upgradedToken.totalSupply()).to.equal(preUpgradeState.totalSupply);
            expect(await upgradedToken.balanceOf(user1.address)).to.equal(preUpgradeState.user1Balance);
            expect(await upgradedToken.getLockedAmount(user1.address)).to.equal(preUpgradeState.lockedAmount);
            expect(await upgradedToken.getTimeLockCount(user1.address)).to.equal(preUpgradeState.lockCount);
            expect(await upgradedToken.owner()).to.equal(preUpgradeState.owner);
            expect(await upgradedToken.version()).to.equal(preUpgradeState.version);
        });
    });
});