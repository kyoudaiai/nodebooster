const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("Avax0Token (V2 Direct Deploy)", function () {
  let avax0Token;
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

    // Deploy the upgradeable contract
    const Avax0Token = await ethers.getContractFactory("Avax0Token");
    avax0Token = await upgrades.deployProxy(
      Avax0Token,
      [
        "avax0",
        "avax0",
        INITIAL_SUPPLY,
        treasury.address,
        300 // 3% transfer fee
      ],
      { initializer: "initialize" }
    );

    await avax0Token.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      expect(await avax0Token.name()).to.equal("avax0");
      expect(await avax0Token.symbol()).to.equal("avax0");
    });

    it("Should set the right owner", async function () {
      expect(await avax0Token.owner()).to.equal(owner.address);
    });

    it("Should mint initial supply to owner", async function () {
      expect(await avax0Token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("Should set treasury address", async function () {
      expect(await avax0Token.treasury()).to.equal(treasury.address);
    });

    it("Should set transfer fee rate", async function () {
      expect(await avax0Token.transferFeeRate()).to.equal(300);
    });

    it("Should set fee exemptions correctly", async function () {
      expect(await avax0Token.feeExempt(owner.address)).to.be.true;
      expect(await avax0Token.feeExempt(treasury.address)).to.be.true;
      expect(await avax0Token.feeExempt(await avax0Token.getAddress())).to.be.true;
    });

    it("Should set owner as minter", async function () {
      expect(await avax0Token.minters(owner.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      await avax0Token.mint(user1.address, mintAmount);
      
      expect(await avax0Token.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 18);
      
      await expect(
        avax0Token.connect(user1).mint(user1.address, mintAmount)
      ).to.be.revertedWith("Avax0: caller is not a minter");
    });

    it("Should not mint beyond max supply", async function () {
      const excessAmount = MAX_SUPPLY + ethers.parseUnits("1", 18);
      
      await expect(
        avax0Token.mint(user1.address, excessAmount)
      ).to.be.revertedWith("Avax0: minting would exceed max supply");
    });

    it("Should allow batch minting", async function () {
      const recipients = [user1.address, user2.address];
      const amounts = [ethers.parseUnits("100", 18), ethers.parseUnits("200", 18)];
      
      await avax0Token.batchMint(recipients, amounts);
      
      expect(await avax0Token.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await avax0Token.balanceOf(user2.address)).to.equal(amounts[1]);
    });
  });

  describe("Transfer Fees", function () {
    beforeEach(async function () {
      // Mint some tokens to user1
      await avax0Token.mint(user1.address, ethers.parseUnits("1000", 18));
    });

    it("Should charge transfer fee for regular transfers", async function () {
      const transferAmount = ethers.parseUnits("100", 18);
      const expectedFee = (transferAmount * 300n) / 10000n; // 3%
      const expectedReceived = transferAmount - expectedFee;
      
      const initialTreasuryBalance = await avax0Token.balanceOf(treasury.address);
      
      await avax0Token.connect(user1).transfer(user2.address, transferAmount);
      
      expect(await avax0Token.balanceOf(user2.address)).to.equal(expectedReceived);
      expect(await avax0Token.balanceOf(treasury.address)).to.equal(
        initialTreasuryBalance + expectedFee
      );
    });

    it("Should not charge fee for exempt addresses", async function () {
      const transferAmount = ethers.parseUnits("100", 18);
      
      // Transfer from owner (fee exempt) to user2
      await avax0Token.transfer(user2.address, transferAmount);
      
      expect(await avax0Token.balanceOf(user2.address)).to.equal(transferAmount);
    });

    it("Should calculate transfer fee correctly", async function () {
      const amount = ethers.parseUnits("100", 18);
      const expectedFee = (amount * 300n) / 10000n; // 3%
      
      expect(await avax0Token.calculateTransferFee(amount)).to.equal(expectedFee);
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to set new minter", async function () {
      await avax0Token.setMinter(minter.address, true);
      expect(await avax0Token.minters(minter.address)).to.be.true;
    });

    it("Should allow owner to update transfer fee rate", async function () {
      const newFeeRate = 500; // 5%
      
      await avax0Token.setTransferFeeRate(newFeeRate);
      
      expect(await avax0Token.transferFeeRate()).to.equal(newFeeRate);
    });

    it("Should not allow setting fee rate above maximum", async function () {
      const excessiveFeeRate = 600; // 6% > 5% max
      
      await expect(
        avax0Token.setTransferFeeRate(excessiveFeeRate)
      ).to.be.revertedWith("Avax0: fee rate too high");
    });

    it("Should allow owner to update treasury", async function () {
      const newTreasury = user1.address;
      
      await avax0Token.setTreasury(newTreasury);
      
      expect(await avax0Token.treasury()).to.equal(newTreasury);
      expect(await avax0Token.feeExempt(newTreasury)).to.be.true;
      expect(await avax0Token.feeExempt(treasury.address)).to.be.false;
    });
  });

  describe("Pausable", function () {
    it("Should allow owner to pause and unpause", async function () {
      await avax0Token.pause();
      expect(await avax0Token.paused()).to.be.true;
      
      await avax0Token.unpause();
      expect(await avax0Token.paused()).to.be.false;
    });

    it("Should prevent transfers when paused", async function () {
      await avax0Token.pause();
      
      await expect(
        avax0Token.transfer(user1.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(avax0Token, "EnforcedPause");
    });

    it("Should prevent minting when paused", async function () {
      await avax0Token.pause();
      
      await expect(
        avax0Token.mint(user1.address, ethers.parseUnits("100", 18))
      ).to.be.revertedWithCustomError(avax0Token, "EnforcedPause");
    });
  });

  describe("Emergency Recovery", function () {
    it("Should allow owner to recover accidentally sent tokens", async function () {
      // Deploy a mock token
      const MockToken = await ethers.getContractFactory("ERC20Token");
      const mockToken = await MockToken.deploy("Mock Token", "MOCK", ethers.parseUnits("1000", 18));
      await mockToken.waitForDeployment();
      
      // Send some mock tokens to the contract
      const amount = ethers.parseUnits("100", 18);
      await mockToken.transfer(await avax0Token.getAddress(), amount);
      
      const initialOwnerBalance = await mockToken.balanceOf(owner.address);
      
      // Recover the tokens
      await avax0Token.recoverToken(await mockToken.getAddress(), amount);
      
      expect(await mockToken.balanceOf(owner.address)).to.equal(initialOwnerBalance + amount);
    });

    it("Should not allow recovering own tokens", async function () {
      const amount = ethers.parseUnits("100", 18);
      
      await expect(
        avax0Token.recoverToken(await avax0Token.getAddress(), amount)
      ).to.be.revertedWith("Avax0: cannot recover own tokens");
    });
  });

  describe("Upgradeability", function () {
    it("Should return correct version", async function () {
      expect(await avax0Token.version()).to.equal("2.0.0");
    });

    it("Should be upgradeable by owner", async function () {
      // This test would typically involve deploying a new implementation
      // For now, we just verify the upgrade authorization works
      const newImplementation = await ethers.getContractFactory("Avax0Token");
      
      // This should not revert
      await expect(
        upgrades.upgradeProxy(await avax0Token.getAddress(), newImplementation)
      ).to.not.be.reverted;
    });
  });
});