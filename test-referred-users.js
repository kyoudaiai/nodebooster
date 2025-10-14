const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NodeBooster V1 - Referred Users Functionality", function () {
    let nodeBooster, usdcToken, avax0Token;
    let owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10;
    let payout1, payout2, payout3, payout4, payout5;
    
    const REGISTRATION_FEE = ethers.parseUnits("25", 6); // 25 USDC
    const INITIAL_USDC_SUPPLY = ethers.parseUnits("100000", 6); // 100,000 USDC
    const INITIAL_AVAX0_SUPPLY = ethers.parseUnits("100000", 18); // 100,000 AVAX0

    beforeEach(async function () {
        [owner, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10, payout1, payout2, payout3, payout4, payout5] = await ethers.getSigners();

        // Deploy mock USDC token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        
        // Deploy AVAX0 token (use V1 for simplicity)
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
                payout3.address,
                payout4.address,
                payout5.address
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        nodeBooster = await ethers.getContractAt("NodeBoosterV1", await nodeBoosterProxy.getAddress());

        // Mint USDC to users for testing
        await usdcToken.mint(user1.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user2.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user3.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user4.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user5.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user6.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user7.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user8.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user9.address, INITIAL_USDC_SUPPLY);
        await usdcToken.mint(user10.address, INITIAL_USDC_SUPPLY);

        // Transfer AVAX0 tokens to NodeBooster contract
        await avax0Token.transfer(await nodeBooster.getAddress(), INITIAL_AVAX0_SUPPLY);
    });

    describe("Direct Referrals (Level 1)", function () {
        it("Should track direct referrals correctly", async function () {
            // Register user1 without referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Register user2 with user1 as referrer
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            // Register user3 with user1 as referrer
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
        });

        it("Should return empty array for user with no referrals", async function () {
            // Register user1 without referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            const directReferrals = await nodeBooster.getDirectReferrals(user1.address);
            expect(directReferrals.length).to.equal(0);
            
            const count = await nodeBooster.getDirectReferralCount(user1.address);
            expect(count).to.equal(0);
        });
    });

    describe("Multi-Level Referrals", function () {
        beforeEach(async function () {
            // Create a referral chain: owner -> user1 -> user2 -> user3 -> user4 -> user5
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress); // user1 uses default referrer (owner)
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user2.address);
            
            await usdcToken.connect(user4).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user4).register(user3.address);
            
            await usdcToken.connect(user5).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user5).register(user4.address);

            // Add some users at level 2 and 3 for owner
            await usdcToken.connect(user6).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user6).register(user1.address); // Level 2 for owner
            
            await usdcToken.connect(user7).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user7).register(user2.address); // Level 3 for owner
            
            await usdcToken.connect(user8).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user8).register(user2.address); // Level 3 for owner
        });

        it("Should get referred users on specific levels", async function () {
            // Level 1 for owner (direct referrals)
            const level1 = await nodeBooster.getReferredUsersOnLevel(owner.address, 1);
            expect(level1.length).to.equal(1);
            expect(level1[0]).to.equal(user1.address);
            
            // Level 2 for owner
            const level2 = await nodeBooster.getReferredUsersOnLevel(owner.address, 2);
            expect(level2.length).to.equal(2);
            expect(level2).to.include(user2.address);
            expect(level2).to.include(user6.address);
            
            // Level 3 for owner
            const level3 = await nodeBooster.getReferredUsersOnLevel(owner.address, 3);
            expect(level3.length).to.equal(3);
            expect(level3).to.include(user3.address);
            expect(level3).to.include(user7.address);
            expect(level3).to.include(user8.address);
        });

        it("Should get all referred users up to specific level", async function () {
            const [allUsers, userLevels] = await nodeBooster.getAllReferredUsers(owner.address, 3);
            
            expect(allUsers.length).to.equal(6); // 1 + 2 + 3 = 6 users
            expect(userLevels.length).to.equal(6);
            
            // Check level 1 users
            expect(allUsers[0]).to.equal(user1.address);
            expect(userLevels[0]).to.equal(1);
            
            // Check that level 2 users have level 2
            const level2Indices = [];
            for (let i = 0; i < userLevels.length; i++) {
                if (userLevels[i] === 2n) {
                    level2Indices.push(i);
                }
            }
            expect(level2Indices.length).to.equal(2);
        });

        it("Should get referral statistics by level", async function () {
            const [levelCounts, totalCount] = await nodeBooster.getReferralStatsByLevel(owner.address, 5);
            
            expect(levelCounts.length).to.equal(5);
            expect(levelCounts[0]).to.equal(1); // Level 1: 1 user
            expect(levelCounts[1]).to.equal(2); // Level 2: 2 users
            expect(levelCounts[2]).to.equal(3); // Level 3: 3 users
            expect(levelCounts[3]).to.equal(1); // Level 4: 1 user (user4)
            expect(levelCounts[4]).to.equal(1); // Level 5: 1 user (user5)
            
            expect(totalCount).to.equal(8); // Total: 1 + 2 + 3 + 1 + 1 = 8 users
        });

        it("Should handle invalid level parameters", async function () {
            await expect(nodeBooster.getReferredUsersOnLevel(owner.address, 0))
                .to.be.revertedWith("Invalid level");
            
            await expect(nodeBooster.getReferredUsersOnLevel(owner.address, 11))
                .to.be.revertedWith("Invalid level");
                
            await expect(nodeBooster.getAllReferredUsers(owner.address, 0))
                .to.be.revertedWith("Invalid max level");
                
            await expect(nodeBooster.getAllReferredUsers(owner.address, 11))
                .to.be.revertedWith("Invalid max level");
        });
    });

    describe("Edge Cases", function () {
        it("Should handle users with no referrals at any level", async function () {
            // Register user1 without referrer
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            // Check levels 1-3 for user1 (who has no referrals)
            for (let level = 1; level <= 3; level++) {
                const levelUsers = await nodeBooster.getReferredUsersOnLevel(user1.address, level);
                expect(levelUsers.length).to.equal(0);
            }
            
            const [allUsers, userLevels] = await nodeBooster.getAllReferredUsers(user1.address, 3);
            expect(allUsers.length).to.equal(0);
            expect(userLevels.length).to.equal(0);
            
            const [levelCounts, totalCount] = await nodeBooster.getReferralStatsByLevel(user1.address, 3);
            expect(totalCount).to.equal(0);
            for (let i = 0; i < levelCounts.length; i++) {
                expect(levelCounts[i]).to.equal(0);
            }
        });

        it("Should work with complex referral tree", async function () {
            // Create a more complex tree
            // owner -> user1
            // user1 -> user2, user3
            // user2 -> user4, user5
            // user3 -> user6
            
            await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user1).register(ethers.ZeroAddress);
            
            await usdcToken.connect(user2).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user2).register(user1.address);
            
            await usdcToken.connect(user3).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user3).register(user1.address);
            
            await usdcToken.connect(user4).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user4).register(user2.address);
            
            await usdcToken.connect(user5).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user5).register(user2.address);
            
            await usdcToken.connect(user6).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
            await nodeBooster.connect(user6).register(user3.address);
            
            // Check owner's referral tree
            const level1 = await nodeBooster.getReferredUsersOnLevel(owner.address, 1);
            expect(level1.length).to.equal(1); // user1
            
            const level2 = await nodeBooster.getReferredUsersOnLevel(owner.address, 2);
            expect(level2.length).to.equal(2); // user2, user3
            
            const level3 = await nodeBooster.getReferredUsersOnLevel(owner.address, 3);
            expect(level3.length).to.equal(3); // user4, user5, user6
            
            // Check user1's direct referrals
            const user1Level1 = await nodeBooster.getReferredUsersOnLevel(user1.address, 1);
            expect(user1Level1.length).to.equal(2); // user2, user3
            expect(user1Level1).to.include(user2.address);
            expect(user1Level1).to.include(user3.address);
        });
    });
});