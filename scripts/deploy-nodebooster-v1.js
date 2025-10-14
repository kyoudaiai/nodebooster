const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Deploying NodeBooster V1 ===\n");
    console.log("Deploying with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "AVAX");
    
    // Contract addresses (update these for your deployment)
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"; // USDC on Avalanche
    let AVAX0_ADDRESS = process.env.AVAX0_ADDRESS;
    
    // System pool addresses (5 addresses with equal split)
    const SYSTEM_POOLS = [
        process.env.PAYOUT_WALLET_1 || deployer.address,
        process.env.PAYOUT_WALLET_2 || deployer.address,
        process.env.PAYOUT_WALLET_3 || deployer.address,
        process.env.PAYOUT_WALLET_4 || deployer.address,
        process.env.PAYOUT_WALLET_5 || deployer.address
    ];
    
    // Equal split percentages (20% each = 2000 basis points)
    const USDC_PERCENTAGES = [2000, 2000, 2000, 2000, 2000]; // 20% each
    const AVAX_PERCENTAGES = [2000, 2000, 2000, 2000, 2000]; // 20% each
    
    // If AVAX0_ADDRESS not provided, deploy a new AVAX0 token for testing
    if (!AVAX0_ADDRESS || AVAX0_ADDRESS === "0x0000000000000000000000000000000000000000") {
        console.log("\\nAVAX0_ADDRESS not provided. Deploying new AVAX0 token for testing...");
        
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
        const avax0Proxy = await upgrades.deployProxy(
            Avax0TokenV1,
            ["avax0", "avax0", ethers.parseEther("1000000")], // 1M tokens
            { initializer: "initialize", kind: "uups" }
        );
        await avax0Proxy.waitForDeployment();
        AVAX0_ADDRESS = await avax0Proxy.getAddress();
        
        console.log("✅ AVAX0 token deployed at:", AVAX0_ADDRESS);
    }
    
    console.log("\n=== Configuration ===");
    console.log("USDC Address:", USDC_ADDRESS);
    console.log("AVAX0 Address:", AVAX0_ADDRESS);
    console.log("System Pools:", SYSTEM_POOLS);
    console.log("USDC Percentages:", USDC_PERCENTAGES);
    console.log("AVAX Percentages:", AVAX_PERCENTAGES);
    
    try {
        // Deploy NodeBooster V1 contract
        console.log("\nDeploying NodeBoosterV1...");
        const NodeBoosterV1 = await ethers.getContractFactory("NodeBoosterV1");
        
        const proxy = await upgrades.deployProxy(
            NodeBoosterV1,
            [
                USDC_ADDRESS,      // USDC token address
                AVAX0_ADDRESS      // AVAX0 token address
            ],
            {
                initializer: "initialize",
                kind: "uups"
            }
        );
        
        await proxy.waitForDeployment();
        const proxyAddress = await proxy.getAddress();
        
        console.log("\n✅ NodeBoosterV1 deployed successfully!");
        console.log("Proxy address:", proxyAddress);
        
        // Configure system pools
        console.log("\nConfiguring system pools...");
        const nodeBooster = await ethers.getContractAt("NodeBoosterV1", proxyAddress);
        await nodeBooster.upSysPools(SYSTEM_POOLS, USDC_PERCENTAGES, AVAX_PERCENTAGES);
        console.log("✅ System pools configured successfully!");
        
        // Get implementation address
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log("Implementation address:", implementationAddress);
        
        // Verify deployment
        const version = await nodeBooster.version();
        const usdcToken = await nodeBooster.usdcToken();
        const avax0Token = await nodeBooster.avax0Token();
        const engineCount = await nodeBooster.engineCount();
        const registrationFee = await nodeBooster.REGISTRATION_FEE();
        const referralRate = await nodeBooster.REFERRAL_COMMISSION_RATE();
        
        console.log("\n=== Deployment Verification ===");
        console.log("Version:", version);
        console.log("USDC Token:", usdcToken);
        console.log("AVAX0 Token:", avax0Token);
        console.log("Engine Count:", engineCount.toString());
        console.log("Registration Fee:", ethers.formatUnits(registrationFee, 6), "USDC");
        console.log("Referral Rate:", (Number(referralRate) / 100).toString() + "%");
        
        // Verify system pools configuration
        console.log("\n=== System Pools Verification ===");
        for (let i = 0; i < SYSTEM_POOLS.length; i++) {
            const poolAddress = await nodeBooster.sysPools(i);
            const usdcPct = await nodeBooster.usdcPcts(i);
            const avaxPct = await nodeBooster.avaxPcts(i);
            console.log(`Pool ${i}: ${poolAddress}`);
            console.log(`  USDC: ${Number(usdcPct)/100}%, AVAX: ${Number(avaxPct)/100}%`);
        }
        
        // Display engine information
        console.log("\n=== Default Engines ===");
        for (let i = 1; i < Number(engineCount); i++) { // Start from 1, skip engine 0 (reserved)
            const engine = await nodeBooster.getEngine(i);
            console.log(`Engine ${i}: ${engine.name}`);
            console.log(`  Price: ${ethers.formatEther(engine.price)} AVAX`);
            console.log(`  Hash Power: ${engine.hashPower.toString()}`);
            console.log(`  Max Reward Days: ${engine.rewardCapDays.toString()}`);
            console.log(`  Active: ${engine.isActive}`);
            console.log("");
        }
        
        // Get contract stats
        const stats = await nodeBooster.getStats();
        console.log("=== Contract Statistics ===");
        console.log("Total Users:", stats[0].toString());
        console.log("Total USDC Collected:", ethers.formatUnits(stats[1], 6), "USDC");
        console.log("Total AVAX0 Distributed:", ethers.formatEther(stats[2]));
        console.log("Total Referral Rewards:", ethers.formatUnits(stats[3], 6), "USDC");
        
        console.log("\n=== Deployment Summary ===");
        console.log(`Network: ${hre.network.name}`);
        console.log(`Proxy Address: ${proxyAddress}`);
        console.log(`Implementation: ${implementationAddress}`);
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Registration Fee: 25 USDC`);
        console.log(`Referral Commission: 10%`);
        console.log(`Default Engines: 10`);
        
        console.log("\n=== Next Steps ===");
        if (AVAX0_ADDRESS === "0x0000000000000000000000000000000000000000") {
            console.log("1. Deploy or get AVAX0 token address");
            console.log("2. Update AVAX0 address in the contract (if needed)");
        }
        console.log("3. Ensure contract has AVAX0 tokens for user rewards");
        console.log("4. Configure payout wallet addresses if using defaults");
        console.log("5. Test user registration functionality");
        
        return {
            proxy: proxyAddress,
            implementation: implementationAddress,
            deployer: deployer.address,
            usdcAddress: USDC_ADDRESS,
            avax0Address: AVAX0_ADDRESS
        };
        
    } catch (error) {
        console.error("\n❌ Deployment failed:");
        console.error(error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        if (error.code === 'INVALID_ARGUMENT') {
            console.error("\nPossible causes:");
            console.error("- Invalid token addresses");
            console.error("- Invalid wallet addresses");
            console.error("- Network connection issues");
        }
        process.exit(1);
    }
}

// Execute deployment
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;