// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const UBSTV1 = await ethers.getContractFactory("SNDAOV1");

    console.log("Deploying SNDAO v1 ...");

    const ubst = await upgrades.deployProxy(UBSTV1, [], {
        initializer: "initialize",
    });

    await ubst.deployed();
    console.log("sndao v1 deployed to:", ubst.address);
}

main();