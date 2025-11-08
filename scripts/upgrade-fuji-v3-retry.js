const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Avax0TokenV3 Upgrade Script - Fuji Network (with retry logic) ===");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Check network connectivity
    try {
        const balance = await deployer.provider.getBalance(deployer.address);
        console.log("Deployer balance:", hre.ethers.formatEther(balance), "AVAX");
        
        const network = await deployer.provider.getNetwork();
        console.log("Connected to network:", network.name, "chainId:", network.chainId);
        
    } catch (error) {
        console.log("Network connectivity issue:", error.message);
        throw error;
    }
    
    const proxyAddress = process.env.AVAX0_fuji;
    if (!proxyAddress) {
        throw new Error("AVAX0_fuji not found in .env file");
    }
    
    console.log("Proxy address:", proxyAddress);
    
    // Pre-upgrade verification
    console.log("\n=== Pre-Upgrade Verification ===");
    const currentContract = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
    
    const version = await currentContract.version();
    console.log("Current version:", version);
    
    const owner = await currentContract.owner();
    console.log("Current owner:", owner);
    
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
        throw new Error(`Deployer ${deployer.address} is not the contract owner ${owner}`);
    }
    
    // Deploy new implementation with retry
    console.log("\n=== Deploying Fixed V3 Implementation ===");
    
    const Avax0TokenV3Fixed = await hre.ethers.getContractFactory("Avax0TokenV3");
    
    let upgradedContract;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`Attempt ${retryCount + 1}/${maxRetries}: Upgrading proxy...`);
            
            // Set higher gas limit and gas price for better reliability
            const upgradeOptions = {
                gasLimit: 3000000,
                gasPrice: hre.ethers.parseUnits("30", "gwei")
            };
            
            upgradedContract = await hre.upgrades.upgradeProxy(
                proxyAddress, 
                Avax0TokenV3Fixed,
                { 
                    txOverrides: upgradeOptions,
                    timeout: 120000 // 2 minutes timeout
                }
            );
            
            console.log("✅ Upgrade transaction sent");
            
            // Wait for confirmation with timeout
            await upgradedContract.waitForDeployment();
            console.log("✅ Upgrade confirmed");
            break;
            
        } catch (error) {
            retryCount++;
            console.log(`❌ Attempt ${retryCount} failed:`, error.message);
            
            if (retryCount >= maxRetries) {
                throw new Error(`Upgrade failed after ${maxRetries} attempts: ${error.message}`);
            }
            
            console.log(`Waiting 10 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    // Post-upgrade verification
    console.log("\n=== Post-Upgrade Verification ===");
    
    const newVersion = await upgradedContract.version();
    console.log("New version:", newVersion);
    
    // Test the fixed function
    console.log("\n=== Testing Fixed Functions ===");
    
    const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    
    // Test 3-parameter function
    try {
        console.log("Testing 3-parameter createTimeLock...");
        const gasEstimate = await upgradedContract['createTimeLock(address,uint256,uint256)'].estimateGas(
            testAccount, 
            hre.ethers.parseEther("1"), 
            Math.floor(Date.now() / 1000) + 3600
        );
        console.log("✅ 3-parameter function gas estimate succeeded:", gasEstimate.toString());
        
    } catch (error) {
        console.log("❌ 3-parameter function still broken:", error.message);
    }
    
    // Test 4-parameter function
    try {
        console.log("Testing 4-parameter createTimeLock...");
        const emptyConfig = { duration: 0, interval: 0, enabled: false };
        const gasEstimate = await upgradedContract['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'].estimateGas(
            testAccount, 
            hre.ethers.parseEther("1"), 
            Math.floor(Date.now() / 1000) + 3600,
            emptyConfig
        );
        console.log("✅ 4-parameter function gas estimate succeeded:", gasEstimate.toString());
        
    } catch (error) {
        console.log("❌ 4-parameter function failed:", error.message);
    }
    
    console.log("\n=== Upgrade Complete ===");
    console.log("✅ Avax0TokenV3 upgraded successfully on Fuji");
    console.log("Proxy address:", proxyAddress);
    console.log("Fixed struct initialization bug");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    });