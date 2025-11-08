const { ethers } = require("hardhat");

async function main() {
    console.log("Verifying V3 upgrade...");
    
    const proxyAddress = "0xA6E3EF4F07f7D82d6813AaBED4805AFe9FaAa078";
    const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
    const upgraded = Avax0TokenV3.attach(proxyAddress);
    
    // Check version
    const version = await upgraded.version();
    console.log(`Contract version: ${version}`);
    
    // Check gradual release config
    const config = await upgraded.defaultGradualReleaseConfig();
    console.log(`Gradual release config:`);
    console.log(`  Duration: ${config.duration} seconds (${Number(config.duration) / 86400} days)`);
    console.log(`  Interval: ${config.interval} seconds (${Number(config.interval) / 86400} days)`);
    console.log(`  Enabled: ${config.enabled}`);
    
    // Test basic functionality
    const [signer] = await ethers.getSigners();
    const balance = await upgraded.balanceOf(signer.address);
    const availableBalance = await upgraded.getAvailableBalance(signer.address);
    const lockedAmount = await upgraded.getLockedAmount(signer.address);
    
    console.log(`\nAccount status for ${signer.address}:`);
    console.log(`  Total balance: ${ethers.formatEther(balance)} AVAX0`);
    console.log(`  Available balance: ${ethers.formatEther(availableBalance)} AVAX0`);
    console.log(`  Locked amount: ${ethers.formatEther(lockedAmount)} AVAX0`);
    
    // Check detailed balance
    const detailed = await upgraded.getDetailedBalance(signer.address);
    console.log(`\nDetailed balance:`);
    console.log(`  Total: ${ethers.formatEther(detailed.totalBalance)} AVAX0`);
    console.log(`  Currently locked: ${ethers.formatEther(detailed.currentlyLocked)} AVAX0`);
    console.log(`  Available now: ${ethers.formatEther(detailed.availableNow)} AVAX0`);
    console.log(`  Pending release: ${ethers.formatEther(detailed.pendingRelease)} AVAX0`);
    console.log(`  Next release time: ${detailed.nextReleaseTime > 0 ? new Date(Number(detailed.nextReleaseTime) * 1000) : 'N/A'}`);
    
    console.log("\nUpgrade verification completed successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});