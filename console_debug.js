// Use this in your console to debug the createTimeLock issue

// Step 1: Get the correct contract instance
const helpers = require('./console_helpers.js');
const contractInfo = await helpers.findProxyAddress();

if (contractInfo) {
    // Use this contract instance
    const avax0 = contractInfo.contract;
    console.log("✅ Connected to contract at:", contractInfo.address);
    
    // Step 2: Check your account first
    const testAccount = "0xf5Bc30aFa7699d01c3E6A372021C36EE5EB275Be";
    
    // Check balance
    const balance = await avax0.balanceOf(testAccount);
    console.log("Account balance:", ethers.formatEther(balance), "tokens");
    
    const availableBalance = await avax0.getAvailableBalance(testAccount);
    console.log("Available balance:", ethers.formatEther(availableBalance), "tokens");
    
    // Step 3: If account has no tokens, mint some first
    if (balance === 0n) {
        console.log("Account has no tokens. Minting 1000 tokens...");
        const tx = await avax0.mint(testAccount, ethers.parseEther("1000"));
        await tx.wait();
        console.log("✅ Minted 1000 tokens");
        
        const newBalance = await avax0.balanceOf(testAccount);
        console.log("New balance:", ethers.formatEther(newBalance), "tokens");
    }
    
    // Step 4: Now try createTimeLock
    console.log("Attempting createTimeLock...");
    try {
        const tx = await avax0.createTimeLock(
            testAccount, 
            ethers.parseEther("100"), 
            "1793964048"
        );
        console.log("✅ createTimeLock succeeded! TX:", tx.hash);
        await tx.wait();
        console.log("✅ Transaction confirmed");
        
        // Check the lock
        const locks = await avax0.getTimeLocks(testAccount);
        console.log("Created lock:", locks[locks.length - 1]);
        
    } catch (error) {
        console.log("❌ createTimeLock failed:", error.message);
        
        // Additional debugging
        if (error.reason) {
            console.log("Reason:", error.reason);
        }
    }
    
} else {
    console.log("❌ Could not connect to contract. You may need to deploy a fresh one.");
    console.log("To deploy fresh: const fresh = await helpers.deployFreshForTesting();");
}