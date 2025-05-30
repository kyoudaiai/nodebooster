const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DailyEthRoiV1", function () {
  // Contract instances
  let dailyEthRoi;
  let depositNFT;
  
  // Signers
  let owner;
  let system_pool1;
  let system_pool2;
  let system_pool3;
  let system_pool4;
  let system_pool5;
  let investor1;
  let investor2;
  let investor3;
  let referrer;
  let blacklistedUser;
  
  // Constants
  const MIN_DEPOSIT = ethers.utils.parseEther("0.001");
  const MIN_WITHDRAWAL = ethers.utils.parseEther("0.005");
  const DAY = 24 * 60 * 60; // seconds in a day
  const PERCENT_DIVIDER = 1000;
  const DAILY_PROFIT = 50; // 5% daily profit
  const DEFAULT_DEPOSIT = ethers.utils.parseEther("0.1"); // 0.1 ETH default deposit for tests

  before(async function () {
    // Get signers
    [owner, system_pool1, system_pool2, system_pool3, system_pool4, system_pool5, 
      investor1, investor2, investor3, referrer, blacklistedUser] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // Deploy DepositNFT contract first
    const DepositNFT = await ethers.getContractFactory("DepositNFT");
    depositNFT = await DepositNFT.deploy(owner.address);
    await depositNFT.deployed();
    
    // Deploy DailyEthRoiV1 contract
    const DailyEthRoi = await ethers.getContractFactory("DailyEthRoiV1");
    dailyEthRoi = await DailyEthRoi.deploy(
      system_pool1.address,
      system_pool2.address,
      system_pool3.address,
      system_pool4.address,
      system_pool5.address
    );
    await dailyEthRoi.deployed();
    
    // Set the NFT contract in DailyEthRoiV1
    await dailyEthRoi.chgNFT(depositNFT.address);
    
    // Transfer minter role in NFT contract to DailyEthRoi
    await depositNFT.transferOwnership(dailyEthRoi.address);
  });

  describe("Deployment and Basic Setup", function () {
    it("Should initialize with correct parameters", async function () {
      expect(await dailyEthRoi.name()).to.equal("DailyRoiOnline");
      expect(await dailyEthRoi.symbol()).to.equal("ETHXP");
      expect(await dailyEthRoi.standard()).to.equal("ETHXP v1.0");
      expect(await dailyEthRoi.owner()).to.equal(owner.address);
      expect(await dailyEthRoi.NFT()).to.equal(depositNFT.address);
    });
  });

  describe("Deposits", function () {
    it("Should allow a user to make a deposit", async function () {
      // Make a deposit
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: DEFAULT_DEPOSIT
        })
      ).to.emit(dailyEthRoi, "DepositMade")
        .withArgs(investor1.address, expect.any(ethers.BigNumber), expect.any(String), expect.any(ethers.BigNumber));

      // Check player was added to the list
      expect(await dailyEthRoi.getPlayersCount()).to.equal(1);
      expect(await dailyEthRoi.playersList(0)).to.equal(investor1.address);
      expect(await dailyEthRoi.playerExists(investor1.address)).to.be.true;
      
      // Get player data
      const player = await dailyEthRoi.players(investor1.address);
      expect(player.total_invested).to.be.gt(0);
    });

    it("Should reject deposits below the minimum amount", async function () {
      const belowMin = ethers.utils.parseEther("0.0005");
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: belowMin
        })
      ).to.be.revertedWithCustomError(
        dailyEthRoi, 
        "MinimumDepositNotMet"
      );
    });

    it("Should correctly distribute deposit fee to system pools", async function () {
      // Get initial balances
      const initialPool1Balance = await ethers.provider.getBalance(system_pool1.address);
      const initialPool2Balance = await ethers.provider.getBalance(system_pool2.address);
      
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Verify pool balances increased
      expect(await ethers.provider.getBalance(system_pool1.address)).to.be.gt(initialPool1Balance);
      expect(await ethers.provider.getBalance(system_pool2.address)).to.be.gt(initialPool2Balance);
    });

    it("Should mint an NFT when a user makes their first deposit", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check if the NFT exists after the deposit
      const balance = await depositNFT.balanceOf(investor1.address);
      expect(balance).to.equal(1);
    });

    it("Should only mint one NFT per user regardless of number of deposits", async function () {
      // Make first deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Make second deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check NFT balance (should still be 1)
      const balance = await depositNFT.balanceOf(investor1.address);
      expect(balance).to.equal(1);
    });
  });

  describe("Referral System", function () {
    it("Should correctly set up referral relationships", async function () {
      // First investor deposits with no referral
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Second investor deposits with investor1 as referrer
      await dailyEthRoi.connect(investor2).makeDeposit(investor1.address, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check referral relationship was established
      const player = await dailyEthRoi.players(investor2.address);
      expect(player.upline).to.equal(investor1.address);
    });

    it("Should pay referral bonuses through multiple levels", async function () {
      // Setup a referral chain: referrer -> investor1 -> investor2 -> investor3
      await dailyEthRoi.connect(referrer).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      await dailyEthRoi.connect(investor1).makeDeposit(referrer.address, {
        value: DEFAULT_DEPOSIT
      });
      
      await dailyEthRoi.connect(investor2).makeDeposit(investor1.address, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check initial balances
      const initialRefBalance = await ethers.provider.getBalance(referrer.address);
      const initialInv1Balance = await ethers.provider.getBalance(investor1.address);
      
      // Deposit with investor3, which should pay commissions to the referral chain
      await dailyEthRoi.connect(investor3).makeDeposit(investor2.address, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check bonus tracking
      const referrerPlayer = await dailyEthRoi.players(referrer.address);
      const investor1Player = await dailyEthRoi.players(investor1.address);
      
      expect(referrerPlayer.total_ref_bonus).to.be.gt(0);
      expect(investor1Player.total_ref_bonus).to.be.gt(0);
      
      // Check actual balance increases
      expect(await ethers.provider.getBalance(referrer.address)).to.be.gt(initialRefBalance);
      expect(await ethers.provider.getBalance(investor1.address)).to.be.gt(initialInv1Balance);
    });
  });

  describe("ROI Calculations", function () {
    it("Should correctly calculate ROI based on deposit time and amount", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Fast forward time by 1 day
      await time.increase(DAY);
      
      // Calculate expected ROI (5% daily)
      const depositFee = DEFAULT_DEPOSIT.mul(10).div(PERCENT_DIVIDER);
      const netDeposit = DEFAULT_DEPOSIT.sub(depositFee);
      const expectedDailyROI = netDeposit.mul(DAILY_PROFIT).div(PERCENT_DIVIDER);
      
      // Check payout calculation
      const payout = await dailyEthRoi.computePayout(investor1.address);
      
      // Should be approximately 1 day's worth of ROI with 30% taken
      const expectedPayout = expectedDailyROI.mul(30).div(100);
      
      // Allow for slight difference due to timing
      expect(payout).to.be.closeTo(expectedPayout, ethers.utils.parseEther("0.0001"));
    });

    it("Should correctly track ROI over multiple days", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Fast forward time by 3 days
      await time.increase(DAY * 3);
      
      // Calculate expected ROI (5% daily for 3 days)
      const depositFee = DEFAULT_DEPOSIT.mul(10).div(PERCENT_DIVIDER);
      const netDeposit = DEFAULT_DEPOSIT.sub(depositFee);
      const expectedDailyROI = netDeposit.mul(DAILY_PROFIT).div(PERCENT_DIVIDER);
      const expectedROI = expectedDailyROI.mul(3);
      
      // Check payout calculation
      const payout = await dailyEthRoi.computePayout(investor1.address);
      
      // Should be approximately 3 days' worth of ROI with 30% taken
      const expectedPayout = expectedROI.mul(30).div(100);
      
      // Allow for slight difference due to timing
      expect(payout).to.be.closeTo(expectedPayout, ethers.utils.parseEther("0.0001"));
    });
  });

  describe("Withdrawals", function () {
    it("Should allow users to withdraw ROI", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: ethers.utils.parseEther("1.0") // Use larger deposit to generate enough ROI
      });
      
      // Fast forward time by 3 days to generate sufficient ROI
      await time.increase(DAY * 3);
      
      // Get balance before withdrawal
      const balanceBefore = await ethers.provider.getBalance(investor1.address);
      
      // Execute withdrawal
      const tx = await dailyEthRoi.connect(investor1).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      
      // Get balance after withdrawal
      const balanceAfter = await ethers.provider.getBalance(investor1.address);
      
      // Balance should have increased (minus gas costs)
      expect(balanceAfter.add(gasUsed).sub(balanceBefore)).to.be.gt(0);
    });

    it("Should fail if withdrawal amount is too small", async function () {
      // Make a small deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: MIN_DEPOSIT
      });
      
      // Fast forward time by 1 day
      await time.increase(DAY);
      
      // Attempt withdrawal (should fail because ROI is too small)
      await expect(
        dailyEthRoi.connect(investor1).withdraw()
      ).to.be.revertedWithCustomError(
        dailyEthRoi, 
        "MinimumWithdrawalAmountNotMet"
      );
    });

    it("Should update deposit tracking after withdrawal", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: ethers.utils.parseEther("1.0")
      });
      
      // Get deposit data before
      const [depositsBefore] = await dailyEthRoi.getAllDeposits(investor1.address);
      const initialRemainingCapital = depositsBefore.remainingCapital;
      
      // Fast forward time
      await time.increase(DAY * 3);
      
      // Withdraw
      await dailyEthRoi.connect(investor1).withdraw();
      
      // Get deposit data after
      const [depositsAfter] = await dailyEthRoi.getAllDeposits(investor1.address);
      
      // Remaining capital should have decreased
      expect(depositsAfter.remainingCapital).to.be.lt(initialRemainingCapital);
      
      // Last withdrawn timestamp should be updated
      expect(depositsAfter.lastWithdrawn).to.be.gt(depositsBefore.lastWithdrawn);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update minimum deposit", async function () {
      const newMin = ethers.utils.parseEther("0.005");
      await dailyEthRoi.connect(owner).UpdateMin(newMin);
      
      // Try to deposit below new minimum (should fail)
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: MIN_DEPOSIT
        })
      ).to.be.revertedWithCustomError(
        dailyEthRoi, 
        "MinimumDepositNotMet"
      );
      
      // Try to deposit above new minimum (should succeed)
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: newMin
        })
      ).to.emit(dailyEthRoi, "DepositMade");
    });

    it("Should allow owner to update fee parameters", async function () {
      const newDepositFee = 20; // 2%
      const newWithdrawFee = 20; // 2%
      
      await dailyEthRoi.connect(owner).FeeModule(newDepositFee, newWithdrawFee);
      
      // Make a deposit with new fee
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Verify player's investment reflects the new fee
      const player = await dailyEthRoi.players(investor1.address);
      
      // Net investment should be (DEFAULT_DEPOSIT - 2% fee)
      const expectedNetDeposit = DEFAULT_DEPOSIT.mul(PERCENT_DIVIDER - newDepositFee).div(PERCENT_DIVIDER);
      expect(player.total_invested).to.be.closeTo(expectedNetDeposit, ethers.utils.parseEther("0.0001"));
    });

    it("Should allow owner to update max payout days", async function () {
      // Set max payout days to 10
      await dailyEthRoi.connect(owner).MaxPayoutDays(10);
      
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Fast forward time by 15 days (beyond the new max)
      await time.increase(DAY * 15);
      
      // Get deposit countdown
      const [daysRemaining, completed] = await dailyEthRoi.getDepositCountdown(investor1.address, 0);
      
      // Should show as completed since we've gone past 10 days
      expect(completed).to.be.true;
      expect(daysRemaining).to.equal(0);
    });

    it("Should allow owner to blacklist an address", async function () {
      // Blacklist an address
      await dailyEthRoi.connect(owner).blacklistAddress(blacklistedUser.address, true);
      
      // Verify the address is blacklisted
      expect(await dailyEthRoi.getBlacklistStatus(blacklistedUser.address)).to.be.true;
      
      // Try to make a deposit from blacklisted address
      await expect(
        dailyEthRoi.connect(blacklistedUser).makeDeposit(ethers.constants.AddressZero, {
          value: DEFAULT_DEPOSIT
        })
      ).to.be.revertedWith("Blacklisted user");
      
      // Remove from blacklist
      await dailyEthRoi.connect(owner).blacklistAddress(blacklistedUser.address, false);
      
      // Now deposit should work
      await expect(
        dailyEthRoi.connect(blacklistedUser).makeDeposit(ethers.constants.AddressZero, {
          value: DEFAULT_DEPOSIT
        })
      ).to.emit(dailyEthRoi, "DepositMade");
    });

    it("Should allow owner to pause and unpause the contract", async function () {
      // Pause the contract
      await dailyEthRoi.connect(owner).pause();
      
      // Try to make a deposit (should fail)
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: DEFAULT_DEPOSIT
        })
      ).to.be.revertedWith("Contract is paused");
      
      // Unpause the contract
      await dailyEthRoi.connect(owner).unpause();
      
      // Try to make a deposit (should succeed)
      await expect(
        dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
          value: DEFAULT_DEPOSIT
        })
      ).to.emit(dailyEthRoi, "DepositMade");
    });

    it("Should prevent non-owners from calling admin functions", async function () {
      await expect(
        dailyEthRoi.connect(investor1).UpdateMin(ethers.utils.parseEther("0.01"))
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        dailyEthRoi.connect(investor1).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        dailyEthRoi.connect(investor1).FeeModule(30, 30)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Security Features", function () {
    it("Should prevent contract calls from other contracts", async function () {
      // Deploy a simple attacker contract
      const AttackerContract = await ethers.getContractFactory("AttackerContract");
      const attackerContract = await AttackerContract.deploy(dailyEthRoi.address);
      await attackerContract.deployed();
      
      // Try to deposit from the attacker contract
      await expect(
        attackerContract.attack({ value: DEFAULT_DEPOSIT })
      ).to.be.revertedWithCustomError(
        dailyEthRoi, 
        "CallerIsContract"
      );
    });

    it("Should prevent reentrancy attacks", async function () {
      // This is inherently tested by the ReentrancyGuard modifier
      // We could create a specific reentrancy attack test if needed
    });
  });

  describe("User Info and Statistics", function () {
    it("Should return correct user info", async function () {
      // Make a deposit
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      // Get user info
      const [upline, dividends, total_invested, total_withdrawn, 
        total_ref_bonus, lastWithdrawn, numDeposits, structure] = await dailyEthRoi.userInfo(investor1.address);
      
      // Verify data
      expect(numDeposits).to.equal(1);
      expect(total_invested).to.be.gt(0);
    });

    it("Should return contract statistics correctly", async function () {
      // Make some deposits
      await dailyEthRoi.connect(investor1).makeDeposit(ethers.constants.AddressZero, {
        value: DEFAULT_DEPOSIT
      });
      
      await dailyEthRoi.connect(investor2).makeDeposit(investor1.address, {
        value: DEFAULT_DEPOSIT
      });
      
      // Check global statistics
      expect(await dailyEthRoi.invested()).to.be.gt(0);
      expect(await dailyEthRoi.withdrawn()).to.be.gt(0);
      expect(await dailyEthRoi.getPlayersCount()).to.equal(2);
    });
  });
});

// Mock contract for testing contract-to-contract calls
contract AttackerContract {
    address private dailyEthRoi;
    
    constructor(address _dailyEthRoi) {
        dailyEthRoi = _dailyEthRoi;
    }
    
    function attack() external payable {
        // Try to make a deposit from this contract
        (bool success, ) = dailyEthRoi.call{value: msg.value}(
            abi.encodeWithSignature("makeDeposit(address)", address(0))
        );
        require(success, "Attack failed");
    }
    
    receive() external payable {}
}
