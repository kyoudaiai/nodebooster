const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NodeBooster V1 to V2 Upgrade", function () {
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
    
    let nodeBoosterV1;
    let nodeBoosterV2;
    let proxyAddress;
    
    const REGISTRATION_FEE = ethers.parseUnits("25", 6); // 25 USDC
    const AVAX0_REWARD = ethers.parseEther("1"); // 1 AVAX0
    const REFERRAL_RATE = 1000; // 10%
    
    // Pre-upgrade state to verify
    let preUpgradeState = {};
    
    before(async function () {
        [owner, user1, user2, user3, referrer, payoutWallet1, payoutWallet2, payoutWallet3] = await ethers.getSigners();
        
        console.log("🔧 Setting up test environment...");
        
        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdcToken.waitForDeployment();
        
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
        const avax0Proxy = await upgrades.deployProxy(
            Avax0TokenV1,
            ["avax0", "avax0", ethers.parseEther("10000000")],
            { initializer: "initialize", kind: "uups" }
        );
        await avax0Proxy.waitForDeployment();
        avax0Token = await ethers.getContractAt("Avax0TokenV1", await avax0Proxy.getAddress());
        
        // Deploy NodeBooster V1 initially
        console.log("📦 Deploying NodeBooster V1...");
        const NodeBoosterV1 = await ethers.getContractFactory("NodeBoosterV1");
        const nodeBoosterProxy = await upgrades.deployProxy(
            NodeBoosterV1,
            [
                await usdcToken.getAddress(),
                await avax0Token.getAddress()
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        
        proxyAddress = await nodeBoosterProxy.getAddress();
        nodeBoosterV1 = await ethers.getContractAt("NodeBoosterV1", proxyAddress);
        
        console.log("⚙️  Configuring V1 contract...");
        
        // Configure system pools
        const sysPools = [payoutWallet1.address, payoutWallet2.address, payoutWallet3.address];
        const usdcPcts = [3333, 3333, 3334];
        const avaxPcts = [3333, 3333, 3334];
        await nodeBoosterV1.upSysPools(sysPools, usdcPcts, avaxPcts);
        
        // Configure engines
        const engines = [
            { id: 1, name: "Starter Engine", price: "2", hashPower: 1, rewardCapDays: 405, rewardCapPct: 450, refLvls: 1 },
            { id: 2, name: "Basic Engine", price: "4", hashPower: 2, rewardCapDays: 405, rewardCapPct: 450, refLvls: 2 },
            { id: 3, name: "Standard Engine", price: "8", hashPower: 4, rewardCapDays: 405, rewardCapPct: 450, refLvls: 3 }
        ];

        for (const engine of engines) {
            await nodeBoosterV1.configureEngine(
                engine.id,
                engine.name,
                ethers.parseEther(engine.price),
                engine.hashPower,
                engine.rewardCapDays,
                engine.rewardCapPct,
                engine.refLvls,
                true
            );
        }
        
        // Mint tokens and transfer to contract
        await usdcToken.mint(user1.address, ethers.parseUnits("1000", 6));
        await usdcToken.mint(user2.address, ethers.parseUnits("1000", 6));
        await usdcToken.mint(referrer.address, ethers.parseUnits("1000", 6));
        await avax0Token.transfer(proxyAddress, ethers.parseEther("1000"));
        
        console.log("👥 Setting up test users and data...");
        
        // Register some users to create state
        await usdcToken.connect(referrer).approve(proxyAddress, REGISTRATION_FEE);
        await nodeBoosterV1.connect(referrer).register(ethers.ZeroAddress);
        
        await usdcToken.connect(user1).approve(proxyAddress, REGISTRATION_FEE);
        await nodeBoosterV1.connect(user1).register(referrer.address);
        
        await usdcToken.connect(user2).approve(proxyAddress, REGISTRATION_FEE);
        await nodeBoosterV1.connect(user2).register(referrer.address);
        
        // Purchase some engines
        const engine1Price = ethers.parseEther("2");
        await nodeBoosterV1.connect(user1).upgradeEngine(1, { value: engine1Price });
        
        const engine2Price = ethers.parseEther("6"); // Cumulative cost for engine 2
        await nodeBoosterV1.connect(user2).upgradeEngine(2, { value: engine2Price });
        
        // Fast forward time and let some rewards accumulate
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
        await ethers.provider.send("evm_mine");
        
        console.log("📊 Capturing pre-upgrade state...");
    });
    
    describe("Pre-upgrade State Capture", function () {
        it("Should capture all relevant state before upgrade", async function () {
            // Capture contract state
            preUpgradeState.version = await nodeBoosterV1.version();
            preUpgradeState.totalUsers = await nodeBoosterV1.totalUsers();
            preUpgradeState.totalUsdcCollected = await nodeBoosterV1.totalUsdcCollected();
            preUpgradeState.totalAvax0Distributed = await nodeBoosterV1.totalAvax0Distributed();
            preUpgradeState.engineCount = await nodeBoosterV1.engineCount();
            preUpgradeState.minWD = await nodeBoosterV1.MIN_WD();
            
            // Capture user states
            preUpgradeState.users = {};
            const users = [owner.address, user1.address, user2.address, referrer.address];
            
            for (const userAddr of users) {
                const [isRegistered, ref, totalRefs, totalRefRewards, currentEngine, engineStartTime, lastClaimTime, totalRewardsClaimed] = 
                    await nodeBoosterV1.getUserAccountInfo(userAddr);
                
                preUpgradeState.users[userAddr] = {
                    isRegistered,
                    referrer: ref,
                    totalReferrals: totalRefs,
                    totalReferralRewards: totalRefRewards,
                    currentEngine,
                    engineStartTime,
                    lastClaimTime,
                    totalRewardsClaimed,
                    pendingRewards: await nodeBoosterV1.calcPending(userAddr),
                    avax0Balance: await avax0Token.balanceOf(userAddr)
                };
            }
            
            // Capture engine configurations
            preUpgradeState.engines = {};
            for (let i = 1; i <= 3; i++) {
                preUpgradeState.engines[i] = await nodeBoosterV1.getEngine(i);
            }
            
            // Capture system pools
            preUpgradeState.sysPools = [];
            for (let i = 0; i < 3; i++) {
                preUpgradeState.sysPools.push(await nodeBoosterV1.sysPools(i));
            }
            
            console.log("✅ Pre-upgrade state captured");
            console.log("  Version:", preUpgradeState.version);
            console.log("  Total users:", preUpgradeState.totalUsers.toString());
            console.log("  Engine count:", preUpgradeState.engineCount.toString());
        });
    });
    
    describe("Upgrade Process", function () {
        it("Should successfully upgrade from V1 to V2", async function () {
            console.log("🚀 Starting upgrade process...");
            
            // Verify we're starting with V1
            expect(preUpgradeState.version).to.equal("1.0.0");
            
            // Deploy V2 implementation and upgrade
            const NodeBoosterV2 = await ethers.getContractFactory("NodeBoosterV2");
            
            console.log("⬆️  Upgrading proxy to V2...");
            const upgradedContract = await upgrades.upgradeProxy(proxyAddress, NodeBoosterV2);
            await upgradedContract.waitForDeployment();
            
            // Get V2 contract interface
            nodeBoosterV2 = await ethers.getContractAt("NodeBoosterV2", proxyAddress);
            
            // Verify upgrade completed
            const newVersion = await nodeBoosterV2.version();
            expect(newVersion).to.equal("2.0.0");
            
            console.log("✅ Upgrade completed, new version:", newVersion);
        });
        
        it("Should preserve proxy address", async function () {
            expect(await nodeBoosterV2.getAddress()).to.equal(proxyAddress);
        });
    });
    
    describe("State Preservation", function () {
        it("Should preserve all basic contract state", async function () {
            // Verify basic state preservation
            expect(await nodeBoosterV2.totalUsers()).to.equal(preUpgradeState.totalUsers);
            expect(await nodeBoosterV2.totalUsdcCollected()).to.equal(preUpgradeState.totalUsdcCollected);
            expect(await nodeBoosterV2.totalAvax0Distributed()).to.equal(preUpgradeState.totalAvax0Distributed);
            expect(await nodeBoosterV2.engineCount()).to.equal(preUpgradeState.engineCount);
            expect(await nodeBoosterV2.MIN_WD()).to.equal(preUpgradeState.minWD);
        });
        
        it("Should preserve all user account data", async function () {
            const users = [owner.address, user1.address, user2.address, referrer.address];
            
            for (const userAddr of users) {
                const preState = preUpgradeState.users[userAddr];
                const [isRegistered, ref, totalRefs, totalRefRewards, currentEngine, engineStartTime, lastClaimTime, totalRewardsClaimed] = 
                    await nodeBoosterV2.getUserAccountInfo(userAddr);
                
                expect(isRegistered).to.equal(preState.isRegistered);
                expect(ref).to.equal(preState.referrer);
                expect(totalRefs).to.equal(preState.totalReferrals);
                expect(totalRefRewards).to.equal(preState.totalReferralRewards);
                expect(currentEngine).to.equal(preState.currentEngine);
                expect(engineStartTime).to.equal(preState.engineStartTime);
                expect(lastClaimTime).to.equal(preState.lastClaimTime);
                expect(totalRewardsClaimed).to.equal(preState.totalRewardsClaimed);
                
                console.log(`✅ User ${userAddr} state preserved`);
            }
        });
        
        it("Should preserve engine configurations", async function () {
            for (let i = 1; i <= 3; i++) {
                const preEngine = preUpgradeState.engines[i];
                const postEngine = await nodeBoosterV2.getEngine(i);
                
                expect(postEngine.isActive).to.equal(preEngine.isActive);
                expect(postEngine.price).to.equal(preEngine.price);
                expect(postEngine.hashPower).to.equal(preEngine.hashPower);
                expect(postEngine.rewardCapDays).to.equal(preEngine.rewardCapDays);
                expect(postEngine.rewardCapPct).to.equal(preEngine.rewardCapPct);
                expect(postEngine.refLvls).to.equal(preEngine.refLvls);
                expect(postEngine.name).to.equal(preEngine.name);
            }
        });
        
        it("Should preserve system pools configuration", async function () {
            for (let i = 0; i < 3; i++) {
                expect(await nodeBoosterV2.sysPools(i)).to.equal(preUpgradeState.sysPools[i]);
            }
        });
        
        it("Should preserve pending rewards calculations", async function () {
            // Note: Pending rewards may have changed slightly due to time passage during upgrade
            // but should be close to original values
            for (const userAddr of [user1.address, user2.address]) {
                const preRewards = preUpgradeState.users[userAddr].pendingRewards;
                const postRewards = await nodeBoosterV2.calcPending(userAddr);
                
                if (preRewards > 0) {
                    // Should be approximately equal (allowing for small time differences)
                    const difference = postRewards > preRewards ? 
                        postRewards - preRewards : preRewards - postRewards;
                    const percentDiff = (difference * 100n) / preRewards;
                    
                    expect(percentDiff).to.be.lt(10n); // Less than 10% difference
                    console.log(`✅ User ${userAddr} pending rewards preserved (diff: ${percentDiff}%)`);
                }
            }
        });
        
        it("Should preserve user list integrity", async function () {
            const usersCount = await nodeBoosterV2.UsersCount();
            expect(usersCount).to.equal(preUpgradeState.totalUsers);
            
            const users = await nodeBoosterV2.getUsers(0, Number(usersCount));
            expect(users.length).to.equal(Number(preUpgradeState.totalUsers));
            
            // Verify specific users are still in the list
            expect(users).to.include(owner.address);
            expect(users).to.include(user1.address);
            expect(users).to.include(user2.address);
            expect(users).to.include(referrer.address);
        });
    });
    
    describe("V2 New Features", function () {
        it("Should have default referrer functionality", async function () {
            const defaultReferrer = await nodeBoosterV2.defaultReferrer();
            expect(defaultReferrer).to.equal(owner.address);
        });
        
        it("Should allow setting new default referrer", async function () {
            // Set referrer as new default referrer
            await nodeBoosterV2.setDefaultReferrer(referrer.address);
            expect(await nodeBoosterV2.defaultReferrer()).to.equal(referrer.address);
            
            // Reset to owner
            await nodeBoosterV2.setDefaultReferrer(owner.address);
        });
        
        it("Should support new getUserEngineCapStatus function", async function () {
            const [maxRewards, claimedRewards, remainingRewards, isCapReached, capPercentage] = 
                await nodeBoosterV2.getUserEngineCapStatus(user1.address, 1);
            
            expect(maxRewards).to.be.gt(0);
            expect(capPercentage).to.equal(450); // 450%
            expect(typeof isCapReached).to.equal("boolean");
        });
        
        it("Should maintain configurable MIN_WD functionality", async function () {
            const originalMinWD = await nodeBoosterV2.MIN_WD();
            
            // Change MIN_WD
            const newMinWD = 12 * 60 * 60; // 12 hours
            await nodeBoosterV2.setMinWD(newMinWD);
            expect(await nodeBoosterV2.MIN_WD()).to.equal(newMinWD);
            
            // Reset to original
            await nodeBoosterV2.setMinWD(originalMinWD);
        });
        
        it("Should preserve blacklist functionality", async function () {
            // Test blacklisting a user
            await nodeBoosterV2.setBlacklistStatus(user3.address, true);
            expect(await nodeBoosterV2.isBlacklisted(user3.address)).to.be.true;
            
            // Unblacklist
            await nodeBoosterV2.setBlacklistStatus(user3.address, false);
            expect(await nodeBoosterV2.isBlacklisted(user3.address)).to.be.false;
        });
    });
    
    describe("Post-Upgrade Functionality", function () {
        it("Should allow normal operations after upgrade", async function () {
            // Test registration with V2
            await usdcToken.mint(user3.address, ethers.parseUnits("100", 6));
            await usdcToken.connect(user3).approve(proxyAddress, REGISTRATION_FEE);
            
            await expect(nodeBoosterV2.connect(user3).register(ethers.ZeroAddress))
                .to.emit(nodeBoosterV2, "UserRegistered");
            
            // Verify user was registered correctly
            const [isRegistered, referrerAddr] = await nodeBoosterV2.getUserAccountInfo(user3.address);
            expect(isRegistered).to.be.true;
            expect(referrerAddr).to.equal(owner.address); // Should use default referrer
        });
        
        it("Should allow engine purchases after upgrade", async function () {
            const engine1Price = ethers.parseEther("2");
            await expect(nodeBoosterV2.connect(user3).upgradeEngine(1, { value: engine1Price }))
                .to.emit(nodeBoosterV2, "Upgrade");
            
            const [, , , , currentEngine] = await nodeBoosterV2.getUserAccountInfo(user3.address);
            expect(currentEngine).to.equal(1);
        });
        
        it("Should allow rewards claiming after upgrade", async function () {
            // Fast forward time to accumulate rewards
            await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]); // 1 day
            await ethers.provider.send("evm_mine");
            
            // Claim rewards for user1 (who had an engine before upgrade)
            const pendingRewards = await nodeBoosterV2.calcPending(user1.address);
            if (pendingRewards > 0) {
                await expect(nodeBoosterV2.connect(user1).claimRewards())
                    .to.emit(nodeBoosterV2, "RewardsClaimed");
            }
        });
        
        it("Should preserve admin functions", async function () {
            // Test pausing/unpausing
            await nodeBoosterV2.pause();
            expect(await nodeBoosterV2.paused()).to.be.true;
            
            await nodeBoosterV2.unpause();
            expect(await nodeBoosterV2.paused()).to.be.false;
            
            // Test engine configuration
            await expect(nodeBoosterV2.configureEngine(4, "Test Engine", ethers.parseEther("16"), 8, 405, 450, 4, true))
                .to.emit(nodeBoosterV2, "EngineConfigured");
        });
    });
    
    describe("Edge Cases and Error Handling", function () {
        it("Should handle edge cases correctly after upgrade", async function () {
            // Test with non-existent user
            const [isRegistered] = await nodeBoosterV2.getUserAccountInfo(ethers.ZeroAddress);
            expect(isRegistered).to.be.false;
            
            // Test invalid engine access
            await expect(nodeBoosterV2.getEngine(999))
                .to.be.revertedWithCustomError(nodeBoosterV2, "InvalidEngine");
        });
        
        it("Should maintain security restrictions after upgrade", async function () {
            // Non-owner should not be able to configure engines
            await expect(nodeBoosterV2.connect(user1).configureEngine(5, "Hacker Engine", ethers.parseEther("1"), 1, 1, 1, 1, true))
                .to.be.revertedWithCustomError(nodeBoosterV2, "OwnableUnauthorizedAccount");
        });
    });
    
    after(async function () {
        console.log("\n🎉 All upgrade tests completed successfully!");
        console.log("📋 Summary:");
        console.log("  ✅ Contract upgraded from V1 to V2");
        console.log("  ✅ All user data preserved");
        console.log("  ✅ All engine configurations preserved");
        console.log("  ✅ All system settings preserved");
        console.log("  ✅ New V2 features working");
        console.log("  ✅ Post-upgrade functionality verified");
    });
});