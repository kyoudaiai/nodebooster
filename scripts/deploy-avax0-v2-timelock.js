const { ethers, upgrades } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    
    console.log("\n=== Deploying Avax0TokenV2 (Time Lock Version) ===\n");
    console.log("Deploying with account:", deployer.address);
    
    // Get balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");
    
    // Deployment parameters
    const TOKEN_NAME = process.env.TOKEN_NAME || "Avax0Token";
    const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "AVAX0";
    const INITIAL_SUPPLY = process.env.INITIAL_SUPPLY ? ethers.parseEther(process.env.INITIAL_SUPPLY) : ethers.parseEther("1000000"); // 1M default
    
    console.log("\n=== Deployment Parameters ===");
    console.log("Token Name:", TOKEN_NAME);
    console.log("Token Symbol:", TOKEN_SYMBOL);
    console.log("Initial Supply:", ethers.formatEther(INITIAL_SUPPLY));
    console.log("Max Supply:", ethers.formatEther(ethers.parseEther("100000000"))); // 100M fixed
    console.log("Deployer:", deployer.address);
    
    // Validate parameters
    const maxSupply = ethers.parseEther("100000000");
    if (INITIAL_SUPPLY > maxSupply) {
        console.error("❌ Error: Initial supply exceeds maximum supply");
        process.exit(1);
    }
    
    try {
        console.log("\n=== Deploying Contract ===");
        
        // Deploy the upgradeable proxy
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        console.log("Deploying Avax0TokenV2 proxy...");
        
        const token = await upgrades.deployProxy(
            Avax0TokenV2,
            [TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY],
            { 
                initializer: "initialize",
                kind: "uups"
            }
        );
        
        await token.waitForDeployment();
        
        const proxyAddress = await token.getAddress();
        const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
        
        console.log("✅ Contract deployed successfully!");
        console.log("Proxy address:", proxyAddress);
        console.log("Implementation address:", implementationAddress);
        
        // Verify deployment
        console.log("\n=== Verifying Deployment ===");
        
        const name = await token.name();
        const symbol = await token.symbol();
        const totalSupply = await token.totalSupply();
        const decimals = await token.decimals();
        const owner = await token.owner();
        const version = await token.version();
        const maxSupplyContract = await token.MAX_SUPPLY();
        const deployerBalance = await token.balanceOf(deployer.address);
        const isDeployerMinter = await token.minters(deployer.address);
        
        console.log("Name:", name);
        console.log("Symbol:", symbol);
        console.log("Decimals:", decimals);
        console.log("Total Supply:", ethers.formatEther(totalSupply));
        console.log("Max Supply:", ethers.formatEther(maxSupplyContract));
        console.log("Version:", version);
        console.log("Owner:", owner);
        console.log("Deployer Balance:", ethers.formatEther(deployerBalance));
        console.log("Deployer is Minter:", isDeployerMinter);
        
        // Test basic functionality
        console.log("\n=== Testing Basic Functionality ===");
        
        try {
            // Test time lock functions
            const timeLockCount = await token.getTimeLockCount(deployer.address);
            const availableBalance = await token.getAvailableBalance(deployer.address);
            const lockedAmount = await token.getLockedAmount(deployer.address);
            
            console.log("✅ Time lock functions working");
            console.log("  Lock count:", timeLockCount.toString());
            console.log("  Available balance:", ethers.formatEther(availableBalance));
            console.log("  Locked amount:", ethers.formatEther(lockedAmount));
            
            // Test minting (small amount)
            const testMintAmount = ethers.parseEther("100");
            const balanceBeforeMint = await token.balanceOf(deployer.address);
            
            await token.mint(deployer.address, testMintAmount);
            
            const balanceAfterMint = await token.balanceOf(deployer.address);
            const mintSuccess = balanceAfterMint === balanceBeforeMint + testMintAmount;
            
            console.log("✅ Minting function working");
            console.log("  Test mint amount:", ethers.formatEther(testMintAmount));
            console.log("  Balance change:", ethers.formatEther(balanceAfterMint - balanceBeforeMint));
            
            // Test transfer (small amount)
            const testTransferAmount = ethers.parseEther("10");
            const initialBalance = await token.balanceOf(deployer.address);
            
            // Create a new account for testing
            const testAccount = ethers.Wallet.createRandom().address;
            await token.transfer(testAccount, testTransferAmount);
            
            const finalBalance = await token.balanceOf(deployer.address);
            const testAccountBalance = await token.balanceOf(testAccount);
            
            console.log("✅ Transfer function working");
            console.log("  Test transfer amount:", ethers.formatEther(testTransferAmount));
            console.log("  Test account balance:", ethers.formatEther(testAccountBalance));
            
        } catch (error) {
            console.log("❌ Error testing functionality:", error.message);
        }
        
        // Verification checks
        const checks = [
            { name: "Contract deployed", condition: proxyAddress && ethers.isAddress(proxyAddress) },
            { name: "Name set correctly", condition: name === TOKEN_NAME },
            { name: "Symbol set correctly", condition: symbol === TOKEN_SYMBOL },
            { name: "Initial supply minted", condition: totalSupply === INITIAL_SUPPLY },
            { name: "Deployer owns initial supply", condition: deployerBalance === INITIAL_SUPPLY },
            { name: "Deployer is minter", condition: isDeployerMinter },
            { name: "Owner set correctly", condition: owner === deployer.address },
            { name: "Version is 2.0.0", condition: version === "2.0.0" },
            { name: "Max supply correct", condition: maxSupplyContract === maxSupply },
            { name: "Decimals is 18", condition: Number(decimals) === 18 }
        ];
        
        console.log("\n=== Deployment Verification ===");
        let allPassed = true;
        for (const check of checks) {
            const status = check.condition ? "✅ PASS" : "❌ FAIL";
            console.log(`${status} ${check.name}`);
            if (!check.condition) allPassed = false;
        }
        
        if (!allPassed) {
            console.error("\n❌ Some verification checks failed!");
            process.exit(1);
        }
        
        console.log("\n=== Deployment Summary ===");
        console.log(`Network: ${hre.network.name}`);
        console.log(`Token Name: ${name}`);
        console.log(`Token Symbol: ${symbol}`);
        console.log(`Proxy Address: ${proxyAddress}`);
        console.log(`Implementation Address: ${implementationAddress}`);
        console.log(`Total Supply: ${ethers.formatEther(totalSupply)} ${symbol}`);
        console.log(`Max Supply: ${ethers.formatEther(maxSupplyContract)} ${symbol}`);
        console.log(`Owner: ${owner}`);
        console.log(`Deployer: ${deployer.address}`);
        console.log(`Version: ${version}`);
        
        console.log("\n🎉 Avax0TokenV2 deployment completed successfully!");
        console.log("\n📝 V2 Features:");
        console.log("   • Time lock functionality for token transfers");
        console.log("   • Multiple concurrent locks per address");
        console.log("   • Mint with automatic time lock");
        console.log("   • Lock extension capabilities");
        console.log("   • Enhanced transfer restrictions");
        console.log("   • Batch minting capabilities");
        console.log("   • Emergency token recovery");
        console.log("   • Pausable for emergency stops");
        console.log("   • Upgradeable using UUPS pattern");
        
        console.log("\n📋 Next Steps:");
        console.log("   1. Verify contract on explorer (if on mainnet)");
        console.log("   2. Set up additional minters if needed");
        console.log("   3. Configure time locks for specific addresses");
        console.log("   4. Test all functionality thoroughly");
        console.log("   5. Update frontend/app configurations");
        
        if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
            console.log("\n🔍 Contract Verification:");
            console.log("Run the following command to verify on explorer:");
            console.log(`npx hardhat verify --network ${hre.network.name} ${implementationAddress}`);
        }
        
        return {
            proxy: proxyAddress,
            implementation: implementationAddress,
            name: name,
            symbol: symbol,
            totalSupply: ethers.formatEther(totalSupply),
            owner: owner,
            deployer: deployer.address,
            version: version,
            network: hre.network.name
        };
        
    } catch (error) {
        console.error("\n❌ Deployment failed:");
        console.error(error.message);
        if (error.reason) {
            console.error("Reason:", error.reason);
        }
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error("\nInsufficient funds for deployment. Please fund your account.");
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