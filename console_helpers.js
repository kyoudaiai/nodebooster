// Console Commands for Debugging createTimeLock

// First, let's find the correct proxy address from recent deployments
const hre = require("hardhat");

// Method 1: Check if there's a deployment artifact
async function findProxyAddress() {
    try {
        // This will look for recent deployment artifacts
        const fs = require('fs');
        const path = require('path');
        
        // Check if there are any deployment logs or artifacts
        const artifactsPath = path.join(__dirname, 'artifacts');
        const cacheePath = path.join(__dirname, 'cache');
        
        console.log("Looking for deployment information...");
        
        // You can also manually specify the address if known
        const knownProxyAddress = "0xACcc92eD7DAb8402aAF23CDcb55ae7BdA559826e";
        
        const [deployer] = await hre.ethers.getSigners();
        const avax0 = await hre.ethers.getContractAt("Avax0TokenV3", knownProxyAddress);
        
        // Test if this is a valid contract
        try {
            const version = await avax0.version();
            console.log("Contract version:", version);
            console.log("Proxy address confirmed:", knownProxyAddress);
            return { address: knownProxyAddress, contract: avax0 };
        } catch (error) {
            console.log("Error connecting to known address:", error.message);
            return null;
        }
        
    } catch (error) {
        console.log("Error finding proxy:", error.message);
        return null;
    }
}

// Method 2: Deploy a fresh contract for testing (if needed)
async function deployFreshForTesting() {
    console.log("Deploying fresh contract for testing...");
    
    const [deployer] = await hre.ethers.getSigners();
    
    // Deploy V1 first
    const Avax0TokenV1 = await hre.ethers.getContractFactory("Avax0Token");
    const tokenV1 = await hre.upgrades.deployProxy(
        Avax0TokenV1,
        ["Test AVAX Token", "TAVAX", hre.ethers.parseEther("1000000")],
        { initializer: 'initialize' }
    );
    await tokenV1.waitForDeployment();
    
    const proxyAddress = await tokenV1.getAddress();
    console.log("Fresh V1 deployed at:", proxyAddress);
    
    // Upgrade to V2
    const Avax0TokenV2 = await hre.ethers.getContractFactory("Avax0TokenV1");
    const tokenV2 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
    console.log("Upgraded to V2");
    
    // Upgrade to V3
    const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
    const tokenV3 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
    await tokenV3.initializeV3(30 * 24 * 60 * 60, 24 * 60 * 60); // 30 days, 1 day intervals
    
    console.log("Upgraded to V3");
    
    return { address: proxyAddress, contract: tokenV3 };
}

module.exports = { findProxyAddress, deployFreshForTesting };