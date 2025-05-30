// scripts/deploy_upgradeable_box.js
const { ethers, upgrades } = require("hardhat");

async function main() {
    const EURFXV1 = await ethers.getContractFactory("EURFXV1");

    console.log("Deploying EURFX v1 ...");

    const eurfx = await upgrades.deployProxy(EURFXV1, [], {
        initializer: "initialize",
    });

    await eurfx.deployed();
    console.log("eurfx v1 deployed to:", eurfx.address);
}

main();