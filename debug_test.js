// Debug the specific failing test
const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Debug Reward Calculation", function () {
    let nodeBooster, avax0Token, usdcToken;
    let owner, user1;
    
    const REGISTRATION_FEE = ethers.parseUnits("25", 6); // 25 USDC

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();

        // Deploy USDC mock
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);

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
                await avax0Token.getAddress()
            ],
            { initializer: "initialize", kind: "uups" }
        );
        await nodeBoosterProxy.waitForDeployment();
        nodeBooster = await ethers.getContractAt("NodeBoosterV1", await nodeBoosterProxy.getAddress());

        // Set up system pools
        await nodeBooster.upSysPools(
            [owner.address, owner.address, owner.address, owner.address, owner.address],
            [20, 20, 20, 20, 20], // Equal 20% split
            [20, 20, 20, 20, 20]  // Equal 20% split
        );

        // Mint tokens
        await usdcToken.mint(user1.address, ethers.parseUnits("1000", 6));
        await avax0Token.mint(await nodeBooster.getAddress(), ethers.parseEther("1000000"));

        // Register user1 for reward cap tests
        await usdcToken.connect(user1).approve(await nodeBooster.getAddress(), REGISTRATION_FEE);
        await nodeBooster.connect(user1).register(ethers.ZeroAddress);
        
        console.log("User registered");

        // Purchase engine 1
        const upgradeCost = await nodeBooster.calculateUpgradeCost(0, 1);
        console.log("Upgrade cost from 0 to 1:", ethers.formatEther(upgradeCost), "AVAX");
        await nodeBooster.connect(user1).upgradeEngine(1, { value: upgradeCost });
        
        console.log("Engine 1 purchased");
        
        // Check user's engine
        const userInfo = await nodeBooster.getUserEngineInfo(user1.address);
        console.log("User current engine:", userInfo.currentEngine.toString());
    });

    it("Should debug engine 11 reward calculation", async function () {
        // Configure a custom engine with different reward cap
        await nodeBooster.configureEngine(11, "Custom Engine", ethers.parseEther("10"), 5, 405, 300, 10, true); // 300% cap

        const engine11 = await nodeBooster.getEngine(11);
        console.log("Engine 11 configured:", engine11);

        // Upgrade to the custom engine
        const upgradeCost = await nodeBooster.calculateUpgradeCost(1, 11);
        console.log("Upgrade cost from 1 to 11:", ethers.formatEther(upgradeCost), "AVAX");
        
        await nodeBooster.connect(user1).upgradeEngine(11, { value: upgradeCost });
        console.log("Upgraded to engine 11");
        
        // Check user's engine after upgrade
        const userInfo = await nodeBooster.getUserEngineInfo(user1.address);
        console.log("User current engine after upgrade:", userInfo.currentEngine.toString());

        // Fast forward time by 1 day
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
        await ethers.provider.send("evm_mine");
        console.log("Fast forwarded 1 day");

        const pendingRewards = await nodeBooster.calcPending(user1.address);
        console.log("Pending rewards (calcPending):", ethers.formatEther(pendingRewards), "AVAX0");
        
        const pendingRewards2 = await nodeBooster.getTotalPendingRewards(user1.address);
        console.log("Pending rewards (getTotalPendingRewards):", ethers.formatEther(pendingRewards2), "AVAX0");

        // Calculate expected reward with 300% cap instead of 450%
        const cumulativeCost = await nodeBooster.getCumulativeCost(11);
        console.log("Cumulative cost for engine 11:", ethers.formatEther(cumulativeCost), "AVAX");
        
        const baseDailyReward = (cumulativeCost * 300n) / (405n * 100n); // 300% instead of 450%
        console.log("Base daily reward:", ethers.formatEther(baseDailyReward), "AVAX0");
        
        const expectedDaily = (baseDailyReward * (100n + 5n)) / 100n; // 5% hashPower for custom engine
        console.log("Expected daily reward:", ethers.formatEther(expectedDaily), "AVAX0");

        console.log("Test expects pending ≈ expected:", ethers.formatEther(expectedDaily));
        console.log("Actually got:", ethers.formatEther(pendingRewards));
    });
});