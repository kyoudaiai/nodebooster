const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("Starting Avax0TokenV2 to V3 upgrade...");
    
    // Get the existing proxy address (you would replace this with your actual deployed proxy address)
    const PROXY_ADDRESS = process.env.AVAX0_AVALANCHE_PROXY_ADDRESS || "YOUR_PROXY_ADDRESS_HERE";
    
    if (PROXY_ADDRESS === "YOUR_PROXY_ADDRESS_HERE") {
        console.log("Please set AVAX0_AVALANCHE_PROXY_ADDRESS environment variable to your deployed proxy address");
        console.log("Usage: AVAX0_AVALANCHE_PROXY_ADDRESS=0x... npx hardhat run scripts/upgradeToV3.js --network <network>");
        return;
    }
    
    console.log(`Upgrading proxy at address: ${PROXY_ADDRESS}`);
    
    // Get the contract factory for V3
    const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
    
    console.log("Upgrading to V3...");
    const upgraded = await upgrades.upgradeProxy(PROXY_ADDRESS, Avax0TokenV3);
    await upgraded.waitForDeployment();
    
    console.log("Upgrade completed!");
    console.log(`Proxy address: ${await upgraded.getAddress()}`);
    
    // Initialize V3 features
    console.log("Initializing V3 features...");
    
    // Default configuration: 30 days gradual release, daily intervals
    const MONTH = 30 * 24 * 60 * 60; // 30 days in seconds
    const DAY = 24 * 60 * 60; // 1 day in seconds
    
    try {
        const tx = await upgraded.initializeV3(MONTH, DAY);
        await tx.wait();
        console.log("V3 initialization completed!");
        console.log(`Default gradual release: 30 days duration, 1 day intervals`);
    } catch (error) {
        if (error.message.includes("already initialized")) {
            console.log("V3 already initialized, skipping...");
        } else {
            console.error("Error during V3 initialization:", error.message);
            throw error;
        }
    }
    
    // Verify the upgrade
    console.log("Verifying upgrade...");
    const version = await upgraded.version();
    console.log(`Contract version: ${version}`);
    
    const config = await upgraded.defaultGradualReleaseConfig();
    console.log(`Gradual release config:`);
    console.log(`  Duration: ${config.duration} seconds (${config.duration / DAY} days)`);
    console.log(`  Interval: ${config.interval} seconds (${config.interval / DAY} days)`);
    console.log(`  Enabled: ${config.enabled}`);
    
    console.log("Upgrade verification completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    });