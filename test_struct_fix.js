const hre = require("hardhat");

async function main() {
    console.log("=== Testing Struct Initialization Fix ===");
    
    const [deployer] = await hre.ethers.getSigners();
    
    // Deploy a fresh V3 contract to test the fix
    console.log("Deploying fresh V3 contract for testing...");
    
    // Deploy V1 first
    const Avax0TokenV1 = await hre.ethers.getContractFactory("Avax0Token");
    const tokenV1 = await hre.upgrades.deployProxy(
        Avax0TokenV1,
        ["Test AVAX Token", "TAVAX", hre.ethers.parseEther("1000000")],
        { initializer: 'initialize' }
    );
    await tokenV1.waitForDeployment();
    
    const proxyAddress = await tokenV1.getAddress();
    console.log("V1 deployed at:", proxyAddress);
    
    // Upgrade to V2
    const Avax0TokenV2 = await hre.ethers.getContractFactory("Avax0TokenV2");
    const tokenV2 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
    console.log("Upgraded to V2");
    
    // Upgrade to V3 (with fix)
    const Avax0TokenV3 = await hre.ethers.getContractFactory("Avax0TokenV3");
    const tokenV3 = await hre.upgrades.upgradeProxy(proxyAddress, Avax0TokenV3);
    await tokenV3.initializeV3(30 * 24 * 60 * 60, 24 * 60 * 60); // 30 days, 1 day intervals
    console.log("Upgraded to V3 with fix");
    
    // Test the fixed 3-parameter function
    console.log("\n=== Testing Fixed 3-Parameter Function ===");
    
    const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    const amount = hre.ethers.parseEther("100");
    const releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    
    // First mint some tokens to test account
    console.log("Minting tokens to test account...");
    await tokenV3.mint(testAccount, hre.ethers.parseEther("1000"));
    
    try {
        console.log("Testing 3-parameter createTimeLock...");
        const tx = await tokenV3['createTimeLock(address,uint256,uint256)'](testAccount, amount, releaseTime);
        await tx.wait();
        console.log("✅ 3-parameter createTimeLock SUCCEEDED!");
        console.log("TX:", tx.hash);
        
        // Verify the lock was created
        const locks = await tokenV3.getTimeLocks(testAccount);
        console.log("Created lock:", locks[locks.length - 1]);
        
    } catch (error) {
        console.log("❌ 3-parameter createTimeLock still failed:", error.message);
        
        if (error.data) {
            console.log("Error data:", error.data);
        }
    }
    
    // Test the 4-parameter function as well
    console.log("\n=== Testing 4-Parameter Function ===");
    
    try {
        const emptyConfig = { duration: 0, interval: 0, enabled: false };
        const tx = await tokenV3['createTimeLock(address,uint256,uint256,(uint256,uint256,bool))'](
            testAccount, 
            amount, 
            releaseTime + 3600, // 2 hours from now
            emptyConfig
        );
        await tx.wait();
        console.log("✅ 4-parameter createTimeLock also works!");
        
    } catch (error) {
        console.log("❌ 4-parameter createTimeLock failed:", error.message);
    }
    
    console.log("\n=== Fix Summary ===");
    console.log("Fresh proxy address:", proxyAddress);
    console.log("This contract should have both functions working correctly");
}

main().catch(console.error);