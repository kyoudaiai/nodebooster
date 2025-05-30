const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DailyEthRoiV1Upgradeable", function () {
  let dailyEthRoi;
  let owner;
  let investor1;
  let investor2;
  let referrer;
  
  // Test parameters
  const minInvestment = ethers.utils.parseEther("0.01");  // 0.01 ETH
  const maxInvestment = ethers.utils.parseEther("10");    // 10 ETH
  const dailyRoi = 100;  // 1% daily ROI
  const referralPercentage = 500;  // 5% referral bonus

  beforeEach(async function () {
    // Get signers for testing
    [owner, investor1, investor2, referrer] = await ethers.getSigners();

    // Deploy the contract
    const DailyEthRoi = await ethers.getContractFactory("DailyEthRoiV1Upgradeable");
    dailyEthRoi = await upgrades.deployProxy(
      DailyEthRoi, 
      [minInvestment, maxInvestment, dailyRoi, referralPercentage],
      { initializer: 'initialize' }
    );
    await dailyEthRoi.deployed();
  });

  it("should initialize with correct parameters", async function () {
    expect(await dailyEthRoi.minInvestment()).to.equal(minInvestment);
    expect(await dailyEthRoi.maxInvestment()).to.equal(maxInvestment);
    expect(await dailyEthRoi.dailyRoi()).to.equal(dailyRoi);
    expect(await dailyEthRoi.referralPercentage()).to.equal(referralPercentage);
    expect(await dailyEthRoi.owner()).to.equal(owner.address);
  });

  it("should allow investment and track user data", async function () {
    const investAmount = ethers.utils.parseEther("1");
    
    await expect(
      dailyEthRoi.connect(investor1).invest(referrer.address, { value: investAmount })
    ).to.emit(dailyEthRoi, "Invested")
      .withArgs(investor1.address, investAmount, referrer.address);

    const userInvestments = await dailyEthRoi.getUserInvestments(investor1.address);
    expect(userInvestments.length).to.equal(1);
    expect(userInvestments[0].amount).to.equal(investAmount);
    expect(userInvestments[0].active).to.be.true;

    const user = await dailyEthRoi.users(investor1.address);
    expect(user.totalInvested).to.equal(investAmount);
    expect(user.referrer).to.equal(referrer.address);

    const referrals = await dailyEthRoi.getUserReferrals(referrer.address);
    expect(referrals.length).to.equal(1);
    expect(referrals[0]).to.equal(investor1.address);
  });

  it("should calculate and allow claiming of ROI", async function () {
    const investAmount = ethers.utils.parseEther("1");
    
    // Make an investment
    await dailyEthRoi.connect(investor1).invest(ethers.constants.AddressZero, { value: investAmount });
    
    // Fast forward 2 days
    await time.increase(2 * 24 * 60 * 60);
    
    // Check pending ROI (should be ~2% of investment)
    const pendingROI = await dailyEthRoi.getPendingROI(investor1.address);
    const expectedROI = investAmount.mul(dailyRoi).mul(2).div(10000);
    expect(pendingROI).to.be.closeTo(expectedROI, ethers.utils.parseEther("0.0001"));
    
    // Claim ROI
    await expect(
      dailyEthRoi.connect(investor1).claimROI()
    ).to.emit(dailyEthRoi, "ROIClaimed");
  });

  it("should handle referral bonuses correctly", async function () {
    const investAmount = ethers.utils.parseEther("1");
    const referralBonus = investAmount.mul(referralPercentage).div(10000);
    
    const referrerInitialBalance = await ethers.provider.getBalance(referrer.address);
    
    // Make an investment with referral
    await dailyEthRoi.connect(investor1).invest(referrer.address, { value: investAmount });
    
    // Check referrer received the bonus
    const referrerFinalBalance = await ethers.provider.getBalance(referrer.address);
    expect(referrerFinalBalance.sub(referrerInitialBalance)).to.equal(referralBonus);
    
    // Check referral data
    const referrer1 = await dailyEthRoi.users(referrer.address);
    expect(referrer1.referralBonus).to.equal(referralBonus);
  });

  it("should allow owner to update parameters", async function () {
    const newMinInvestment = ethers.utils.parseEther("0.05");
    const newMaxInvestment = ethers.utils.parseEther("5");
    const newDailyRoi = 150;
    const newReferralPercentage = 600;
    
    await dailyEthRoi.updateParameters(
      newMinInvestment,
      newMaxInvestment,
      newDailyRoi,
      newReferralPercentage
    );
    
    expect(await dailyEthRoi.minInvestment()).to.equal(newMinInvestment);
    expect(await dailyEthRoi.maxInvestment()).to.equal(newMaxInvestment);
    expect(await dailyEthRoi.dailyRoi()).to.equal(newDailyRoi);
    expect(await dailyEthRoi.referralPercentage()).to.equal(newReferralPercentage);
  });

  it("should enforce investment limits", async function () {
    const tooSmall = ethers.utils.parseEther("0.009");
    const tooLarge = ethers.utils.parseEther("11");
    
    await expect(
      dailyEthRoi.connect(investor1).invest(ethers.constants.AddressZero, { value: tooSmall })
    ).to.be.revertedWith("Investment below minimum");
    
    await expect(
      dailyEthRoi.connect(investor1).invest(ethers.constants.AddressZero, { value: tooLarge })
    ).to.be.revertedWith("Investment above maximum");
  });
});
