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
    
    /// @notice Maximum referral levels for multi-level commissions
    uint256 public constant MAX_REFERRAL_LEVELS = 10;
    
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
        uint256 currentEngine; // Current engine ID (0 = no engine, 1-10 = engines)
        uint256 engineStartTime; // When the current engine was activated
        uint256 lastClaimTime; // Last time rewards were claimed for current engine
        mapping(uint256 => uint256) totalDaysRewarded; // Total days rewarded per engine
        mapping(uint256 => uint256) totalRewardsClaimedPerEngine; // Total rewards claimed per engine
        Rewards[] pendingRewards; // History of rewards
        uint256 totalRewardsClaimed; // Total rewards claimed by user
    }
    
    /// @notice Engine configuration structure
    struct Engine {
        bool isActive;
        uint256 priceInAvax; // Price in AVAX (18 decimals)
        uint256 hashPower; // Hash power units
        uint256 maxRewardCapDays; // Maximum reward period in days
        uint256 maxRewardCapPercentage; // Maximum reward cap as percentage (e.g., 450 = 450%)
        uint256 maxReferralLevels; // Maximum referral levels this engine can earn from
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
    
    /// @notice Total engine referral commissions paid
    uint256 public totalEngineReferralCommissions;
    
    /// @notice Multi-level referral commission rates (in basis points)
    /// Level 1: 800 (8%), Level 2: 400 (4%), etc.
    uint256[MAX_REFERRAL_LEVELS] public referralCommissionRates;
    
    /// @notice Mapping of referrer to their directly referred users
    mapping(address => address[]) public directReferrals;
    
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
        uint256 maxRewardCapPercentage,
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
    
    event EngineReferralCommissionPaid(
        address indexed referrer,
        address indexed buyer,
        uint256 indexed level,
        uint256 amount,
        uint256 engineId
    );
    
    event ReferralCommissionRatesUpdated(
        uint256[MAX_REFERRAL_LEVELS] oldRates,
        uint256[MAX_REFERRAL_LEVELS] newRates
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
        require(_usdcToken != address(0), "USDC 0 addr");
        require(_avax0Token != address(0), "AVAX0 0 addr");
        require(_payoutWallet1 != address(0), "1:0 addr");
        require(_payoutWallet2 != address(0), "2:0 addr");
        require(_payoutWallet3 != address(0), "3:0 addr");

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
        UserAccount storage deployerAccount = userAccounts[msg.sender];
        deployerAccount.isRegistered = true;
        deployerAccount.referrer = address(0);
        deployerAccount.totalReferrals = 0;
        deployerAccount.totalReferralRewards = 0;
        deployerAccount.currentEngine = 0; // No engine initially
        deployerAccount.engineStartTime = 0; // No engine start time
        deployerAccount.lastClaimTime = 0;
        deployerAccount.totalRewardsClaimed = 0;
        // Note: pendingRewards array and totalDaysRewarded mapping are automatically initialized
        
        totalUsers = 1;
        usersList.push(msg.sender);
        
        // Initialize with 10 default engines
        _initializeDefaultEngines();
        
        // Initialize multi-level referral commission rates
        _initializeReferralCommissionRates();
    }
    
    /**
     * @dev Modifier to check if user is not blacklisted
     */
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "blacklisted");
        _;
    }
    
    /**
     * @dev Modifier to check if address is not a contract
     */
    modifier notContract() {
        require(!_isContract(msg.sender), "no Contracts");
        _;
    }
    
    /**
     * @dev Register a new user account
     * @param _referrer Address of the referrer (can be address(0) for no referrer)
     */
    function register(address _referrer) external whenNotPaused nonReentrant notBlacklisted notContract {
        require(!userAccounts[msg.sender].isRegistered, "already registered");
        require(_referrer != msg.sender, "self refer");
        
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
        UserAccount storage newAccount = userAccounts[msg.sender];
        newAccount.isRegistered = true;
        newAccount.referrer = finalReferrer;
        newAccount.totalReferrals = 0;
        newAccount.totalReferralRewards = 0;
        newAccount.currentEngine = 0; // No engine initially
        newAccount.engineStartTime = 0; // No engine start time
        newAccount.lastClaimTime = 0; // No claims yet
        newAccount.totalRewardsClaimed = 0;
        // Note: pendingRewards array and totalDaysRewarded mapping are automatically initialized
        
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
            
            // Add the new user to referrer's direct referrals list
            directReferrals[finalReferrer].push(msg.sender);
            
            emit ReferralRewardPaid(finalReferrer, msg.sender, referralReward, block.timestamp);
        }
        
        // Distribute remaining USDC to payout wallets
        uint256 remainingAmount = REGISTRATION_FEE - referralReward;
        _distributeToPayoutWallets(remainingAmount);
        
        emit UserRegistered(msg.sender, finalReferrer, REGISTRATION_FEE, avax0Amount, block.timestamp);
    }
    
    /**
     * @dev Configure an engine
     * @param _engineId Engine ID (1-10)
     * @param _name Engine name
     * @param _priceInAvax Price in AVAX (18 decimals)
     * @param _hashPower Hash power units
     * @param _maxRewardCapDays Maximum reward period in days
     * @param _maxRewardCapPercentage Maximum reward cap as percentage (e.g., 450 = 450%)
     * @param _maxReferralLevels Maximum referral levels this engine can earn from
     * @param _isActive Whether the engine is active
     */
    function configureEngine(
        uint256 _engineId,
        string memory _name,
        uint256 _priceInAvax,
        uint256 _hashPower,
        uint256 _maxRewardCapDays,
        uint256 _maxRewardCapPercentage,
        uint256 _maxReferralLevels,
        bool _isActive
    ) external onlyOwner {
        require(_engineId >= 1 && _engineId < MAX_ENGINES, "Invalid engine");
        require(_priceInAvax > 0, "Price: 0");
        require(_hashPower > 0, "HashPower: 0");
        require(_maxRewardCapDays > 0, "RewardCapDays: 0");
        require(_maxRewardCapPercentage > 0, "RewardCapPercentage: 0");
        require(_maxReferralLevels <= MAX_REFERRAL_LEVELS, "ref Lvls >  max");
        require(bytes(_name).length > 0, "No Name");
        
        engines[_engineId] = Engine({
            isActive: _isActive,
            priceInAvax: _priceInAvax,
            hashPower: _hashPower,
            maxRewardCapDays: _maxRewardCapDays,
            maxRewardCapPercentage: _maxRewardCapPercentage,
            maxReferralLevels: _maxReferralLevels,
            name: _name
        });
        
        // Update engine count if this is a new engine (account for engine 0 being reserved)
        if (_engineId >= engineCount) {
            engineCount = _engineId + 1;
        }
        
        emit EngineConfigured(_engineId, _name, _priceInAvax, _hashPower, _maxRewardCapDays, _maxRewardCapPercentage, _isActive);
    }
    
    /**
     * @dev Update payout wallet addresses
     * @param _walletNumber Wallet number (1, 2, or 3)
     * @param _newWallet New wallet address
     */
    function updatePayoutWallet(uint256 _walletNumber, address _newWallet) external onlyOwner {
        require(_newWallet != address(0), "0 addr");
        require(_walletNumber >= 1 && _walletNumber <= 3, "<=>3");
        
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
        require(_newDefaultReferrer != address(0), "defRef 0 addr");
        require(userAccounts[_newDefaultReferrer].isRegistered, "defRef !reg");
        require(!isBlacklisted[_newDefaultReferrer], "defRef blkList");
        
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
     * @dev Set multi-level referral commission rates
     * @param _rates Array of commission rates in basis points for levels 1-10
     */
    function setReferralCommissionRates(uint256[MAX_REFERRAL_LEVELS] calldata _rates) external onlyOwner {
        // Validate rates don't exceed 100% total
        uint256 totalRate = 0;
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            totalRate += _rates[i];
        }
        require(totalRate <= BASIS_POINTS, ">100%");
        
        uint256[MAX_REFERRAL_LEVELS] memory oldRates = referralCommissionRates;
        referralCommissionRates = _rates;
        
        emit ReferralCommissionRatesUpdated(oldRates, _rates);
    }
    
    /**
     * @dev Get referral commission rates
     * @return Array of commission rates in basis points for levels 1-10
     */
    function getReferralCommissionRates() external view returns (uint256[MAX_REFERRAL_LEVELS] memory) {
        return referralCommissionRates;
    }
    
    /**
     * @dev Add or remove address from blacklist
     * @param _user User address to blacklist/unblacklist
     * @param _status True to blacklist, false to unblacklist
     */
    function setBlacklistStatus(address _user, bool _status) external onlyOwner {
        require(_user != address(0), "0 addr");
        require(_user != owner(), "owner");
        require(isBlacklisted[_user] != _status, "is blkLstd");
        
        isBlacklisted[_user] = _status;
        emit UserBlacklisted(_user, _status, msg.sender);
    }
    
    /**
     * @dev Batch blacklist multiple addresses
     * @param _users Array of user addresses
     * @param _status True to blacklist, false to unblacklist
     */
    function batchSetBlacklistStatus(address[] calldata _users, bool _status) external onlyOwner {
        require(_users.length > 0, "Empty");
        require(_users.length <= 100, "< 100");
        
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            require(user != address(0), "0 addr");
            require(user != owner(), "owner");
            
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
     * @dev Purchase or upgrade user's engine
     * @param targetEngine Target engine ID to purchase/upgrade to (1-10)
     */
    function upgradeEngine(uint256 targetEngine) external payable whenNotPaused nonReentrant notBlacklisted {
        require(userAccounts[msg.sender].isRegistered, "not registered");
        require(targetEngine >= 1 && targetEngine < engineCount, "Invalid engine");
        require(engines[targetEngine].isActive, "not active");
        
        UserAccount storage account = userAccounts[msg.sender];
        require(targetEngine > account.currentEngine, "must be higher");
        
        uint256 pendingRewards = 0;
        
        // If user currently has an engine, calculate and store pending rewards
        if (account.currentEngine > 0) {
            pendingRewards = calculatePendingRewards(msg.sender);
            
            if (pendingRewards > 0) {
                // Calculate days being rewarded before upgrade
                uint256 lastRewardTime = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
                uint256 daysPending = (block.timestamp - lastRewardTime) / 1 days;
                
                // Update total days rewarded for the current engine (capped)
                Engine storage currentEngine = engines[account.currentEngine];
                uint256 alreadyRewardedDays = account.totalDaysRewarded[account.currentEngine];
                uint256 remainingDays = currentEngine.maxRewardCapDays > alreadyRewardedDays ? 
                    currentEngine.maxRewardCapDays - alreadyRewardedDays : 0;
                uint256 actualDaysPending = daysPending > remainingDays ? remainingDays : daysPending;
                
                account.totalDaysRewarded[account.currentEngine] += actualDaysPending;
                
                // Also update the rewards claimed per engine when storing pending rewards
                account.totalRewardsClaimedPerEngine[account.currentEngine] += pendingRewards;
                
                account.pendingRewards.push(Rewards({
                    engineId: account.currentEngine,
                    startTime: lastRewardTime,
                    endTime: block.timestamp,
                    withdrawalTime: 0,
                    amount: pendingRewards,
                    completed: false
                }));
            }
        }
        
        // Calculate cost (if upgrading from engine, only pay difference; if first purchase, pay cumulative)
        uint256 upgradeCost;
        if (account.currentEngine == 0) {
            // First engine purchase - pay cumulative cost
            upgradeCost = getCumulativeCost(targetEngine);
        } else {
            // Upgrading - pay difference
            upgradeCost = calculateUpgradeCost(account.currentEngine, targetEngine);
        }
        
        // Transfer AVAX payment
        require(msg.value >= upgradeCost, "funds");
        
        // Return excess AVAX if any
        if (msg.value > upgradeCost) {
            payable(msg.sender).transfer(msg.value - upgradeCost);
        }
        
        uint256 oldEngine = account.currentEngine;
        
        // Set the new engine
        account.currentEngine = targetEngine;
        account.engineStartTime = block.timestamp;
        account.lastClaimTime = 0; // Reset claim time for new engine
        
        // Process multi-level referral commissions
        uint256 totalCommissions = _processEngineReferralCommissions(msg.sender, upgradeCost);
        
        // Distribute remaining AVAX to payout wallets
        uint256 remainingAmount = upgradeCost - totalCommissions;
        // TODO decide what to do with remaining amount. Currently, it stays in the contract.
        
        emit EngineUpgraded(msg.sender, oldEngine, targetEngine, pendingRewards);
    }
    
    /**
     * @dev Claim accumulated rewards
     */
    function claimRewards() external whenNotPaused nonReentrant notBlacklisted {
        require(userAccounts[msg.sender].isRegistered, "not registered");
        require(userAccounts[msg.sender].currentEngine > 0, "No engine");
        
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
        
        require(totalRewards > 0, "No rewards");
        
        // Mark all pending rewards as completed and set withdrawal time
        for (uint256 i = 0; i < account.pendingRewards.length; i++) {
            if (!account.pendingRewards[i].completed) {
                account.pendingRewards[i].completed = true;
                account.pendingRewards[i].withdrawalTime = block.timestamp;
            }
        }
        
        // Add current pending rewards as a new completed reward entry
        if (currentPendingRewards > 0) {
            // Calculate days being rewarded in this claim
            uint256 lastRewardTime = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
            uint256 daysClaimed = (block.timestamp - lastRewardTime) / 1 days;
            
            // Update total days rewarded for this engine (capped)
            Engine storage engine = engines[account.currentEngine];
            uint256 alreadyRewardedDays = account.totalDaysRewarded[account.currentEngine];
            uint256 remainingDays = engine.maxRewardCapDays > alreadyRewardedDays ? 
                engine.maxRewardCapDays - alreadyRewardedDays : 0;
            uint256 actualDaysClaimed = daysClaimed > remainingDays ? remainingDays : daysClaimed;
            
            account.totalDaysRewarded[account.currentEngine] += actualDaysClaimed;
            
            account.pendingRewards.push(Rewards({
                engineId: account.currentEngine,
                startTime: lastRewardTime,
                endTime: block.timestamp,
                withdrawalTime: block.timestamp,
                amount: currentPendingRewards,
                completed: true
            }));
        }
        
        // Update last claim time
        account.lastClaimTime = block.timestamp;
        account.totalRewardsClaimed += totalRewards;
        
        // Update rewards claimed for current engine (only current pending rewards)
        if (currentPendingRewards > 0) {
            account.totalRewardsClaimedPerEngine[account.currentEngine] += currentPendingRewards;
        }
        
        // Note: Stored rewards were already counted per engine when they were created during upgrades
        
        // Update global stats
        totalAvax0Distributed += totalRewards;
        totalEngineRewards += totalRewards;
        
        // Transfer AVAX0 rewards to user
        avax0Token.safeTransfer(msg.sender, totalRewards);
        
        emit RewardsClaimed(msg.sender, totalRewards);
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
        require(_start < usersList.length, "OOB"); // Out of bounds
        
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
     * @param currentEngine Starting engine (0 for no engine, 1-10 for engines)
     * @param targetEngine Target engine (1-10)
     * @return Total cost in AVAX
     */
    function calculateUpgradeCost(uint256 currentEngine, uint256 targetEngine) public view returns (uint256) {
        require(targetEngine >= 1 && targetEngine < engineCount, "Invalid engine");
        require(targetEngine > currentEngine, "must be higher");

        if (currentEngine == 0) {
            // First purchase - return cumulative cost
            return getCumulativeCost(targetEngine);
        }
        
        // Upgrade cost - difference between engines
        uint256 totalCost = 0;
        for (uint256 i = currentEngine + 1; i <= targetEngine; i++) {
            require(engines[i].isActive, "not active");
            totalCost += engines[i].priceInAvax;
        }
        
        return totalCost;
    }
    
    /**
     * @dev Calculate cumulative cost of engines from 1 to engineId (inclusive)
     * @param engineId Engine to calculate cumulative cost for (1-10)
     * @return Total cumulative cost in AVAX
     */
    function getCumulativeCost(uint256 engineId) public view returns (uint256) {
        require(engineId >= 1 && engineId < engineCount, "Invalid engine");
        
        uint256 totalCost = 0;
        for (uint256 i = 1; i <= engineId; i++) {
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
        
        if (!account.isRegistered || account.currentEngine == 0 || account.engineStartTime == 0) {
            return 0; // No engine or not registered
        }
        
        Engine storage engine = engines[account.currentEngine];
        if (!engine.isActive) {
            return 0;
        }
        
        // Calculate days since last claim (or engine start if never claimed)
        uint256 lastRewardTime = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
        uint256 daysSinceLastClaim = (block.timestamp - lastRewardTime) / 1 days;
        
        if (daysSinceLastClaim == 0) {
            return 0;
        }
        
        // Check how many days have already been rewarded for this engine
        uint256 alreadyRewardedDays = account.totalDaysRewarded[account.currentEngine];
        
        // Calculate remaining days available for rewards (cap at maxRewardCapDays)
        uint256 maxDays = engine.maxRewardCapDays;
        if (alreadyRewardedDays >= maxDays) {
            return 0; // Already reached maximum reward cap for this engine
        }
        
        uint256 remainingDays = maxDays - alreadyRewardedDays;
        uint256 rewardableDays = daysSinceLastClaim > remainingDays ? remainingDays : daysSinceLastClaim;
        
        if (rewardableDays == 0) {
            return 0;
        }
        
        // Get cumulative cost for this engine
        uint256 cumulativeCost = getCumulativeCost(account.currentEngine);
        
        // Calculate maximum allowed rewards for this engine using engine's cap percentage
        uint256 maxRewardsForEngine = (cumulativeCost * engine.maxRewardCapPercentage) / 100;
        
        // Check how much has already been claimed for this engine
        uint256 alreadyClaimedForEngine = account.totalRewardsClaimedPerEngine[account.currentEngine];
        
        // If already reached reward cap, return 0
        if (alreadyClaimedForEngine >= maxRewardsForEngine) {
            return 0;
        }
        
        // Calculate daily reward: (cumulativeCost * maxRewardCapPercentage / 405 days) * (1 + hashPower%)
        // Formula: ((cumulativeCost * maxRewardCapPercentage / 100) / 405) * (100 + hashPower) / 100
        uint256 dailyRewardBase = (cumulativeCost * engine.maxRewardCapPercentage) / (405 * 100); // Percentage divided by 405 days
        uint256 dailyReward = (dailyRewardBase * (100 + engine.hashPower)) / 100; // Apply hashPower multiplier
        
        uint256 calculatedRewards = dailyReward * rewardableDays;
        
        // Cap the rewards to not exceed maximum total for this engine
        uint256 remainingRewardsAllowed = maxRewardsForEngine - alreadyClaimedForEngine;
        uint256 finalRewards = calculatedRewards > remainingRewardsAllowed ? remainingRewardsAllowed : calculatedRewards;
        
        return finalRewards;
    }
    
    /**
     * @dev Get user account basic information (excluding mapping)
     * @param user User address
     * @return isRegistered User registration status
     * @return referrer User's referrer address
     * @return userTotalReferrals Total referrals made by user
     * @return userTotalReferralRewards Total referral rewards earned
     * @return currentEngine Current engine ID
     * @return engineStartTime When current engine was activated
     * @return lastClaimTime Last time rewards were claimed
     * @return userTotalRewardsClaimed Total rewards claimed by user
     */
    function getUserAccountInfo(address user) external view returns (
        bool isRegistered,
        address referrer,
        uint256 userTotalReferrals,
        uint256 userTotalReferralRewards,
        uint256 currentEngine,
        uint256 engineStartTime,
        uint256 lastClaimTime,
        uint256 userTotalRewardsClaimed
    ) {
        UserAccount storage account = userAccounts[user];
        return (
            account.isRegistered,
            account.referrer,
            account.totalReferrals,
            account.totalReferralRewards,
            account.currentEngine,
            account.engineStartTime,
            account.lastClaimTime,
            account.totalRewardsClaimed
        );
    }
    
    /**
     * @dev Get total rewards claimed for a specific engine for a user
     * @param user User address
     * @param engineId Engine ID to check (1-10)
     * @return Total rewards claimed for the specified engine
     */
    function getUserEngineRewardsClaimed(address user, uint256 engineId) external view returns (uint256) {
        require(engineId >= 1 && engineId < engineCount, "Invalid engine");
        return userAccounts[user].totalRewardsClaimedPerEngine[engineId];
    }
    
    /**
     * @dev Get reward cap status for a specific engine for a user
     * @param user User address
     * @param engineId Engine ID to check (1-10)
     * @return maxRewards Maximum rewards allowed (engine's percentage of cost)
     * @return claimedRewards Total rewards already claimed
     * @return remainingRewards Remaining rewards available
     * @return isCapReached Whether reward cap has been reached
     * @return capPercentage The reward cap percentage for this engine
     */
    function getUserEngineCapStatus(address user, uint256 engineId) external view returns (
        uint256 maxRewards,
        uint256 claimedRewards,
        uint256 remainingRewards,
        bool isCapReached,
        uint256 capPercentage
    ) {
        require(engineId >= 1 && engineId < engineCount, "Invalid engine");
        
        Engine storage engine = engines[engineId];
        uint256 cumulativeCost = getCumulativeCost(engineId);
        capPercentage = engine.maxRewardCapPercentage;
        maxRewards = (cumulativeCost * capPercentage) / 100;
        claimedRewards = userAccounts[user].totalRewardsClaimedPerEngine[engineId];
        
        if (claimedRewards >= maxRewards) {
            remainingRewards = 0;
            isCapReached = true;
        } else {
            remainingRewards = maxRewards - claimedRewards;
            isCapReached = false;
        }
    }
    
    /**
     * @dev Get comprehensive reward status for a user across all engines
     * @param user User address
     * @return engineIds Array of engine IDs (1-10)
     * @return daysRewarded Array of days rewarded for each engine
     * @return maxDays Array of maximum reward days for each engine
     * @return rewardsClaimed Array of rewards claimed for each engine
     * @return maxRewardsAllowed Array of maximum rewards allowed (450% cap)
     * @return isTimeCapReached Array indicating if time cap (405 days) reached
     * @return isRewardCapReached Array indicating if reward cap (450%) reached
     */
    function getUserRewardStatus(address user) external view returns (
        uint256[] memory engineIds,
        uint256[] memory daysRewarded,
        uint256[] memory maxDays,
        uint256[] memory rewardsClaimed,
        uint256[] memory maxRewardsAllowed,
        bool[] memory isTimeCapReached,
        bool[] memory isRewardCapReached
    ) {
        // Return data for engines 1 to 10
        uint256 engineRange = engineCount - 1; // Exclude engine 0
        engineIds = new uint256[](engineRange);
        daysRewarded = new uint256[](engineRange);
        maxDays = new uint256[](engineRange);
        rewardsClaimed = new uint256[](engineRange);
        maxRewardsAllowed = new uint256[](engineRange);
        isTimeCapReached = new bool[](engineRange);
        isRewardCapReached = new bool[](engineRange);
        
        UserAccount storage account = userAccounts[user];
        
        for (uint256 i = 1; i < engineCount; i++) {
            uint256 index = i - 1; // Adjust for array indexing
            engineIds[index] = i;
            daysRewarded[index] = account.totalDaysRewarded[i];
            maxDays[index] = engines[i].maxRewardCapDays;
            rewardsClaimed[index] = account.totalRewardsClaimedPerEngine[i];
            
            uint256 cumulativeCost = getCumulativeCost(i);
            maxRewardsAllowed[index] = (cumulativeCost * engines[i].maxRewardCapPercentage) / 100;
            
            isTimeCapReached[index] = daysRewarded[index] >= maxDays[index];
            isRewardCapReached[index] = rewardsClaimed[index] >= maxRewardsAllowed[index];
        }
    }
    
    /**
     * @dev Get total days rewarded for a specific engine for a user
     * @param user User address
     * @param engineId Engine ID to check (1-10)
     * @return Total days rewarded for the specified engine
     */
    function getUserEngineRewardedDays(address user, uint256 engineId) external view returns (uint256) {
        require(engineId >= 1 && engineId < engineCount, "Invalid engine");
        return userAccounts[user].totalDaysRewarded[engineId];
    }
    
    /**
     * @dev Check if a user can purchase or upgrade to a specific engine
     * @param user User address
     * @param targetEngine Target engine ID (1-10)
     * @return canPurchase Whether the user can purchase/upgrade
     * @return cost Cost in AVAX to purchase/upgrade
     * @return reason Reason if cannot purchase
     */
    function canUserPurchaseEngine(address user, uint256 targetEngine) external view returns (
        bool canPurchase,
        uint256 cost,
        string memory reason
    ) {
        if (!userAccounts[user].isRegistered) {
            return (false, 0, "not registered");
        }
        
        if (targetEngine < 1 || targetEngine >= engineCount) {
            return (false, 0, "Invalid engine");
        }
        
        if (!engines[targetEngine].isActive) {
            return (false, 0, "not active");
        }
        
        UserAccount storage account = userAccounts[user];
        
        if (targetEngine <= account.currentEngine) {
            return (false, 0, "must be higher");
        }
        
        if (isBlacklisted[user]) {
            return (false, 0, "blacklisted");
        }
        
        // Calculate cost
        uint256 upgradeCost;
        if (account.currentEngine == 0) {
            upgradeCost = getCumulativeCost(targetEngine);
        } else {
            upgradeCost = calculateUpgradeCost(account.currentEngine, targetEngine);
        }
        
        return (true, upgradeCost, "Can purchase");
    }
    
    /**
     * @dev Get user's engine ownership and purchase options
     * @param user User address
     * @return hasEngine Whether user owns an engine
     * @return currentEngineId Current engine ID (0 if no engine)
     * @return availableEngines Array of engine IDs user can purchase
     * @return purchaseCosts Array of costs for each available engine
     */
    function getUserEngineOptions(address user) external view returns (
        bool hasEngine,
        uint256 currentEngineId,
        uint256[] memory availableEngines,
        uint256[] memory purchaseCosts
    ) {
        UserAccount storage account = userAccounts[user];
        hasEngine = account.currentEngine > 0;
        currentEngineId = account.currentEngine;
        
        if (!account.isRegistered || isBlacklisted[user]) {
            // Return empty arrays if user can't purchase
            availableEngines = new uint256[](0);
            purchaseCosts = new uint256[](0);
            return (hasEngine, currentEngineId, availableEngines, purchaseCosts);
        }
        
        // Count available engines
        uint256 availableCount = 0;
        for (uint256 i = account.currentEngine + 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                availableCount++;
            }
        }
        
        // Populate arrays
        availableEngines = new uint256[](availableCount);
        purchaseCosts = new uint256[](availableCount);
        
        uint256 index = 0;
        for (uint256 i = account.currentEngine + 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                availableEngines[index] = i;
                
                // Calculate cost
                if (account.currentEngine == 0) {
                    purchaseCosts[index] = getCumulativeCost(i);
                } else {
                    purchaseCosts[index] = calculateUpgradeCost(account.currentEngine, i);
                }
                
                index++;
            }
        }
    }
    
    /**
     * @dev Get user's current engine information and pending rewards
     * @param user User address
     * @return currentEngine Current engine ID
     * @return engineStartTime When current engine was activated
     * @return lastClaimTime Last time rewards were claimed
     * @return daysRewarded Total days rewarded for current engine
     * @return remainingDays Remaining days available for rewards
     * @return rewardsClaimed Total rewards claimed for current engine
     * @return maxRewardsAllowed Maximum rewards allowed for current engine (engine's percentage cap)
     * @return pendingRewards Total stored pending rewards
     * @return currentRewards Currently accumulating rewards
     * @return totalClaimable Total claimable rewards
     */
    function getUserEngineInfo(address user) external view returns (
        uint256 currentEngine,
        uint256 engineStartTime,
        uint256 lastClaimTime,
        uint256 daysRewarded,
        uint256 remainingDays,
        uint256 rewardsClaimed,
        uint256 maxRewardsAllowed,
        uint256 pendingRewards,
        uint256 currentRewards,
        uint256 totalClaimable
    ) {
        UserAccount storage account = userAccounts[user];
        currentEngine = account.currentEngine;
        engineStartTime = account.engineStartTime;
        lastClaimTime = account.lastClaimTime;
        
        if (currentEngine > 0) {
            // Calculate days rewarded and remaining for current engine
            daysRewarded = account.totalDaysRewarded[currentEngine];
            Engine storage engine = engines[currentEngine];
            remainingDays = engine.maxRewardCapDays > daysRewarded ? 
                engine.maxRewardCapDays - daysRewarded : 0;
            
            // Calculate reward cap information
            rewardsClaimed = account.totalRewardsClaimedPerEngine[currentEngine];
            uint256 cumulativeCost = getCumulativeCost(currentEngine);
            maxRewardsAllowed = (cumulativeCost * engines[currentEngine].maxRewardCapPercentage) / 100;
        }
        
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
     * @param _engineId Engine ID (1-10)
     * @return Engine configuration details
     */
    function getEngine(uint256 _engineId) external view returns (Engine memory) {
        require(_engineId >= 1 && _engineId < engineCount, "Invalid engine");
        return engines[_engineId];
    }
    
    /**
     * @dev Get all active purchasable engines (1-10)
     * @return engineIds Array of active engine IDs
     * @return activeEngines Array of active engine configurations
     */
    function getActiveEngines() external view returns (uint256[] memory engineIds, Engine[] memory activeEngines) {
        // Count active engines first (engines 1-10 only)
        uint256 activeCount = 0;
        for (uint256 i = 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                activeCount++;
            }
        }
        
        // Create arrays for active engines
        engineIds = new uint256[](activeCount);
        activeEngines = new Engine[](activeCount);
        
        // Populate arrays
        uint256 index = 0;
        for (uint256 i = 1; i < engineCount; i++) {
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
     * @return totalEngineReferralCommissions Total engine referral commissions paid
     */
    function getStats() external view returns (
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) {
        return (totalUsers, totalUsdcCollected, totalAvax0Distributed, totalReferralRewards, totalEngineReferralCommissions);
    }
    
    /**
     * @dev Get referral chain for a user up to MAX_REFERRAL_LEVELS
     * @param user Starting user address
     * @return referrers Array of referrer addresses in the chain
     * @return referrerEngines Array of engine IDs for each referrer
     * @return maxLevels Array of max referral levels each referrer can earn from
     */
    function getReferralChain(address user) external view returns (
        address[] memory referrers,
        uint256[] memory referrerEngines,
        uint256[] memory maxLevels
    ) {
        referrers = new address[](MAX_REFERRAL_LEVELS);
        referrerEngines = new uint256[](MAX_REFERRAL_LEVELS);
        maxLevels = new uint256[](MAX_REFERRAL_LEVELS);
        
        address currentReferrer = userAccounts[user].referrer;
        uint256 count = 0;
        
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS && currentReferrer != address(0); i++) {
            referrers[i] = currentReferrer;
            referrerEngines[i] = userAccounts[currentReferrer].currentEngine;
            
            if (referrerEngines[i] > 0) {
                maxLevels[i] = this.getEngine(referrerEngines[i]).maxReferralLevels;
            } else {
                maxLevels[i] = 0;
            }
            
            currentReferrer = userAccounts[currentReferrer].referrer;
            count++;
        }
        
        // Resize arrays to actual count
        assembly {
            mstore(referrers, count)
            mstore(referrerEngines, count)
            mstore(maxLevels, count)
        }
    }
    
    /**
     * @dev Calculate potential commissions for engine purchase
     * @param buyer Address of potential buyer
     * @param amount Amount of engine purchase
     * @return referrers Array of referrer addresses that would receive commissions
     * @return levels Array of commission levels (1-10)
     * @return commissions Array of commission amounts
     * @return totalCommission Total commission amount
     */
    function calculateEngineCommissions(address buyer, uint256 amount) external view returns (
        address[] memory referrers,
        uint256[] memory levels,
        uint256[] memory commissions,
        uint256 totalCommission
    ) {
        address[] memory tempReferrers = new address[](MAX_REFERRAL_LEVELS);
        uint256[] memory tempLevels = new uint256[](MAX_REFERRAL_LEVELS);
        uint256[] memory tempCommissions = new uint256[](MAX_REFERRAL_LEVELS);
        
        address currentReferrer = userAccounts[buyer].referrer;
        uint256 count = 0;
        uint256 total = 0;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS; level++) {
            if (currentReferrer == address(0) || 
                !userAccounts[currentReferrer].isRegistered || 
                isBlacklisted[currentReferrer]) {
                break;
            }
            
            uint256 referrerEngine = userAccounts[currentReferrer].currentEngine;
            if (referrerEngine == 0) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 maxLevelsForEngine = engines[referrerEngine].maxReferralLevels;
            if (level > maxLevelsForEngine) {
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 commissionRate = referralCommissionRates[level - 1];
            if (commissionRate > 0) {
                uint256 commission = (amount * commissionRate) / BASIS_POINTS;
                
                tempReferrers[count] = currentReferrer;
                tempLevels[count] = level;
                tempCommissions[count] = commission;
                total += commission;
                count++;
            }
            
            currentReferrer = userAccounts[currentReferrer].referrer;
        }
        
        // Create properly sized return arrays
        referrers = new address[](count);
        levels = new uint256[](count);
        commissions = new uint256[](count);
        
        for (uint256 i = 0; i < count; i++) {
            referrers[i] = tempReferrers[i];
            levels[i] = tempLevels[i];
            commissions[i] = tempCommissions[i];
        }
        
        totalCommission = total;
    }
    
    /**
     * @dev Get direct referrals for a user (Level 1 only)
     * @param user User address to get referrals for
     * @return Array of directly referred user addresses
     */
    function getDirectReferrals(address user) external view returns (address[] memory) {
        return directReferrals[user];
    }
    
    /**
     * @dev Get number of direct referrals for a user
     * @param user User address to get referral count for
     * @return Number of direct referrals
     */
    function getDirectReferralCount(address user) external view returns (uint256) {
        return directReferrals[user].length;
    }
    
    /**
     * @dev Get referred users on a specific level for a user
     * @param user User address to start from
     * @param level Level to get (1 = direct referrals, 2 = second level, etc.)
     * @return Array of user addresses on the specified level
     */
    function getReferredUsersOnLevel(address user, uint256 level) external view returns (address[] memory) {
        require(level > 0 && level <= MAX_REFERRAL_LEVELS, "Invalid level");
        
        if (level == 1) {
            return directReferrals[user];
        }
        
        // Get all users on the previous level first
        address[] memory previousLevel = this.getReferredUsersOnLevel(user, level - 1);
        
        // Count total users on current level
        uint256 totalCount = 0;
        for (uint256 i = 0; i < previousLevel.length; i++) {
            totalCount += directReferrals[previousLevel[i]].length;
        }
        
        // Create result array
        address[] memory result = new address[](totalCount);
        uint256 currentIndex = 0;
        
        // Fill result array with all referrals from previous level users
        for (uint256 i = 0; i < previousLevel.length; i++) {
            address[] memory userReferrals = directReferrals[previousLevel[i]];
            for (uint256 j = 0; j < userReferrals.length; j++) {
                result[currentIndex] = userReferrals[j];
                currentIndex++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get all referred users up to a specific level (cumulative)
     * @param user User address to start from
     * @param maxLevel Maximum level to include (1-10)
     * @return allUsers Array of all referred user addresses up to maxLevel
     * @return userLevels Array indicating which level each user is on
     */
    function getAllReferredUsers(address user, uint256 maxLevel) external view returns (
        address[] memory allUsers,
        uint256[] memory userLevels
    ) {
        require(maxLevel > 0 && maxLevel <= MAX_REFERRAL_LEVELS, ">maxLvl");
        
        // Count total users first
        uint256 totalUsersCount = 0;
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            totalUsersCount += levelUsers.length;
        }
        
        // Create result arrays
        allUsers = new address[](totalUsersCount);
        userLevels = new uint256[](totalUsersCount);
        uint256 currentIndex = 0;
        
        // Fill arrays with users from each level
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            for (uint256 i = 0; i < levelUsers.length; i++) {
                allUsers[currentIndex] = levelUsers[i];
                userLevels[currentIndex] = level;
                currentIndex++;
            }
        }
    }
    
    /**
     * @dev Get referral statistics by level for a user
     * @param user User address to get stats for
     * @param maxLevel Maximum level to include in stats
     * @return levelCounts Array of user counts per level
     * @return totalCount Total number of referred users across all levels
     */
    function getReferralStatsByLevel(address user, uint256 maxLevel) external view returns (
        uint256[] memory levelCounts,
        uint256 totalCount
    ) {
        require(maxLevel > 0 && maxLevel <= MAX_REFERRAL_LEVELS, ">maxLvl");
        
        levelCounts = new uint256[](maxLevel);
        totalCount = 0;
        
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            levelCounts[level - 1] = levelUsers.length;
            totalCount += levelUsers.length;
        }
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
        require(newOwner != address(0), "0 addr");
        require(newOwner != owner(), "same owner");
        require(!isBlacklisted[newOwner], "blacklisted");
        
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
        require(newOwner != address(0), "0 addr");
        require(newOwner != owner(), "same owner");
        
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
        require(token != address(this), "own tokens");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        IERC20(token).safeTransfer(to, amount);
        emit TokensWithdrawn(token, to, amount);        
    }

    /**
     * @dev Emergency function to recover accidentally sent tokens
     * @param amount Amount of tokens to recover
     */
    function recoverFunds(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        require(amount <= address(this).balance, "Insufficient funds");        
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
     * @dev Process multi-level referral commissions for engine purchases
     * @param buyer Address of the engine buyer
     * @param amount Total amount paid for engine upgrade
     * @return totalCommissionsPaid Total amount paid in commissions
     */
    function _processEngineReferralCommissions(address buyer, uint256 amount) internal returns (uint256) {
        address currentReferrer = userAccounts[buyer].referrer;
        uint256 totalCommissionsPaid = 0;
        
        // Process up to MAX_REFERRAL_LEVELS
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS; level++) {
            if (currentReferrer == address(0) || 
                !userAccounts[currentReferrer].isRegistered || 
                isBlacklisted[currentReferrer]) {
                break; // Stop if referrer is invalid
            }
            
            // Check if referrer has an engine and if engine supports this level
            uint256 referrerEngine = userAccounts[currentReferrer].currentEngine;
            if (referrerEngine == 0) {
                // Move to next referrer without paying commission
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            // Check if referrer's engine supports this commission level
            uint256 maxLevelsForEngine = engines[referrerEngine].maxReferralLevels;
            if (level > maxLevelsForEngine) {
                // This referrer's engine doesn't support this level, move to next
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            // Calculate commission for this level
            uint256 commissionRate = referralCommissionRates[level - 1]; // Array is 0-indexed
            if (commissionRate == 0) {
                // No commission for this level, move to next referrer
                currentReferrer = userAccounts[currentReferrer].referrer;
                continue;
            }
            
            uint256 commission = (amount * commissionRate) / BASIS_POINTS;
            if (commission > 0) {
                // Transfer commission to referrer
                payable(currentReferrer).transfer(commission);
                
                // Update referrer's stats
                userAccounts[currentReferrer].totalReferralRewards += commission;
                
                // Update global stats
                totalEngineReferralCommissions += commission;
                totalCommissionsPaid += commission;
                
                // Emit commission event
                emit EngineReferralCommissionPaid(currentReferrer, buyer, level, commission, userAccounts[buyer].currentEngine);
            }
            
            // Move to next level referrer
            currentReferrer = userAccounts[currentReferrer].referrer;
        }
        
        return totalCommissionsPaid;
    }
    
    /**
     * @dev Initialize referral commission rates (called during contract initialization)
     */
    function _initializeReferralCommissionRates() internal {        
        referralCommissionRates = [800, 400, 300, 250, 250, 150, 100, 100, 100, 100];                
    }
        
    function _initializeDefaultEngines() internal {
        // Engine 1: Starter
        engines[1] = Engine({
            isActive: true,
            priceInAvax: 2 * 10**18, // 2 AVAX
            hashPower: 1,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 1,
            name: "Starter Engine"
        });
        
        // Engine 2: Basic
        engines[2] = Engine({
            isActive: true,
            priceInAvax: 4 * 10**18, // 4 AVAX
            hashPower: 2,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 2,
            name: "Basic Engine"
        });
        
        // Engine 3: Standard
        engines[3] = Engine({
            isActive: true,
            priceInAvax: 8 * 10**18, // 8 AVAX
            hashPower: 4,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 3,
            name: "Standard Engine"
        });
        
        // Engine 4: Advanced
        engines[4] = Engine({
            isActive: true,
            priceInAvax: 12 * 10**18, // 12 AVAX
            hashPower: 6,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 4,
            name: "Advanced Engine"
        });
        
        // Engine 5: Professional
        engines[5] = Engine({
            isActive: true,
            priceInAvax: 20 * 10**18, // 20 AVAX
            hashPower: 8,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 5,
            name: "Professional Engine"
        });
        
        // Engine 6: Expert
        engines[6] = Engine({
            isActive: true,
            priceInAvax: 36 * 10**18, // 36 AVAX
            hashPower: 10,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 6,
            name: "Expert Engine"
        });
        
        // Engine 7: Master
        engines[7] = Engine({
            isActive: true,
            priceInAvax: 75 * 10**18, // 75 AVAX
            hashPower: 12,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 10,
            name: "Master Engine"
        });
        
        // Engine 8: Elite
        engines[8] = Engine({
            isActive: true,
            priceInAvax: 115 * 10**18, // 115 AVAX
            hashPower: 14,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 10,
            name: "Elite Engine"
        });
        
        // Engine 9: Supreme
        engines[9] = Engine({
            isActive: true,
            priceInAvax: 195 * 10**18, // 195 AVAX
            hashPower: 16,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 10,
            name: "Supreme Engine"
        });
        
        // Engine 10: Ultimate
        engines[10] = Engine({
            isActive: true,
            priceInAvax: 310 * 10**18, // 310 AVAX
            hashPower: 18,
            maxRewardCapDays: 405,
            maxRewardCapPercentage: 450, // 450%
            maxReferralLevels: 10,
            name: "Ultimate Engine"
        });
        
        engineCount = 11; // 0 (no engine) + engines 1-10
    }
}