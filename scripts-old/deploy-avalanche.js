const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🚀 Deploying avax0 contracts to Avalanche C-Chain...");
  
  // Get the network information
  const network = await ethers.provider.getNetwork();
  console.log(`📍 Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`👤 Deployer address: ${deployer.address}`);
  
  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} AVAX`);
  
  if (balance < ethers.parseEther("0.1")) {
    console.warn("⚠️  Warning: Low AVAX balance. Make sure you have enough AVAX for deployment.");
  }
  
  try {
    // Deploy Avax0 Token V2 with proxy
    console.log("\\n📄 Deploying Avax0TokenV2 with UUPS proxy...");
    const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
    
    const tokenName = "avax0";
    const tokenSymbol = "avax0";
    const initialSupply = ethers.parseUnits("1000000", 18); // 1M tokens
    
    // For V2, we need a treasury address for fee collection
    // Using deployer as default treasury (can be changed later)
    const treasuryAddress = deployer.address;
    const transferFeeRate = 300; // 3% default fee
    
    const token = await upgrades.deployProxy(
      Avax0TokenV2,
      [
        tokenName,
        tokenSymbol,
        initialSupply,
        treasuryAddress,
        transferFeeRate
      ],
      { initializer: "initialize" }
    );
    
    await token.waitForDeployment();
    
    const tokenAddress = await token.getAddress();
    console.log(`✅ Avax0TokenV2 deployed to: ${tokenAddress}`);
    
    // Verify deployment
    const deployedName = await token.name();
    const deployedSymbol = await token.symbol();
    const deployedSupply = await token.totalSupply();
    const deployedVersion = await token.version();
    const deployedTreasury = await token.treasury();
    const deployedFeeRate = await token.transferFeeRate();
    
    console.log(`\\n📊 Contract Details:`);
    console.log(`   Name: ${deployedName}`);
    console.log(`   Symbol: ${deployedSymbol}`);
    console.log(`   Version: ${deployedVersion}`);
    console.log(`   Total Supply: ${ethers.formatUnits(deployedSupply, 18)} tokens`);
    console.log(`   Owner: ${await token.owner()}`);
    console.log(`   Treasury: ${deployedTreasury}`);
    console.log(`   Transfer Fee Rate: ${deployedFeeRate} basis points (${deployedFeeRate / 100}%)`);
    
    // Save deployment info
    const deploymentInfo = {
      network: network.name,
      chainId: network.chainId.toString(),
      deployer: deployer.address,
      contracts: {
        Avax0TokenV2: {
          address: tokenAddress,
          name: deployedName,
          symbol: deployedSymbol,
          version: deployedVersion,
          totalSupply: ethers.formatUnits(deployedSupply, 18),
          treasury: deployedTreasury,
          transferFeeRate: deployedFeeRate.toString()
        }
      },
      timestamp: new Date().toISOString(),
      blockNumber: await ethers.provider.getBlockNumber()
    };
    
    console.log(`\\n💾 Deployment completed successfully!`);
    console.log(`\\n🔗 Add to your .env file:`);
    if (network.chainId === 43113n) {
      console.log(`FUJI_DEPLOYED_CONTRACT=${tokenAddress}`);
    } else if (network.chainId === 43114n) {
      console.log(`AVALANCHE_DEPLOYED_CONTRACT=${tokenAddress}`);
    }
    
    return deploymentInfo;
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
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

module.exports = { main };