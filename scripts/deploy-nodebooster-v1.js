const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Deploying NodeBooster V1 ===\n");
    console.log("Deploying with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "AVAX");
    
    // Contract addresses (update these for your deployment)
    
    // Detect network
    const network = hre.network.name || process.env.NETWORK;

    if (network === "hardhat" || network === "localhost") {
        console.log("Local network detected. Deploying mock USDC token...");
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdcToken.waitForDeployment();
        const usdcAddress = await usdcToken.getAddress();
        console.log("✅ Mock USDC deployed at:", usdcAddress);
        process.env.USDC_ADDRESS = usdcAddress;
        process.env.AVAX0_ADDRESS = process.env.AVAX0_fuji || "0x0000000000000000000000000000000000000000"; // Replace with actual if available
    }    
    else if (network === "fuji") {
        // process.env.USDC_ADDRESS = "0x5425890298aed601595a70AB815c96711a31Bc65";
        process.env.AVAX0_ADDRESS = process.env.AVAX0_fuji || "0x0000000000000000000000000000000000000000"; // Replace with actual if available

        console.log("Fuji testnet detected. Deploying mock USDC token...");
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
        await usdcToken.waitForDeployment();
        const usdcAddress = await usdcToken.getAddress();
        console.log("✅ Mock USDC deployed at:", usdcAddress);
        process.env.USDC_ADDRESS = usdcAddress;
        process.env.AVAX0_ADDRESS = process.env.AVAX0_fuji || "0x0000000000000000000000000000000000000000"; // Replace with actual if available

    }    
    else if (network === "avalanche") {
        process.env.USDC_ADDRESS = "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e";
    }    
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48A6E"; // USDC on Avalanche
    
    let AVAX0_ADDRESS = process.env.AVAX0_ADDRESS;
    
    // System pool addresses (5 addresses with equal split)

    // if localhost or hardhat or fuji use 5 random addresses
    if (network === "hardhat" || network === "localhost" || network === "fuji") {
        // Use 5 random addresses from ethers.Wallet.createRandom()
        const randomWallets = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().address);
        process.env.PAYOUT_WALLET_1 = randomWallets[0];
        process.env.PAYOUT_WALLET_2 = randomWallets[1];
        process.env.PAYOUT_WALLET_3 = randomWallets[2];
        process.env.PAYOUT_WALLET_4 = randomWallets[3];
        process.env.PAYOUT_WALLET_5 = randomWallets[4];
        console.log("Using random payout wallets:", randomWallets);
    }
    
    const SYSTEM_POOLS = [
        process.env.PAYOUT_WALLET_1 || deployer.address,
        process.env.PAYOUT_WALLET_2 || deployer.address,
        process.env.PAYOUT_WALLET_3 || deployer.address,
        process.env.PAYOUT_WALLET_4 || deployer.address,
        process.env.PAYOUT_WALLET_5 || deployer.address
    ];
    
    // Default percentages (in basis points, total 10000 = 100%)
    const USDC_PERCENTAGES = [5500, 1500, 1500, 500, 1000]; 
    const AVAX_PERCENTAGES = [5000, 1500, 1500, 1000, 1000]; 
    

    // If AVAX0_ADDRESS not provided, deploy a new AVAX0 token for testing
    if (!AVAX0_ADDRESS || AVAX0_ADDRESS === "0x0000000000000000000000000000000000000000") {
        console.log("\nAVAX0_ADDRESS not provided. Deploying new AVAX0 token for testing...");
        
        const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
        const avax0Proxy = await upgrades.deployProxy(
            Avax0TokenV1,
            ["avax0", "avax0", ethers.parseEther("5000000")], // 5M tokens
            { initializer: "initialize", kind: "uups" }
        );
        await avax0Proxy.waitForDeployment();
        AVAX0_ADDRESS = await avax0Proxy.getAddress();
        AVAX0_Implementation = await upgrades.erc1967.getImplementationAddress(AVAX0_ADDRESS);
        
        console.log("✅ AVAX0 token deployed at:");
        console.log("AVAX0 Proxy at:", AVAX0_ADDRESS);
        console.log("AVAX0 Implementation at:", AVAX0_Implementation);
    }
    
    console.log("\n=== Configuration ===");
    console.log("USDC Address:", USDC_ADDRESS);
    console.log("AVAX0 Address:", AVAX0_ADDRESS);
    console.log("System Pools:", SYSTEM_POOLS);
    console.log("USDC Percentages:", USDC_PERCENTAGES);
    console.log("AVAX Percentages:", AVAX_PERCENTAGES);
    
    // make sure first we have USDC and AVAX0 addresses, system pools and usdc/avax percentages
    if (!USDC_ADDRESS || !AVAX0_ADDRESS) {
        console.error("❌ Error: USDC_ADDRESS or AVAX0_ADDRESS is not set.");
        process.exit(1);
    }
    if (SYSTEM_POOLS.length !== 5 || USDC_PERCENTAGES.length !== 5 || AVAX_PERCENTAGES.length !== 5) {
        console.error("❌ Error: There must be exactly 5 system pools and corresponding percentages.");
        process.exit(1);
    }
    const totalUsdcPct = USDC_PERCENTAGES.reduce((a, b) => a + b, 0);
    const totalAvaxPct = AVAX_PERCENTAGES.reduce((a, b) => a + b, 0);
    if (totalUsdcPct !== 10000 || totalAvaxPct !== 10000) {
        console.error("❌ Error: USDC and AVAX percentages must each sum to 10000 basis points (100%).");
        process.exit(1);
    }


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
        console.log("Deployer address:", deployer.address);
        console.log("Proxy address:", proxyAddress);
        // Get implementation address
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        console.log("Implementation address:", implementationAddress);

        
        // Configure system pools
        console.log("\nConfiguring system pools...");
        const nodeBooster = await ethers.getContractAt("NodeBoosterV1", proxyAddress);
        await nodeBooster.upSysPools(SYSTEM_POOLS, USDC_PERCENTAGES, AVAX_PERCENTAGES);
        console.log("✅ System pools configured successfully!");
        
        // Configure engines
        console.log("\nConfiguring engines...");
        const engines = [
            { id: 1, name: "Starter Engine", price: "2", hashPower: 1, rewardCapDays: 405, rewardCapPct: 450, refLvls: 1 },
            { id: 2, name: "Basic Engine", price: "4", hashPower: 2, rewardCapDays: 405, rewardCapPct: 450, refLvls: 2 },
            { id: 3, name: "Standard Engine", price: "8", hashPower: 4, rewardCapDays: 405, rewardCapPct: 450, refLvls: 3 },
            { id: 4, name: "Advanced Engine", price: "12", hashPower: 6, rewardCapDays: 405, rewardCapPct: 450, refLvls: 4 },
            { id: 5, name: "Professional Engine", price: "20", hashPower: 8, rewardCapDays: 405, rewardCapPct: 450, refLvls: 5 },
            { id: 6, name: "Expert Engine", price: "36", hashPower: 10, rewardCapDays: 405, rewardCapPct: 450, refLvls: 6 },
            { id: 7, name: "Master Engine", price: "75", hashPower: 12, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 8, name: "Elite Engine", price: "115", hashPower: 14, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 9, name: "Supreme Engine", price: "195", hashPower: 16, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 },
            { id: 10, name: "Ultimate Engine", price: "310", hashPower: 18, rewardCapDays: 405, rewardCapPct: 450, refLvls: 10 }
        ];

        for (const engine of engines) {
            const tx = await nodeBooster.configureEngine(
                engine.id,
                engine.name,
                ethers.parseEther(engine.price),
                engine.hashPower,
                engine.rewardCapDays,
                engine.rewardCapPct,
                engine.refLvls,
                true // isActive
            );
            await tx.wait();
            console.log(`✅ Engine ${engine.id} (${engine.name}) configured`);
        }
        console.log("✅ All engines configured successfully!");
        
        
        
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
        console.log("\n=== Configured Engines ===");
        const finalEngineCount = await nodeBooster.engineCount();
        for (let i = 1; i < Number(finalEngineCount); i++) { // Start from 1, skip engine 0 (reserved)
            const engine = await nodeBooster.getEngine(i);
            console.log(`Engine ${i}: ${engine.name}`);
            console.log(`  Price: ${ethers.formatEther(engine.price)} AVAX`);
            console.log(`  Hash Power: ${engine.hashPower.toString()}`);
            console.log(`  Max Reward Days: ${engine.rewardCapDays.toString()}`);
            console.log(`  Reward Cap %: ${engine.rewardCapPct.toString()}%`);
            console.log(`  Referral Levels: ${engine.refLvls.toString()}`);
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
        console.log(`Configured Engines: ${Number(finalEngineCount) - 1}`);
        
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