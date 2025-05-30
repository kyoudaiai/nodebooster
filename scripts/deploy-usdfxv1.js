// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const USDFXV1 = await ethers.getContractFactory("USDFXV1");

    console.log("Deploying USDFX v1 ...");

    const usdfx = await upgrades.deployProxy(USDFXV1, [], {
        initializer: "initialize",
    });

    await usdfx.deployed();
    console.log("usdfx v1 deployed to:", usdfx.address);
}

main();