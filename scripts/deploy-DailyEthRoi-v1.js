// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const DailyEthRoi = await ethers.getContractFactory("DailyEthRoiV1");

    console.log("Deploying DailyEthRoi v1 ...");

    const dailyEthRoi = await upgrades.deployProxy(DailyEthRoi, [], {
        initializer: "initialize",
    });

    await dailyEthRoi.deployed();
    console.log("DailyEthRoi v1 deployed to:", dailyEthRoi.address);
}

main();