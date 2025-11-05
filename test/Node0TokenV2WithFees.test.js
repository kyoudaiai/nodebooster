const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Node0TokenV2 with Transfer Fees", function () {
    let token, owner, treasury, user1, user2, user3;
    
    const INITIAL_SUPPLY = ethers.parseEther("100000000"); // 100M
    const TRANSFER_FEE_RATE = 250; // 2.5%
    
    beforeEach(async function () {
        [owner, treasury, user1, user2, user3] = await ethers.getSigners();
        
        // Deploy Node0TokenV2 with transfer fees
        const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
        token = await upgrades.deployProxy(
            Node0TokenV2,
            ["Node0Token", "NODE0", INITIAL_SUPPLY],
            { initializer: "initialize", kind: "uups" }
        );
        await token.waitForDeployment();
        
        // Initialize V2 features (transfer fees)
        await token.initializeV2(treasury.address, TRANSFER_FEE_RATE);
        
        // Setup test balances
        await token.transfer(user1.address, ethers.parseEther("50000"));
        await token.transfer(user2.address, ethers.parseEther("10000"));
    });
    
    describe("Transfer Fee Functionality", function () {
        it("Should charge transfer fee on regular transfers", async function () {
            const transferAmount = ethers.parseEther("1000");
            const expectedFee = (transferAmount * BigInt(TRANSFER_FEE_RATE)) / 10000n;
            const expectedTransfer = transferAmount - expectedFee;
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            const initialTreasuryBalance = await token.balanceOf(treasury.address);
            
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "FeeCollected")
             .withArgs(user1.address, user2.address, expectedFee);
            
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + expectedTransfer);
            expect(await token.balanceOf(treasury.address)).to.equal(initialTreasuryBalance + expectedFee);
        });
        
        it("Should not charge fee for exempt addresses", async function () {
            // Set user1 as fee exempt
            await token.setFeeExempt(user1.address, true);
            
            const transferAmount = ethers.parseEther("1000");
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            const initialTreasuryBalance = await token.balanceOf(treasury.address);
            
            await token.connect(user1).transfer(user2.address, transferAmount);
            
            // Full amount should be transferred, no fee
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + transferAmount);
            expect(await token.balanceOf(treasury.address)).to.equal(initialTreasuryBalance);
        });
        
        it("Should respect time locks with transfer fees", async function () {
            const lockAmount = ethers.parseEther("20000");
            const transferAmount = ethers.parseEther("40000"); // More than available after lock
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            // Create time lock
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Should fail - not enough unlocked balance
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.be.revertedWithCustomError(token, "InsufficientUnlockedBalance");
            
            // Should succeed with available balance
            const availableBalance = await token.getAvailableBalance(user1.address);
            const transferableAmount = ethers.parseEther("10000");
            
            expect(transferableAmount).to.be.lte(availableBalance);
            
            await expect(
                token.connect(user1).transfer(user2.address, transferableAmount)
            ).to.not.be.reverted;
        });
        
        it("Should calculate fees correctly", async function () {
            const amount = ethers.parseEther("1000");
            const expectedFee = (amount * BigInt(TRANSFER_FEE_RATE)) / 10000n;
            
            expect(await token.calculateTransferFee(amount)).to.equal(expectedFee);
        });
        
        it("Should allow owner to update transfer fee rate", async function () {
            const newRate = 500; // 5%
            
            await expect(token.setTransferFeeRate(newRate))
                .to.emit(token, "TransferFeeRateUpdated")
                .withArgs(TRANSFER_FEE_RATE, newRate);
            
            expect(await token.transferFeeRate()).to.equal(newRate);
        });
        
        it("Should not allow fee rate above maximum", async function () {
            const tooHighRate = 600; // 6% > 5% max
            
            await expect(
                token.setTransferFeeRate(tooHighRate)
            ).to.be.revertedWith("Node0: fee rate too high");
        });
        
        it("Should allow treasury address update", async function () {
            const newTreasury = user3.address;
            
            await expect(token.setTreasury(newTreasury))
                .to.emit(token, "TreasuryUpdated")
                .withArgs(treasury.address, newTreasury);
            
            expect(await token.treasury()).to.equal(newTreasury);
            expect(await token.feeExempt(newTreasury)).to.be.true;
            expect(await token.feeExempt(treasury.address)).to.be.false;
        });
    });
    
    describe("Upgrade Safety", function () {
        it("Should preserve all state during upgrade from V1", async function () {
            // This test simulates upgrading from a V1 contract
            // Deploy V1 first
            const Node0TokenV1 = await ethers.getContractFactory("Node0TokenV1");
            const tokenV1 = await upgrades.deployProxy(
                Node0TokenV1,
                ["Node0Token", "NODE0", INITIAL_SUPPLY],
                { initializer: "initialize", kind: "uups" }
            );
            await tokenV1.waitForDeployment();
            
            // Setup some state in V1
            await tokenV1.transfer(user1.address, ethers.parseEther("50000"));
            await tokenV1.setMinter(user1.address, true);
            
            // Capture V1 state
            const v1State = {
                totalSupply: await tokenV1.totalSupply(),
                user1Balance: await tokenV1.balanceOf(user1.address),
                user1IsMinter: await tokenV1.minters(user1.address),
                owner: await tokenV1.owner()
            };
            
            // Upgrade to V2
            const Node0TokenV2 = await ethers.getContractFactory("Node0TokenV2");
            const tokenV2 = await upgrades.upgradeProxy(
                await tokenV1.getAddress(),
                Node0TokenV2
            );
            
            // Initialize V2 features
            await tokenV2.initializeV2(treasury.address, TRANSFER_FEE_RATE);
            
            // Verify all V1 state preserved
            expect(await tokenV2.totalSupply()).to.equal(v1State.totalSupply);
            expect(await tokenV2.balanceOf(user1.address)).to.equal(v1State.user1Balance);
            expect(await tokenV2.minters(user1.address)).to.equal(v1State.user1IsMinter);
            expect(await tokenV2.owner()).to.equal(v1State.owner);
            
            // Verify V2 features work
            expect(await tokenV2.treasury()).to.equal(treasury.address);
            expect(await tokenV2.transferFeeRate()).to.equal(TRANSFER_FEE_RATE);
            expect(await tokenV2.version()).to.equal("2.0.0");
            
            // Test transfer with fees
            const transferAmount = ethers.parseEther("1000");
            await expect(
                tokenV2.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(tokenV2, "FeeCollected");
        });
        
        it("Should not allow double initialization of V2 features", async function () {
            await expect(
                token.initializeV2(treasury.address, TRANSFER_FEE_RATE)
            ).to.be.revertedWith("Node0: V2 already initialized");
        });
    });
    
    describe("Combined Time Lock and Transfer Fee Features", function () {
        it("Should handle complex scenario with locks and fees", async function () {
            // Create time lock for part of user1's balance
            const lockAmount = ethers.parseEther("20000");
            const currentBlock = await ethers.provider.getBlock('latest');
            const releaseTime = currentBlock.timestamp + 3600;
            
            await token.createTimeLock(user1.address, lockAmount, releaseTime);
            
            // Transfer within available balance
            const transferAmount = ethers.parseEther("10000");
            const expectedFee = (transferAmount * BigInt(TRANSFER_FEE_RATE)) / 10000n;
            const expectedTransfer = transferAmount - expectedFee;
            
            const initialUser2Balance = await token.balanceOf(user2.address);
            const initialTreasuryBalance = await token.balanceOf(treasury.address);
            
            await token.connect(user1).transfer(user2.address, transferAmount);
            
            // Verify transfer with fee
            expect(await token.balanceOf(user2.address)).to.equal(initialUser2Balance + expectedTransfer);
            expect(await token.balanceOf(treasury.address)).to.equal(initialTreasuryBalance + expectedFee);
            
            // Verify lock still intact
            expect(await token.getLockedAmount(user1.address)).to.equal(lockAmount);
        });
    });
});