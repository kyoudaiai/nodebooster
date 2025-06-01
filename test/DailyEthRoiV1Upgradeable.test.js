const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("DailyEthRoiV1Upgradeable", function () {
  let owner, addr1, addr2, addr3, systemPool1, systemPool2, systemPool3, systemPool4, systemPool5;
  let DailyEthRoiV1Upgradeable, DepositNFTUpgradeable;
  let dailyEthRoi, depositNFT;

  // Deploy the contracts before each test
  beforeEach(async function () {
    // Get signers
    [owner, addr1, addr2, addr3, systemPool1, systemPool2, systemPool3, systemPool4, systemPool5] = await ethers.getSigners();

    // Deploy DepositNFTUpgradeable
    DepositNFTUpgradeable = await ethers.getContractFactory("DepositNFTUpgradeable");
    depositNFT = await upgrades.deployProxy(DepositNFTUpgradeable, [owner.address], {
      initializer: "initialize",
    });
    await depositNFT.waitForDeployment();

    // Deploy DailyEthRoiV1Upgradeable
    DailyEthRoiV1Upgradeable = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
    dailyEthRoi = await upgrades.deployProxy(
      DailyEthRoiV1Upgradeable,
      [systemPool1.address, systemPool2.address, systemPool3.address, systemPool4.address, systemPool5.address],
      { initializer: "initialize" }
    );
    await dailyEthRoi.waitForDeployment();

    // Set NFT in the DailyEthRoi contract
    await dailyEthRoi.chgNFT(await depositNFT.getAddress());
  });

  describe("Initialization", function () {
    it("should set the right owner", async function () {
      expect(await dailyEthRoi.owner()).to.equal(owner.address);
    });

    it("should set the right name and symbol", async function () {
      expect(await dailyEthRoi.name()).to.equal("DailyRoiOnline");
      expect(await dailyEthRoi.symbol()).to.equal("ETHXP");
    });

    it("should have correct initial values", async function () {
      expect(await dailyEthRoi.invested()).to.equal(0);
      expect(await dailyEthRoi.withdrawn()).to.equal(0);
      expect(await dailyEthRoi.ref_bonus()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("should allow making deposits", async function () {
      const depositAmount = ethers.parseEther("1.0");
      
      await expect(dailyEthRoi.connect(addr1).makeDeposit(owner.address, { value: depositAmount }))
        .to.emit(dailyEthRoi, "DepositMade");
      
      // Check user's deposit was recorded
      const userInfo = await dailyEthRoi.userInfo(addr1.address);
      expect(userInfo[2]).to.be.greaterThan(0); // total_invested
    });

    it("should reject deposits below minimum", async function () {
      const tooSmallDeposit = ethers.parseEther("0.0001");
      await expect(dailyEthRoi.connect(addr1).makeDeposit(owner.address, { value: tooSmallDeposit }))
        .to.be.revertedWithCustomError(dailyEthRoi, "MinimumDepositNotMet");
    });
  });

  describe("Withdrawals", function () {
    it("should allow making withdrawals after some time", async function () {
      // Make a deposit first
      const depositAmount = ethers.parseEther("1.0");
      await dailyEthRoi.connect(addr1).makeDeposit(owner.address, { value: depositAmount });
      
      // Fast forward time (1 day)
      await network.provider.send("evm_increaseTime", [86400]);
      await network.provider.send("evm_mine");
      
      // Check that there's something to withdraw
      const payoutBefore = await dailyEthRoi.computePayout(addr1.address);
      
      // If there's enough to withdraw, test it
      if (payoutBefore > ethers.parseEther("0.005")) {
        // Withdraw
        await expect(dailyEthRoi.connect(addr1).withdraw())
          .to.emit(dailyEthRoi, "WithdrawalMade");
        
        // Check the user's total withdrawn increased
        const userInfo = await dailyEthRoi.userInfo(addr1.address);
        expect(userInfo[3]).to.be.greaterThan(0); // total_withdrawn
      }
    });
  });

  describe("Admin functions", function () {
    it("should allow owner to update parameters", async function () {
      // Test changing deposit fee
      await dailyEthRoi.connect(owner).FeeModule(20, 15);
      
      // Test setting new pool addresses
      await dailyEthRoi.connect(owner).Pool(
        addr1.address,
        addr2.address,
        addr3.address,
        systemPool4.address,
        systemPool5.address
      );
      
      // Test changing minimum deposit
      const newMin = ethers.parseEther("0.002");
      await dailyEthRoi.connect(owner).UpdateMin(newMin);
      
      // Test pause/unpause
      await dailyEthRoi.connect(owner).pause();
      await expect(
        dailyEthRoi.connect(addr1).makeDeposit(owner.address, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWith("Contract is paused");
      
      await dailyEthRoi.connect(owner).unpause();
    });
  });
});
