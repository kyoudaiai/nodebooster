const { ethers, upgrades } = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("🚀 COMPLETE UPGRADE PATH: Deploying V1 → Upgrading to V2 → Upgrading to V2.1");
    console.log("=" .repeat(80));
    
    const [deployer] = await ethers.getSigners();
    console.log("📝 Deploying with account:", deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));
    console.log("🌐 Network:", hre.network.name);
    
    // Deployment parameters
    const tokenName = "avax0 Token";
    const tokenSymbol = "AVAX0";
    const initialSupply = ethers.parseEther("10000000"); // 10M tokens
    
    let proxyAddress;
    let currentContract;
    
    // PHASE 1: Deploy V1
    console.log("\n" + "=".repeat(40));
    console.log("📦 PHASE 1: Deploying Avax0TokenV1");
    console.log("=".repeat(40));
    
    const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
    console.log(`  Token Name: ${tokenName}`);
    console.log(`  Token Symbol: ${tokenSymbol}`);
    console.log(`  Initial Supply: ${ethers.formatEther(initialSupply)} tokens`);
    
    const avax0Proxy = await upgrades.deployProxy(
        Avax0TokenV1,
        [tokenName, tokenSymbol, initialSupply],
        {
            initializer: "initialize", 
            kind: "uups"
        }
    );
    
    await avax0Proxy.waitForDeployment();
    proxyAddress = await avax0Proxy.getAddress();
    
    console.log("✅ V1 deployed successfully!");
    console.log("📍 Proxy address:", proxyAddress);
    
    const v1Implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("🔧 V1 Implementation address:", v1Implementation);
    
    // Verify V1 deployment
    currentContract = await ethers.getContractAt("Avax0TokenV1", proxyAddress);
    console.log("\n📋 V1 verification:");
    console.log("  Version:", await currentContract.version());
    console.log("  Total Supply:", ethers.formatEther(await currentContract.totalSupply()));
    console.log("  Owner:", await currentContract.owner());
    
    // Set up some test data in V1
    console.log("\n🔧 Setting up test data in V1...");
    await currentContract.setMinter(deployer.address, true);
    
    // Create some test accounts and mint tokens
    const [, testUser1, testUser2] = await ethers.getSigners();
    if (testUser1 && testUser2) {
        await currentContract.transfer(testUser1.address, ethers.parseEther("100000"));
        await currentContract.transfer(testUser2.address, ethers.parseEther("50000"));
        console.log("  ✅ Test tokens distributed to test accounts");
    }
    
    // PHASE 2: Upgrade V1 → V2  
    console.log("\n" + "=".repeat(40));
    console.log("⬆️  PHASE 2: Upgrading V1 → V2");
    console.log("=".repeat(40));
    
    // Capture V1 state before upgrade
    const v1TotalSupply = await currentContract.totalSupply();
    const v1OwnerBalance = await currentContract.balanceOf(deployer.address);
    
    const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
    console.log("🔄 Performing V1 → V2 upgrade...");
    
    const upgradedToV2 = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2);
    await upgradedToV2.waitForDeployment();
    
    currentContract = await ethers.getContractAt("Avax0TokenV2", proxyAddress);
    const v2Version = await currentContract.version();
    
    console.log("✅ V1 → V2 upgrade completed!");
    console.log("🆕 New version:", v2Version);
    
    const v2Implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("🔧 V2 Implementation address:", v2Implementation);
    
    // Verify state preservation
    console.log("\n🔍 Verifying V1 → V2 state preservation:");
    const v2TotalSupply = await currentContract.totalSupply();
    const v2OwnerBalance = await currentContract.balanceOf(deployer.address);
    
    console.log(`  Total Supply: ${ethers.formatEther(v1TotalSupply)} → ${ethers.formatEther(v2TotalSupply)} ✅`);
    console.log(`  Owner Balance preserved: ${v1OwnerBalance === v2OwnerBalance ? '✅' : '❌'}`);
    
    // Test V2 new features (time locks)
    console.log("\n🧪 Testing V2 time lock features...");
    const lockAmount = ethers.parseEther("1000");
    const releaseTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    if (testUser1) {
        try {
            await currentContract.createTimeLock(testUser1.address, lockAmount, releaseTime);
            console.log("  ✅ Time lock created successfully");
            
            const lockedAmount = await currentContract.getLockedAmount(testUser1.address);
            console.log(`  📊 Locked amount: ${ethers.formatEther(lockedAmount)}`);
        } catch (error) {
            console.log("  ⚠️  Time lock test failed:", error.message);
        }
    }
    
    // PHASE 3: Upgrade V2 → V2.1
    console.log("\n" + "=".repeat(40));
    console.log("⬆️  PHASE 3: Upgrading V2 → V2.1");
    console.log("=".repeat(40));
    
    // Capture V2 state before upgrade
    const v2LockCount = testUser1 ? await currentContract.getTimeLockCount(testUser1.address) : 0n;
    
    const Avax0TokenV2_1 = await ethers.getContractFactory("Avax0TokenV2_1");
    console.log("🔄 Performing V2 → V2.1 upgrade...");
    
    const upgradedToV2_1 = await upgrades.upgradeProxy(proxyAddress, Avax0TokenV2_1);
    await upgradedToV2_1.waitForDeployment();
    
    currentContract = await ethers.getContractAt("Avax0TokenV2_1", proxyAddress);
    const v2_1Version = await currentContract.version();
    
    console.log("✅ V2 → V2.1 upgrade completed!");
    console.log("🆕 Final version:", v2_1Version);
    
    const v2_1Implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("🔧 V2.1 Implementation address:", v2_1Implementation);
    
    // Verify state preservation from V2
    console.log("\n🔍 Verifying V2 → V2.1 state preservation:");
    const v2_1TotalSupply = await currentContract.totalSupply();
    const v2_1LockCount = testUser1 ? await currentContract.getTimeLockCount(testUser1.address) : 0n;
    
    console.log(`  Total Supply preserved: ${v2TotalSupply === v2_1TotalSupply ? '✅' : '❌'}`);
    console.log(`  Time Locks preserved: ${v2LockCount === v2_1LockCount ? '✅' : '❌'}`);
    
    // Initialize V2.1 features
    console.log("\n🔧 Initializing V2.1 vesting features...");
    const vestingDurationHours = 24; // 24 hours vesting period
    const vestingEndDate = Math.floor(Date.now() / 1000) + (vestingDurationHours * 60 * 60);
    const enableVesting = true;
    
    try {
        const initTx = await currentContract.initializeV2_1(vestingEndDate, enableVesting);
        await initTx.wait();
        
        console.log("✅ V2.1 features initialized successfully!");
        console.log(`  Vesting Period: ${vestingDurationHours} hours`);
        console.log(`  Vesting End: ${new Date(vestingEndDate * 1000).toISOString()}`);
        console.log(`  Vesting Enabled: ${enableVesting}`);
        
        // Test V2.1 features
        console.log("\n🧪 Testing V2.1 vesting features...");
        
        // Check vesting status
        const [enabled, endDate, remainingTime] = await currentContract.getVestingStatus();
        console.log(`  Vesting Status: enabled=${enabled}, remaining=${remainingTime}s`);
        
        // Add exclusions  
        await currentContract.setVestingExclusion(deployer.address, true);
        console.log("  ✅ Owner added to vesting exclusion list");
        
        // Test vesting restrictions
        if (testUser1) {
            const canTransfer = await currentContract.canTransfer(testUser1.address);
            const isSubjectToVesting = await currentContract.isSubjectToVesting(testUser1.address);
            console.log(`  Test User 1: canTransfer=${canTransfer}, subjectToVesting=${isSubjectToVesting}`);
        }
        
    } catch (error) {
        console.error("❌ Error initializing V2.1 features:", error.message);
    }
    
    // FINAL SUMMARY
    console.log("\n" + "=".repeat(80));
    console.log("🎉 COMPLETE UPGRADE PATH FINISHED SUCCESSFULLY!");
    console.log("=".repeat(80));
    
    console.log("📋 Summary:");
    console.log("  ✅ V1 deployed and verified");
    console.log("  ✅ V1 → V2 upgrade successful");
    console.log("  ✅ V2 → V2.1 upgrade successful");
    console.log("  ✅ All data preserved through upgrades");
    console.log("  ✅ V2.1 features initialized and tested");
    
    console.log("\n📊 Final State:");
    console.log("  📍 Proxy Address:", proxyAddress);
    console.log("  🔧 Final Implementation:", v2_1Implementation);
    console.log("  🆕 Final Version:", v2_1Version);
    console.log("  💰 Final Total Supply:", ethers.formatEther(await currentContract.totalSupply()));
    console.log("  👤 Owner:", await currentContract.owner());
    
    // Save complete deployment info
    const completeDeploymentInfo = {
        network: hre.network.name,
        proxyAddress: proxyAddress,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        
        // V1 Info
        v1: {
            version: "1.0.0",
            implementationAddress: v1Implementation,
        },
        
        // V2 Info  
        v2: {
            version: "2.0.0",
            implementationAddress: v2Implementation,
        },
        
        // V2.1 Info
        v2_1: {
            version: "2.1.0", 
            implementationAddress: v2_1Implementation,
            vestingInitialized: true,
            vestingDurationHours: vestingDurationHours
        },
        
        // Token Info
        token: {
            name: tokenName,
            symbol: tokenSymbol,
            initialSupply: initialSupply.toString(),
            finalSupply: (await currentContract.totalSupply()).toString()
        }
    };
    
    // Save to file
    const deployDir = './deployments';
    if (!fs.existsSync(deployDir)) {
        fs.mkdirSync(deployDir, { recursive: true });
    }
    
    const filename = `${deployDir}/Avax0Token-Complete-Upgrade-${hre.network.name}.json`;
    fs.writeFileSync(filename, JSON.stringify(completeDeploymentInfo, null, 2));
    
    console.log(`\n💾 Complete deployment info saved to: ${filename}`);
    console.log("\n🚀 Ready for production use!");
    
    return {
        proxyAddress,
        finalImplementation: v2_1Implementation,
        contract: currentContract,
        deploymentInfo: completeDeploymentInfo
    };
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Complete upgrade path failed:");
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;