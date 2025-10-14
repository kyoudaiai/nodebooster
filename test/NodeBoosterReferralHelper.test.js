const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NodeBooster Referral Helper", function () {
    let nodeBooster, referralHelper, usdcToken, avax0Token;
    let owner, user1, user2, user3, user4, user5;
    let payout1, payout2, payout3;
    
    const REGISTRATION_FEE = ethers.parseUnits("25", 6); // 25 USDC
    const INITIAL_USDC_SUPPLY = ethers.parseUnits("10000", 6); // 10,000 USDC
    const INITIAL_AVAX0_SUPPLY = ethers.parseUnits("10000", 18); // 10,000 AVAX0

    beforeEach(async function () {
        [owner, user1, user2, user3, user4, user5, payout1, payout2, payout3] = await ethers.getSigners();

        // Deploy mock USDC token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdcToken.waitForDeployment();
        
        // Deploy AVAX0 token
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
        const avax0Proxy = await upgrades.deployProxy(
            Avax0TokenV1,
            ["Avax Zero", "AVAX0", INITIAL_AVAX0_SUPPLY],
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
                payout1.address,
                payout2.address,
                payout3.address
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        nodeBooster = await ethers.getContractAt("NodeBoosterV1", await nodeBoosterProxy.getAddress());

        // Deploy Referral Helper
        const ReferralHelper = await ethers.getContractFactory("NodeBoosterReferralHelper");
        referralHelper = await ReferralHelper.deploy(await nodeBooster.getAddress());
        await referralHelper.waitForDeployment();

        // Setup tokens
        await usdcToken.mint(user1.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user2.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user3.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user4.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user5.address, INITIAL_USDC_SUPPLY);

        await avax0Token.transfer(await nodeBooster.getAddress(), INITIAL_AVAX0_SUPPLY);
    });

    describe("Direct Referral Tracking", function () {
        it("Should work with NodeBooster direct referrals", async function () {
            // Register users with referral chain
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user1.address);
            
            // Test direct referrals through main contract
            const directReferrals = await nodeBooster.getDirectReferrals(user1.address);
            expect(directReferrals.length).to.equal(2);
            expect(directReferrals[0]).to.equal(user2.address);
            expect(directReferrals[1]).to.equal(user3.address);
        });
    });

    describe("Multi-Level Helper Functions", function () {
        beforeEach(async function () {
            // Create referral chain: owner -> user1 -> user2 -> user3 -> user4
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress); // user1 -> owner (default referrer)
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user2.address);
            
            await usdcToken.connect(user4).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user4).register(user3.address);

            // Add user5 as second referral to user1 for more complex tree
            await usdcToken.connect(user5).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user5).register(user1.address);
        });

        it("Should get referred users on specific levels using helper", async function () {
            // Level 1 for owner (direct referrals)
            const level1 = await referralHelper.getReferredUsersOnLevel(owner.address, 1);
            expect(level1.length).to.equal(1);
            expect(level1[0]).to.equal(user1.address);
            
            // Level 2 for owner  
            const level2 = await referralHelper.getReferredUsersOnLevel(owner.address, 2);
            expect(level2.length).to.equal(2);
            expect(level2).to.include(user2.address);
            expect(level2).to.include(user5.address);
            
            // Level 3 for owner
            const level3 = await referralHelper.getReferredUsersOnLevel(owner.address, 3);
            expect(level3.length).to.equal(1);
            expect(level3[0]).to.equal(user3.address);
            
            // Level 4 for owner
            const level4 = await referralHelper.getReferredUsersOnLevel(owner.address, 4);
            expect(level4.length).to.equal(1);
            expect(level4[0]).to.equal(user4.address);
        });

        it("Should get all referred users up to specific level", async function () {
            const [allUsers, userLevels] = await referralHelper.getAllReferredUsers(owner.address, 3);
            
            // Should have 1 (level 1) + 2 (level 2) + 1 (level 3) = 4 users
            expect(allUsers.length).to.equal(4);
            expect(userLevels.length).to.equal(4);
            
            // Check that we have the right levels
            const level1Count = userLevels.filter(level => level === 1n).length;
            const level2Count = userLevels.filter(level => level === 2n).length; 
            const level3Count = userLevels.filter(level => level === 3n).length;
            
            expect(level1Count).to.equal(1);
            expect(level2Count).to.equal(2);
            expect(level3Count).to.equal(1);
        });

        it("Should get referral statistics by level", async function () {
            const [levelCounts, totalCount] = await referralHelper.getReferralStatsByLevel(owner.address, 5);
            
            expect(levelCounts.length).to.equal(5);
            expect(levelCounts[0]).to.equal(1); // Level 1: 1 user (user1)
            expect(levelCounts[1]).to.equal(2); // Level 2: 2 users (user2, user5)
            expect(levelCounts[2]).to.equal(1); // Level 3: 1 user (user3)
            expect(levelCounts[3]).to.equal(1); // Level 4: 1 user (user4)
            expect(levelCounts[4]).to.equal(0); // Level 5: 0 users
            
            expect(totalCount).to.equal(5); // Total: 1 + 2 + 1 + 1 = 5 users
        });

        it("Should get referral tree structure", async function () {
            const [users, levels, parents] = await referralHelper.getReferralTree(owner.address, 3);
            
            expect(users.length).to.equal(4); // 1 + 2 + 1 = 4 users up to level 3
            expect(levels.length).to.equal(4);
            expect(parents.length).to.equal(4);
            
            // Check that each user has correct parent
            for (let i = 0; i < users.length; i++) {
                if (levels[i] === 1n) {
                    expect(parents[i]).to.equal(owner.address);
                }
            }
        });

        it("Should handle edge cases", async function () {
            // Test with user who has no referrals
            const emptyLevel1 = await referralHelper.getReferredUsersOnLevel(user4.address, 1);
            expect(emptyLevel1.length).to.equal(0);
            
            // Test invalid levels
            await expect(referralHelper.getReferredUsersOnLevel(owner.address, 0))
                .to.be.revertedWith("Invalid level");
                
            await expect(referralHelper.getReferredUsersOnLevel(owner.address, 11))
                .to.be.revertedWith("Invalid level");
        });
    });

    describe("Integration with NodeBooster", function () {
        it("Should correctly read data from NodeBooster contract", async function () {
            // Register a user
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Check that helper can read user account data
            const [isRegistered, referrer] = await nodeBooster.userAccounts(user1.address);
            expect(isRegistered).to.be.true;
            expect(referrer).to.equal(owner.address); // Default referrer
            
            // Check direct referrals
            const directRefs = await nodeBooster.getDirectReferrals(owner.address);
            expect(directRefs).to.include(user1.address);
        });
    });
});