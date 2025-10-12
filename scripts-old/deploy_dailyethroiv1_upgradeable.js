const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Starting deployment of upgradeable contracts...");
  
  // Get signers
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  
  // Deploy DepositNFTUpgradeable
  console.log("Deploying DepositNFTUpgradeable...");
  const DepositNFTUpgradeable = await ethers.getContractFactory("DepositNFTUpgradeable");
  const depositNFT = await upgrades.deployProxy(DepositNFTUpgradeable, [deployer.address], { 
    initializer: "initialize",
    kind: "transparent" 
  });
  await depositNFT.waitForDeployment();
  const depositNFTAddress = await depositNFT.getAddress();
  console.log("DepositNFTUpgradeable deployed to:", depositNFTAddress);
  
  // Get system pool addresses (using deployer address as placeholder - replace with actual addresses)
  const systemPool1 = deployer.address;
  const systemPool2 = deployer.address;
  const systemPool3 = deployer.address;
  const systemPool4 = deployer.address;
  const systemPool5 = deployer.address;
  
  // Deploy DailyEthRoiV1Upgradeable
  console.log("Deploying DailyEthRoiV1Upgradeable...");
  const DailyEthRoiV1Upgradeable = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
  const dailyEthRoi = await upgrades.deployProxy(
    DailyEthRoiV1Upgradeable,
    [systemPool1, systemPool2, systemPool3, systemPool4, systemPool5],
    { initializer: "initialize", kind: "transparent" }
  );
  await dailyEthRoi.waitForDeployment();
  const dailyEthRoiAddress = await dailyEthRoi.getAddress();
  console.log("DailyEthRoiV1Upgradeable deployed to:", dailyEthRoiAddress);
  
  // Set NFT in the DailyEthRoi contract
  console.log("Setting NFT in the DailyEthRoi contract...");
  const tx = await dailyEthRoi.chgNFT(depositNFTAddress);
  await tx.wait();
  console.log("NFT set successfully in DailyEthRoi");
  
  // Log deployment information
  console.log("Deployment Summary:");
  console.log("-------------------");
  console.log("DepositNFTUpgradeable:", depositNFTAddress);
  console.log("DailyEthRoiV1Upgradeable:", dailyEthRoiAddress);
  console.log("-------------------");
  console.log("Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
