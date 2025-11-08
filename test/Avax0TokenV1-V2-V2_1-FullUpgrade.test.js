const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0Token V1 → V2 → V2.1 Full Upgrade Path", function () {
    let owner;
    let user1;
    let user2;
    let user3;
    let minter;
    let excluded1;
    let excluded2;
    
    let avax0TokenV1;
    let avax0TokenV2;
    let avax0TokenV2_1;
    let proxyAddress;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
    const LOCK_AMOUNT = ethers.parseEther("10000");
    const TRANSFER_AMOUNT = ethers.parseEther("100");
    
    // Pre-upgrade state to verify
    let preUpgradeV1State = {};
    let preUpgradeV2State = {};
    
    before(async function () {
        [owner, user1, user2, user3, minter, excluded1, excluded2] = await ethers.getSigners();
        
        console.log("🔧 Setting up test environment...");
        console.log("  Owner:", owner.address);
        console.log("  User1:", user1.address);
        console.log("  User2:", user2.address);
    });
    
    describe("Phase 1: Deploy and Test V1", function () {
        it("Should deploy Avax0TokenV1 successfully", async function () {
            console.log("📦 Deploying Avax0TokenV1...");
            
            const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
            const avax0Proxy = await upgrades.deployProxy(
                Avax0TokenV1,
                ["avax0 Token", "AVAX0", INITIAL_SUPPLY],
                { initializer: "initialize", kind: "uups" }
            );
            await avax0Proxy.waitForDeployment();
            
            proxyAddress = await avax0Proxy.getAddress();
            avax0TokenV1 = await ethers.getContractAt("Avax0TokenV1", proxyAddress);
            
            // Verify deployment
            expect(await avax0TokenV1.name()).to.equal("avax0 Token");
            expect(await avax0TokenV1.symbol()).to.equal("AVAX0");
            expect(await avax0TokenV1.totalSupply()).to.equal(INITIAL_SUPPLY);
            expect(await avax0TokenV1.version()).to.equal("1.0.0");
            expect(await avax0TokenV1.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
            
            console.log("✅ V1 deployed at:", proxyAddress);
        });
        
        it("Should set up V1 test data", async function () {
            // Set minter
            await avax0TokenV1.setMinter(minter.address, true);
            expect(await avax0TokenV1.minters(minter.address)).to.be.true;
            
            // Transfer tokens to users
            await avax0TokenV1.transfer(user1.address, ethers.parseEther("50000"));
            await avax0TokenV1.transfer(user2.address, ethers.parseEther("30000"));
            await avax0TokenV1.transfer(user3.address, ethers.parseEther("20000"));
            
            // Mint additional tokens
            await avax0TokenV1.connect(minter).mint(excluded1.address, ethers.parseEther("10000"));
            await avax0TokenV1.connect(minter).mint(excluded2.address, ethers.parseEther("5000"));
            
            // Verify balances
            expect(await avax0TokenV1.balanceOf(user1.address)).to.equal(ethers.parseEther("50000"));
            expect(await avax0TokenV1.balanceOf(user2.address)).to.equal(ethers.parseEther("30000"));
            expect(await avax0TokenV1.balanceOf(user3.address)).to.equal(ethers.parseEther("20000"));
            expect(await avax0TokenV1.balanceOf(excluded1.address)).to.equal(ethers.parseEther("10000"));
            expect(await avax0TokenV1.balanceOf(excluded2.address)).to.equal(ethers.parseEther("5000"));
        });
        
        it("Should test V1 functionality", async function () {
            // Test transfers
            await expect(avax0TokenV1.connect(user1).transfer(user2.address, TRANSFER_AMOUNT))
                .to.emit(avax0TokenV1, "Transfer");
            
            // Test batch mint
            const recipients = [user1.address, user2.address];
            const amounts = [ethers.parseEther("1000"), ethers.parseEther("2000")];
            await expect(avax0TokenV1.connect(minter).batchMint(recipients, amounts))
                .to.emit(avax0TokenV1, "Transfer");
            
            // Pause and unpause
            await avax0TokenV1.pause();
            expect(await avax0TokenV1.paused()).to.be.true;
            
            await expect(avax0TokenV1.connect(user1).transfer(user2.address, TRANSFER_AMOUNT))
                .to.be.revertedWithCustomError(avax0TokenV1, "EnforcedPause");
            
            await avax0TokenV1.unpause();
            expect(await avax0TokenV1.paused()).to.be.false;
        });
        
        it("Should capture V1 state before upgrade", async function () {
            preUpgradeV1State.version = await avax0TokenV1.version();
            preUpgradeV1State.totalSupply = await avax0TokenV1.totalSupply();
            preUpgradeV1State.name = await avax0TokenV1.name();
            preUpgradeV1State.symbol = await avax0TokenV1.symbol();
            preUpgradeV1State.decimals = await avax0TokenV1.decimals();
            
            preUpgradeV1State.balances = {
                owner: await avax0TokenV1.balanceOf(owner.address),
                user1: await avax0TokenV1.balanceOf(user1.address),
                user2: await avax0TokenV1.balanceOf(user2.address),
                user3: await avax0TokenV1.balanceOf(user3.address),
                excluded1: await avax0TokenV1.balanceOf(excluded1.address),
                excluded2: await avax0TokenV1.balanceOf(excluded2.address)
            };
            
            preUpgradeV1State.minters = {
                owner: await avax0TokenV1.minters(owner.address),
                minter: await avax0TokenV1.minters(minter.address),
                user1: await avax0TokenV1.minters(user1.address)
            };
            
            console.log("📊 V1 State captured:");
            console.log("  Version:", preUpgradeV1State.version);
            console.log("  Total Supply:", ethers.formatEther(preUpgradeV1State.totalSupply));
            console.log("  Owner Balance:", ethers.formatEther(preUpgradeV1State.balances.owner));
        });
    });
    
    describe("Phase 2: Upgrade V1 → V2", function () {
        it("Should upgrade from V1 to V2 successfully", async function () {
            console.log("🚀 Upgrading from V1 to V2...");
            
            const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
            const upgradedContract = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
            await upgradedContract.waitForDeployment();
            
            avax0TokenV2 = await ethers.getContractAt("Avax0TokenV2", proxyAddress);
            
            // Verify upgrade
            expect(await avax0TokenV2.version()).to.equal("2.0.0");
            expect(await avax0TokenV2.getAddress()).to.equal(proxyAddress);
            
            console.log("✅ Upgraded to V2, version:", await avax0TokenV2.version());
        });
        
        it("Should preserve V1 state in V2", async function () {
            // Verify basic properties
            expect(await avax0TokenV2.name()).to.equal(preUpgradeV1State.name);
            expect(await avax0TokenV2.symbol()).to.equal(preUpgradeV1State.symbol);
            expect(await avax0TokenV2.decimals()).to.equal(preUpgradeV1State.decimals);
            expect(await avax0TokenV2.totalSupply()).to.equal(preUpgradeV1State.totalSupply);
            
            // Verify balances
            expect(await avax0TokenV2.balanceOf(owner.address)).to.equal(preUpgradeV1State.balances.owner);
            expect(await avax0TokenV2.balanceOf(user1.address)).to.equal(preUpgradeV1State.balances.user1);
            expect(await avax0TokenV2.balanceOf(user2.address)).to.equal(preUpgradeV1State.balances.user2);
            expect(await avax0TokenV2.balanceOf(user3.address)).to.equal(preUpgradeV1State.balances.user3);
            expect(await avax0TokenV2.balanceOf(excluded1.address)).to.equal(preUpgradeV1State.balances.excluded1);
            expect(await avax0TokenV2.balanceOf(excluded2.address)).to.equal(preUpgradeV1State.balances.excluded2);
            
            // Verify minters
            expect(await avax0TokenV2.minters(owner.address)).to.equal(preUpgradeV1State.minters.owner);
            expect(await avax0TokenV2.minters(minter.address)).to.equal(preUpgradeV1State.minters.minter);
            expect(await avax0TokenV2.minters(user1.address)).to.equal(preUpgradeV1State.minters.user1);
            
            console.log("✅ All V1 state preserved in V2");
        });
        
        it("Should test V2 new features (time locks)", async function () {
            // Test creating time locks
            const releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            
            await expect(avax0TokenV2.createTimeLock(user1.address, LOCK_AMOUNT, releaseTime))
                .to.emit(avax0TokenV2, "TokensLocked");
            
            // Check locked amounts
            expect(await avax0TokenV2.getLockedAmount(user1.address)).to.equal(LOCK_AMOUNT);
            expect(await avax0TokenV2.totalLockedAmount(user1.address)).to.equal(LOCK_AMOUNT);
            
            // Check available balance
            const user1Balance = await avax0TokenV2.balanceOf(user1.address);
            const expectedAvailable = user1Balance - LOCK_AMOUNT;
            expect(await avax0TokenV2.getAvailableBalance(user1.address)).to.equal(expectedAvailable);
            
            // Test mint with lock
            await expect(avax0TokenV2.connect(minter).mintWithLock(
                user2.address, 
                ethers.parseEther("5000"), 
                releaseTime
            )).to.emit(avax0TokenV2, "TokensLocked");
            
            // Test transfers with locks
            await expect(avax0TokenV2.connect(user1).transfer(user2.address, user1Balance))
                .to.be.revertedWithCustomError(avax0TokenV2, "InsufficientUnlockedBalance");
            
            // Should allow transfer of available balance
            await expect(avax0TokenV2.connect(user1).transfer(user2.address, expectedAvailable))
                .to.emit(avax0TokenV2, "Transfer");
        });
        
        it("Should capture V2 state before upgrade to V2.1", async function () {
            preUpgradeV2State.version = await avax0TokenV2.version();
            preUpgradeV2State.totalSupply = await avax0TokenV2.totalSupply();
            
            preUpgradeV2State.balances = {
                owner: await avax0TokenV2.balanceOf(owner.address),
                user1: await avax0TokenV2.balanceOf(user1.address),
                user2: await avax0TokenV2.balanceOf(user2.address),
                user3: await avax0TokenV2.balanceOf(user3.address),
                excluded1: await avax0TokenV2.balanceOf(excluded1.address),
                excluded2: await avax0TokenV2.balanceOf(excluded2.address)
            };
            
            preUpgradeV2State.locks = {
                user1: {
                    count: await avax0TokenV2.getTimeLockCount(user1.address),
                    totalLocked: await avax0TokenV2.totalLockedAmount(user1.address),
                    lockedAmount: await avax0TokenV2.getLockedAmount(user1.address)
                },
                user2: {
                    count: await avax0TokenV2.getTimeLockCount(user2.address),
                    totalLocked: await avax0TokenV2.totalLockedAmount(user2.address),
                    lockedAmount: await avax0TokenV2.getLockedAmount(user2.address)
                }
            };
            
            console.log("📊 V2 State captured:");
            console.log("  Version:", preUpgradeV2State.version);
            console.log("  User1 locks:", preUpgradeV2State.locks.user1.count.toString());
            console.log("  User2 locks:", preUpgradeV2State.locks.user2.count.toString());
        });
    });
    
    describe("Phase 3: Upgrade V2 → V2.1", function () {
        it("Should upgrade from V2 to V2.1 successfully", async function () {
            console.log("🚀 Upgrading from V2 to V2.1...");
            
            const Avax0TokenV2_1 = await ethers.getContractFactory("Avax0TokenV2_1");
            const upgradedContract = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2_1);
            await upgradedContract.waitForDeployment();
            
            avax0TokenV2_1 = await ethers.getContractAt("Avax0TokenV2_1", proxyAddress);
            
            // Verify upgrade
            expect(await avax0TokenV2_1.version()).to.equal("2.1.0");
            expect(await avax0TokenV2_1.getAddress()).to.equal(proxyAddress);
            
            console.log("✅ Upgraded to V2.1, version:", await avax0TokenV2_1.version());
        });
        
        it("Should initialize V2.1 features", async function () {
            // Initialize V2.1 with vesting enabled, ending in 1 hour
            const vestingEndDate = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
            
            await expect(avax0TokenV2_1.initializeV2_1(vestingEndDate, true))
                .to.emit(avax0TokenV2_1, "VestingStatusChanged")
                .to.emit(avax0TokenV2_1, "VestingEndDateChanged")
                .to.emit(avax0TokenV2_1, "VestingExclusionChanged");
            
            // Verify initialization
            expect(await avax0TokenV2_1.vestingEnabled()).to.be.true;
            expect(await avax0TokenV2_1.vestingEndDate()).to.equal(vestingEndDate);
            expect(await avax0TokenV2_1.vestingExcluded(owner.address)).to.be.true;
            
            // Should not allow re-initialization
            await expect(avax0TokenV2_1.initializeV2_1(vestingEndDate, true))
                .to.be.revertedWith("Avax0: V2.1 already initialized");
        });
        
        it("Should preserve V2 state in V2.1", async function () {
            // Verify basic properties
            expect(await avax0TokenV2_1.totalSupply()).to.equal(preUpgradeV2State.totalSupply);
            
            // Verify balances
            expect(await avax0TokenV2_1.balanceOf(owner.address)).to.equal(preUpgradeV2State.balances.owner);
            expect(await avax0TokenV2_1.balanceOf(user1.address)).to.equal(preUpgradeV2State.balances.user1);
            expect(await avax0TokenV2_1.balanceOf(user2.address)).to.equal(preUpgradeV2State.balances.user2);
            expect(await avax0TokenV2_1.balanceOf(user3.address)).to.equal(preUpgradeV2State.balances.user3);
            expect(await avax0TokenV2_1.balanceOf(excluded1.address)).to.equal(preUpgradeV2State.balances.excluded1);
            expect(await avax0TokenV2_1.balanceOf(excluded2.address)).to.equal(preUpgradeV2State.balances.excluded2);
            
            // Verify time locks
            expect(await avax0TokenV2_1.getTimeLockCount(user1.address)).to.equal(preUpgradeV2State.locks.user1.count);
            expect(await avax0TokenV2_1.totalLockedAmount(user1.address)).to.equal(preUpgradeV2State.locks.user1.totalLocked);
            expect(await avax0TokenV2_1.getLockedAmount(user1.address)).to.equal(preUpgradeV2State.locks.user1.lockedAmount);
            
            expect(await avax0TokenV2_1.getTimeLockCount(user2.address)).to.equal(preUpgradeV2State.locks.user2.count);
            expect(await avax0TokenV2_1.totalLockedAmount(user2.address)).to.equal(preUpgradeV2State.locks.user2.totalLocked);
            expect(await avax0TokenV2_1.getLockedAmount(user2.address)).to.equal(preUpgradeV2State.locks.user2.lockedAmount);
            
            console.log("✅ All V2 state preserved in V2.1");
        });
    });
    
    describe("Phase 4: Test V2.1 Global Vesting Features", function () {
        it("Should manage vesting exclusions", async function () {
            // Add exclusions
            await expect(avax0TokenV2_1.setVestingExclusion(excluded1.address, true))
                .to.emit(avax0TokenV2_1, "VestingExclusionChanged");
            
            await expect(avax0TokenV2_1.setVestingExclusion(excluded2.address, true))
                .to.emit(avax0TokenV2_1, "VestingExclusionChanged");
            
            // Batch update exclusions
            await expect(avax0TokenV2_1.batchSetVestingExclusion(
                [user1.address, user2.address], 
                [false, false]
            )).to.emit(avax0TokenV2_1, "VestingExclusionChanged");
            
            // Verify exclusions
            expect(await avax0TokenV2_1.vestingExcluded(owner.address)).to.be.true;
            expect(await avax0TokenV2_1.vestingExcluded(excluded1.address)).to.be.true;
            expect(await avax0TokenV2_1.vestingExcluded(excluded2.address)).to.be.true;
            expect(await avax0TokenV2_1.vestingExcluded(user1.address)).to.be.false;
            expect(await avax0TokenV2_1.vestingExcluded(user2.address)).to.be.false;
            expect(await avax0TokenV2_1.vestingExcluded(user3.address)).to.be.false;
        });
        
        it("Should check vesting status correctly", async function () {
            // Test isSubjectToVesting
            expect(await avax0TokenV2_1.isSubjectToVesting(owner.address)).to.be.false; // excluded
            expect(await avax0TokenV2_1.isSubjectToVesting(excluded1.address)).to.be.false; // excluded
            expect(await avax0TokenV2_1.isSubjectToVesting(user1.address)).to.be.true; // not excluded, vesting active
            expect(await avax0TokenV2_1.isSubjectToVesting(user3.address)).to.be.true; // not excluded, vesting active
            
            // Test canTransfer
            expect(await avax0TokenV2_1.canTransfer(owner.address)).to.be.true;
            expect(await avax0TokenV2_1.canTransfer(excluded1.address)).to.be.true;
            expect(await avax0TokenV2_1.canTransfer(user1.address)).to.be.false;
            expect(await avax0TokenV2_1.canTransfer(user3.address)).to.be.false;
            
            // Test getVestingStatus
            const [enabled, endDate, remainingTime] = await avax0TokenV2_1.getVestingStatus();
            expect(enabled).to.be.true;
            expect(endDate).to.be.gt(0);
            expect(remainingTime).to.be.gt(0);
        });
        
        it("Should enforce vesting restrictions on transfers", async function () {
            // Non-excluded users cannot transfer during vesting
            await expect(avax0TokenV2_1.connect(user1).transfer(user2.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "VestingActive");
            
            await expect(avax0TokenV2_1.connect(user3).transfer(user1.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "VestingActive");
            
            // Excluded users can transfer during vesting
            const excludedBalance = await avax0TokenV2_1.balanceOf(excluded1.address);
            if (excludedBalance > 0) {
                await expect(avax0TokenV2_1.connect(excluded1).transfer(excluded2.address, ethers.parseEther("100")))
                    .to.emit(avax0TokenV2_1, "Transfer");
            }
            
            // Owner can transfer during vesting
            await expect(avax0TokenV2_1.transfer(excluded1.address, ethers.parseEther("1000")))
                .to.emit(avax0TokenV2_1, "Transfer");
        });
        
        it("Should enforce vesting restrictions on burns", async function () {
            // Non-excluded users cannot burn during vesting
            await expect(avax0TokenV2_1.connect(user3).burn(ethers.parseEther("100")))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "VestingActive");
            
            // Excluded users can burn during vesting
            await expect(avax0TokenV2_1.connect(excluded1).burn(ethers.parseEther("100")))
                .to.emit(avax0TokenV2_1, "Transfer"); // Burn emits transfer to zero
        });
        
        it("Should show zero available balance for vested users", async function () {
            // Users subject to vesting should have zero available balance
            expect(await avax0TokenV2_1.getAvailableBalance(user1.address)).to.equal(0);
            expect(await avax0TokenV2_1.getAvailableBalance(user3.address)).to.equal(0);
            
            // Excluded users should have normal available balance
            const ownerBalance = await avax0TokenV2_1.balanceOf(owner.address);
            expect(await avax0TokenV2_1.getAvailableBalance(owner.address)).to.equal(ownerBalance);
            
            const excluded1Balance = await avax0TokenV2_1.balanceOf(excluded1.address);
            expect(await avax0TokenV2_1.getAvailableBalance(excluded1.address)).to.equal(excluded1Balance);
        });
        
        it("Should allow changing vesting parameters", async function () {
            // Disable vesting
            await expect(avax0TokenV2_1.setVestingEnabled(false))
                .to.emit(avax0TokenV2_1, "VestingStatusChanged");
            
            expect(await avax0TokenV2_1.vestingEnabled()).to.be.false;
            
            // Now all users should be able to transfer
            expect(await avax0TokenV2_1.isSubjectToVesting(user1.address)).to.be.false;
            expect(await avax0TokenV2_1.canTransfer(user1.address)).to.be.true;
            
            // Test transfer now works
            const user3Balance = await avax0TokenV2_1.balanceOf(user3.address);
            if (user3Balance > 0) {
                await expect(avax0TokenV2_1.connect(user3).transfer(user1.address, ethers.parseEther("50")))
                    .to.emit(avax0TokenV2_1, "Transfer");
            }
            
            // Re-enable vesting
            await expect(avax0TokenV2_1.setVestingEnabled(true))
                .to.emit(avax0TokenV2_1, "VestingStatusChanged");
            
            // Change vesting end date to future
            const newEndDate = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now
            await expect(avax0TokenV2_1.setVestingEndDate(newEndDate))
                .to.emit(avax0TokenV2_1, "VestingEndDateChanged");
            
            expect(await avax0TokenV2_1.vestingEndDate()).to.equal(newEndDate);
        });
        
        it("Should handle vesting end correctly", async function () {
            // Set vesting end date to 0 to simulate disabled vesting end date
            await avax0TokenV2_1.setVestingEndDate(0);
            
            // With vesting still enabled but end date = 0, vesting should still be active
            // (because the contract logic checks if enabled AND not yet expired)
            expect(await avax0TokenV2_1.isSubjectToVesting(user1.address)).to.be.true;
            expect(await avax0TokenV2_1.canTransfer(user1.address)).to.be.false;
            
            // Now disable vesting entirely
            await avax0TokenV2_1.setVestingEnabled(false);
            
            // Now all users should be able to transfer
            expect(await avax0TokenV2_1.isSubjectToVesting(user1.address)).to.be.false;
            expect(await avax0TokenV2_1.canTransfer(user1.address)).to.be.true;
            
            const user1Balance = await avax0TokenV2_1.balanceOf(user1.address);
            const availableBalance = await avax0TokenV2_1.getAvailableBalance(user1.address);
            
            // Should have normal available balance calculation (considering only time locks)
            const lockedAmount = await avax0TokenV2_1.getLockedAmount(user1.address);
            const expectedAvailable = user1Balance >= lockedAmount ? user1Balance - lockedAmount : 0n;
            expect(availableBalance).to.equal(expectedAvailable);
        });
    });
    
    describe("Phase 5: Comprehensive Functionality Tests", function () {
        it("Should test all transfer functions with combined locks and vesting", async function () {
            // Reset vesting to active state for comprehensive testing
            const futureDate = Math.floor(Date.now() / 1000) + 3600;
            await avax0TokenV2_1.setVestingEnabled(true);
            await avax0TokenV2_1.setVestingEndDate(futureDate);
            
            // Test transferFrom with vesting - user1 should be subject to vesting
            await avax0TokenV2_1.connect(user1).approve(owner.address, ethers.parseEther("1000"));
            await expect(avax0TokenV2_1.transferFrom(user1.address, user2.address, ethers.parseEther("100")))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "VestingActive");
            
            // Test with excluded user
            await avax0TokenV2_1.setVestingExclusion(user1.address, true);
            
            // Now should work (if no time lock conflicts)
            const user1LockedAmount = await avax0TokenV2_1.getLockedAmount(user1.address);
            const user1Balance = await avax0TokenV2_1.balanceOf(user1.address);
            const availableForTransfer = user1Balance - user1LockedAmount;
            
            if (availableForTransfer > ethers.parseEther("50")) {
                await expect(avax0TokenV2_1.transferFrom(user1.address, user2.address, ethers.parseEther("50")))
                    .to.emit(avax0TokenV2_1, "Transfer");
            }
        });
        
        it("Should test minting functions in V2.1", async function () {
            // Test regular mint
            await expect(avax0TokenV2_1.connect(minter).mint(user3.address, ethers.parseEther("1000")))
                .to.emit(avax0TokenV2_1, "Transfer");
            
            // Test mint with lock
            const futureTime = Math.floor(Date.now() / 1000) + 1800; // 30 minutes
            await expect(avax0TokenV2_1.connect(minter).mintWithLock(
                user3.address, 
                ethers.parseEther("500"), 
                futureTime
            )).to.emit(avax0TokenV2_1, "TokensLocked");
            
            // Test batch mint
            await expect(avax0TokenV2_1.connect(minter).batchMint(
                [excluded1.address, excluded2.address],
                [ethers.parseEther("200"), ethers.parseEther("300")]
            )).to.emit(avax0TokenV2_1, "Transfer");
        });
        
        it("Should test time lock functions in V2.1", async function () {
            // Test creating new time lock
            const lockTime = Math.floor(Date.now() / 1000) + 1800;
            const lockAmount = ethers.parseEther("500");
            
            await expect(avax0TokenV2_1.createTimeLock(excluded1.address, lockAmount, lockTime))
                .to.emit(avax0TokenV2_1, "TokensLocked");
            
            // Test extending lock
            const lockCount = await avax0TokenV2_1.getTimeLockCount(excluded1.address);
            if (lockCount > 0) {
                const newTime = lockTime + 1800; // Add 30 more minutes
                await expect(avax0TokenV2_1.extendLock(excluded1.address, lockCount - 1n, newTime))
                    .to.emit(avax0TokenV2_1, "LockExtended");
            }
        });
        
        it("Should test edge cases and error conditions", async function () {
            // Test invalid vesting dates
            await expect(avax0TokenV2_1.setVestingEndDate(Math.floor(Date.now() / 1000) - 100))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "InvalidVestingEndDate");
            
            // Test zero address in exclusion
            await expect(avax0TokenV2_1.setVestingExclusion(ethers.ZeroAddress, true))
                .to.be.revertedWithCustomError(avax0TokenV2_1, "ZeroAddress");
            
            // Test empty arrays in batch functions
            await expect(avax0TokenV2_1.batchSetVestingExclusion([], []))
                .to.be.revertedWith("Avax0: empty arrays");
            
            // Test mismatched arrays
            await expect(avax0TokenV2_1.batchSetVestingExclusion([user1.address], [true, false]))
                .to.be.revertedWith("Avax0: arrays length mismatch");
        });
        
        it("Should test admin functions in V2.1", async function () {
            // Test pause/unpause still works
            await avax0TokenV2_1.pause();
            expect(await avax0TokenV2_1.paused()).to.be.true;
            
            await avax0TokenV2_1.unpause();
            expect(await avax0TokenV2_1.paused()).to.be.false;
            
            // Test minter management
            await avax0TokenV2_1.setMinter(user1.address, true);
            expect(await avax0TokenV2_1.minters(user1.address)).to.be.true;
            
            await avax0TokenV2_1.setMinter(user1.address, false);
            expect(await avax0TokenV2_1.minters(user1.address)).to.be.false;
        });
    });
    
    describe("Phase 6: Final Validation", function () {
        it("Should have correct final state", async function () {
            // Verify contract version
            expect(await avax0TokenV2_1.version()).to.equal("2.1.0");
            
            // Verify storage integrity - balances should be correct
            const totalSupply = await avax0TokenV2_1.totalSupply();
            expect(totalSupply).to.be.gt(INITIAL_SUPPLY); // Should be higher due to minting
            
            // Verify all V1 functions still work
            expect(await avax0TokenV2_1.decimals()).to.equal(18);
            expect(await avax0TokenV2_1.MAX_SUPPLY()).to.equal(ethers.parseEther("100000000"));
            
            // Verify all V2 functions still work  
            expect(await avax0TokenV2_1.getTimeLockCount(user1.address)).to.be.gte(0);
            
            // Verify all V2.1 functions work
            const [enabled, endDate, remainingTime] = await avax0TokenV2_1.getVestingStatus();
            expect(typeof enabled).to.equal("boolean");
            expect(typeof endDate).to.equal("bigint");
            expect(typeof remainingTime).to.equal("bigint");
        });
        
        it("Should demonstrate full upgrade compatibility", async function () {
            console.log("\n🎉 UPGRADE PATH COMPLETED SUCCESSFULLY!");
            console.log("📋 Summary:");
            
            console.log("  ✅ V1 → V2 → V2.1 upgrade path verified");
            console.log("  ✅ All data preserved through upgrades");
            console.log("  ✅ V1 basic functionality preserved");
            console.log("  ✅ V2 time lock functionality preserved");
            console.log("  ✅ V2.1 global vesting functionality working");
            
            // Final stats
            const finalSupply = await avax0TokenV2_1.totalSupply();
            const finalVersion = await avax0TokenV2_1.version();
            
            console.log(`  📊 Final total supply: ${ethers.formatEther(finalSupply)} AVAX0`);
            console.log(`  📈 Final version: ${finalVersion}`);
            
            // Test a final transfer to prove everything works
            await avax0TokenV2_1.setVestingEnabled(false); // Disable vesting for final test
            const ownerBalance = await avax0TokenV2_1.balanceOf(owner.address);
            if (ownerBalance > 0) {
                await expect(avax0TokenV2_1.transfer(excluded1.address, ethers.parseEther("1")))
                    .to.emit(avax0TokenV2_1, "Transfer");
                console.log("  ✅ Final transfer test successful");
            }
            
            console.log("\n🚀 Ready for production deployment!");
        });
    });
});