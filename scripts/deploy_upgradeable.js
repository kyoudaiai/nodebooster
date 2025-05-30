const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Deploying DailyEthRoiV1Upgradeable contract...");

  // Contract deployment parameters
  const minInvestment = ethers.utils.parseEther("0.01");  // 0.01 ETH
  const maxInvestment = ethers.utils.parseEther("10");    // 10 ETH
  const dailyRoi = 100;  // 1% daily ROI (100 = 1%)
  const referralPercentage = 500;  // 5% referral bonus (500 = 5%)

  // Deploy the implementation, proxy, and proxy admin
  const DailyEthRoi = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
  
  const proxy = await upgrades.deployProxy(
    DailyEthRoi, 
    [minInvestment, maxInvestment, dailyRoi, referralPercentage],
    { initializer: 'initialize' }
  );

  await proxy.deployed();

  // Get the implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxy.address);
  
  console.log("DailyEthRoiV1Upgradeable proxy deployed to:", proxy.address);
  console.log("Implementation deployed to:", implementationAddress);
  console.log("Contract parameters:");
  console.log("- Min Investment:", ethers.utils.formatEther(minInvestment), "ETH");
  console.log("- Max Investment:", ethers.utils.formatEther(maxInvestment), "ETH");
  console.log("- Daily ROI:", dailyRoi / 100, "%");
  console.log("- Referral Percentage:", referralPercentage / 100, "%");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
