const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Deploying Avax0TokenV3...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
    
    // Deploy V3 contract
    const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
    
    // Initial parameters
    const name = "Avax0Token";
    const symbol = "AVAX0";
    const initialSupply = ethers.parseEther("1000000"); // 1M tokens for testing
    
    console.log("Deploying proxy...");
    const token = await upgrades.deployProxy(
        Avax0TokenV3,
        [name, symbol, initialSupply],
        { 
            initializer: "initialize",
            kind: "uups"
        }
    );
    
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    
    console.log("Token deployed to:", tokenAddress);
    console.log("Initial supply:", ethers.formatEther(initialSupply), symbol);
    
    // Initialize V3 features
    console.log("Initializing V3 features...");
    
    // Configuration options:
    const DAY = 24 * 60 * 60;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    
    // Default: 30 days gradual release, daily intervals
    const duration = MONTH;
    const interval = DAY;
    
    const initTx = await token.initializeV3(duration, interval);
    await initTx.wait();
    
    console.log("V3 initialization completed!");
    console.log(`Default gradual release config:`);
    console.log(`  Duration: ${duration / DAY} days`);
    console.log(`  Interval: ${interval / DAY} days`);
    
    // Verify deployment
    console.log("\nVerifying deployment...");
    const version = await token.version();
    const totalSupply = await token.totalSupply();
    const ownerBalance = await token.balanceOf(deployer.address);
    const config = await token.defaultGradualReleaseConfig();
    
    console.log(`Contract version: ${version}`);
    console.log(`Total supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
    console.log(`Owner balance: ${ethers.formatEther(ownerBalance)} ${symbol}`);
    console.log(`Gradual release enabled: ${config.enabled}`);
    
    // Create a test lock to demonstrate functionality
    console.log("\nCreating test time lock...");
    const lockAmount = ethers.parseEther("10000");
    const currentBlock = await ethers.provider.getBlock('latest');
    const releaseTime = currentBlock.timestamp + (WEEK); // Lock for 1 week
    
    // Custom gradual release: 2 weeks duration, 2-day intervals
    const customConfig = {
        duration: 2 * WEEK,
        interval: 2 * DAY,
        enabled: true
    };
    
    const lockTx = await token.createTimeLock(deployer.address, lockAmount, releaseTime, customConfig);
    await lockTx.wait();
    
    console.log(`Test lock created: ${ethers.formatEther(lockAmount)} tokens`);
    console.log(`Release starts: ${new Date(releaseTime * 1000).toISOString()}`);
    console.log(`Gradual release: ${customConfig.duration / DAY} days, ${customConfig.interval / DAY}-day intervals`);
    
    // Show balance information
    const balanceInfo = await token.getDetailedBalance(deployer.address);
    console.log("\nBalance information:");
    console.log(`  Total balance: ${ethers.formatEther(balanceInfo.totalBalance)} ${symbol}`);
    console.log(`  Currently locked: ${ethers.formatEther(balanceInfo.currentlyLocked)} ${symbol}`);
    console.log(`  Available now: ${ethers.formatEther(balanceInfo.availableNow)} ${symbol}`);
    
    console.log("\nDeployment completed successfully!");
    console.log("Contract address:", tokenAddress);
    
    // Save deployment info
    const deploymentInfo = {
        network: network.name,
        contractAddress: tokenAddress,
        deployerAddress: deployer.address,
        version: version,
        timestamp: new Date().toISOString(),
        initialSupply: ethers.formatEther(initialSupply),
        gradualReleaseConfig: {
            duration: `${duration / DAY} days`,
            interval: `${interval / DAY} days`,
            enabled: true
        }
    };
    
    console.log("\nDeployment Info:");
    console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });