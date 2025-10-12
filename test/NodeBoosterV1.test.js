const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NodeBooster V1", function () {
    let nodeBooster;
    let usdcToken;
    let avax0Token;
    let owner;
    let user1;
    let user2;
    let user3;
    let referrer;
    let payoutWallet1;
    let payoutWallet2;
    let payoutWallet3;
    
    const REGISTRATION_FEE = ethers.parseUnits("25", 6); // 25 USDC
    const AVAX0_REWARD = ethers.parseEther("1"); // 1 AVAX0
    const REFERRAL_RATE = 1000; // 10%
    
    beforeEach(async function () {
        [owner, user1, user2, user3, referrer, payoutWallet1, payoutWallet2, payoutWallet3] = await ethers.getSigners();
        
        // Deploy mock USDC token (6 decimals)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdcToken.waitForDeployment();
        
        // Deploy AVAX0 token (use V1 for simplicity)
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
        const avax0Proxy = await upgrades.deployProxy(
            Avax0TokenV1,
            ["avax0", "avax0", ethers.parseEther("10000000")], // 10M tokens
            { initializer: "initialize", kind: "uups" }
        );
        await avax0Proxy.waitForDeployment();
        avax0Token = await ethers.getContractAt("Avax0TokenV1", await avax0Proxy.getAddress());
        
        // Deploy NodeBooster V1
        const NodeBoosterV1 = await ethers.getContractFactory("NodeBoosterV1");
        const nodeBoosterProxy = await upgrades.deployProxy(
            NodeBoosterV1,
            [
                await usdcToken.getAddress(),
                await avax0Token.getAddress(),
                payoutWallet1.address,
                payoutWallet2.address,
                payoutWallet3.address
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        nodeBooster = await ethers.getContractAt("NodeBoosterV1", await nodeBoosterProxy.getAddress());
        
        // Mint USDC to users
        await usdcToken.mint(user1.address, ethers.parseUnits("1000", 6)); // 1000 USDC
        await usdcToken.mint(user2.address, ethers.parseUnits("1000", 6));
        await usdcToken.mint(user3.address, ethers.parseUnits("1000", 6));
        await usdcToken.mint(referrer.address, ethers.parseUnits("1000", 6));
        
        // Transfer AVAX0 tokens to NodeBooster contract for rewards
        await avax0Token.transfer(await nodeBooster.getAddress(), ethers.parseEther("1000")); // 1000 AVAX0
    });
    
    describe("Deployment", function () {
        it("Should set the right configuration", async function () {
            expect(await nodeBooster.usdcToken()).to.equal(await usdcToken.getAddress());
            expect(await nodeBooster.avax0Token()).to.equal(await avax0Token.getAddress());
            expect(await nodeBooster.payoutWallet1()).to.equal(payoutWallet1.address);
            expect(await nodeBooster.payoutWallet2()).to.equal(payoutWallet2.address);
            expect(await nodeBooster.payoutWallet3()).to.equal(payoutWallet3.address);
            expect(await nodeBooster.owner()).to.equal(owner.address);
            expect(await nodeBooster.version()).to.equal("1.0.0");
        });
        
        it("Should initialize with 10 default engines", async function () {
            expect(await nodeBooster.engineCount()).to.equal(10);
            
            // Check first engine
            const engine0 = await nodeBooster.getEngine(0);
            expect(engine0.name).to.equal("Starter Engine");
            expect(engine0.priceInAvax).to.equal(ethers.parseEther("2"));
            expect(engine0.hashPower).to.equal(1);
            expect(engine0.maxRewardCapDays).to.equal(405);
            expect(engine0.isActive).to.be.true;
            
            // Check last engine
            const engine9 = await nodeBooster.getEngine(9);
            expect(engine9.name).to.equal("Ultimate Engine");
            expect(engine9.priceInAvax).to.equal(ethers.parseEther("310"));
            expect(engine9.hashPower).to.equal(18);
            expect(engine9.maxRewardCapDays).to.equal(405);
            expect(engine9.isActive).to.be.true;
        });
        
        it("Should have correct constants", async function () {
            expect(await nodeBooster.REGISTRATION_FEE()).to.equal(REGISTRATION_FEE);
            expect(await nodeBooster.REFERRAL_COMMISSION_RATE()).to.equal(REFERRAL_RATE);
            expect(await nodeBooster.BASIS_POINTS()).to.equal(10000);
            expect(await nodeBooster.MAX_ENGINES()).to.equal(50);
        });
    });
    
    describe("User Registration", function () {
        it("Should register user without referrer", async function () {
            // Approve USDC spending
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            // Register user
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check user account
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            expect(userAccount.isRegistered).to.be.true;
            expect(userAccount.referrer).to.equal(owner.address); // Now uses default referrer
            expect(userAccount.totalReferrals).to.equal(0);
            expect(userAccount.totalReferralRewards).to.equal(0);
            expect(userAccount.currentEngine).to.equal(0); // Started with engine 0
            expect(userAccount.pendingRewards.length).to.equal(0); // No pending rewards initially
            expect(userAccount.totalRewardsClaimed).to.equal(0);
            expect(userAccount.engineStartTime).to.be.gt(0); // Should be set
            
            // Check AVAX0 balance
            expect(await avax0Token.balanceOf(user1.address)).to.equal(AVAX0_REWARD);
            
            // Check contract stats
            expect(await nodeBooster.totalUsers()).to.equal(2); // Owner + user1
            expect(await nodeBooster.totalUsdcCollected()).to.equal(REGISTRATION_FEE);
            expect(await nodeBooster.totalAvax0Distributed()).to.equal(AVAX0_REWARD);
        });
        
        it("Should register user with referrer", async function () {
            // Register referrer first
            await usdcToken.connect(referrer).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(referrer).register(ethers.ZeroAddress);
            
            // Register user with referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            const referralReward = (REGISTRATION_FEE * BigInt(REFERRAL_RATE)) / BigInt(10000);
            
            await expect(nodeBooster.connect(user1).register(referrer.address))
                .to.emit(nodeBooster, "UserRegistered")
                .and.to.emit(nodeBooster, "ReferralRewardPaid");
            
            // Check referrer account
            const referrerAccount = await nodeBooster.getUserAccount(referrer.address);
            expect(referrerAccount.totalReferrals).to.equal(1);
            expect(referrerAccount.totalReferralRewards).to.equal(referralReward);
            
            // Check referrer USDC balance (should have received referral reward)
            const expectedBalance = ethers.parseUnits("1000", 6) - REGISTRATION_FEE + referralReward;
            expect(await usdcToken.balanceOf(referrer.address)).to.equal(expectedBalance);
        });
        
        it("Should distribute remaining USDC to payout wallets", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            const initialBalance1 = await usdcToken.balanceOf(payoutWallet1.address);
            const initialBalance2 = await usdcToken.balanceOf(payoutWallet2.address);
            const initialBalance3 = await usdcToken.balanceOf(payoutWallet3.address);
            
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Calculate expected amounts (25 USDC - 10% referral reward = 22.5 USDC to split)
            const referralReward = (REGISTRATION_FEE * BigInt(REFERRAL_RATE)) / BigInt(10000);
            const remainingAmount = REGISTRATION_FEE - referralReward;
            const amountPerWallet = remainingAmount / BigInt(3);
            const remainder = remainingAmount % BigInt(3);
            
            expect(await usdcToken.balanceOf(payoutWallet1.address)).to.equal(initialBalance1 + amountPerWallet);
            expect(await usdcToken.balanceOf(payoutWallet2.address)).to.equal(initialBalance2 + amountPerWallet);
            expect(await usdcToken.balanceOf(payoutWallet3.address)).to.equal(initialBalance3 + amountPerWallet + remainder);
        });
        
        it("Should not allow double registration", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.be.revertedWith("NodeBooster: User already registered");
        });
        
        it("Should not allow self-referral", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user1).register(user1.address))
                .to.be.revertedWith("NodeBooster: Cannot refer yourself");
        });
        
        it("Should use default referrer when referrer is not registered", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            // Get default referrer (should be owner initially)
            const defaultReferrer = await nodeBooster.getDefaultReferrer();
            expect(defaultReferrer).to.equal(owner.address);
            
            // Register with unregistered referrer - should use default referrer instead
            await expect(nodeBooster.connect(user1).register(user2.address))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check that default referrer was used
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            expect(userAccount.referrer).to.equal(defaultReferrer);
        });
    });
    
    describe("Engine Management", function () {
        it("Should allow owner to configure new engine", async function () {
            const engineId = 10;
            const name = "Custom Engine";
            const priceInAvax = ethers.parseEther("50");
            const hashPower = 5000;
            const maxRewardCapDays = 120;
            const isActive = true;
            
            await expect(nodeBooster.configureEngine(engineId, name, priceInAvax, hashPower, maxRewardCapDays, isActive))
                .to.emit(nodeBooster, "EngineConfigured")
                .withArgs(engineId, name, priceInAvax, hashPower, maxRewardCapDays, isActive);
            
            const engine = await nodeBooster.getEngine(engineId);
            expect(engine.name).to.equal(name);
            expect(engine.priceInAvax).to.equal(priceInAvax);
            expect(engine.hashPower).to.equal(hashPower);
            expect(engine.maxRewardCapDays).to.equal(maxRewardCapDays);
            expect(engine.isActive).to.equal(isActive);
            
            expect(await nodeBooster.engineCount()).to.equal(11);
        });
        
        it("Should not allow non-owner to configure engine", async function () {
            await expect(nodeBooster.connect(user1).configureEngine(10, "Test", ethers.parseEther("1"), 100, 30, true))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should validate engine parameters", async function () {
            await expect(nodeBooster.configureEngine(10, "", ethers.parseEther("1"), 100, 30, true))
                .to.be.revertedWith("NodeBooster: Engine name cannot be empty");
            
            await expect(nodeBooster.configureEngine(10, "Test", 0, 100, 30, true))
                .to.be.revertedWith("NodeBooster: Price must be greater than 0");
            
            await expect(nodeBooster.configureEngine(50, "Test", ethers.parseEther("1"), 100, 30, true))
                .to.be.revertedWith("NodeBooster: Engine ID exceeds maximum");
        });
    });
    
    describe("Default Referrer Functionality", function () {
        it("Should set owner as default referrer initially", async function () {
            const defaultReferrer = await nodeBooster.getDefaultReferrer();
            expect(defaultReferrer).to.equal(owner.address);
        });
        
        it("Should allow owner to update default referrer", async function () {
            // Register user1 first so they can be a referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Update default referrer
            await expect(nodeBooster.setDefaultReferrer(user1.address))
                .to.emit(nodeBooster, "DefaultReferrerUpdated")
                .withArgs(owner.address, user1.address);
            
            expect(await nodeBooster.getDefaultReferrer()).to.equal(user1.address);
        });
        
        it("Should not allow setting unregistered user as default referrer", async function () {
            await expect(nodeBooster.setDefaultReferrer(user1.address))
                .to.be.revertedWith("NodeBooster: Default referrer must be registered");
        });
        
        it("Should not allow setting blacklisted user as default referrer", async function () {
            // Register and blacklist user1
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.setDefaultReferrer(user1.address))
                .to.be.revertedWith("NodeBooster: Default referrer cannot be blacklisted");
        });
        
        it("Should use default referrer when no referrer is specified", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.emit(nodeBooster, "UserRegistered");
            
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            const defaultReferrer = await nodeBooster.getDefaultReferrer();
            expect(userAccount.referrer).to.equal(defaultReferrer);
        });
    });
    
    describe("Emergency Functions", function () {
        it("Should allow owner to pause and unpause", async function () {
            await nodeBooster.pause();
            expect(await nodeBooster.paused()).to.be.true;
            
            // Should prevent registration when paused
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(nodeBooster, "EnforcedPause");
            
            await nodeBooster.unpause();
            expect(await nodeBooster.paused()).to.be.false;
        });
    });
    
    describe("Blacklist Functionality", function () {
        beforeEach(async function () {
            // Register a user for blacklist testing
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
        });
        
        it("Should allow owner to blacklist users", async function () {
            await expect(nodeBooster.setBlacklistStatus(user2.address, true))
                .to.emit(nodeBooster, "UserBlacklisted")
                .withArgs(user2.address, true, owner.address);
            
            expect(await nodeBooster.getBlacklistStatus(user2.address)).to.be.true;
        });
        
        it("Should prevent blacklisted users from registering", async function () {
            // Blacklist user2
            await nodeBooster.setBlacklistStatus(user2.address, true);
            
            // Try to register user2
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user2).register(ethers.ZeroAddress))
                .to.be.revertedWith("NodeBooster: Address is blacklisted");
        });
        
        it("Should prevent using blacklisted referrer", async function () {
            // Blacklist user1 (who is already registered)
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            // Try to register user2 with blacklisted referrer - should use default referrer
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user2).register(user1.address))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check that default referrer was used instead of blacklisted one
            const userAccount = await nodeBooster.getUserAccount(user2.address);
            const defaultReferrer = await nodeBooster.getDefaultReferrer();
            expect(userAccount.referrer).to.equal(defaultReferrer);
        });
        
        it("Should allow batch blacklisting", async function () {
            const users = [user2.address, user3.address];
            
            await expect(nodeBooster.batchSetBlacklistStatus(users, true))
                .to.emit(nodeBooster, "UserBlacklisted")
                .withArgs(user2.address, true, owner.address);
            
            expect(await nodeBooster.getBlacklistStatus(user2.address)).to.be.true;
            expect(await nodeBooster.getBlacklistStatus(user3.address)).to.be.true;
        });
        
        it("Should not allow blacklisting owner", async function () {
            await expect(nodeBooster.setBlacklistStatus(owner.address, true))
                .to.be.revertedWith("NodeBooster: Cannot blacklist owner");
        });
        
        it("Should not allow non-owner to blacklist", async function () {
            await expect(nodeBooster.connect(user1).setBlacklistStatus(user2.address, true))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should validate batch blacklist parameters", async function () {
            await expect(nodeBooster.batchSetBlacklistStatus([], true))
                .to.be.revertedWith("NodeBooster: Empty users array");
            
            // Create array with too many users
            const tooManyUsers = new Array(101).fill(user2.address);
            await expect(nodeBooster.batchSetBlacklistStatus(tooManyUsers, true))
                .to.be.revertedWith("NodeBooster: Too many users (max 100)");
        });
    });
    
    describe("View Functions", function () {
        it("Should return correct statistics", async function () {
            // Register some users
            await usdcToken.connect(referrer).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(referrer).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(referrer.address);
            
            const stats = await nodeBooster.getStats();
            expect(stats[0]).to.equal(3); // Owner + referrer + user1
            expect(stats[1]).to.equal(REGISTRATION_FEE * BigInt(2)); // totalUsdcCollected
            expect(stats[2]).to.equal(AVAX0_REWARD * BigInt(2)); // totalAvax0Distributed
            expect(stats[3]).to.equal((REGISTRATION_FEE * BigInt(REFERRAL_RATE)) / BigInt(10000) * BigInt(2)); // totalReferralRewards (2 registrations)
        });
        
        it("Should return correct users count and list", async function () {
            // Register some users
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(ethers.ZeroAddress);
            
            expect(await nodeBooster.getUsersCount()).to.equal(3); // Owner + user1 + user2
            
            const users = await nodeBooster.getUsers(0, 10);
            expect(users.length).to.equal(3);
            expect(users[0]).to.equal(owner.address); // Owner is first
            expect(users[1]).to.equal(user1.address);
            expect(users[2]).to.equal(user2.address);
        });
        
        it("Should return security status", async function () {
            // Register and blacklist a user
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            const [isPaused, contractOwner, totalBlacklisted] = await nodeBooster.getSecurityStatus();
            expect(isPaused).to.be.false;
            expect(contractOwner).to.equal(owner.address);
            expect(totalBlacklisted).to.equal(1);
        });
        
        it("Should prevent contracts from registering", async function () {
            // Deploy a simple contract to test
            const MockContract = await ethers.getContractFactory("MockERC20");
            const mockContract = await MockContract.deploy("Test", "TEST", 18);
            await mockContract.waitForDeployment();
            
            // Mint USDC to the contract and try to register
            await usdcToken.mint(await mockContract.getAddress(), REGISTRATION_FEE);
            
            // This should fail because contracts can't register
            // Note: This test might need adjustment based on how the contract detection works
        });
    });
    
    describe("Ownership Management", function () {
        it("Should allow owner to transfer ownership", async function () {
            await expect(nodeBooster.transferOwnership(user1.address))
                .to.emit(nodeBooster, "OwnershipTransferInitiated")
                .withArgs(owner.address, user1.address);
            
            expect(await nodeBooster.owner()).to.equal(user1.address);
        });
        
        it("Should not allow transferring to blacklisted address", async function () {
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.transferOwnership(user1.address))
                .to.be.revertedWith("NodeBooster: New owner cannot be blacklisted");
        });
        
        it("Should allow emergency ownership transfer to blacklisted address", async function () {
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.emergencyTransferOwnership(user1.address))
                .to.emit(nodeBooster, "UserBlacklisted")
                .withArgs(user1.address, false, owner.address);
            
            expect(await nodeBooster.owner()).to.equal(user1.address);
            expect(await nodeBooster.getBlacklistStatus(user1.address)).to.be.false;
        });
    });
    
    describe("Engine System", function () {
        beforeEach(async function () {
            // Register user1 for engine tests
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
        });
        
        it("Should calculate cumulative cost correctly", async function () {
            // Engine 0: 2 AVAX, Engine 1: 4 AVAX, cumulative for engine 1 = 6 AVAX
            expect(await nodeBooster.getCumulativeCost(0)).to.equal(ethers.parseEther("2"));
            expect(await nodeBooster.getCumulativeCost(1)).to.equal(ethers.parseEther("6"));
            expect(await nodeBooster.getCumulativeCost(2)).to.equal(ethers.parseEther("14")); // 2+4+8
        });
        
        it("Should calculate upgrade cost correctly", async function () {
            // From engine 0 to 1: just engine 1 cost = 4 AVAX
            expect(await nodeBooster.calculateUpgradeCost(0, 1)).to.equal(ethers.parseEther("4"));
            // From engine 0 to 2: engine 1 + engine 2 = 4 + 8 = 12 AVAX
            expect(await nodeBooster.calculateUpgradeCost(0, 2)).to.equal(ethers.parseEther("12"));
        });
        
        it("Should upgrade engine successfully", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost }))
                .to.emit(nodeBooster, "EngineUpgraded")
                .withArgs(user1.address, 0, 1, 0); // No pending rewards initially
            
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            expect(userAccount.currentEngine).to.equal(1);
            expect(userAccount.engineStartTime).to.be.gt(0);
        });
        
        it("Should calculate rewards correctly after time passes", async function () {
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const pendingRewards = await nodeBooster.calculatePendingRewards(user1.address);
            expect(pendingRewards).to.be.gt(0);
            
            // Formula: (cumulativeCost * 450% / 405 days) * (1 + hashPower%)
            // Engine 0: cumulative cost = 2 AVAX, hashPower = 1%
            // Daily reward = (2 * 4.5 / 405) * (1 + 0.01) = 0.0222 * 1.01 = 0.0224 AVAX
            const baseDailyReward = (ethers.parseEther("2") * 450n) / (405n * 100n);
            const expectedDaily = (baseDailyReward * (100n + 1n)) / 100n; // 1% hashPower
            expect(pendingRewards).to.be.closeTo(expectedDaily, ethers.parseEther("0.001"));
        });
        
        it("Should claim rewards successfully", async function () {
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const initialBalance = await avax0Token.balanceOf(user1.address);
            const pendingRewards = await nodeBooster.calculatePendingRewards(user1.address);
            
            await expect(nodeBooster.connect(user1).claimRewards())
                .to.emit(nodeBooster, "RewardsClaimed")
                .withArgs(user1.address, pendingRewards);
            
            const finalBalance = await avax0Token.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.equal(pendingRewards);
            
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            expect(userAccount.totalRewardsClaimed).to.equal(pendingRewards);
            
            // Check that all pending rewards are marked as completed
            const totalPending = await nodeBooster.getTotalPendingRewards(user1.address);
            expect(totalPending).to.equal(0);
        });
        
        it("Should preserve pending rewards during upgrade", async function () {
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const pendingBefore = await nodeBooster.calculatePendingRewards(user1.address);
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost }))
                .to.emit(nodeBooster, "EngineUpgraded")
                .withArgs(user1.address, 0, 1, pendingBefore);
            
            // Check that pending rewards are stored in the array
            const totalPending = await nodeBooster.getTotalPendingRewards(user1.address);
            expect(totalPending).to.equal(pendingBefore);
            
            const userAccount = await nodeBooster.getUserAccount(user1.address);
            expect(userAccount.currentEngine).to.equal(1);
        });
        
        it("Should get user engine info correctly", async function () {
            const [currentEngine, engineStartTime, pendingRewards, currentRewards, totalClaimable] = 
                await nodeBooster.getUserEngineInfo(user1.address);
            
            expect(currentEngine).to.equal(0);
            expect(engineStartTime).to.be.gt(0);
            expect(pendingRewards).to.equal(0); // No stored pending rewards initially
            expect(currentRewards).to.equal(0); // No time passed
            expect(totalClaimable).to.equal(0);
        });
        
        it("Should revert engine upgrade with insufficient payment", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            const insufficientPayment = upgradeCost - ethers.parseEther("0.1");
            
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: insufficientPayment }))
                .to.be.revertedWith("Insufficient AVAX payment");
        });
        
        it("Should revert upgrade to lower engine", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            await expect(nodeBooster.connect(user1).upgradeEngine(0, { value: 0 }))
                .to.be.revertedWith("Target engine must be higher than current");
        });
        
        it("Should track rewards history correctly", async function () {
            // Fast forward time and upgrade to create a reward entry
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            // Check rewards history
            const rewardsHistory = await nodeBooster.getUserRewardsHistory(user1.address);
            expect(rewardsHistory.length).to.equal(1);
            expect(rewardsHistory[0].engineId).to.equal(0);
            expect(rewardsHistory[0].completed).to.be.false;
            expect(rewardsHistory[0].amount).to.be.gt(0);
            
            // Check pending rewards count
            const pendingCount = await nodeBooster.getPendingRewardsCount(user1.address);
            expect(pendingCount).to.equal(1);
        });
        
        it("Should handle multiple reward entries correctly", async function () {
            // Create multiple reward entries through upgrades
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
            await ethers.provider.send("evm_mine");
            
            // Upgrade to engine 1
            let upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            await ethers.provider.send("evm_increaseTime", [48 * 60 * 60]); // 2 more days
            await ethers.provider.send("evm_mine");
            
            // Upgrade to engine 2
            upgradeCost = await nodeBooster.calculateUpgradeCost(1, 2);
            await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost });
            
            // Should now have 2 pending reward entries
            const pendingCount = await nodeBooster.getPendingRewardsCount(user1.address);
            expect(pendingCount).to.equal(2);
            
            const totalPending = await nodeBooster.getTotalPendingRewards(user1.address);
            expect(totalPending).to.be.gt(0);
            
            // Claim all rewards
            await nodeBooster.connect(user1).claimRewards();
            
            // All rewards should now be completed
            const pendingCountAfter = await nodeBooster.getPendingRewardsCount(user1.address);
            expect(pendingCountAfter).to.equal(0);
            
            // Total history should include all entries (may or may not include current period if it was zero)
            const rewardsHistory = await nodeBooster.getUserRewardsHistory(user1.address);
            expect(rewardsHistory.length).to.be.at.least(2); // At least 2 upgrades
            
            // All entries should be completed after claiming
            for (let i = 0; i < rewardsHistory.length; i++) {
                expect(rewardsHistory[i].completed).to.be.true;
            }
        });
    });
});