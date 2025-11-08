const { ethers } = require("hardhat");

async function main() {
    console.log("=== Quick Implementation Deploy ===");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    
    try {
        // Deploy with minimal logging to avoid timeouts
        const Avax0TokenV3 = await ethers.getContractFactory("Avax0TokenV3");
        console.log("Deploying...");
        
        const implementation = await Avax0TokenV3.deploy();
        const address = await implementation.getAddress();
        
        console.log("✅ IMPLEMENTATION ADDRESS:", address);
        console.log("📋 Copy this address to the manual upgrade script!");
        
        // Quick version check
        const version = await implementation.version();
        console.log("Version:", version);
        
    } catch (error) {
        console.error("Deploy failed:", error.message);
    }
}

main().catch(console.error);