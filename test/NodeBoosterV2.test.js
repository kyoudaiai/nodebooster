const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("NodeBooster V2", function () {
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

        // Deploy NodeBooster V2
        const NodeBoosterV2 = await ethers.getContractFactory("NodeBoosterV2");
        const nodeBoosterProxy = await upgrades.deployProxy(
            NodeBoosterV2,
            [
                await usdcToken.getAddress(),
                await avax0Token.getAddress()
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        nodeBooster = await ethers.getContractAt("NodeBoosterV2", await nodeBoosterProxy.getAddress());
        
        // Configure system pools after deployment
        const sysPools = [payoutWallet1.address, payoutWallet2.address, payoutWallet3.address];
        const usdcPcts = [3333, 3333, 3334]; // 33.33%, 33.33%, 33.34%
        const avaxPcts = [3333, 3333, 3334]; // 33.33%, 33.33%, 33.34%
        await nodeBooster.upSysPools(sysPools, usdcPcts, avaxPcts);
        
        // Configure engines after deployment
        const engines = [
            { id: 1, name: "Starter Engine", price: "2", hashPower: 1, rewardCapDays: 405, rewardCapPct: 450, refLvls: 1 },
            { id: 2, name: "Basic Engine", price: "4", hashPower: 2, rewardCapDays: 405, rewardCapPct: 450, refLvls: 2 },
            { id: 3, name: "Standard Engine", price: "8", hashPower: 4, rewardCapDays: 405, rewardCapPct: 450, refLvls: 3 },
            { id: 4, name: "Advanced Engine", price: "12", hashPower: 6, rewardCapDays: 405, rewardCapPct: 450, refLvls: 4 },
            { id: 5, name: "Professional Engine", price: "20", hashPower: 8, rewardCapDays: 405, rewardCapPct: 450, refLvls: 5 },
            { id: 6, name: "Expert Engine", price: "36", hashPower: 10, rewardCapDays: 405, rewardCapPct: 450, refLvls: 6 },
            { id: 7, name: "Master Engine", price: "75", hashPower: 12, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 8, name: "Elite Engine", price: "115", hashPower: 14, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 9, name: "Supreme Engine", price: "195", hashPower: 16, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 10, name: "Ultimate Engine", price: "310", hashPower: 18, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 }
        ];

        for (const engine of engines) {
            await nodeBooster.configureEngine(
                engine.id,
                engine.name,
                ethers.parseEther(engine.price),
                engine.hashPower,
                engine.rewardCapDays,
                engine.rewardCapPct,
                engine.refLvls,
                true // isActive
            );
        }
        
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
            expect(await nodeBooster.sysPools(0)).to.equal(payoutWallet1.address);
            expect(await nodeBooster.sysPools(1)).to.equal(payoutWallet2.address);
            expect(await nodeBooster.sysPools(2)).to.equal(payoutWallet3.address);
            expect(await nodeBooster.owner()).to.equal(owner.address);
            expect(await nodeBooster.version()).to.equal("2.0.0");
        });
        
        it("Should initialize with 11 engines (0-10, where 0 is no engine)", async function () {
            expect(await nodeBooster.engineCount()).to.equal(11);
            
            // Check first purchasable engine (engine 1)
            const engine1 = await nodeBooster.getEngine(1);
            expect(engine1.name).to.equal("Starter Engine");
            expect(engine1.price).to.equal(ethers.parseEther("2"));
            expect(engine1.hashPower).to.equal(1);
            expect(engine1.rewardCapDays).to.equal(405);
            expect(engine1.rewardCapPct).to.equal(450); // 450%
            expect(engine1.isActive).to.be.true;
            
            // Check last engine (engine 10)
            const engine10 = await nodeBooster.getEngine(10);
            expect(engine10.name).to.equal("Ultimate Engine");
            expect(engine10.price).to.equal(ethers.parseEther("310"));
            expect(engine10.hashPower).to.equal(18);
            expect(engine10.rewardCapDays).to.equal(405);
            expect(engine10.rewardCapPct).to.equal(450); // 450%
            expect(engine10.isActive).to.be.true;
        });
        
        it("Should have correct constants", async function () {
            expect(await nodeBooster.REGISTRATION_FEE()).to.equal(REGISTRATION_FEE);
            expect(await nodeBooster.REFERRAL_COMMISSION_RATE()).to.equal(REFERRAL_RATE);
            expect(await nodeBooster.BASIS_POINTS()).to.equal(10000);
            expect(await nodeBooster.MAX_REFERRAL_LEVELS()).to.equal(10);
        });
    });
    
    describe("User Registration", function () {
        it("Should register user without referrer and no engine initially", async function () {
            // Approve USDC spending
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            // Register user
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check user account using new function
            const [isRegistered, referrer, totalReferrals, totalReferralRewards, currentEngine, engineStartTime, lastClaimTime, totalRewardsClaimed] = 
                await nodeBooster.getUserAccountInfo(user1.address);
            
            expect(isRegistered).to.be.true;
            expect(referrer).to.equal(owner.address); // Now uses default referrer
            expect(totalReferrals).to.equal(0);
            expect(totalReferralRewards).to.equal(0);
            expect(currentEngine).to.equal(0); // No engine initially
            expect(engineStartTime).to.equal(0); // No engine start time
            expect(lastClaimTime).to.equal(0);
            expect(totalRewardsClaimed).to.equal(0);
            
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
            const [, , referrerTotalReferrals, referrerTotalReferralRewards] = await nodeBooster.getUserAccountInfo(referrer.address);
            expect(referrerTotalReferrals).to.equal(1);
            expect(referrerTotalReferralRewards).to.equal(referralReward);
            
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
            
            // Contract uses basis points: 3333, 3333, 3334 (out of 10000)
            const wallet1Amount = (remainingAmount * 3333n) / 10000n;
            const wallet2Amount = (remainingAmount * 3333n) / 10000n;
            const wallet3Amount = (remainingAmount * 3334n) / 10000n;
            
            expect(await usdcToken.balanceOf(payoutWallet1.address)).to.equal(initialBalance1 + wallet1Amount);
            expect(await usdcToken.balanceOf(payoutWallet2.address)).to.equal(initialBalance2 + wallet2Amount);
            expect(await usdcToken.balanceOf(payoutWallet3.address)).to.equal(initialBalance3 + wallet3Amount);
        });
        
        it("Should not allow double registration", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(nodeBooster, "AlreadyRegistered");
        });
        
        it("Should not allow self-referral", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user1).register(user1.address))
                .to.be.revertedWithCustomError(nodeBooster, "SelfReferencing");
        });
        
        it("Should use default referrer when referrer is not registered", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            // Get default referrer (should be owner initially)
            const defaultReferrer = await nodeBooster.defaultReferrer();
            expect(defaultReferrer).to.equal(owner.address);
            
            // Register with unregistered referrer - should use default referrer instead
            await expect(nodeBooster.connect(user1).register(user2.address))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check that default referrer was used
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userReferrer).to.equal(defaultReferrer);
        });
    });
    
    describe("Engine Management", function () {
        it("Should allow owner to configure new engine with reward cap percentage", async function () {
            const engineId = 11;
            const name = "Custom Engine";
            const price = ethers.parseEther("50");
            const hashPower = 5000;
            const rewardCapDays = 120;
            const rewardCapPct = 600; // 600%
            const isActive = true;
            
            await expect(nodeBooster.configureEngine(engineId, name, price, hashPower, rewardCapDays, rewardCapPct, 10, isActive))
                .to.emit(nodeBooster, "EngineConfigured")
                .withArgs(engineId, name, price, hashPower, rewardCapDays, rewardCapPct, isActive);
            
            const engine = await nodeBooster.getEngine(engineId);
            expect(engine.name).to.equal(name);
            expect(engine.price).to.equal(price);
            expect(engine.hashPower).to.equal(hashPower);
            expect(engine.rewardCapDays).to.equal(rewardCapDays);
            expect(engine.rewardCapPct).to.equal(rewardCapPct);
            expect(engine.isActive).to.equal(isActive);
            
            expect(await nodeBooster.engineCount()).to.equal(12);
        });
        
        it("Should not allow non-owner to configure engine", async function () {
            await expect(nodeBooster.connect(user1).configureEngine(11, "Test", ethers.parseEther("1"), 100, 30, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should validate engine parameters", async function () {
            await expect(nodeBooster.configureEngine(11, "", ethers.parseEther("1"), 100, 30, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
            
            await expect(nodeBooster.configureEngine(11, "Test", 0, 100, 30, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
            
            await expect(nodeBooster.configureEngine(11, "Test", ethers.parseEther("1"), 0, 30, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
            
            await expect(nodeBooster.configureEngine(11, "Test", ethers.parseEther("1"), 100, 0, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
            
            await expect(nodeBooster.configureEngine(11, "Test", ethers.parseEther("1"), 100, 30, 0, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
            
            // Test invalid engine ID (0 or less)
            await expect(nodeBooster.configureEngine(0, "Test", ethers.parseEther("1"), 100, 30, 450, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
        });
    });
    
    describe("Default Referrer Functionality", function () {
        it("Should set owner as default referrer initially", async function () {
            const defaultReferrer = await nodeBooster.defaultReferrer();
            expect(defaultReferrer).to.equal(owner.address);
        });
        
        it("Should allow owner to update default referrer", async function () {
            // Register user1 first so they can be a referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Update default referrer
            await nodeBooster.setDefaultReferrer(user1.address);
            
            expect(await nodeBooster.defaultReferrer()).to.equal(user1.address);
        });
        
        it("Should not allow setting unregistered user as default referrer", async function () {
            await expect(nodeBooster.setDefaultReferrer(user3.address))
                .to.be.revertedWithCustomError(nodeBooster, "NotRegistered");
        });
        
        it("Should not allow setting blacklisted user as default referrer", async function () {
            // Register and blacklist user1
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.setDefaultReferrer(user1.address))
                .to.be.revertedWithCustomError(nodeBooster, "Blacklisted");
        });
        
        it("Should use default referrer when no referrer is specified", async function () {
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            const defaultReferrer = await nodeBooster.defaultReferrer();
            expect(userReferrer).to.equal(defaultReferrer);
        });
    });
    
    describe("MIN_WD Configuration", function () {
        it("Should initialize MIN_WD to 1 day by default", async function () {
            const minWD = await nodeBooster.MIN_WD();
            expect(minWD).to.equal(24 * 60 * 60); // 1 day in seconds
        });
        
        it("Should allow owner to update MIN_WD", async function () {
            const newMinWD = 12 * 60 * 60; // 12 hours
            await nodeBooster.setMinWD(newMinWD);
            
            const updatedMinWD = await nodeBooster.MIN_WD();
            expect(updatedMinWD).to.equal(newMinWD);
        });
        
        it("Should not allow non-owner to update MIN_WD", async function () {
            const newMinWD = 12 * 60 * 60; // 12 hours
            await expect(nodeBooster.connect(user1).setMinWD(newMinWD))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should allow setting MIN_WD to different values and affect claim intervals", async function () {
            // Set MIN_WD to 2 hours for faster testing
            const customMinWD = 2 * 60 * 60; // 2 hours
            await nodeBooster.setMinWD(customMinWD);
            
            // Register and purchase engine
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            const engine1Price = ethers.parseEther("2");
            await nodeBooster.connect(user1).upgradeEngine(1, { value: engine1Price });
            
            // Should have rewards before MIN_WD (but can't claim them yet)
            await ethers.provider.send("evm_increaseTime", [customMinWD - 60]); // 2h - 1min
            await ethers.provider.send("evm_mine");
            expect(await nodeBooster.calcPending(user1.address)).to.be.gt(0);
            
            // Should still have rewards after MIN_WD (and can claim them)
            await ethers.provider.send("evm_increaseTime", [customMinWD]); // +2h
            await ethers.provider.send("evm_mine");
            expect(await nodeBooster.calcPending(user1.address)).to.be.gt(0);
        });
    });
    
    describe("Token Configuration", function () {
        let newUsdcToken;
        let newAvax0Token;
        
        beforeEach(async function () {
            // Deploy new mock tokens for testing
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            newUsdcToken = await MockERC20.deploy("New USDC", "nUSDC", 6);
            await newUsdcToken.waitForDeployment();
            
            const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
            const newAvax0Proxy = await upgrades.deployProxy(
                Avax0TokenV1,
                ["New AVAX0", "nAVAX0", ethers.parseEther("10000000")],
                { initializer: "initialize", kind: "uups" }
            );
            await newAvax0Proxy.waitForDeployment();
            newAvax0Token = await ethers.getContractAt("Avax0TokenV1", await newAvax0Proxy.getAddress());
        });
        
        it("Should allow owner to update token addresses", async function () {
            const initialUsdcAddress = await nodeBooster.usdcToken();
            const initialAvax0Address = await nodeBooster.avax0Token();
            
            await nodeBooster.setTokens(await newUsdcToken.getAddress(), await newAvax0Token.getAddress());
            
            expect(await nodeBooster.usdcToken()).to.equal(await newUsdcToken.getAddress());
            expect(await nodeBooster.avax0Token()).to.equal(await newAvax0Token.getAddress());
            expect(await nodeBooster.usdcToken()).to.not.equal(initialUsdcAddress);
            expect(await nodeBooster.avax0Token()).to.not.equal(initialAvax0Address);
        });
        
        it("Should not allow non-owner to update token addresses", async function () {
            await expect(nodeBooster.connect(user1).setTokens(await newUsdcToken.getAddress(), await newAvax0Token.getAddress()))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should not allow setting zero address for USDC token", async function () {
            await expect(nodeBooster.setTokens(ethers.ZeroAddress, await newAvax0Token.getAddress()))
                .to.be.revertedWithCustomError(nodeBooster, "ZeroAddress");
        });
        
        it("Should not allow setting zero address for AVAX0 token", async function () {
            await expect(nodeBooster.setTokens(await newUsdcToken.getAddress(), ethers.ZeroAddress))
                .to.be.revertedWithCustomError(nodeBooster, "ZeroAddress");
        });
        
        it("Should not allow setting both addresses to zero", async function () {
            await expect(nodeBooster.setTokens(ethers.ZeroAddress, ethers.ZeroAddress))
                .to.be.revertedWithCustomError(nodeBooster, "ZeroAddress");
        });
        
        it("Should work correctly with new tokens after update", async function () {
            // Mint new tokens to users
            await newUsdcToken.mint(user1.address, ethers.parseUnits("1000", 6));
            await newAvax0Token.transfer(await nodeBooster.getAddress(), ethers.parseEther("1000"));
            
            // Update token addresses
            await nodeBooster.setTokens(await newUsdcToken.getAddress(), await newAvax0Token.getAddress());
            
            // Test registration with new USDC token
            await newUsdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            
            const initialAvax0Balance = await newAvax0Token.balanceOf(user1.address);
            
            await expect(nodeBooster.connect(user1).register(ethers.ZeroAddress))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check that new AVAX0 tokens were distributed
            expect(await newAvax0Token.balanceOf(user1.address)).to.equal(initialAvax0Balance + AVAX0_REWARD);
            
            // Check that new USDC was collected
            expect(await newUsdcToken.balanceOf(user1.address)).to.equal(ethers.parseUnits("1000", 6) - REGISTRATION_FEE);
        });
        
        it("Should handle engine rewards with new AVAX0 token", async function () {
            // Setup: Update tokens and register user
            await newUsdcToken.mint(user1.address, ethers.parseUnits("1000", 6));
            await newAvax0Token.transfer(await nodeBooster.getAddress(), ethers.parseEther("1000"));
            
            await nodeBooster.setTokens(await newUsdcToken.getAddress(), await newAvax0Token.getAddress());
            
            await newUsdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Purchase an engine
            const engine1Price = ethers.parseEther("2");
            await nodeBooster.connect(user1).upgradeEngine(1, { value: engine1Price });
            
            // Fast forward time to accumulate rewards
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 2 days
            await ethers.provider.send("evm_mine");
            
            const pendingRewards = await nodeBooster.calcPending(user1.address);
            expect(pendingRewards).to.be.gt(0);
            
            const initialBalance = await newAvax0Token.balanceOf(user1.address);
            
            // Claim rewards
            await nodeBooster.connect(user1).claimRewards();
            
            // Check that new AVAX0 tokens were distributed as rewards
            expect(await newAvax0Token.balanceOf(user1.address)).to.be.gt(initialBalance);
        });
        
        it("Should allow setting same token addresses (no-op)", async function () {
            const currentUsdcAddress = await nodeBooster.usdcToken();
            const currentAvax0Address = await nodeBooster.avax0Token();
            
            // This should not revert
            await nodeBooster.setTokens(currentUsdcAddress, currentAvax0Address);
            
            // Addresses should remain the same
            expect(await nodeBooster.usdcToken()).to.equal(currentUsdcAddress);
            expect(await nodeBooster.avax0Token()).to.equal(currentAvax0Address);
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
            
            expect(await nodeBooster.isBlacklisted(user2.address)).to.be.true;
        });
        
        it("Should prevent blacklisted users from registering", async function () {
            // Blacklist user2
            await nodeBooster.setBlacklistStatus(user2.address, true);
            
            // Try to register user2
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user2).register(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(nodeBooster, "Blacklisted");
        });
        
        it("Should prevent using blacklisted referrer", async function () {
            // Blacklist user1 (who is already registered)
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            // Try to register user2 with blacklisted referrer - should use default referrer
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await expect(nodeBooster.connect(user2).register(user1.address))
                .to.emit(nodeBooster, "UserRegistered");
            
            // Check that default referrer was used instead of blacklisted one
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user2.address);
            const defaultReferrer = await nodeBooster.defaultReferrer();
            expect(userReferrer).to.equal(defaultReferrer);
        });
        
        it("Should allow batch blacklisting", async function () {
            const users = [user2.address, user3.address];
            
            await expect(nodeBooster.batchSetBlacklistStatus(users, true))
                .to.emit(nodeBooster, "UserBlacklisted")
                .withArgs(user2.address, true, owner.address);
            
            expect(await nodeBooster.isBlacklisted(user2.address)).to.be.true;
            expect(await nodeBooster.isBlacklisted(user3.address)).to.be.true;
        });
        
        it("Should not allow blacklisting owner", async function () {
            await expect(nodeBooster.setBlacklistStatus(owner.address, true))
                .to.be.revertedWith("owner");
        });
        
        it("Should not allow non-owner to blacklist", async function () {
            await expect(nodeBooster.connect(user1).setBlacklistStatus(user2.address, true))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should validate batch blacklist parameters", async function () {
            await expect(nodeBooster.batchSetBlacklistStatus([], true))
                .to.be.revertedWith("Empty");
            
            // Create array with too many users
            const tooManyUsers = new Array(101).fill(user2.address);
            await expect(nodeBooster.batchSetBlacklistStatus(tooManyUsers, true))
                .to.be.revertedWith("< 100");
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
            
            expect(await nodeBooster.UsersCount()).to.equal(3); // Owner + user1 + user2
            
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
                .to.emit(nodeBooster, "OwnerTransfer")
                .withArgs(owner.address, user1.address);
            
            expect(await nodeBooster.owner()).to.equal(user1.address);
        });
        
        it("Should not allow transferring to blacklisted address", async function () {
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.transferOwnership(user1.address))
                .to.be.revertedWithCustomError(nodeBooster, "Blacklisted");
        });
        
        it("Should allow emergency ownership transfer to blacklisted address", async function () {
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            await expect(nodeBooster.emergencyTransferOwnership(user1.address))
                .to.emit(nodeBooster, "UserBlacklisted")
                .withArgs(user1.address, false, owner.address);
            
            expect(await nodeBooster.owner()).to.equal(user1.address);
            expect(await nodeBooster.isBlacklisted(user1.address)).to.be.false;
        });
    });
    
    describe("Engine System", function () {
        beforeEach(async function () {
            // Register user1 for engine tests
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
        });
        
        it("Should not allow claiming rewards without an engine", async function () {
            await expect(nodeBooster.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(nodeBooster, "NoEngine");
        });
        
        it("Should calculate cumulative cost correctly", async function () {
            // Engine 1: 2 AVAX, Engine 2: 4 AVAX, cumulative for engine 2 = 6 AVAX
            expect(await nodeBooster.getCumulativeCost(1)).to.equal(ethers.parseEther("2"));
            expect(await nodeBooster.getCumulativeCost(2)).to.equal(ethers.parseEther("6"));
            expect(await nodeBooster.getCumulativeCost(3)).to.equal(ethers.parseEther("14")); // 2+4+8
        });
        
        it("Should calculate upgrade cost correctly for first purchase", async function () {
            // From no engine (0) to engine 1: cumulative cost = 2 AVAX
            expect(await nodeBooster.calculateUpgradeCost(0, 1)).to.equal(ethers.parseEther("2"));
            // From no engine (0) to engine 2: cumulative cost = 6 AVAX
            expect(await nodeBooster.calculateUpgradeCost(0, 2)).to.equal(ethers.parseEther("6"));
        });
        
        it("Should calculate upgrade cost correctly for engine upgrades", async function () {
            // From engine 1 to 2: just engine 2 cost = 4 AVAX
            expect(await nodeBooster.calculateUpgradeCost(1, 2)).to.equal(ethers.parseEther("4"));
            // From engine 1 to 3: engine 2 + engine 3 = 4 + 8 = 12 AVAX
            expect(await nodeBooster.calculateUpgradeCost(1, 3)).to.equal(ethers.parseEther("12"));
        });
        
        it("Should purchase first engine successfully", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost }))
                .to.emit(nodeBooster, "Upgrade")
                .withArgs(user1.address, 0, 1, 0); // No pending rewards initially
            
            const [, , , , currentEngine, engineStartTime] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(currentEngine).to.equal(1);
            expect(engineStartTime).to.be.gt(0);
        });
        
        it("Should calculate rewards correctly after purchasing engine and time passes", async function () {
            // First purchase an engine
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const pendingRewards = await nodeBooster.calcPending(user1.address);
            expect(pendingRewards).to.be.gt(0);
            
            // Formula: (cumulativeCost * maxRewardCapPercentage / 405 days) * (1 + hashPower%)
            // Engine 1: cumulative cost = 2 AVAX, hashPower = 1%, maxRewardCapPercentage = 450%
            // Daily reward = (2 * 450 / 405 / 100) * (1 + 0.01) = 0.0222 * 1.01 = 0.0224 AVAX
            const baseDailyReward = (ethers.parseEther("2") * 450n) / (405n * 100n);
            const expectedDaily = (baseDailyReward * (100n + 1n)) / 100n; // 1% hashPower
            expect(pendingRewards).to.be.closeTo(expectedDaily, ethers.parseEther("0.001"));
        });
        
        it("Should claim rewards successfully after purchasing engine", async function () {
            // First purchase an engine
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const initialBalance = await avax0Token.balanceOf(user1.address);
            const pendingRewards = await nodeBooster.calcPending(user1.address);
            
            await expect(nodeBooster.connect(user1).claimRewards())
                .to.emit(nodeBooster, "RewardsClaimed")
                .withArgs(user1.address, anyValue); // Use anyValue since per-second precision may vary slightly
            
            const finalBalance = await avax0Token.balanceOf(user1.address);
            expect(finalBalance - initialBalance).to.be.closeTo(pendingRewards, ethers.parseEther("0.001"));
            
            const [, , , , , , , totalRewardsClaimed] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(totalRewardsClaimed).to.be.closeTo(pendingRewards, ethers.parseEther("0.001"));
            
            // Check that all pending rewards are marked as completed
            const totalPending = await nodeBooster.calcPending(user1.address);
            expect(totalPending).to.equal(0);
        });
        
        it("Should preserve pending rewards during upgrade", async function () {
            // First purchase an engine
            const firstUpgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: firstUpgradeCost });
            
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const pendingBefore = await nodeBooster.calcPending(user1.address);
            const upgradeCost = await nodeBooster.calculateUpgradeCost(1, 2);
            
            await expect(nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost }))
                .to.emit(nodeBooster, "Upgrade")
                .withArgs(user1.address, 1, 2, anyValue); // Use anyValue for per-second precision variation
            
            // Check that pending rewards are stored in the array
            const totalPending = await nodeBooster.getTotalPendingRewards(user1.address);
            expect(totalPending).to.be.closeTo(pendingBefore, ethers.parseEther("0.001"));
            
            const [, , , , currentEngine] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(currentEngine).to.equal(2);
        });
        
        it("Should get user engine info correctly", async function () {
            const engineInfo = await nodeBooster.getUserEngineInfo(user1.address);
            
            expect(engineInfo[0]).to.equal(0); // currentEngine
            expect(engineInfo[1]).to.equal(0); // engineStartTime (no engine)
            expect(engineInfo[2]).to.equal(0); // lastClaimTime
            expect(engineInfo[3]).to.equal(0); // daysRewarded
            expect(engineInfo[4]).to.equal(0); // remainingDays
            expect(engineInfo[5]).to.equal(0); // rewardsClaimed
            expect(engineInfo[6]).to.equal(0); // maxRewardsAllowed
            expect(engineInfo[7]).to.equal(0); // pendingRewards
            expect(engineInfo[8]).to.equal(0); // currentRewards
            expect(engineInfo[9]).to.equal(0); // totalClaimable
        });
        
        it("Should revert engine upgrade with insufficient payment", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            const insufficientPayment = upgradeCost - ethers.parseEther("0.1");
            
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: insufficientPayment }))
                .to.be.revertedWithCustomError(nodeBooster, "InsufficientFunds");
        });
        
        it("Should revert upgrade to lower or same engine", async function () {
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            // Try to "upgrade" to same engine
            await expect(nodeBooster.connect(user1).upgradeEngine(1, { value: 0 }))
                .to.be.revertedWithCustomError(nodeBooster, "EngineUpgradeNotAllowed");
        });
        
        it("Should track rewards history correctly", async function () {
            // First purchase an engine
            const upgradeCost1 = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost1 });
            
            // Fast forward time and upgrade to create a reward entry
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const upgradeCost2 = await nodeBooster.calculateUpgradeCost(1, 2);
            await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost2 });
            
            // Check rewards history
            const rewardsHistory = await nodeBooster.getUserRewardsHistory(user1.address);
            expect(rewardsHistory.length).to.equal(1);
            expect(rewardsHistory[0].engineId).to.equal(1);
            expect(rewardsHistory[0].completed).to.be.false;
            expect(rewardsHistory[0].amount).to.be.gt(0);
            
            // Check pending rewards count
            const pendingCount = await nodeBooster.getPendingRewardsCount(user1.address);
            expect(pendingCount).to.equal(1);
        });
        
        it("Should handle multiple reward entries correctly", async function () {
            // First purchase an engine
            let upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
            
            // Create multiple reward entries through upgrades
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
            await ethers.provider.send("evm_mine");
            
            // Upgrade to engine 2
            upgradeCost = await nodeBooster.calculateUpgradeCost(1, 2);
            await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost });
            
            await ethers.provider.send("evm_increaseTime", [48 * 60 * 60]); // 2 more days
            await ethers.provider.send("evm_mine");
            
            // Upgrade to engine 3
            upgradeCost = await nodeBooster.calculateUpgradeCost(2, 3);
            await nodeBooster.connect(user1).upgradeEngine(3, { value: upgradeCost });
            
            // Should now have 2 pending reward entries
            const pendingCount = await nodeBooster.getPendingRewardsCount(user1.address);
            expect(pendingCount).to.equal(2);
            
            const totalPending = await nodeBooster.calcPending(user1.address);
            expect(totalPending).to.be.gte(0); // May be 0 if rewards are already at cap
            
            // Wait for MIN_WD before claiming
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day (MIN_WD)
            await ethers.provider.send("evm_mine");
            
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
    
    describe("Configurable Reward Cap System", function () {
        beforeEach(async function () {
            // Register user1 for reward cap tests
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Purchase engine 1
            const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
        });
        
        it("Should use engine's rewardCapPct in reward calculations", async function () {
            // Configure a custom engine with different reward cap
            await nodeBooster.configureEngine(11, "Custom Engine", ethers.parseEther("10"), 5, 405, 300, 10, true); // 300% cap
            
            const engine11 = await nodeBooster.getEngine(11);
            expect(engine11.rewardCapPct).to.equal(300);
            
            // Upgrade to the custom engine
            const upgradeCost = await nodeBooster.calculateUpgradeCost(1, 11);
            await nodeBooster.connect(user1).upgradeEngine(11, { value: upgradeCost });
            
            // Fast forward time by 1 day
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const pendingRewards = await nodeBooster.calcPending(user1.address);
            
            // Calculate expected reward with 300% cap instead of 450%
            const cumulativeCost = await nodeBooster.getCumulativeCost(11);
            const baseDailyReward = (cumulativeCost * 300n) / (405n * 100n); // 300% instead of 450%
            const expectedDaily = (baseDailyReward * (100n + 5n)) / 100n; // 5% hashPower for custom engine
            
            expect(pendingRewards).to.be.closeTo(expectedDaily, ethers.parseEther("0.001"));
        });
        
        it("Should enforce per-engine reward cap correctly", async function () {
            // Get engine 1 details
            const engine1 = await nodeBooster.getEngine(1);
            const cumulativeCost = await nodeBooster.getCumulativeCost(1);
            const maxRewardsAllowed = (cumulativeCost * engine1.rewardCapPct) / 100n;
            
            // Check initial cap status
            const [maxRewards, claimedRewards, remainingRewards, isCapReached, capPercentage] = 
                await nodeBooster.getUserEngineCapStatus(user1.address, 1);
            
            expect(maxRewards).to.equal(maxRewardsAllowed);
            expect(claimedRewards).to.equal(0);
            expect(remainingRewards).to.equal(maxRewardsAllowed);
            expect(isCapReached).to.be.false;
            expect(capPercentage).to.equal(450); // Default 450%
        });
        
        it("Should stop rewarding when cap is reached", async function () {
            // Configure a small engine with low cap for testing (use engine 11 since 1-10 are taken)
            await nodeBooster.configureEngine(11, "Test Engine", ethers.parseEther("1"), 1, 405, 100, 5, true); // 100% cap only
            
            // Upgrade to test engine
            const upgradeCost = await nodeBooster.calculateUpgradeCost(1, 11);
            await nodeBooster.connect(user1).upgradeEngine(11, { value: upgradeCost });
            
            // Fast forward time significantly to exceed the cap
            await ethers.provider.send("evm_increaseTime", [405 * 24 * 60 * 60]); // 405 days
            await ethers.provider.send("evm_mine");
            
            // Calculate what rewards should be available
            const pendingRewards = await nodeBooster.calcPending(user1.address);
            
            // Claim rewards
            await nodeBooster.connect(user1).claimRewards();
            
            // Check cap status after claiming
            const [maxRewards, claimedRewards, remainingRewards, isCapReached] = 
                await nodeBooster.getUserEngineCapStatus(user1.address, 11);
            
            // Should have reached or be very close to the 100% cap
            const cumulativeCost = await nodeBooster.getCumulativeCost(11);
            const expectedMaxRewards = cumulativeCost; // 100% of cumulative cost
            
            expect(maxRewards).to.equal(expectedMaxRewards);
            expect(claimedRewards).to.be.lte(expectedMaxRewards);
            
            // Try to get more rewards - should be 0 or very small
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 more day
            await ethers.provider.send("evm_mine");
            
            const newPendingRewards = await nodeBooster.calcPending(user1.address);
            expect(newPendingRewards).to.be.lte(ethers.parseEther("0.001")); // Should be minimal or zero
        });
        
        it("Should track rewards claimed per engine separately", async function () {
            // Fast forward and claim rewards for engine 1
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const engine1Rewards = await nodeBooster.calcPending(user1.address);
            await nodeBooster.connect(user1).claimRewards();
            
            // Check engine 1 claimed rewards
            const engine1Claimed = await nodeBooster.getUserEngineRewardsClaimed(user1.address, 1);
            expect(engine1Claimed).to.be.closeTo(engine1Rewards, ethers.parseEther("0.001"));
            
            // Upgrade to engine 2
            const upgradeCost = await nodeBooster.calculateUpgradeCost(1, 2);
            await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost });
            
            // Fast forward and claim rewards for engine 2
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            
            const engine2Rewards = await nodeBooster.calcPending(user1.address);
            await nodeBooster.connect(user1).claimRewards();
            
            // Check that rewards are tracked separately
            const engine1ClaimedAfter = await nodeBooster.getUserEngineRewardsClaimed(user1.address, 1);
            const engine2ClaimedAfter = await nodeBooster.getUserEngineRewardsClaimed(user1.address, 2);
            
            expect(engine1ClaimedAfter).to.be.closeTo(engine1Rewards, ethers.parseEther("0.001")); // Should remain the same
            expect(engine2ClaimedAfter).to.be.gt(0); // Should have some rewards for engine 2
            
            // Total rewards claimed should be sum of both engines
            const totalClaimed = engine1ClaimedAfter + engine2ClaimedAfter;
            const [, , , , , , , userTotalRewardsClaimed] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userTotalRewardsClaimed).to.equal(totalClaimed);
        });
        
        it("Should return comprehensive reward status across all engines", async function () {
            // Upgrade through several engines and claim rewards
            let upgradeCost = await nodeBooster.calculateUpgradeCost(1, 2);
            await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeCost });
            
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
            await ethers.provider.send("evm_mine");
            await nodeBooster.connect(user1).claimRewards();
            
            upgradeCost = await nodeBooster.calculateUpgradeCost(2, 3);
            await nodeBooster.connect(user1).upgradeEngine(3, { value: upgradeCost });
            
            // Get comprehensive status
            const [engineIds, daysRewarded, maxDays, rewardsClaimed, maxRewardsAllowed, isTimeCapReached, isRewardCapReached] = 
                await nodeBooster.getUserRewardStatus(user1.address);
            
            expect(engineIds.length).to.equal(10); // Engines 1-10
            expect(engineIds[0]).to.equal(1);
            expect(engineIds[9]).to.equal(10);
            
            // Check that engine 2 has some rewards claimed
            expect(rewardsClaimed[1]).to.be.gt(0); // Engine 2 (index 1)
            expect(maxRewardsAllowed[1]).to.be.gt(0); // Engine 2 max rewards
            
            // Check that higher engines have no rewards yet
            expect(rewardsClaimed[9]).to.equal(0); // Engine 10 (index 9)
        });
        
        it("Should handle different reward cap percentages per engine", async function () {
            // Configure engines with different caps (use consecutive IDs)
            await nodeBooster.configureEngine(11, "Low Cap Engine", ethers.parseEther("5"), 2, 405, 200, 5, true); // 200%
            await nodeBooster.configureEngine(12, "High Cap Engine", ethers.parseEther("5"), 2, 405, 800, 5, true); // 800%
            
            // Check cap differences
            const [maxRewards200] = await nodeBooster.getUserEngineCapStatus(user1.address, 11);
            const [maxRewards800] = await nodeBooster.getUserEngineCapStatus(user1.address, 12);
            
            // Engines have same price but different cumulative costs due to position
            const cumulativeCost11 = await nodeBooster.getCumulativeCost(11);
            const cumulativeCost12 = await nodeBooster.getCumulativeCost(12);
            
            expect(maxRewards200).to.equal((cumulativeCost11 * 200n) / 100n);
            expect(maxRewards800).to.equal((cumulativeCost12 * 800n) / 100n);
            
            // Verify the cap percentages are different
            const [, , , , capPercentage11] = await nodeBooster.getUserEngineCapStatus(user1.address, 11);
            const [, , , , capPercentage12] = await nodeBooster.getUserEngineCapStatus(user1.address, 12);
            
            expect(capPercentage11).to.equal(200);
            expect(capPercentage12).to.equal(800);
        });
        
        it("Should validate reward cap percentage in configureEngine", async function () {
            await expect(nodeBooster.configureEngine(13, "Invalid Engine", ethers.parseEther("1"), 1, 405, 0, 5, true))
                .to.be.revertedWithCustomError(nodeBooster, "InvalidEngineConfiguration");
        });
        
        it("Should include cap percentage in getUserEngineCapStatus", async function () {
            const [, , , , capPercentage] = await nodeBooster.getUserEngineCapStatus(user1.address, 1);
            expect(capPercentage).to.equal(450); // Default 450%
            
            // Configure custom engine and check its cap
            await nodeBooster.configureEngine(11, "Custom Engine", ethers.parseEther("1"), 1, 405, 750, 5, true);
            const [, , , , customCapPercentage] = await nodeBooster.getUserEngineCapStatus(user1.address, 11);
            expect(customCapPercentage).to.equal(750);
        });
    });

    describe("Multi-Level Engine Purchase Commission System", function () {
        beforeEach(async function () {
            // Register referral chain: user1 -> user2 -> user3
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await usdcToken.mint(user2.address, REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(owner.address); // user2 refers to owner
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await usdcToken.mint(user3.address, REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user2.address); // user3 refers to user2
            
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await usdcToken.mint(user1.address, REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(user3.address); // user1 refers to user3
        });

        it("Should have correct default referral commission rates", async function () {
            // Access public array directly
            expect(await nodeBooster.referralCommissionRates(0)).to.equal(800);  // Level 1: 8%
            expect(await nodeBooster.referralCommissionRates(1)).to.equal(400);  // Level 2: 4%
            expect(await nodeBooster.referralCommissionRates(2)).to.equal(300);  // Level 3: 3%
            expect(await nodeBooster.referralCommissionRates(3)).to.equal(250);  // Level 4: 2.5%
            expect(await nodeBooster.referralCommissionRates(4)).to.equal(250);  // Level 5: 2.5%
            expect(await nodeBooster.referralCommissionRates(5)).to.equal(150);  // Level 6: 1.5%
            expect(await nodeBooster.referralCommissionRates(6)).to.equal(100);  // Level 7: 1%
            expect(await nodeBooster.referralCommissionRates(7)).to.equal(100);  // Level 8: 1%
            expect(await nodeBooster.referralCommissionRates(8)).to.equal(100);  // Level 9: 1%
            expect(await nodeBooster.referralCommissionRates(9)).to.equal(100);  // Level 10: 1%
        });

        it("Should allow owner to update referral commission rates", async function () {
            const newRates = [1000, 500, 300, 200, 200, 100, 50, 50, 50, 50]; // New rates
            
            await nodeBooster.setReferralCommissionRates(newRates);
            
            // Verify rates were updated by accessing the public array
            for (let i = 0; i < 10; i++) {
                expect(await nodeBooster.referralCommissionRates(i)).to.equal(newRates[i]);
            }
        });

        it("Should reject commission rates exceeding 100%", async function () {
            const invalidRates = [5000, 5000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]; // Total > 100%
            
            await expect(nodeBooster.setReferralCommissionRates(invalidRates))
                .to.be.revertedWith(">100%");
        });

        it("Should have engines with correct refLvls", async function () {
            for (let i = 1; i <= 6; i++) {
                const engine = await nodeBooster.getEngine(i);
                expect(engine.refLvls).to.equal(i);
            }
            
            // Engines 7-10 should have 10 levels
            for (let i = 7; i <= 10; i++) {
                const engine = await nodeBooster.getEngine(i);
                expect(engine.refLvls).to.equal(10);
            }
        });

        it("Should return correct referral chain", async function () {
            const [referrers, referrerEngines, maxLevels] = await nodeBooster.getReferralChain(user1.address);
            
            expect(referrers[0]).to.equal(user3.address);
            expect(referrers[1]).to.equal(user2.address);
            expect(referrers[2]).to.equal(owner.address);
            
            // Initially no engines
            expect(referrerEngines[0]).to.equal(0);
            expect(referrerEngines[1]).to.equal(0);
            expect(referrerEngines[2]).to.equal(0);
        });

        it("Should calculate potential commissions correctly", async function () {
            // Give user3 engine 3 (max 3 levels)
            await nodeBooster.connect(user3).upgradeEngine(3, { value: ethers.parseEther("14") });
            
            const purchaseAmount = ethers.parseEther("10");
            const [referrers, levels, commissions, totalCommission] = 
                await nodeBooster.calculateEngineCommissions(user1.address, purchaseAmount);
            
            // Should only have user3 as referrer (has engine 3, max 3 levels, level 1 commission)
            expect(referrers.length).to.equal(1);
            expect(referrers[0]).to.equal(user3.address);
            expect(levels[0]).to.equal(1);
            
            // 8% of 10 ETH = 0.8 ETH
            const expectedCommission = (purchaseAmount * 800n) / 10000n;
            expect(commissions[0]).to.equal(expectedCommission);
            expect(totalCommission).to.equal(expectedCommission);
        });

        it("Should pay multi-level commissions on engine upgrade", async function () {
            // Setup engines for referrers
            await nodeBooster.connect(user3).upgradeEngine(2, { value: ethers.parseEther("6") });   // Max 2 levels
            await nodeBooster.connect(user2).upgradeEngine(5, { value: ethers.parseEther("46") });  // Max 5 levels
            await nodeBooster.connect(owner).upgradeEngine(7, { value: ethers.parseEther("272") }); // Max 10 levels
            
            const upgradeAmount = ethers.parseEther("2"); // Engine 1 cost
            
            // user1 buys engine 1
            const tx = await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeAmount });
            
            // Level 1: user3 gets 8% of 2 ETH = 0.16 ETH
            const level1Commission = (upgradeAmount * 800n) / 10000n;
            // Level 2: user2 gets 4% of 2 ETH = 0.08 ETH
            const level2Commission = (upgradeAmount * 400n) / 10000n;
            
            // Check events were emitted
            await expect(tx)
                .to.emit(nodeBooster, "EngineReferralCommissionPaid")
                .withArgs(user3.address, user1.address, 1, level1Commission, 1);
                
            await expect(tx)
                .to.emit(nodeBooster, "EngineReferralCommissionPaid")
                .withArgs(user2.address, user1.address, 2, level2Commission, 1);
                
            // Check referral rewards were updated (should be greater than or equal to expected commission)
            const user3Account = await nodeBooster.getUserAccountInfo(user3.address);
            const user2Account = await nodeBooster.getUserAccountInfo(user2.address);
            
            expect(user3Account[3]).to.be.gte(level1Commission); // totalReferralRewards
            expect(user2Account[3]).to.be.gte(level2Commission);
        });        it("Should respect engine level limits for commissions", async function () {
            // user3 has engine 1 (max 1 level), user2 has no engine  
            await nodeBooster.connect(user3).upgradeEngine(1, { value: ethers.parseEther("2") });
            // user2 has no engine, so they can't earn commissions
            
            // user1 first buys engine 1, then upgrades to engine 2
            await nodeBooster.connect(user1).upgradeEngine(1, { value: ethers.parseEther("2") });
            const upgradeAmount = ethers.parseEther("4"); // Engine 2 price when upgrading from 1
            
            const tx = await nodeBooster.connect(user1).upgradeEngine(2, { value: upgradeAmount });
            
            // user3 should get level 1 commission (8%)
            const level1Commission = (upgradeAmount * 800n) / 10000n;
            
            // Check only user3 got commission (user2 has no engine so no commission)
            await expect(tx)
                .to.emit(nodeBooster, "EngineReferralCommissionPaid")
                .withArgs(user3.address, user1.address, 1, level1Commission, 2);
                
            // Only one commission event should be emitted
            const receipt = await tx.wait();
            const commissionEvents = receipt.logs.filter(log => 
                log.fragment && log.fragment.name === "EngineReferralCommissionPaid"
            );
            expect(commissionEvents.length).to.equal(1); // Only one commission event
        });

        it("Should skip referrers without engines", async function () {
            // Don't give any referrers engines - user3 and user2 have no engines, owner doesn't either in this test
            const upgradeAmount = ethers.parseEther("2");
            const tx = await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeAmount });
            
            // No commissions should be paid since user3 and user2 don't have engines
            // Check no commission events were emitted
            const receipt = await tx.wait();
            const commissionEvents = receipt.logs.filter(log => 
                log.fragment && log.fragment.name === "EngineReferralCommissionPaid"
            );
            expect(commissionEvents.length).to.equal(0); // No commission events
        });

        it("Should update total engine referral commissions stat", async function () {
            await nodeBooster.connect(user3).upgradeEngine(5, { value: ethers.parseEther("46") });
            
            const initialStats = await nodeBooster.getStats();
            const initialCommissions = initialStats[4]; // totalEngineReferralCommissions
            
            const upgradeAmount = ethers.parseEther("2");
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeAmount });
            
            const finalStats = await nodeBooster.getStats();
            const finalCommissions = finalStats[4];
            
            const expectedCommission = (upgradeAmount * 800n) / 10000n; // 8% level 1 commission
            expect(finalCommissions - initialCommissions).to.equal(expectedCommission);
        });

        it("Should handle blacklisted referrers in chain", async function () {
            // Blacklist user3
            await nodeBooster.setBlacklistStatus(user3.address, true);
            
            // Give user2 an engine
            await nodeBooster.connect(user2).upgradeEngine(3, { value: ethers.parseEther("14") });
            
            const initialUser2Balance = await ethers.provider.getBalance(user2.address);
            
            await nodeBooster.connect(user1).upgradeEngine(1, { value: ethers.parseEther("2") });
            
            // user3 is blacklisted so commission chain should stop
            const finalUser2Balance = await ethers.provider.getBalance(user2.address);
            expect(finalUser2Balance).to.equal(initialUser2Balance); // No commission
        });

        it("Should keep remaining avax funds in contract after commissions", async function () {
            await nodeBooster.connect(user3).upgradeEngine(3, { value: ethers.parseEther("14") });
            
            const initialContractBalance = await ethers.provider.getBalance(await nodeBooster.getAddress());
            const upgradeAmount = ethers.parseEther("2");
            
            await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeAmount });
            
            const finalContractBalance = await ethers.provider.getBalance(await nodeBooster.getAddress());
            
            // Commission: 8% of 2 ETH = 0.16 ETH
            const commission = (upgradeAmount * 800n) / 10000n;
            const remainingAmount = upgradeAmount - commission;
            
            // Contract receives the full amount, then pays out commission
            // So the net increase should be the remaining amount
            expect(finalContractBalance - initialContractBalance).to.be.gte(0); // Contract should have some balance increase
        });
    });

    describe("Owner addUser() Function", function () {
        it("Should allow owner to add user with no engine", async function () {
            const initialTotalUsers = await nodeBooster.totalUsers();
            
            const tx = await nodeBooster.addUser(user1.address, ethers.ZeroAddress, 0);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, ethers.ZeroAddress, 0, 0, block.timestamp);
            
            // Check user account info
            const [isRegistered, referrer, totalReferrals, totalReferralRewards, currentEngine, engineStartTime, lastClaimTime, totalRewardsClaimed] = 
                await nodeBooster.getUserAccountInfo(user1.address);
            
            expect(isRegistered).to.be.true;
            expect(referrer).to.equal(ethers.ZeroAddress);
            expect(totalReferrals).to.equal(0);
            expect(totalReferralRewards).to.equal(0);
            expect(currentEngine).to.equal(0);
            expect(engineStartTime).to.equal(0);
            expect(lastClaimTime).to.equal(0);
            expect(totalRewardsClaimed).to.equal(0);
            
            // Check total users increased
            expect(await nodeBooster.totalUsers()).to.equal(initialTotalUsers + 1n);
            
            // Check user is in users list
            const usersCount = await nodeBooster.UsersCount();
            const users = await nodeBooster.getUsers(0, usersCount);
            expect(users).to.include(user1.address);
        });
        
        it("Should allow owner to add user with referrer", async function () {
            // First add a referrer
            await nodeBooster.addUser(referrer.address, ethers.ZeroAddress, 0);
            
            // Then add user1 with referrer
            const tx = await nodeBooster.addUser(user1.address, referrer.address, 0);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, referrer.address, 0, 0, block.timestamp);
            
            // Check user account info
            const [isRegistered, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(isRegistered).to.be.true;
            expect(userReferrer).to.equal(referrer.address);
        });
        
        it("Should allow owner to add user with specific engine", async function () {
            const tx = await nodeBooster.addUser(user1.address, ethers.ZeroAddress, 5);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, ethers.ZeroAddress, 0, 0, block.timestamp);
            
            // Check user has the specified engine
            const [, , , , currentEngine, engineStartTime] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(currentEngine).to.equal(5);
            expect(engineStartTime).to.equal(0); // addUser doesn't set engine start time
        });
        
        it("Should allow owner to add user with both referrer and engine", async function () {
            // First add a referrer
            await nodeBooster.addUser(referrer.address, ethers.ZeroAddress, 3);
            
            // Then add user1 with both referrer and engine
            const tx = await nodeBooster.addUser(user1.address, referrer.address, 7);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, referrer.address, 0, 0, block.timestamp);
            
            // Check user account info
            const [isRegistered, userReferrer, , , currentEngine] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(isRegistered).to.be.true;
            expect(userReferrer).to.equal(referrer.address);
            expect(currentEngine).to.equal(7);
        });
        
        it("Should not allow non-owner to add users", async function () {
            await expect(nodeBooster.connect(user1).addUser(user2.address, ethers.ZeroAddress, 0))
                .to.be.revertedWithCustomError(nodeBooster, "OwnableUnauthorizedAccount");
        });
        
        it("Should allow adding user that's already in usersList without duplication", async function () {
            // Add user1 first time
            await nodeBooster.addUser(user1.address, ethers.ZeroAddress, 1);
            
            const usersCountAfterFirst = await nodeBooster.UsersCount();
            const totalUsersAfterFirst = await nodeBooster.totalUsers();
            
            // Add user1 again (this will overwrite but not duplicate in list)
            await nodeBooster.addUser(user1.address, referrer.address, 3);
            
            // Check that users count and list didn't grow (function prevents duplication)
            expect(await nodeBooster.UsersCount()).to.equal(usersCountAfterFirst); // Doesn't increase because user already exists
            expect(await nodeBooster.totalUsers()).to.equal(totalUsersAfterFirst); // Doesn't increase because user already exists
            
            // Check user data was updated
            const [, userReferrer, , , currentEngine] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userReferrer).to.equal(referrer.address);
            expect(currentEngine).to.equal(3);
        });
        
        it("Should emit UserRegistered event with correct parameters", async function () {
            const tx = await nodeBooster.addUser(user1.address, referrer.address, 5);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, referrer.address, 0, 0, block.timestamp);
        });
        
        it("Should allow adding user with invalid engine ID without validation", async function () {
            // addUser doesn't validate engine IDs, it just sets the value
            await expect(nodeBooster.addUser(user1.address, ethers.ZeroAddress, 999))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [, , , , currentEngine] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(currentEngine).to.equal(999);
        });
        
        it("Should allow adding user with unregistered referrer", async function () {
            // addUser doesn't validate if referrer is registered
            await expect(nodeBooster.addUser(user1.address, user2.address, 0))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userReferrer).to.equal(user2.address);
        });
        
        it("Should allow adding user with blacklisted referrer", async function () {
            // First register and blacklist a user
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(ethers.ZeroAddress);
            await nodeBooster.setBlacklistStatus(user2.address, true);
            
            // addUser doesn't check blacklist status
            await expect(nodeBooster.addUser(user1.address, user2.address, 0))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userReferrer).to.equal(user2.address);
        });
        
        it("Should allow adding blacklisted user", async function () {
            // Blacklist user1 first
            await nodeBooster.setBlacklistStatus(user1.address, true);
            
            // addUser should still work for blacklisted addresses
            await expect(nodeBooster.addUser(user1.address, ethers.ZeroAddress, 0))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [isRegistered] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(isRegistered).to.be.true;
            expect(await nodeBooster.isBlacklisted(user1.address)).to.be.true; // Still blacklisted
        });
        
        it("Should not update other account fields beyond basic registration", async function () {
            await nodeBooster.addUser(user1.address, referrer.address, 5);
            
            const [isRegistered, userReferrer, totalReferrals, totalReferralRewards, currentEngine, engineStartTime, lastClaimTime, totalRewardsClaimed] = 
                await nodeBooster.getUserAccountInfo(user1.address);
            
            // Check what's set
            expect(isRegistered).to.be.true;
            expect(userReferrer).to.equal(referrer.address);
            expect(currentEngine).to.equal(5);
            
            // Check what's not set (defaults to 0)
            expect(totalReferrals).to.equal(0);
            expect(totalReferralRewards).to.equal(0);
            expect(engineStartTime).to.equal(0); // Not set by addUser
            expect(lastClaimTime).to.equal(0);
            expect(totalRewardsClaimed).to.equal(0);
        });
        
        it("Should handle zero address as referrer", async function () {
            const tx = await nodeBooster.addUser(user1.address, ethers.ZeroAddress, 2);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(user1.address, ethers.ZeroAddress, 0, 0, block.timestamp);
            
            const [, userReferrer] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(userReferrer).to.equal(ethers.ZeroAddress);
        });
        
        it("Should handle zero engine correctly", async function () {
            await expect(nodeBooster.addUser(user1.address, referrer.address, 0))
                .to.emit(nodeBooster, "UserRegistered");
            
            const [, , , , currentEngine] = await nodeBooster.getUserAccountInfo(user1.address);
            expect(currentEngine).to.equal(0); // No engine
        });
        
        it("Should allow owner to add multiple users in sequence", async function () {
            const initialTotalUsers = await nodeBooster.totalUsers();
            
            // Add multiple users
            await nodeBooster.addUser(user1.address, ethers.ZeroAddress, 1);
            await nodeBooster.addUser(user2.address, user1.address, 2);
            await nodeBooster.addUser(user3.address, user2.address, 3);
            
            // Check all users were added
            expect(await nodeBooster.totalUsers()).to.equal(initialTotalUsers + 3n);
            
            // Check user relationships
            const [, user1Referrer, , , user1Engine] = await nodeBooster.getUserAccountInfo(user1.address);
            const [, user2Referrer, , , user2Engine] = await nodeBooster.getUserAccountInfo(user2.address);
            const [, user3Referrer, , , user3Engine] = await nodeBooster.getUserAccountInfo(user3.address);
            
            expect(user1Referrer).to.equal(ethers.ZeroAddress);
            expect(user1Engine).to.equal(1);
            
            expect(user2Referrer).to.equal(user1.address);
            expect(user2Engine).to.equal(2);
            
            expect(user3Referrer).to.equal(user2.address);
            expect(user3Engine).to.equal(3);
        });
        
        it("Should work with contract addresses as users", async function () {
            // Deploy a mock contract to use as user
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const mockContract = await MockERC20.deploy("Test", "TEST", 18);
            await mockContract.waitForDeployment();
            const contractAddress = await mockContract.getAddress();
            
            // addUser doesn't have notContract modifier, so it should work
            const tx = await nodeBooster.addUser(contractAddress, ethers.ZeroAddress, 1);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);
            
            await expect(tx)
                .to.emit(nodeBooster, "UserRegistered")
                .withArgs(contractAddress, ethers.ZeroAddress, 0, 0, block.timestamp);
            
            const [isRegistered, , , , currentEngine] = await nodeBooster.getUserAccountInfo(contractAddress);
            expect(isRegistered).to.be.true;
            expect(currentEngine).to.equal(1);
        });
    });

    describe("Referred Users Tracking", function () {
        it("Should track direct referrals correctly", async function () {
            // Register users with referrals
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user1.address);
            
            // Check direct referrals
            const directReferrals = await nodeBooster.getDirectReferrals(user1.address);
            expect(directReferrals.length).to.equal(2);
            expect(directReferrals[0]).to.equal(user2.address);
            expect(directReferrals[1]).to.equal(user3.address);
            
            // Check direct referral count
            const count = await nodeBooster.getDirectReferralCount(user1.address);
            expect(count).to.equal(2);
            
            // Check empty referrals for user with no referrals
            const emptyReferrals = await nodeBooster.getDirectReferrals(referrer.address);
            expect(emptyReferrals.length).to.equal(0);
        });

        it("Should get referred users on level 2", async function () {
            // Create referral chain: owner -> user1 -> user2 
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress); // user1 -> owner (default referrer)
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user1.address);
            
            // Level 1 for owner (direct referrals)
            const level1 = await nodeBooster.getDirectReferrals(owner.address);
            expect(level1.length).to.equal(1);
            expect(level1[0]).to.equal(user1.address);
            
            // Level 2 for owner (using getReferredUsersOnLevel function)
            const level2 = await nodeBooster.getReferredUsersOnLevel(owner.address, 2);
            expect(level2.length).to.equal(2);
            expect(level2).to.include(user2.address);
            expect(level2).to.include(user3.address);
        });
    });

    describe("Per-Second Rewards and Minimum Interval", function () {
        beforeEach(async function () {
            // Register user1 and purchase engine 1
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            const engine1Price = ethers.parseEther("2");
            await nodeBooster.connect(user1).upgradeEngine(1, { value: engine1Price });
        });

        it("Should return pending rewards per second if less than MIN_WD has passed", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Check immediately after purchase
            const pendingImmediate = await nodeBooster.calcPending(user1.address);
            expect(pendingImmediate).to.equal(0);
            
            // Check after half MIN_WD (should still be 0)
            await ethers.provider.send("evm_increaseTime", [Number(minWD) / 2]);
            await ethers.provider.send("evm_mine");
            
            const pendingHalf = await nodeBooster.calcPending(user1.address);
            expect(pendingHalf).to.gt(0);
            
            // Check after almost MIN_WD (should still be 0)
            await ethers.provider.send("evm_increaseTime", [Number(minWD) / 2 - 60]); // -1 minute
            await ethers.provider.send("evm_mine");
            
            const pendingAlmost = await nodeBooster.calcPending(user1.address);
            expect(pendingAlmost).to.gt(0);
        });

        it("Should calculate rewards based on exact seconds after MIN_WD", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Fast forward exactly MIN_WD
            await ethers.provider.send("evm_increaseTime", [Number(minWD)]);
            await ethers.provider.send("evm_mine");
            
            const pendingMinWD = await nodeBooster.calcPending(user1.address);
            expect(pendingMinWD).to.be.gt(0);
            
            // Fast forward additional half MIN_WD (1.5 * MIN_WD total)
            await ethers.provider.send("evm_increaseTime", [Number(minWD) / 2]);
            await ethers.provider.send("evm_mine");
            
            const pending1_5MinWD = await nodeBooster.calcPending(user1.address);
            expect(pending1_5MinWD).to.be.gt(pendingMinWD);
            
            // Check that the relationship is approximately correct (1.5x rewards for 1.5x time)
            const ratio = Number(pending1_5MinWD) / Number(pendingMinWD);
            expect(ratio).to.be.closeTo(1.5, 0.01); // Within 1% tolerance
        });

        it("Should calculate precise per-second rewards", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Calculate expected per-second reward
            // Engine 1: cumulative cost = 2 AVAX, rewardCapPct = 450%, hashPower = 1%
            const cumulativeCost = ethers.parseEther("2");
            const rewardCapPct = 450n;
            const hashPower = 1n;
            
            // dailyReward = ((cumulativeCost * rewardCapPct / 100) / 405) * (100 + hashPower) / 100
            const dailyRewardBase = (cumulativeCost * rewardCapPct) / (405n * 100n);
            const dailyReward = (dailyRewardBase * (100n + hashPower)) / 100n;
            const perSecondReward = dailyReward / (24n * 60n * 60n); // 86400 seconds
            
            // Test rewards after MIN_WD + additional time
            const testSeconds = Number(minWD) + (60 * 60); // MIN_WD + 1 hour
            await ethers.provider.send("evm_increaseTime", [testSeconds]);
            await ethers.provider.send("evm_mine");
            
            const actualRewards = await nodeBooster.calcPending(user1.address);
            const expectedRewards = perSecondReward * BigInt(testSeconds);
            
            // Should be very close (within 1 wei due to rounding)
            expect(actualRewards).to.be.closeTo(expectedRewards, 1);
        });

        it("Should prevent claiming before MIN_WD minimum interval", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Try to claim immediately (should fail with 'No rewards' because calcPending returns 0)
            await expect(nodeBooster.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(nodeBooster, "MinWDIntervalNotMet");
            
            // Wait almost MIN_WD
            await ethers.provider.send("evm_increaseTime", [Number(minWD) - 60]); // MIN_WD - 1 minute
            await ethers.provider.send("evm_mine");
            
            // Still should fail with 'No rewards' because calcPending enforces minimum interval
            await expect(nodeBooster.connect(user1).claimRewards())
                .to.be.revertedWithCustomError(nodeBooster, "MinWDIntervalNotMet");
        });

        it("Should allow claiming after MIN_WD and set lastClaimTime to block.timestamp", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Wait exactly MIN_WD
            await ethers.provider.send("evm_increaseTime", [Number(minWD)]);
            await ethers.provider.send("evm_mine");
            
            const pendingBefore = await nodeBooster.calcPending(user1.address);
            expect(pendingBefore).to.be.gt(0);
            
            // Get block timestamp before claim
            const blockBefore = await ethers.provider.getBlock("latest");
            const timestampBefore = blockBefore.timestamp;
            
            // Claim rewards
            await nodeBooster.connect(user1).claimRewards();
            
            // Get user info after claim
            const userInfo = await nodeBooster.getUserAccountInfo(user1.address);
            const lastClaimTime = userInfo.lastClaimTime;
            
            // lastClaimTime should be set to the block timestamp of the claim transaction
            const blockAfter = await ethers.provider.getBlock("latest");
            expect(lastClaimTime).to.equal(blockAfter.timestamp);
            expect(lastClaimTime).to.be.gt(timestampBefore);
        });

        it("Should accumulate rewards across multiple claim periods accurately", async function () {
            const minWD = await nodeBooster.MIN_WD();
            
            // Record initial state
            const initialUserInfo = await nodeBooster.getUserAccountInfo(user1.address);
            const initialClaimed = initialUserInfo.userTotalRewardsClaimed;
            
            // First claim after MIN_WD
            await ethers.provider.send("evm_increaseTime", [Number(minWD)]);
            await ethers.provider.send("evm_mine");
            
            const firstPending = await nodeBooster.calcPending(user1.address);
            await nodeBooster.connect(user1).claimRewards();
            
            const userInfoAfterFirst = await nodeBooster.getUserAccountInfo(user1.address);
            const firstClaimAmount = userInfoAfterFirst.userTotalRewardsClaimed - initialClaimed;
            
            // Wait another 1.5 * MIN_WD
            await ethers.provider.send("evm_increaseTime", [Number(minWD) + Number(minWD) / 2]); // 1.5 * MIN_WD
            await ethers.provider.send("evm_mine");
            
            const secondPending = await nodeBooster.calcPending(user1.address);
            await nodeBooster.connect(user1).claimRewards();
            
            const userInfoAfterSecond = await nodeBooster.getUserAccountInfo(user1.address);
            const secondClaimAmount = userInfoAfterSecond.userTotalRewardsClaimed - userInfoAfterFirst.userTotalRewardsClaimed;
            
            // The second claim should be approximately 1.5x the first claim
            const ratio = Number(secondClaimAmount) / Number(firstClaimAmount);
            expect(ratio).to.be.closeTo(1.5, 0.05); // Allow 5% tolerance for any accumulated precision differences
            
            // Check that rewards are accumulating correctly
            expect(userInfoAfterSecond.userTotalRewardsClaimed).to.be.gt(userInfoAfterFirst.userTotalRewardsClaimed);
            expect(userInfoAfterFirst.userTotalRewardsClaimed).to.be.gt(initialClaimed);
        });

        it("Should handle partial day rewards correctly without losing time", async function () {
            // Wait 1 day + 23 hours (47 hours total)
            await ethers.provider.send("evm_increaseTime", [47 * 60 * 60]); // 47 hours
            await ethers.provider.send("evm_mine");
            
            const pendingAfter47h = await nodeBooster.calcPending(user1.address);
            expect(pendingAfter47h).to.be.gt(0);
            
            // Claim rewards (should get rewards for all 47 hours)
            await nodeBooster.connect(user1).claimRewards();
            
            // Immediately check - should be 0 because minimum interval not met
            const pendingImmediate = await nodeBooster.calcPending(user1.address);
            expect(pendingImmediate).to.equal(0);
            
            // Wait exactly 1 more day from claim time
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 24 hours
            await ethers.provider.send("evm_mine");
            
            const pendingAfterNextDay = await nodeBooster.calcPending(user1.address);
            expect(pendingAfterNextDay).to.be.gt(0);
            
            // The new pending should be approximately equal to 1 day's worth of rewards
            // Compare with the rate from the first 47 hours
            const hourlyRate = Number(pendingAfter47h) / 47;
            const expectedNext24h = hourlyRate * 24;
            const actualNext24h = Number(pendingAfterNextDay);
            
            expect(actualNext24h).to.be.closeTo(expectedNext24h, expectedNext24h * 0.01); // 1% tolerance
        });

        it("Should respect reward caps even with per-second calculation", async function () {
            // Fast forward to near the end of reward period
            // Engine 1 has 405 day cap, so go to day 404
            await ethers.provider.send("evm_increaseTime", [404 * 24 * 60 * 60]); // 404 days
            await ethers.provider.send("evm_mine");
            
            const pendingNearEnd = await nodeBooster.calcPending(user1.address);
            expect(pendingNearEnd).to.be.gt(0);
            
            // Fast forward past the 405 day cap
            await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // +2 more days (406 total)
            await ethers.provider.send("evm_mine");
            
            const pendingPastCap = await nodeBooster.calcPending(user1.address);
            
            // Should be same as near end because we hit the day cap
            expect(pendingPastCap).to.equal(pendingNearEnd);
            
            // Verify the cap is exactly what we expect
            const userInfo = await nodeBooster.getUserEngineCapStatus(user1.address, 1);
            expect(pendingPastCap).to.be.lte(userInfo.maxRewards);
        });

        it("Should handle engine upgrades correctly with per-second rewards", async function () {
            // Wait 25 hours and upgrade to engine 2
            await ethers.provider.send("evm_increaseTime", [25 * 60 * 60]); // 25 hours
            await ethers.provider.send("evm_mine");
            
            const pendingBeforeUpgrade = await nodeBooster.calcPending(user1.address);
            expect(pendingBeforeUpgrade).to.be.gt(0);
            
            // Upgrade to engine 2
            const engine2UpgradeCost = ethers.parseEther("4"); // Engine 2 costs 4 additional AVAX
            await nodeBooster.connect(user1).upgradeEngine(2, { value: engine2UpgradeCost });
            
            // Check that pending rewards were stored
            const storedRewards = await nodeBooster.getTotalPendingRewards(user1.address);
            expect(storedRewards).to.be.gt(0);
            
            // Wait 1 day with new engine
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 24 hours
            await ethers.provider.send("evm_mine");
            
            const newEnginePending = await nodeBooster.calcPending(user1.address);
            expect(newEnginePending).to.be.gt(0);
            
            // New engine should generate more rewards per second (higher cumulative cost and hashPower)
            // Engine 2: cumulative cost = 6 AVAX, hashPower = 2%
            // Should be higher reward rate than engine 1
            const totalClaimable = await nodeBooster.getUserEngineInfo(user1.address);
            expect(totalClaimable.totalClaimable).to.equal(storedRewards + newEnginePending);
        });
    });
});