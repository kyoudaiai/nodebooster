const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Deploying NodeBooster for debugging...");
    
    const [deployer, user1] = await ethers.getSigners();
    
    // Deploy tokens first
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
    
    const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
    const avax0Token = await upgrades.deployProxy(Avax0TokenV1, ["avax0", "avax0", ethers.parseEther("10000000")], { initializer: 'initialize' });
    
    // Deploy NodeBooster
    const NodeBoosterV1 = await ethers.getContractFactory("NodeBoosterV1");
    const nodeBooster = await upgrades.deployProxy(
        NodeBoosterV1,
        [usdcToken.target, avax0Token.target],
        { initializer: 'initialize' }
    );
    
    await nodeBooster.upSysPools(
        [deployer.address, deployer.address, deployer.address, deployer.address, deployer.address],
        [20, 20, 20, 20, 20], // Equal 20% split
        [20, 20, 20, 20, 20]  // Equal 20% split
    );
    
    // Mint tokens to avax0 contract for rewards
    await avax0Token.mint(nodeBooster.target, ethers.parseEther("1000000"));
    
    // Register user
    await usdcToken.mint(user1.address, ethers.parseUnits("1000", 6));
    console.log("USDC balance:", await usdcToken.balanceOf(user1.address));
    
    await usdcToken.connect(user1).approve(nodeBooster.target, ethers.parseUnits("1000", 6));
    console.log("USDC allowance:", await usdcToken.allowance(user1.address, nodeBooster.target));
    
    await nodeBooster.connect(user1).register(deployer.address);
    
    console.log("User1 registered");
    
    // Check initial engine
    const userInfo = await nodeBooster.getUserEngineInfo(user1.address);
    console.log("Initial engine:", userInfo.currentEngine.toString());
    
    // Check upgrade cost from current engine to 1
    const upgradeCost = await nodeBooster.calculateUpgradeCost(userInfo.currentEngine, 1);
    console.log("Upgrade cost from", userInfo.currentEngine.toString(), "to 1:", ethers.formatEther(upgradeCost), "AVAX");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});