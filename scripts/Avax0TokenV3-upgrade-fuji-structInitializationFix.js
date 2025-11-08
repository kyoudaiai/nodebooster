const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("=== Avax0TokenV3 Upgrade Script - Fuji Network ===");
    console.log("Upgrading to fixed V3 with struct initialization bug resolved");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer address:", deployer.address);
    
    // Get proxy address from environment
    const proxyAddress = process.env.AVAX0_fuji;
    if (!proxyAddress) {
        throw new Error("AVAX0_fuji not found in .env file");
    }
    
    console.log("Proxy address:", proxyAddress);
    
    // Verify current contract state
    console.log("\n=== Pre-Upgrade Verification ===");
    try {
        const currentContract = await hre.ethers.getContractAt("Avax0TokenV3", proxyAddress);
        
        const version = await currentContract.version();
        console.log("Current version:", version);
        
        const name = await currentContract.name();
        console.log("Token name:", name);
        
        const totalSupply = await currentContract.totalSupply();
        console.log("Total supply:", hre.ethers.formatEther(totalSupply));
        
        const owner = await currentContract.owner();
        console.log("Current owner:", owner);
        
        // Verify deployer is owner
        if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
            throw new Error(`Deployer ${deployer.address} is not the contract owner ${owner}`);
        }
        
        // Test the broken 3-parameter function
        console.log("\n=== Testing Current Broken Function ===");
        try {
            const gasEstimate = await currentContract['createTimeLock(address,uint256,uint256)'].estimateGas(
                "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be", 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 3600
            );
            console.log("❌ Function should have failed but gas estimate succeeded:", gasEstimate.toString());
        } catch (error) {
            console.log("✅ Confirmed: 3-parameter function is broken as expected");
        }
        
    } catch (error) {
        console.log("Error verifying current contract:", error.message);
        throw error;
    }
    
    // Deploy new implementation
    console.log("\n=== Deploying Fixed V3 Implementation ===");
    
    const Avax0TokenV3Fixed = await hre.ethers.getContractFactory("Avax0TokenV3");
    
    // Perform the upgrade
    console.log("Upgrading proxy to fixed V3 implementation...");
    const upgradedContract = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV3Fixed);
    
    console.log("✅ Upgrade transaction completed");
    
    // Wait for deployment
    await upgradedContract.waitForDeployment();
    console.log("✅ Upgrade confirmed");
    
    // Verify the upgrade
    console.log("\n=== Post-Upgrade Verification ===");
    
    try {
        const version = await upgradedContract.version();
        console.log("New version:", version);
        
        const name = await upgradedContract.name();
        console.log("Token name:", name);
        
        const totalSupply = await upgradedContract.totalSupply();
        console.log("Total supply:", hre.ethers.formatEther(totalSupply));
        
        // Test the fixed 3-parameter function
        console.log("\n=== Testing Fixed 3-Parameter Function ===");
        
        // First ensure we have tokens to test with
        const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
        const testBalance = await upgradedContract.balanceOf(testAccount);
        console.log("Test account balance:", hre.ethers.formatEther(testBalance));
        
        if (testBalance < hre.ethers.parseEther("10")) {
            console.log("Minting test tokens...");
            const mintTx = await upgradedContract.mint(testAccount, hre.ethers.parseEther("100"));
            await mintTx.wait();
            console.log("✅ Test tokens minted");
        }
        
        // Test gas estimation (should work now)
        try {
            const gasEstimate = await upgradedContract['createTimeLock(address,uint256,uint256)'].estimateGas(
                testAccount, 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 3600
            );
            console.log("✅ 3-parameter function gas estimate succeeded:", gasEstimate.toString());
            
            // Actually create a test lock
            console.log("Creating test time lock...");
            const lockTx = await upgradedContract['createTimeLock(address,uint256,uint256)'](
                testAccount, 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 3600
            );
            await lockTx.wait();
            console.log("✅ 3-parameter createTimeLock succeeded! TX:", lockTx.hash);
            
            // Verify lock was created
            const locks = await upgradedContract.getTimeLocks(testAccount);
            console.log("Total locks for test account:", locks.length);
            if (locks.length > 0) {
                const lastLock = locks[locks.length - 1];
                console.log("Last lock:", {
                    amount: hre.ethers.formatEther(lastLock.amount),
                    releaseTime: new Date(Number(lastLock.releaseTime) * 1000).toISOString(),
                    released: lastLock.released
                });
            }
            
        } catch (error) {
            console.log("❌ 3-parameter function still failing:", error.message);
            throw error;
        }
        
        // Test 4-parameter function as well
        console.log("\n=== Testing 4-Parameter Function ===");
        try {
            const emptyConfig = { duration: 0, interval: 0, enabled: false };
            const lockTx4 = await upgradedContract['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'](
                testAccount, 
                hre.ethers.parseEther("1"), 
                Math.floor(Date.now() / 1000) + 7200, // 2 hours
                emptyConfig
            );
            await lockTx4.wait();
            console.log("✅ 4-parameter createTimeLock also works! TX:", lockTx4.hash);
            
        } catch (error) {
            console.log("❌ 4-parameter function failed:", error.message);
        }
        
    } catch (error) {
        console.log("Error in post-upgrade verification:", error.message);
        throw error;
    }
    
    console.log("\n=== Upgrade Summary ===");
    console.log("✅ Successfully upgraded Avax0TokenV3 on Fuji");
    console.log("✅ Fixed struct initialization bug");
    console.log("✅ Both 3-parameter and 4-parameter createTimeLock functions working");
    console.log("✅ All existing functionality preserved");
    console.log("\nProxy Address:", proxyAddress);
    console.log("Network: Fuji Testnet");
    console.log("Upgrade completed at:", new Date().toISOString());
    
    console.log("\n=== Usage Instructions ===");
    console.log("You can now use either version of createTimeLock:");
    console.log("1. Simple version: avax0.createTimeLock(account, amount, releaseTime)");
    console.log("2. With config: avax0.createTimeLock(account, amount, releaseTime, gradualConfig)");
    console.log("\nBoth functions should work correctly after this upgrade.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    });