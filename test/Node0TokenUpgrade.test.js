const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Node0Token V1 to V2 Upgrade Safety Test", function () {
    let tokenV1;
    let tokenV2;
    let owner;
    let user1;
    let user2;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
    
    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        // Deploy V1
        const Node0TokenV1 = await ethers.getContractFactory("Node0TokenV1");
        tokenV1 = await upgrades.deployProxy(
            Node0TokenV1,
            ["Node0Token", "NODE0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await tokenV1.waitForDeployment();
        
        // Setup initial state
        await tokenV1.transfer(user1.address, ethers.parseEther("50000"));
        await tokenV1.transfer(user2.address, ethers.parseEther("30000"));
        await tokenV1.setMinter(user1.address, true);
    });
    
    describe("Upgrade Process", function () {
        it("Should upgrade V1 to V2 preserving all state", async function () {
            // Capture V1 state
            const v1State = {
                name: await tokenV1.name(),
                symbol: await tokenV1.symbol(),
                totalSupply: await tokenV1.totalSupply(),
                ownerBalance: await tokenV1.balanceOf(owner.address),
                user1Balance: await tokenV1.balanceOf(user1.address),
                user2Balance: await tokenV1.balanceOf(user2.address),
                owner: await tokenV1.owner(),
                user1IsMinter: await tokenV1.minters(user1.address),
                version: await tokenV1.version()
            };
            
            console.log("Pre-upgrade state:", v1State);
            
            // Upgrade to V2
            const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
            tokenV2 = await upgrades.upgradeProxy(
                await tokenV1.getAddress(),
                Node0TokenV2
            );
            
            // Verify all V1 state preserved
            expect(await tokenV2.name()).to.equal(v1State.name);
            expect(await tokenV2.symbol()).to.equal(v1State.symbol);
            expect(await tokenV2.totalSupply()).to.equal(v1State.totalSupply);
            expect(await tokenV2.balanceOf(owner.address)).to.equal(v1State.ownerBalance);
            expect(await tokenV2.balanceOf(user1.address)).to.equal(v1State.user1Balance);
            expect(await tokenV2.balanceOf(user2.address)).to.equal(v1State.user2Balance);
            expect(await tokenV2.owner()).to.equal(v1State.owner);
            expect(await tokenV2.minters(user1.address)).to.equal(v1State.user1IsMinter);
            
            // Verify version updated
            expect(await tokenV2.version()).to.equal("2.0.0");
            
            console.log("✅ All V1 state preserved after upgrade");
        });
        
        it("Should maintain transfer functionality for existing balances", async function () {
            // Upgrade to V2
            const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
            tokenV2 = await upgrades.upgradeProxy(
                await tokenV1.getAddress(),
                Node0TokenV2
            );
            
            const transferAmount = ethers.parseEther("1000");
            const initialBalance = await tokenV2.balanceOf(user2.address);
            
            // Should allow normal transfers (no locks exist yet)
            await expect(
                tokenV2.connect(user1).transfer(user2.address, transferAmount)
            ).to.not.be.reverted;
            
            expect(await tokenV2.balanceOf(user2.address)).to.equal(
                initialBalance + transferAmount
            );
            
            console.log("✅ Existing balances remain freely transferable");
        });
        
        it("Should enable V2 time lock functionality", async function () {
            // Upgrade to V2
            const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
            tokenV2 = await upgrades.upgradeProxy(
                await tokenV1.getAddress(),
                Node0TokenV2
            );
            
            const lockAmount = ethers.parseEther("10000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            // Should be able to create time locks
            await expect(
                tokenV2.createTimeLock(user1.address, lockAmount, releaseTime)
            ).to.not.be.reverted;
            
            // Verify lock was created
            expect(await tokenV2.getLockedAmount(user1.address)).to.equal(lockAmount);
            
            // Should prevent transfer of locked tokens
            await expect(
                tokenV2.connect(user1).transfer(user2.address, ethers.parseEther("45000"))
            ).to.be.revertedWithCustomError(tokenV2, "InsufficientUnlockedBalance");
            
            console.log("✅ V2 time lock functionality working");
        });
    });
});