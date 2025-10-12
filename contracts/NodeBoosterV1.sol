// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title NodeBoosterV1
 * @dev Upgradeable contract for NodeBooster platform on Avalanche C-Chain - Version 1
 * @notice This contract manages user registration, referrals, mining engines, and blacklist functionality
 * 
 * Features:
 * - User registration with USDC payment (25 USDC)
 * - Referral system (10% commission)
 * - Multi-wallet payout distribution
 * - Configurable mining engines
 * - Blacklist functionality for security
 * - Contract detection to prevent bots
 * - Upgradeable using UUPS pattern
 * - Pausable for emergency stops
 */
contract NodeBoosterV1 is 
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    /// @notice Registration fee in USDC (25 USDC with 6 decimals)
    uint256 public constant REGISTRATION_FEE = 25 * 10**6; // 25 USDC
    
    /// @notice Referral commission rate (10% = 1000 basis points)
    uint256 public constant REFERRAL_COMMISSION_RATE = 1000; // 10%
    
    /// @notice Basis points for percentage calculations
    uint256 public constant BASIS_POINTS = 10000; // 100%
    
    /// @notice Maximum number of engines that can be configured
    uint256 public constant MAX_ENGINES = 50;
    
    /// @notice USDC token contract
    IERC20 public usdcToken;
    
    /// @notice Avax0 token contract
    IERC20 public avax0Token;
    
    /// @notice Payout wallet addresses
    address public payoutWallet1;
    address public payoutWallet2;
    address public payoutWallet3;
    
    /// @notice Default referrer address for unregistered referrers
    address public defaultReferrer;
    
    /// @notice Number of active engines
    uint256 public engineCount;

    /// @notice Rewards structure
    struct Rewards {
        uint256 engineId;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawalTime;        
        uint256 amount;                              
        bool completed;
    }

    mapping(uint256 => Rewards) public rewards;
    
    
    /// @notice User account structure
    struct UserAccount {
        bool isRegistered;
        address referrer;
        uint256 totalReferrals;
        uint256 totalReferralRewards;
        uint256 currentEngine; // Current engine ID (0-9)
        uint256 engineStartTime; // When the current engine was activated
        // uint256 pendingRewards; // Accumulated rewards waiting to be claimed
        Rewards[] pendingRewards; // History of rewards
        uint256 totalRewardsClaimed; // Total rewards claimed by user
    }
    
    /// @notice Engine configuration structure
    struct Engine {
        bool isActive;
        uint256 priceInAvax; // Price in AVAX (18 decimals)
        uint256 hashPower; // Hash power units
        uint256 maxRewardCapDays; // Maximum reward period in days
        string name; // Engine name
    }
    
    /// @notice Mapping of user addresses to their accounts
    mapping(address => UserAccount) public userAccounts;
    
    /// @notice Mapping of blacklisted addresses
    mapping(address => bool) public isBlacklisted;
    
    /// @notice List of all registered users
    address[] public usersList;
    
    /// @notice Mapping of engine IDs to engine configurations
    mapping(uint256 => Engine) public engines;
    
    /// @notice Total number of registered users
    uint256 public totalUsers;
    
    /// @notice Total USDC collected from registrations
    uint256 public totalUsdcCollected;
    
    /// @notice Total AVAX0 tokens distributed to users
    uint256 public totalAvax0Distributed;
    
    /// @notice Total engine rewards distributed
    uint256 public totalEngineRewards;
    
    /// @notice Total referral rewards paid
    uint256 public totalReferralRewards;
    
    // Events
    event UserRegistered(
        address indexed user, 
        address indexed referrer, 
        uint256 usdcPaid, 
        uint256 avax0Received,
        uint256 timestamp
    );
    
    event ReferralRewardPaid(
        address indexed referrer, 
        address indexed referee, 
        uint256 reward,
        uint256 timestamp
    );
    
    event PayoutWalletUpdated(
        uint256 indexed walletNumber, 
        address oldWallet, 
        address newWallet
    );
    
    event EngineConfigured(
        uint256 indexed engineId,
        string name,
        uint256 priceInAvax,
        uint256 hashPower,
        uint256 maxRewardCapDays,
        bool isActive
    );
    
    event TokensWithdrawn(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    
    event UserBlacklisted(
        address indexed user,
        bool indexed status,
        address indexed admin
    );
    
    event OwnershipTransferInitiated(
        address indexed previousOwner,
        address indexed newOwner
    );
    
    event DefaultReferrerUpdated(
        address indexed oldReferrer,
        address indexed newReferrer
    );
    
    event EngineUpgraded(
        address indexed user,
        uint256 fromEngine,
        uint256 toEngine,
        uint256 pendingRewards
    );
    
    event RewardsClaimed(
        address indexed user,
        uint256 amount
    );
    
    event PayoutDistributed(
        address indexed wallet,
        uint256 amount
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initialize the contract
     * @param _usdcToken USDC token contract address
     * @param _avax0Token Avax0 token contract address
     * @param _payoutWallet1 First payout wallet address
     * @param _payoutWallet2 Second payout wallet address
     * @param _payoutWallet3 Third payout wallet address
     */
    function initialize(
        address _usdcToken,
        address _avax0Token,
        address _payoutWallet1,
        address _payoutWallet2,
        address _payoutWallet3
    ) public initializer {
        require(_usdcToken != address(0), "NodeBooster: Invalid USDC token address");
        require(_avax0Token != address(0), "NodeBooster: Invalid AVAX0 token address");
        require(_payoutWallet1 != address(0), "NodeBooster: Invalid payout wallet 1");
        require(_payoutWallet2 != address(0), "NodeBooster: Invalid payout wallet 2");
        require(_payoutWallet3 != address(0), "NodeBooster: Invalid payout wallet 3");
        
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        usdcToken = IERC20(_usdcToken);
        avax0Token = IERC20(_avax0Token);
        payoutWallet1 = _payoutWallet1;
        payoutWallet2 = _payoutWallet2;
        payoutWallet3 = _payoutWallet3;
        
        // Set deployer as default referrer initially and register them
        defaultReferrer = msg.sender;
        
        // Register the deployer as the first user (without fees)
        userAccounts[msg.sender] = UserAccount({
            isRegistered: true,
            referrer: address(0),
            totalReferrals: 0,
            totalReferralRewards: 0,
            currentEngine: 0,
            engineStartTime: block.timestamp,
            pendingRewards: new Rewards[](0),
            totalRewardsClaimed: 0
        });
        
        totalUsers = 1;
        usersList.push(msg.sender);
        
        // Initialize with 10 default engines
        _initializeDefaultEngines();
    }
    
    /**
     * @dev Modifier to check if user is not blacklisted
     */
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "NodeBooster: Address is blacklisted");
        _;
    }
    
    /**
     * @dev Modifier to check if address is not a contract
     */
    modifier notContract() {
        require(!_isContract(msg.sender), "NodeBooster: Contracts not allowed");
        _;
    }
    
    /**
     * @dev Register a new user account
     * @param _referrer Address of the referrer (can be address(0) for no referrer)
     */
    function register(address _referrer) external whenNotPaused nonReentrant notBlacklisted notContract {
        require(!userAccounts[msg.sender].isRegistered, "NodeBooster: User already registered");
        require(_referrer != msg.sender, "NodeBooster: Cannot refer yourself");
        
        address finalReferrer = _referrer;
        
        // If referrer is specified, validate and use default if needed
        if (_referrer != address(0)) {
            // If referrer is not registered or is blacklisted, use default referrer
            if (!userAccounts[_referrer].isRegistered || isBlacklisted[_referrer]) {
                finalReferrer = defaultReferrer;
            }
        } else {
            // If no referrer specified, use default referrer
            finalReferrer = defaultReferrer;
        }
        
        // Ensure final referrer is valid (registered and not blacklisted)
        if (finalReferrer != address(0) && (!userAccounts[finalReferrer].isRegistered || isBlacklisted[finalReferrer])) {
            finalReferrer = address(0); // No referrer if default is also invalid
        }
        
        // Transfer USDC from user to contract
        usdcToken.safeTransferFrom(msg.sender, address(this), REGISTRATION_FEE);
        
        // Register the user
        userAccounts[msg.sender] = UserAccount({
            isRegistered: true,
            referrer: finalReferrer,
            totalReferrals: 0,
            totalReferralRewards: 0,
            currentEngine: 0,
            engineStartTime: block.timestamp,
            pendingRewards: new Rewards[](0),
            totalRewardsClaimed: 0
        });
        
        totalUsers++;
        totalUsdcCollected += REGISTRATION_FEE;
        
        // Add user to users list
        usersList.push(msg.sender);
        
        // Transfer 1 AVAX0 token to the user
        uint256 avax0Amount = 1 * 10**18; // 1 AVAX0 token
        avax0Token.safeTransfer(msg.sender, avax0Amount);
        totalAvax0Distributed += avax0Amount;
        
        // Process referral reward
        uint256 referralReward = 0;
        if (finalReferrer != address(0)) {
            referralReward = (REGISTRATION_FEE * REFERRAL_COMMISSION_RATE) / BASIS_POINTS;
            usdcToken.safeTransfer(finalReferrer, referralReward);
            
            userAccounts[finalReferrer].totalReferrals++;
            userAccounts[finalReferrer].totalReferralRewards += referralReward;
            totalReferralRewards += referralReward;
            
            emit ReferralRewardPaid(finalReferrer, msg.sender, referralReward, block.timestamp);
        }
        
        // Distribute remaining USDC to payout wallets
        uint256 remainingAmount = REGISTRATION_FEE - referralReward;
        _distributeToPayoutWallets(remainingAmount);
        
        emit UserRegistered(msg.sender, finalReferrer, REGISTRATION_FEE, avax0Amount, block.timestamp);
    }
    
    /**
     * @dev Configure an engine
     * @param _engineId Engine ID (0-based)
     * @param _name Engine name
     * @param _priceInAvax Price in AVAX (18 decimals)
     * @param _hashPower Hash power units
     * @param _maxRewardCapDays Maximum reward period in days
     * @param _isActive Whether the engine is active
     */
    function configureEngine(
        uint256 _engineId,
        string memory _name,
        uint256 _priceInAvax,
        uint256 _hashPower,
        uint256 _maxRewardCapDays,
        bool _isActive
    ) external onlyOwner {
        require(_engineId < MAX_ENGINES, "NodeBooster: Engine ID exceeds maximum");
        require(_priceInAvax > 0, "NodeBooster: Price must be greater than 0");
        require(_hashPower > 0, "NodeBooster: Hash power must be greater than 0");
        require(_maxRewardCapDays > 0, "NodeBooster: Reward cap days must be greater than 0");
        require(bytes(_name).length > 0, "NodeBooster: Engine name cannot be empty");
        
        engines[_engineId] = Engine({
            isActive: _isActive,
            priceInAvax: _priceInAvax,
            hashPower: _hashPower,
            maxRewardCapDays: _maxRewardCapDays,
            name: _name
        });
        
        // Update engine count if this is a new engine
        if (_engineId >= engineCount) {
            engineCount = _engineId + 1;
        }
        
        emit EngineConfigured(_engineId, _name, _priceInAvax, _hashPower, _maxRewardCapDays, _isActive);
    }
    
    /**
     * @dev Update payout wallet addresses
     * @param _walletNumber Wallet number (1, 2, or 3)
     * @param _newWallet New wallet address
     */
    function updatePayoutWallet(uint256 _walletNumber, address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "NodeBooster: Invalid wallet address");
        require(_walletNumber >= 1 && _walletNumber <= 3, "NodeBooster: Invalid wallet number");
        
        address oldWallet;
        if (_walletNumber == 1) {
            oldWallet = payoutWallet1;
            payoutWallet1 = _newWallet;
        } else if (_walletNumber == 2) {
            oldWallet = payoutWallet2;
            payoutWallet2 = _newWallet;
        } else {
            oldWallet = payoutWallet3;
            payoutWallet3 = _newWallet;
        }
        
        emit PayoutWalletUpdated(_walletNumber, oldWallet, _newWallet);
    }
    
    /**
     * @dev Update default referrer address
     * @param _newDefaultReferrer New default referrer address
     */
    function setDefaultReferrer(address _newDefaultReferrer) external onlyOwner {
        require(_newDefaultReferrer != address(0), "NodeBooster: Invalid default referrer address");
        require(userAccounts[_newDefaultReferrer].isRegistered, "NodeBooster: Default referrer must be registered");
        require(!isBlacklisted[_newDefaultReferrer], "NodeBooster: Default referrer cannot be blacklisted");
        
        address oldReferrer = defaultReferrer;
        defaultReferrer = _newDefaultReferrer;
        
        emit DefaultReferrerUpdated(oldReferrer, _newDefaultReferrer);
    }
    
    /**
     * @dev Get default referrer address
     * @return Default referrer address
     */
    function getDefaultReferrer() external view returns (address) {
        return defaultReferrer;
    }
    
    /**
     * @dev Add or remove address from blacklist
     * @param _user User address to blacklist/unblacklist
     * @param _status True to blacklist, false to unblacklist
     */
    function setBlacklistStatus(address _user, bool _status) external onlyOwner {
        require(_user != address(0), "NodeBooster: Invalid user address");
        require(_user != owner(), "NodeBooster: Cannot blacklist owner");
        require(isBlacklisted[_user] != _status, "NodeBooster: Status already set");
        
        isBlacklisted[_user] = _status;
        emit UserBlacklisted(_user, _status, msg.sender);
    }
    
    /**
     * @dev Batch blacklist multiple addresses
     * @param _users Array of user addresses
     * @param _status True to blacklist, false to unblacklist
     */
    function batchSetBlacklistStatus(address[] calldata _users, bool _status) external onlyOwner {
        require(_users.length > 0, "NodeBooster: Empty users array");
        require(_users.length <= 100, "NodeBooster: Too many users (max 100)");
        
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            require(user != address(0), "NodeBooster: Invalid user address");
            require(user != owner(), "NodeBooster: Cannot blacklist owner");
            
            if (isBlacklisted[user] != _status) {
                isBlacklisted[user] = _status;
                emit UserBlacklisted(user, _status, msg.sender);
            }
        }
    }
    
    /**
     * @dev Check if an address is blacklisted
     * @param _user User address to check
     * @return True if blacklisted, false otherwise
     */
    function getBlacklistStatus(address _user) external view returns (bool) {
        return isBlacklisted[_user];
    }
    
    /**
     * @dev Upgrade user's engine to a higher level
     * @param targetEngine Target engine ID to upgrade to
     */
    function upgradeEngine(uint256 targetEngine) external payable whenNotPaused nonReentrant notBlacklisted {
        require(userAccounts[msg.sender].isRegistered, "User not registered");
        require(targetEngine < engineCount, "Engine does not exist");
        require(engines[targetEngine].isActive, "Target engine not active");
        
        UserAccount storage account = userAccounts[msg.sender];
        require(targetEngine > account.currentEngine, "Target engine must be higher than current");
        
        // Calculate and store pending rewards before upgrade
        uint256 pendingRewards = calculatePendingRewards(msg.sender);
        
        if (pendingRewards > 0) {
            account.pendingRewards.push(Rewards({
                engineId: account.currentEngine,
                startTime: account.engineStartTime,
                endTime: block.timestamp,
                withdrawalTime: 0,
                amount: pendingRewards,
                completed: false
            }));
        }
        
        // Calculate upgrade cost
        uint256 upgradeCost = calculateUpgradeCost(account.currentEngine, targetEngine);
        
        // Transfer AVAX payment
        require(msg.value >= upgradeCost, "Insufficient AVAX payment");
        
        // Return excess AVAX if any
        if (msg.value > upgradeCost) {
            payable(msg.sender).transfer(msg.value - upgradeCost);
        }
        
        uint256 oldEngine = account.currentEngine;
        
        // Upgrade the engine
        account.currentEngine = targetEngine;
        account.engineStartTime = block.timestamp;
        
        // Distribute AVAX to payout wallets
        _distributeAvaxToPayouts(upgradeCost);
        
        emit EngineUpgraded(msg.sender, oldEngine, targetEngine, pendingRewards);
    }
    
    /**
     * @dev Claim accumulated rewards
     */
    function claimRewards() external whenNotPaused nonReentrant notBlacklisted {
        require(userAccounts[msg.sender].isRegistered, "User not registered");
        
        UserAccount storage account = userAccounts[msg.sender];
        
        // Calculate current pending rewards
        uint256 currentPendingRewards = calculatePendingRewards(msg.sender);
        
        // Calculate total rewards from pending rewards array
        uint256 storedRewards = 0;
        for (uint256 i = 0; i < account.pendingRewards.length; i++) {
            if (!account.pendingRewards[i].completed) {
                storedRewards += account.pendingRewards[i].amount;
            }
        }
        
        uint256 totalRewards = storedRewards + currentPendingRewards;
        
        require(totalRewards > 0, "No rewards to claim");
        
        // Mark all pending rewards as completed and set withdrawal time
        for (uint256 i = 0; i < account.pendingRewards.length; i++) {
            if (!account.pendingRewards[i].completed) {
                account.pendingRewards[i].completed = true;
                account.pendingRewards[i].withdrawalTime = block.timestamp;
            }
        }
        
        // Add current pending rewards as a new completed reward entry
        if (currentPendingRewards > 0) {
            account.pendingRewards.push(Rewards({
                engineId: account.currentEngine,
                startTime: account.engineStartTime,
                endTime: block.timestamp,
                withdrawalTime: block.timestamp,
                amount: currentPendingRewards,
                completed: true
            }));
        }
        
        // Reset engine start time
        account.engineStartTime = block.timestamp;
        account.totalRewardsClaimed += totalRewards;
        
        // Update global stats
        totalAvax0Distributed += totalRewards;
        totalEngineRewards += totalRewards;
        
        // Transfer AVAX0 rewards to user
        avax0Token.safeTransfer(msg.sender, totalRewards);
        
        emit RewardsClaimed(msg.sender, totalRewards);
    }
    
    /**
     * @dev Distribute AVAX to payout wallets
     * @param amount Total amount to distribute
     */
    function _distributeAvaxToPayouts(uint256 amount) private {
        address[] memory wallets = new address[](3);
        wallets[0] = payoutWallet1;
        wallets[1] = payoutWallet2;
        wallets[2] = payoutWallet3;
        
        uint256 amountPerWallet = amount / wallets.length;
        uint256 remainder = amount % wallets.length;
        
        for (uint256 i = 0; i < wallets.length; i++) {
            uint256 walletAmount = amountPerWallet;
            
            // Add remainder to last wallet
            if (i == wallets.length - 1) {
                walletAmount += remainder;
            }
            
            payable(wallets[i]).transfer(walletAmount);
            emit PayoutDistributed(wallets[i], walletAmount);
        }
    }
    
    /**
     * @dev Get total number of registered users
     * @return Total number of users
     */
    function getUsersCount() external view returns (uint256) {
        return usersList.length;
    }
    
    /**
     * @dev Get users in a specific range
     * @param _start Start index
     * @param _limit Number of users to return
     * @return Array of user addresses
     */
    function getUsers(uint256 _start, uint256 _limit) external view returns (address[] memory) {
        require(_start < usersList.length, "NodeBooster: Start index out of bounds");
        
        uint256 end = _start + _limit;
        if (end > usersList.length) {
            end = usersList.length;
        }
        
        address[] memory users = new address[](end - _start);
        for (uint256 i = _start; i < end; i++) {
            users[i - _start] = usersList[i];
        }
        
        return users;
    }
    
    
    
    /**
     * @dev Calculate cumulative cost from currentEngine to targetEngine (inclusive)
     * @param currentEngine Starting engine (exclusive if upgrading)
     * @param targetEngine Target engine (inclusive)
     * @return Total cost in AVAX
     */
    function calculateUpgradeCost(uint256 currentEngine, uint256 targetEngine) public view returns (uint256) {
        require(targetEngine < engineCount, "Target engine does not exist");
        require(targetEngine > currentEngine, "Target engine must be higher than current");
        
        uint256 totalCost = 0;
        for (uint256 i = currentEngine + 1; i <= targetEngine; i++) {
            require(engines[i].isActive, "Engine not active");
            totalCost += engines[i].priceInAvax;
        }
        
        return totalCost;
    }
    
    /**
     * @dev Calculate cumulative cost of engines from 0 to engineId (inclusive)
     * @param engineId Engine to calculate cumulative cost for
     * @return Total cumulative cost in AVAX
     */
    function getCumulativeCost(uint256 engineId) public view returns (uint256) {
        require(engineId < engineCount, "Engine does not exist");
        
        uint256 totalCost = 0;
        for (uint256 i = 0; i <= engineId; i++) {
            totalCost += engines[i].priceInAvax;
        }
        
        return totalCost;
    }
    
    /**
     * @dev Calculate pending rewards for a user based on their current engine
     * @param user User address
     * @return Pending rewards in AVAX0
     */
    function calculatePendingRewards(address user) public view returns (uint256) {
        UserAccount storage account = userAccounts[user];
        
        if (!account.isRegistered || account.engineStartTime == 0) {
            return 0;
        }
        
        Engine storage engine = engines[account.currentEngine];
        if (!engine.isActive) {
            return 0;
        }
        
        uint256 daysPassed = (block.timestamp - account.engineStartTime) / 1 days;        
        
        // Cap at maxRewardCapDays
        if (daysPassed > engine.maxRewardCapDays) {
            daysPassed = engine.maxRewardCapDays;
        }
        
        if (daysPassed == 0) {
            return 0;
        }
        
        // Get cumulative cost for this engine
        uint256 cumulativeCost = getCumulativeCost(account.currentEngine);
        
        // Calculate daily reward: (cumulativeCost * 450% / 405 days) * (1 + hashPower%)
        // Formula: ((cumulativeCost * 4.5) / 405) * (100 + hashPower) / 100
        uint256 dailyRewardBase = (cumulativeCost * 450) / (405 * 100); // 4.5% divided by 405 days
        uint256 dailyReward = (dailyRewardBase * (100 + engine.hashPower)) / 100; // Apply hashPower multiplier
        
        return dailyReward * daysPassed;
    }
    
    /**
     * @dev Get user account information
     * @param user User address
     * @return User account details
     */
    function getUserAccount(address user) external view returns (UserAccount memory) {
        return userAccounts[user];
    }
    
    /**
     * @dev Get user's current engine information and pending rewards
     * @param user User address
     * @return currentEngine Current engine ID
     * @return engineStartTime When current engine was activated
     * @return pendingRewards Total stored pending rewards
     * @return currentRewards Currently accumulating rewards
     * @return totalClaimable Total claimable rewards
     */
    function getUserEngineInfo(address user) external view returns (
        uint256 currentEngine,
        uint256 engineStartTime,
        uint256 pendingRewards,
        uint256 currentRewards,
        uint256 totalClaimable
    ) {
        UserAccount storage account = userAccounts[user];
        currentEngine = account.currentEngine;
        engineStartTime = account.engineStartTime;
        
        // Calculate total pending rewards from array
        pendingRewards = 0;
        for (uint256 i = 0; i < account.pendingRewards.length; i++) {
            if (!account.pendingRewards[i].completed) {
                pendingRewards += account.pendingRewards[i].amount;
            }
        }
        
        currentRewards = calculatePendingRewards(user);
        totalClaimable = pendingRewards + currentRewards;
    }
    
    /**
     * @dev Get user's pending rewards history
     * @param user User address
     * @return Array of Rewards structs
     */
    function getUserRewardsHistory(address user) external view returns (Rewards[] memory) {
        return userAccounts[user].pendingRewards;
    }
    
    /**
     * @dev Get count of pending (unclaimed) rewards for a user
     * @param user User address
     * @return Number of unclaimed reward entries
     */
    function getPendingRewardsCount(address user) external view returns (uint256) {
        uint256 count = 0;
        Rewards[] storage userRewards = userAccounts[user].pendingRewards;
        for (uint256 i = 0; i < userRewards.length; i++) {
            if (!userRewards[i].completed) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * @dev Get total pending rewards amount for a user
     * @param user User address
     * @return Total amount of unclaimed rewards
     */
    function getTotalPendingRewards(address user) external view returns (uint256) {
        uint256 total = 0;
        Rewards[] storage userRewards = userAccounts[user].pendingRewards;
        for (uint256 i = 0; i < userRewards.length; i++) {
            if (!userRewards[i].completed) {
                total += userRewards[i].amount;
            }
        }
        return total;
    }
    
    /**
     * @dev Get engine configuration
     * @param _engineId Engine ID
     * @return Engine configuration details
     */
    function getEngine(uint256 _engineId) external view returns (Engine memory) {
        require(_engineId < engineCount, "NodeBooster: Engine does not exist");
        return engines[_engineId];
    }
    
    /**
     * @dev Get all active engines
     * @return engineIds Array of active engine IDs
     * @return activeEngines Array of active engine configurations
     */
    function getActiveEngines() external view returns (uint256[] memory engineIds, Engine[] memory activeEngines) {
        // Count active engines first
        uint256 activeCount = 0;
        for (uint256 i = 0; i < engineCount; i++) {
            if (engines[i].isActive) {
                activeCount++;
            }
        }
        
        // Create arrays for active engines
        engineIds = new uint256[](activeCount);
        activeEngines = new Engine[](activeCount);
        
        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 0; i < engineCount; i++) {
            if (engines[i].isActive) {
                engineIds[index] = i;
                activeEngines[index] = engines[i];
                index++;
            }
        }
    }
    
    /**
     * @dev Get contract statistics
     * @return totalUsers Total registered users
     * @return totalUsdcCollected Total USDC collected
     * @return totalAvax0Distributed Total AVAX0 distributed
     * @return totalReferralRewards Total referral rewards paid
     */
    function getStats() external view returns (
        uint256,
        uint256,
        uint256,
        uint256
    ) {
        return (totalUsers, totalUsdcCollected, totalAvax0Distributed, totalReferralRewards);
    }
    
    /**
     * @dev Check if an address is a contract
     * @param _addr Address to check
     * @return True if address is a contract
     */
    function _isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }
    
    /**
     * @dev Return contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
    
    /**
     * @dev Get contract security status
     * @return isPaused Contract pause status
     * @return contractOwner Contract owner address
     * @return totalBlacklisted Total number of blacklisted addresses
     */
    function getSecurityStatus() external view returns (
        bool isPaused,
        address contractOwner,
        uint256 totalBlacklisted
    ) {
        // Count blacklisted users
        uint256 blacklistedCount = 0;
        for (uint256 i = 0; i < usersList.length; i++) {
            if (isBlacklisted[usersList[i]]) {
                blacklistedCount++;
            }
        }
        
        return (paused(), owner(), blacklistedCount);
    }
    
    /**
     * @dev Pause the contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Authorize upgrade (only owner)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Transfer ownership with event emission
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "NodeBooster: New owner cannot be zero address");
        require(newOwner != owner(), "NodeBooster: New owner cannot be current owner");
        require(!isBlacklisted[newOwner], "NodeBooster: New owner cannot be blacklisted");
        
        address oldOwner = owner();
        emit OwnershipTransferInitiated(oldOwner, newOwner);
        
        super.transferOwnership(newOwner);
    }
    
    /**
     * @dev Emergency function to transfer ownership if current owner is compromised
     * @param newOwner Address of the new owner
     * @dev This function can only be called by the current owner
     */
    function emergencyTransferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "NodeBooster: New owner cannot be zero address");
        require(newOwner != owner(), "NodeBooster: New owner cannot be current owner");
        
        // Remove blacklist status from new owner if blacklisted
        if (isBlacklisted[newOwner]) {
            isBlacklisted[newOwner] = false;
            emit UserBlacklisted(newOwner, false, msg.sender);
        }
        
        address oldOwner = owner();
        emit OwnershipTransferInitiated(oldOwner, newOwner);
        
        super.transferOwnership(newOwner);
    }

    /**
     * @dev Emergency function to recover accidentally sent tokens
     * @param token Token address to recover
     * @param amount Amount to recover
     */
    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(this), "NodeBooster: cannot recover own tokens");
        require(to != address(0), "NodeBooster: invalid recipient");
        require(amount > 0, "NodeBooster: invalid amount");
        IERC20(token).safeTransfer(to, amount);
        emit TokensWithdrawn(token, to, amount);        
    }

    /**
     * @dev Emergency function to recover accidentally sent tokens
     * @param amount Amount of tokens to recover
     */
    function recoverFunds(uint256 amount) external onlyOwner {
        require(amount > 0, "NodeBooster: invalid amount");
        require(amount <= address(this).balance, "NodeBooster: insufficient funds");        
        payable(owner()).transfer(amount);        
    }
    
    /**
     * @dev Distribute USDC to the three payout wallets equally
     * @param _amount Total amount to distribute
     */
    function _distributeToPayoutWallets(uint256 _amount) internal {
        uint256 amountPerWallet = _amount / 3;
        uint256 remainder = _amount % 3;
        
        // Transfer equal amounts to each wallet
        usdcToken.safeTransfer(payoutWallet1, amountPerWallet);
        usdcToken.safeTransfer(payoutWallet2, amountPerWallet);
        usdcToken.safeTransfer(payoutWallet3, amountPerWallet + remainder); // Last wallet gets any remainder
    }
    
    /**
     * @dev Initialize default engines (called during contract initialization)
     */
    function _initializeDefaultEngines() internal {
        // Engine 0: Starter
        engines[0] = Engine({
            isActive: true,
            priceInAvax: 2 * 10**18, // 1 AVAX
            hashPower: 1,
            maxRewardCapDays:405,
            name: "Starter Engine"
        });
        
        // Engine 1: Basic
        engines[1] = Engine({
            isActive: true,
            priceInAvax: 4 * 10**18, // 5 AVAX
            hashPower: 2,
            maxRewardCapDays:405,
            name: "Basic Engine"
        });
        
        // Engine 2: Standard
        engines[2] = Engine({
            isActive: true,
            priceInAvax: 8 * 10**18, // 10 AVAX
            hashPower: 4,
            maxRewardCapDays:405,
            name: "Standard Engine"
        });
        
        // Engine 3: Advanced
        engines[3] = Engine({
            isActive: true,
            priceInAvax: 12 * 10**18, // 25 AVAX
            hashPower: 6,
            maxRewardCapDays: 405,
            name: "Advanced Engine"
        });
        
        // Engine 4: Professional
        engines[4] = Engine({
            isActive: true,
            priceInAvax: 20 * 10**18, // 50 AVAX
            hashPower: 8,
            maxRewardCapDays: 405,
            name: "Professional Engine"
        });
        
        // Engine 5: Expert
        engines[5] = Engine({
            isActive: true,
            priceInAvax: 36 * 10**18, // 100 AVAX
            hashPower: 10,
            maxRewardCapDays: 405,
            name: "Expert Engine"
        });
        
        // Engine 6: Master
        engines[6] = Engine({
            isActive: true,
            priceInAvax: 75 * 10**18, // 200 AVAX
            hashPower: 12,
            maxRewardCapDays: 405,
            name: "Master Engine"
        });
        
        // Engine 7: Elite
        engines[7] = Engine({
            isActive: true,
            priceInAvax: 115 * 10**18, // 500 AVAX
            hashPower: 14,
            maxRewardCapDays: 405,
            name: "Elite Engine"
        });
        
        // Engine 8: Supreme
        engines[8] = Engine({
            isActive: true,
            priceInAvax: 195 * 10**18, // 1000 AVAX
            hashPower: 16,
            maxRewardCapDays: 405,
            name: "Supreme Engine"
        });
        
        // Engine 9: Ultimate
        engines[9] = Engine({
            isActive: true,
            priceInAvax: 310 * 10**18, // 2000 AVAX
            hashPower: 18,
            maxRewardCapDays: 405,
            name: "Ultimate Engine"
        });
        
        engineCount = 10;
    }
}