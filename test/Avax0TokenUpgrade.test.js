const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0Token Upgrade Tests", function () {
  let avax0TokenV1;
  let avax0TokenV2;
  let owner;
  let treasury;
  let minter;
  let user1;
  let user2;
  let addrs;

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 18); // 1M tokens
  const MAX_SUPPLY = ethers.parseUnits("100000000", 18); // 100M tokens

  beforeEach(async function () {
    [owner, treasury, minter, user1, user2, ...addrs] = await ethers.getSigners();
  });

  describe("Version 1 (Basic Token)", function () {
    beforeEach(async function () {
      // Deploy V1 contract
      const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
      avax0TokenV1 = await upgrades.deployProxy(
        Avax0TokenV1,
        [
          "avax0",
          "avax0",
          INITIAL_SUPPLY
        ],
        { initializer: "initialize" }
      );

      await avax0TokenV1.waitForDeployment();
    });

    describe("V1 Basic Functionality", function () {
      it("Should deploy V1 with correct parameters", async function () {
        expect(await avax0TokenV1.name()).to.equal("avax0");
        expect(await avax0TokenV1.symbol()).to.equal("avax0");
        expect(await avax0TokenV1.version()).to.equal("1.0.0");
        expect(await avax0TokenV1.totalSupply()).to.equal(INITIAL_SUPPLY);
        expect(await avax0TokenV1.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
      });

      it("Should set owner as minter in V1", async function () {
        expect(await avax0TokenV1.minters(owner.address)).to.be.true;
      });

      it("Should allow minting in V1", async function () {
        const mintAmount = ethers.parseUnits("1000", 18);
        
        await avax0TokenV1.mint(user1.address, mintAmount);
        
        expect(await avax0TokenV1.balanceOf(user1.address)).to.equal(mintAmount);
      });

      it("Should allow transfers without fees in V1", async function () {
        const transferAmount = ethers.parseUnits("100", 18);
        
        await avax0TokenV1.transfer(user1.address, transferAmount);
        
        // User should receive full amount (no fees in V1)
        expect(await avax0TokenV1.balanceOf(user1.address)).to.equal(transferAmount);
        expect(await avax0TokenV1.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY - transferAmount);
      });

      it("Should not have transfer fee functionality in V1", async function () {
        // V1 should not have these state variables/functions
        try {
          await avax0TokenV1.transferFeeRate();
          expect.fail("transferFeeRate should not exist in V1");
        } catch (error) {
          expect(error.message).to.include("transferFeeRate");
        }
        
        try {
          await avax0TokenV1.treasury();
          expect.fail("treasury should not exist in V1");
        } catch (error) {
          expect(error.message).to.include("treasury");
        }
      });

      it("Should be pausable in V1", async function () {
        await avax0TokenV1.pause();
        expect(await avax0TokenV1.paused()).to.be.true;
        
        await expect(
          avax0TokenV1.transfer(user1.address, ethers.parseUnits("100", 18))
        ).to.be.revertedWithCustomError(avax0TokenV1, "EnforcedPause");
        
        await avax0TokenV1.unpause();
        expect(await avax0TokenV1.paused()).to.be.false;
      });
    });

    describe("Upgrade from V1 to V2", function () {
      it("Should successfully upgrade from V1 to V2", async function () {
        // Verify initial V1 state
        expect(await avax0TokenV1.version()).to.equal("1.0.0");
        expect(await avax0TokenV1.totalSupply()).to.equal(INITIAL_SUPPLY);
        
        // Upgrade to V2
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        const upgraded = await upgrades.upgradeProxy(
          await avax0TokenV1.getAddress(),
          Avax0TokenV2,
          { unsafeSkipStorageCheck: true, unsafeAllow: ["missing-public-upgradeto"] }
        );
        
        // Now initialize V2 features
        await upgraded.initializeV2(treasury.address, 300); // 3% fee
        
        // Verify upgrade
        expect(await upgraded.version()).to.equal("2.0.0");
        expect(await upgraded.totalSupply()).to.equal(INITIAL_SUPPLY);
        expect(await upgraded.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
        
        // Verify V2 features are available
        expect(await upgraded.treasury()).to.equal(treasury.address);
        expect(await upgraded.transferFeeRate()).to.equal(300);
        
        avax0TokenV2 = upgraded;
      });

      it("Should preserve token balances during upgrade", async function () {
        // Transfer some tokens before upgrade
        const transferAmount = ethers.parseUnits("100", 18);
        await avax0TokenV1.transfer(user1.address, transferAmount);
        await avax0TokenV1.mint(user2.address, ethers.parseUnits("500", 18));
        
        const ownerBalanceBefore = await avax0TokenV1.balanceOf(owner.address);
        const user1BalanceBefore = await avax0TokenV1.balanceOf(user1.address);
        const user2BalanceBefore = await avax0TokenV1.balanceOf(user2.address);
        const totalSupplyBefore = await avax0TokenV1.totalSupply();
        
        // Upgrade to V2
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        const upgraded = await upgrades.upgradeProxy(
          await avax0TokenV1.getAddress(),
          Avax0TokenV2,
          { unsafeSkipStorageCheck: true, unsafeAllow: ["missing-public-upgradeto"] }
        );
        
        await upgraded.initializeV2(treasury.address, 300);
        
        // Verify balances are preserved
        expect(await upgraded.balanceOf(owner.address)).to.equal(ownerBalanceBefore);
        expect(await upgraded.balanceOf(user1.address)).to.equal(user1BalanceBefore);
        expect(await upgraded.balanceOf(user2.address)).to.equal(user2BalanceBefore);
        expect(await upgraded.totalSupply()).to.equal(totalSupplyBefore);
      });

      it("Should preserve minter permissions during upgrade", async function () {
        // Add additional minter in V1
        await avax0TokenV1.setMinter(minter.address, true);
        
        expect(await avax0TokenV1.minters(owner.address)).to.be.true;
        expect(await avax0TokenV1.minters(minter.address)).to.be.true;
        
        // Upgrade to V2
        const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
        const upgraded = await upgrades.upgradeProxy(
          await avax0TokenV1.getAddress(),
          Avax0TokenV2,
          { unsafeSkipStorageCheck: true, unsafeAllow: ["missing-public-upgradeto"] }
        );
        
        await upgraded.initializeV2(treasury.address, 300);
        
        // Verify minter permissions are preserved
        expect(await upgraded.minters(owner.address)).to.be.true;
        expect(await upgraded.minters(minter.address)).to.be.true;
        
        // Verify minting still works
        const mintAmount = ethers.parseUnits("1000", 18);
        await upgraded.connect(minter).mint(user1.address, mintAmount);
        expect(await upgraded.balanceOf(user1.address)).to.equal(mintAmount);
      });
    });
  });

  describe("Version 2 (With Transfer Fees)", function () {
    beforeEach(async function () {
      // Deploy V1 first
      const Avax0TokenV1 = await ethers.getContractFactory("Avax0TokenV1");
      avax0TokenV1 = await upgrades.deployProxy(
        Avax0TokenV1,
        [
          "avax0",
          "avax0",
          INITIAL_SUPPLY
        ],
        { initializer: "initialize" }
      );

      await avax0TokenV1.waitForDeployment();

      // Upgrade to V2
      const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
      avax0TokenV2 = await upgrades.upgradeProxy(
        await avax0TokenV1.getAddress(),
        Avax0TokenV2,
        { unsafeSkipStorageCheck: true, unsafeAllow: ["missing-public-upgradeto"] }
      );
      
      // Initialize V2 features
      await avax0TokenV2.initializeV2(treasury.address, 300); // 3% fee
    });

    describe("V2 Transfer Fee Functionality", function () {
      beforeEach(async function () {
        // Mint some tokens to user1 for testing
        await avax0TokenV2.mint(user1.address, ethers.parseUnits("1000", 18));
      });

      it("Should charge transfer fees for regular transfers", async function () {
        const transferAmount = ethers.parseUnits("100", 18);
        const expectedFee = (transferAmount * 300n) / 10000n; // 3%
        const expectedReceived = transferAmount - expectedFee;
        
        const initialTreasuryBalance = await avax0TokenV2.balanceOf(treasury.address);
        
        await avax0TokenV2.connect(user1).transfer(user2.address, transferAmount);
        
        expect(await avax0TokenV2.balanceOf(user2.address)).to.equal(expectedReceived);
        expect(await avax0TokenV2.balanceOf(treasury.address)).to.equal(
          initialTreasuryBalance + expectedFee
        );
      });

      it("Should not charge fees for exempt addresses", async function () {
        const transferAmount = ethers.parseUnits("100", 18);
        
        // Transfer from owner (fee exempt) to user2
        await avax0TokenV2.transfer(user2.address, transferAmount);
        
        expect(await avax0TokenV2.balanceOf(user2.address)).to.equal(transferAmount);
      });

      it("Should calculate transfer fees correctly", async function () {
        const amount = ethers.parseUnits("100", 18);
        const expectedFee = (amount * 300n) / 10000n; // 3%
        
        expect(await avax0TokenV2.calculateTransferFee(amount)).to.equal(expectedFee);
      });

      it("Should allow fee rate updates", async function () {
        const newFeeRate = 500; // 5%
        
        await avax0TokenV2.setTransferFeeRate(newFeeRate);
        
        expect(await avax0TokenV2.transferFeeRate()).to.equal(newFeeRate);
        
        // Test new fee rate
        const amount = ethers.parseUnits("100", 18);
        const expectedFee = (amount * 500n) / 10000n; // 5%
        
        expect(await avax0TokenV2.calculateTransferFee(amount)).to.equal(expectedFee);
      });

      it("Should allow treasury updates", async function () {
        const newTreasury = user1.address;
        
        await avax0TokenV2.setTreasury(newTreasury);
        
        expect(await avax0TokenV2.treasury()).to.equal(newTreasury);
        expect(await avax0TokenV2.feeExempt(newTreasury)).to.be.true;
        expect(await avax0TokenV2.feeExempt(treasury.address)).to.be.false;
      });

      it("Should emit FeeCollected events", async function () {
        const transferAmount = ethers.parseUnits("100", 18);
        const expectedFee = (transferAmount * 300n) / 10000n;
        
        await expect(
          avax0TokenV2.connect(user1).transfer(user2.address, transferAmount)
        ).to.emit(avax0TokenV2, "FeeCollected")
         .withArgs(user1.address, user2.address, expectedFee);
      });

      it("Should handle zero transfer fee rate", async function () {
        // Set fee rate to 0
        await avax0TokenV2.setTransferFeeRate(0);
        
        const transferAmount = ethers.parseUnits("100", 18);
        
        await avax0TokenV2.connect(user1).transfer(user2.address, transferAmount);
        
        // User should receive full amount when fee rate is 0
        expect(await avax0TokenV2.balanceOf(user2.address)).to.equal(transferAmount);
        expect(await avax0TokenV2.calculateTransferFee(transferAmount)).to.equal(0);
      });

      it("Should not allow fee rate above maximum", async function () {
        const excessiveFeeRate = 600; // 6% > 5% max
        
        await expect(
          avax0TokenV2.setTransferFeeRate(excessiveFeeRate)
        ).to.be.revertedWith("Avax0: fee rate too high");
      });
    });

    describe("V2 Compatibility with V1 Functions", function () {
      it("Should maintain all V1 functionality in V2", async function () {
        // Minting should still work
        const mintAmount = ethers.parseUnits("500", 18);
        await avax0TokenV2.mint(user1.address, mintAmount);
        expect(await avax0TokenV2.balanceOf(user1.address)).to.equal(mintAmount);
        
        // Batch minting should still work
        const recipients = [user1.address, user2.address];
        const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
        
        await avax0TokenV2.batchMint(recipients, amounts);
        
        expect(await avax0TokenV2.balanceOf(user1.address)).to.equal(mintAmount + amounts[0]);
        expect(await avax0TokenV2.balanceOf(user2.address)).to.equal(amounts[1]);
        
        // Pause/unpause should still work
        await avax0TokenV2.pause();
        expect(await avax0TokenV2.paused()).to.be.true;
        
        await avax0TokenV2.unpause();
        expect(await avax0TokenV2.paused()).to.be.false;
      });

      it("Should maintain minter functionality in V2", async function () {
        await avax0TokenV2.setMinter(minter.address, true);
        expect(await avax0TokenV2.minters(minter.address)).to.be.true;
        
        const mintAmount = ethers.parseUnits("1000", 18);
        await avax0TokenV2.connect(minter).mint(user1.address, mintAmount);
        expect(await avax0TokenV2.balanceOf(user1.address)).to.equal(mintAmount);
      });
    });

    describe("V2 Version and Upgrade Protection", function () {
      it("Should return correct version for V2", async function () {
        expect(await avax0TokenV2.version()).to.equal("2.0.0");
      });

      it("Should not allow double initialization of V2", async function () {
        await expect(
          avax0TokenV2.initializeV2(treasury.address, 300)
        ).to.be.revertedWith("Avax0: V2 already initialized");
      });

      it("Should be upgradeable to future versions", async function () {
        // This test verifies the upgrade mechanism is still working
        const newImplementation = await ethers.getContractFactory("Avax0TokenV2");
        
        await expect(
          upgrades.upgradeProxy(await avax0TokenV2.getAddress(), newImplementation)
        ).to.not.be.reverted;
      });
    });
  });

  describe("Direct V2 Deployment", function () {
    it("Should allow direct deployment of V2 with full initialization", async function () {
      const Avax0TokenV2 = await ethers.getContractFactory("Avax0TokenV2");
      const directV2 = await upgrades.deployProxy(
        Avax0TokenV2,
        [
          "avax0",
          "avax0",
          INITIAL_SUPPLY,
          treasury.address,
          300 // 3% transfer fee
        ],
        { initializer: "initialize" }
      );

      await directV2.waitForDeployment();

      // Verify it's V2 with all features
      expect(await directV2.version()).to.equal("2.0.0");
      expect(await directV2.name()).to.equal("avax0");
      expect(await directV2.symbol()).to.equal("avax0");
      expect(await directV2.treasury()).to.equal(treasury.address);
      expect(await directV2.transferFeeRate()).to.equal(300);
      expect(await directV2.totalSupply()).to.equal(INITIAL_SUPPLY);
      
      // Test transfer fee functionality
      const transferAmount = ethers.parseUnits("100", 18);
      await directV2.mint(user1.address, ethers.parseUnits("1000", 18));
      
      const expectedFee = (transferAmount * 300n) / 10000n;
      const expectedReceived = transferAmount - expectedFee;
      
      await directV2.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await directV2.balanceOf(user2.address)).to.equal(expectedReceived);
    });
  });
});