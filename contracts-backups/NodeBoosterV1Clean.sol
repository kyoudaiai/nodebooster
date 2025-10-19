// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error MinWDIntervalNotMet(uint256 attempted, uint256 required);
error InvalidEngine(uint256 engineId);
error NoEngine(address user);
error EngineNotActive(uint256 engineId);
error InvalidEngineConfiguration(
    uint256 engineId,
    uint256 price,
    uint256 hashPower,
    uint256 rewardCapDays,
    uint256 rewardCapPct,
    uint256 refLvls,
    string name
);
error EngineUpgradeNotAllowed(uint256 targetEngine, uint256 currentEngine);
error InsufficientFunds(uint256 sent, uint256 required);
error ZeroAddress();
error SelfReferencing();
error AlreadyRegistered(address user);
error NotRegistered(address user);
error Blacklisted(address user);
error InvalidReferrer(address referrer);
error InvalidSysPools();
error InvalidReferralRates();
error NoRewards();
error NoContracts(address contractAddr);

contract NodeBoosterV1 is 
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    uint256 public constant REGISTRATION_FEE = 25 * 10**6;
    uint256 public constant REFERRAL_COMMISSION_RATE = 1000;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_REFERRAL_LEVELS = 10;
    
    IERC20 public usdcToken;
    IERC20 public avax0Token;
    address[] public sysPools;
    uint256[] public usdcPcts;
    uint256[] public avaxPcts;
    address public defaultReferrer;
    uint256 public engineCount;
    uint public MIN_WD;

    struct Rewards {
        uint256 engineId;
        uint256 startTime;
        uint256 endTime;
        uint256 withdrawalTime;        
        uint256 amount;                              
        bool completed;
    }

    mapping(uint256 => Rewards) public rewards;

    struct Engine {
        bool isActive;
        uint256 price;
        uint256 hashPower;
        uint256 rewardCapDays;
        uint256 rewardCapPct;
        uint256 refLvls;
        string name;
    }

    mapping(uint256 => Engine) public engines;

    struct Account {
        bool isRegistered;
        address ref;
        uint256 tRefs;
        uint256 tRefRewards;
        uint256 cEngine;
        uint256 engineStartTime;
        uint256 lastClaimTime;
        mapping(uint256 => uint256) tDaysRewarded;
        mapping(uint256 => uint256) tRewardsClaimedPerEngine;
        Rewards[] pending;
        uint256 tClaimed;
    }
    
    mapping(address => Account) public userAccounts;
    mapping(address => bool) public isBlacklisted;
    address[] public usersList;
    uint256 public totalUsers;
    uint256 public totalUsdcCollected;
    uint256 public totalAvax0Distributed;
    uint256 public totalEngineRewards;
    uint256 public totalReferralRewards;
    uint256 public totalEngineReferralCommissions;
    uint256[MAX_REFERRAL_LEVELS] public referralCommissionRates;
    mapping(address => address[]) public directReferrals;
    
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
    
    event SysPoolsUpdated(
        address[] sysPools,
        uint256[] usdcPcts,
        uint256[] avaxPcts
    );
    
    event EngineConfigured(
        uint256 indexed engineId,
        string name,
        uint256 price,
        uint256 hashPower,
        uint256 rewardCapDays,
        uint256 rewardCapPct,
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
    
    event OwnerTransfer(
        address indexed previousOwner,
        address indexed newOwner
    );
            
    event Upgrade(
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

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdcToken,
        address _avax0Token
    ) public initializer {
        require(_usdcToken != address(0), "USDC 0 addr");
        require(_avax0Token != address(0), "AVAX0 0 addr");        
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _initRefLvlPcts();
        usdcToken = IERC20(_usdcToken);
        avax0Token = IERC20(_avax0Token);
        defaultReferrer = msg.sender;
        MIN_WD = 1 days;
        addUser(msg.sender, address(0), 0);
    }
    
    modifier notBlacklisted() {
        if (isBlacklisted[msg.sender]) { revert Blacklisted(msg.sender); }        
        _;
    }
    
    modifier notContract() {
        if (_isContract(msg.sender)) { revert NoContracts(msg.sender); }
        _;
    }

    function addUser(address _user, address _referrer, uint256 _engine) public onlyOwner {    
        Account storage newAccount = userAccounts[_user];
        newAccount.isRegistered = true;
        newAccount.ref = _referrer;
        newAccount.cEngine = _engine;
        usersList.push(_user);
        totalUsers++;
        emit UserRegistered(_user, _referrer, 0, 0, block.timestamp);        
    }

    function register(address _referrer) external whenNotPaused nonReentrant notBlacklisted notContract {
        if (userAccounts[msg.sender].isRegistered) { revert AlreadyRegistered(msg.sender); }
        if (_referrer == msg.sender) { revert SelfReferencing(); }

        address finalReferrer = _referrer;
        
        if (_referrer != address(0)) {
            if (!userAccounts[_referrer].isRegistered || isBlacklisted[_referrer]) {
                finalReferrer = defaultReferrer;
            }
        } else {
            finalReferrer = defaultReferrer;
        }
        
        if (finalReferrer != address(0) && (!userAccounts[finalReferrer].isRegistered || isBlacklisted[finalReferrer])) {
            finalReferrer = address(0);
        }
        
        usdcToken.safeTransferFrom(msg.sender, address(this), REGISTRATION_FEE);
        
        Account storage newAccount = userAccounts[msg.sender];
        newAccount.isRegistered = true;
        newAccount.ref = finalReferrer;
        newAccount.tRefs = 0;
        newAccount.tRefRewards = 0;
        newAccount.cEngine = 0;
        newAccount.engineStartTime = 0;
        newAccount.lastClaimTime = 0;
        newAccount.tClaimed = 0;
        
        totalUsers++;
        totalUsdcCollected += REGISTRATION_FEE;
        usersList.push(msg.sender);
        
        uint256 avax0Amount = 1 * 10**18;
        avax0Token.safeTransfer(msg.sender, avax0Amount);
        totalAvax0Distributed += avax0Amount;
        
        uint256 referralReward = 0;
        if (finalReferrer != address(0)) {
            referralReward = (REGISTRATION_FEE * REFERRAL_COMMISSION_RATE) / BASIS_POINTS;
            usdcToken.safeTransfer(finalReferrer, referralReward);
            userAccounts[finalReferrer].tRefs++;
            userAccounts[finalReferrer].tRefRewards += referralReward;
            totalReferralRewards += referralReward;
            directReferrals[finalReferrer].push(msg.sender);
            emit ReferralRewardPaid(finalReferrer, msg.sender, referralReward, block.timestamp);
        }
        
        uint256 remainingAmount = REGISTRATION_FEE - referralReward;
        _distributeUSDC(remainingAmount);
        emit UserRegistered(msg.sender, finalReferrer, REGISTRATION_FEE, avax0Amount, block.timestamp);
    }
    
    function configureEngine(
        uint256 _engineId,
        string memory _name,
        uint256 _price,
        uint256 _hashPower,
        uint256 _rewardCapDays,
        uint256 _rewardCapPct,
        uint256 _refLvls,
        bool _isActive
    ) external onlyOwner {        
        if (
            _engineId < 1 || _price < 1 || _hashPower < 1 || _rewardCapDays < 1 || _rewardCapPct < 1 || _refLvls < 1 || _refLvls > MAX_REFERRAL_LEVELS || bytes(_name).length == 0
        ) {
            revert InvalidEngineConfiguration(
                _engineId,
                _price,
                _hashPower,
                _rewardCapDays,
                _rewardCapPct,
                _refLvls,
                _name
            );
        }        
        
        engines[_engineId] = Engine({
            isActive: _isActive,
            price: _price,
            hashPower: _hashPower,
            rewardCapDays: _rewardCapDays,
            rewardCapPct: _rewardCapPct,
            refLvls: _refLvls,
            name: _name
        });
        
        if (_engineId >= engineCount) {
            engineCount = _engineId + 1;
        }
        
        emit EngineConfigured(_engineId, _name, _price, _hashPower, _rewardCapDays, _rewardCapPct, _isActive);
    }

    function setMinWD(uint _minWd) external onlyOwner { MIN_WD = _minWd; }

    function upSysPools(address[] memory _sysPools, uint256[] memory _usdcPct, uint256[] memory _avaxPct) external onlyOwner {
        require(_sysPools.length > 0, "sysPools");
        require(_usdcPct.length == _avaxPct.length && _avaxPct.length == _sysPools.length, "Length Mismatch");                
        delete sysPools;
        delete usdcPcts;
        delete avaxPcts;
        for (uint256 i = 0; i < _sysPools.length; i++) {
            if (_sysPools[i] == address(0)) { revert ZeroAddress(); }
            sysPools.push(_sysPools[i]);
            usdcPcts.push(_usdcPct[i]);
            avaxPcts.push(_avaxPct[i]);
        }
        emit SysPoolsUpdated(_sysPools, _usdcPct, _avaxPct);
    }
    
    function setDefaultReferrer(address _newDefaultReferrer) external onlyOwner {
        if (_newDefaultReferrer == address(0)) {revert InvalidReferrer(_newDefaultReferrer);}
        if (!userAccounts[_newDefaultReferrer].isRegistered) {revert NotRegistered(_newDefaultReferrer);}
        if (isBlacklisted[_newDefaultReferrer]) {revert Blacklisted(_newDefaultReferrer);}
        defaultReferrer = _newDefaultReferrer;
    }
    
    function setReferralCommissionRates(uint256[MAX_REFERRAL_LEVELS] calldata _rates) external onlyOwner {
        uint256 totalRate = 0;
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS; i++) {
            totalRate += _rates[i];
        }
        require(totalRate <= BASIS_POINTS, ">100%");
        referralCommissionRates = _rates;                
    }
    
    function setBlacklistStatus(address _user, bool _status) external onlyOwner {
        if ( _user == address(0) ) { revert ZeroAddress(); }    
        if (isBlacklisted[_user] == _status) { revert Blacklisted(_user); }
        require(_user != owner(), "owner");
        isBlacklisted[_user] = _status;
        emit UserBlacklisted(_user, _status, msg.sender);
    }
    
    function batchSetBlacklistStatus(address[] calldata _users, bool _status) external onlyOwner {
        require(_users.length > 0, "Empty");
        require(_users.length <= 100, "< 100");
        for (uint256 i = 0; i < _users.length; i++) {
            address user = _users[i];
            if (user == address(0)) { revert ZeroAddress(); }
            require(user != owner(), "owner");
            if (isBlacklisted[user] != _status) {
                isBlacklisted[user] = _status;
                emit UserBlacklisted(user, _status, msg.sender);
            }
        }
    }
    
    function upgradeEngine(uint256 targetEngine) external payable whenNotPaused nonReentrant notBlacklisted {
        if (targetEngine < 1 || targetEngine >= engineCount) { revert InvalidEngine(targetEngine); }
        if (!engines[targetEngine].isActive) { revert EngineNotActive(targetEngine); }
        if (!userAccounts[msg.sender].isRegistered) { revert NotRegistered(msg.sender); }

        Account storage account = userAccounts[msg.sender];
        if (targetEngine <= account.cEngine) { revert EngineUpgradeNotAllowed(targetEngine, account.cEngine); }
        
        uint256 pendingRewards = 0;
        
        if (account.cEngine > 0) {
            pendingRewards = calcPending(msg.sender);
            
            if (pendingRewards > 0) {
                uint256 lastRewardTime = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
                uint256 daysPending = (block.timestamp - lastRewardTime) / 1 days;
                Engine storage currentEngine = engines[account.cEngine];
                uint256 alreadyRewardedDays = account.tDaysRewarded[account.cEngine];
                uint256 remainingDays = currentEngine.rewardCapDays > alreadyRewardedDays ? 
                    currentEngine.rewardCapDays - alreadyRewardedDays : 0;
                uint256 actualDaysPending = daysPending > remainingDays ? remainingDays : daysPending;
                account.tDaysRewarded[account.cEngine] += actualDaysPending;
                account.tRewardsClaimedPerEngine[account.cEngine] += pendingRewards;
                uint256 rewardedPeriodEnd = lastRewardTime + (actualDaysPending * 1 days);
                
                account.pending.push(Rewards({
                    engineId: account.cEngine,
                    startTime: lastRewardTime,
                    endTime: rewardedPeriodEnd,
                    withdrawalTime: 0,
                    amount: pendingRewards,
                    completed: false
                }));
            }
        }
        
        uint256 upgradeCost;
        if (account.cEngine == 0) {
            upgradeCost = getCumulativeCost(targetEngine);
        } else {
            upgradeCost = calculateUpgradeCost(account.cEngine, targetEngine);
        }
        
        if (msg.value < upgradeCost) { revert InsufficientFunds(msg.value, upgradeCost); }
        
        if (msg.value > upgradeCost) {
            payable(msg.sender).transfer(msg.value - upgradeCost);
        }
        
        uint256 oldEngine = account.cEngine;
        account.cEngine = targetEngine;
        account.engineStartTime = block.timestamp;
        account.lastClaimTime = 0;
        
        uint256 totalCommissions = _processEngineReferralCommissions(msg.sender, upgradeCost);
        uint256 remainingAmount = upgradeCost - totalCommissions;
        _distributeAVAX(remainingAmount);
        
        emit Upgrade(msg.sender, oldEngine, targetEngine, pendingRewards);
    }
    
    function claimRewards() external whenNotPaused nonReentrant notBlacklisted {
        if (!userAccounts[msg.sender].isRegistered) { revert NotRegistered(msg.sender); }
        if (userAccounts[msg.sender].cEngine == 0) { revert NoEngine(msg.sender); }

        Account storage account = userAccounts[msg.sender];
        uint256 curPending = calcPending(msg.sender);
        uint256 storedRewards = 0;
        for (uint256 i = 0; i < account.pending.length; i++) {
            if (!account.pending[i].completed) {
                storedRewards += account.pending[i].amount;
            }
        }
        
        uint256 tRewards = storedRewards + curPending;
        if (tRewards == 0) { revert NoRewards(); }

        if (curPending > 0) {
            uint256 _last = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
            uint256 secondsElapsed = block.timestamp > _last ? (block.timestamp - _last) : 0;
            if (secondsElapsed < MIN_WD) {
                revert MinWDIntervalNotMet(secondsElapsed, MIN_WD);
            }
        }
        
        for (uint256 i = 0; i < account.pending.length; i++) {
            if (!account.pending[i].completed) {
                account.pending[i].completed = true;
                account.pending[i].withdrawalTime = block.timestamp;
            }
        }
        
        if (curPending > 0) {
            uint256 _last = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
            uint256 secondsElapsed = block.timestamp > _last ? (block.timestamp - _last) : 0;
            Engine storage engine = engines[account.cEngine];
            uint256 alreadyRewardedDays = account.tDaysRewarded[account.cEngine];
            uint256 maxDays = engine.rewardCapDays;
            uint256 remainingDays = maxDays > alreadyRewardedDays ? maxDays - alreadyRewardedDays : 0;
            uint256 daysClaimed = secondsElapsed / 1 days;
            uint256 actualDaysClaimed = daysClaimed > remainingDays ? remainingDays : daysClaimed;
            
            account.tDaysRewarded[account.cEngine] += actualDaysClaimed;
            
            account.pending.push(Rewards({
                engineId: account.cEngine,
                startTime: _last,
                endTime: block.timestamp,
                withdrawalTime: block.timestamp,
                amount: curPending,
                completed: true
            }));
            
            account.lastClaimTime = block.timestamp;
        }
        account.tClaimed += tRewards;
        
        if (curPending > 0) {
            account.tRewardsClaimedPerEngine[account.cEngine] += curPending;
        }
        
        totalAvax0Distributed += tRewards;
        totalEngineRewards += tRewards;
        avax0Token.safeTransfer(msg.sender, tRewards);
        emit RewardsClaimed(msg.sender, tRewards);
    }
    
    function UsersCount() external view returns (uint256) {
        return usersList.length;
    }
    
    function getUsers(uint256 _start, uint256 _limit) external view returns (address[] memory) {
        require(_start < usersList.length, "OOB");
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
    
    function calculateUpgradeCost(uint256 _cur, uint256 _target) public view returns (uint256) {
        if (_target < 1 || _target > engineCount) { revert InvalidEngine(_target); }
        if (!engines[_target].isActive) { revert EngineNotActive(_target); }
        if (_target <= _cur) { revert EngineUpgradeNotAllowed(_target, _cur); }

        if (_cur == 0) {
            return getCumulativeCost(_target);
        }
        
        uint256 totalCost = 0;
        for (uint256 i = _cur + 1; i <= _target; i++) {            
            if (!engines[i].isActive) { revert EngineNotActive(i); }
            totalCost += engines[i].price;
        }
        return totalCost;
    }
    
    function getCumulativeCost(uint256 engineId) public view returns (uint256) {
        if (engineId < 1 || engineId > engineCount) { revert InvalidEngine(engineId); }
        if (!engines[engineId].isActive) { revert EngineNotActive(engineId); }
        uint256 totalCost = 0;
        for (uint256 i = 1; i <= engineId; i++) {
            totalCost += engines[i].price;
        }        
        return totalCost;
    }
    
    function calcPending(address user) public view returns (uint256) {
        Account storage account = userAccounts[user];
        if (!account.isRegistered || account.cEngine == 0 || account.engineStartTime == 0) {
            return 0;
        }
        Engine storage engine = engines[account.cEngine];
        if (!engine.isActive) {
            return 0;
        }
        uint256 lastRewardTime = account.lastClaimTime > 0 ? account.lastClaimTime : account.engineStartTime;
        if (block.timestamp <= lastRewardTime) {
            return 0;
        }
        if ((block.timestamp - lastRewardTime) < MIN_WD) {
            return 0;
        }
        uint256 alreadyRewardedDays = account.tDaysRewarded[account.cEngine];
        uint256 maxDays = engine.rewardCapDays;
        if (alreadyRewardedDays >= maxDays) {
            return 0;
        }
        uint256 remainingDays = maxDays - alreadyRewardedDays;
        uint256 maxRewardableSeconds = remainingDays * 1 days;
        uint256 secondsElapsed = block.timestamp - lastRewardTime;
        if (secondsElapsed > maxRewardableSeconds) {
            secondsElapsed = maxRewardableSeconds;
        }
        uint256 cumulativeCost = getCumulativeCost(account.cEngine);
        uint256 maxRewardsForEngine = (cumulativeCost * engine.rewardCapPct) / 100;
        uint256 alreadyClaimedForEngine = account.tRewardsClaimedPerEngine[account.cEngine];
        if (alreadyClaimedForEngine >= maxRewardsForEngine) {
            return 0;
        }
        uint256 dailyRewardBase = (cumulativeCost * engine.rewardCapPct) / (405 * 100);
        uint256 dailyReward = (dailyRewardBase * (100 + engine.hashPower)) / 100;
        uint256 perSecondReward = dailyReward / 1 days;
        uint256 calculatedRewards = perSecondReward * secondsElapsed;
        uint256 remainingRewardsAllowed = maxRewardsForEngine - alreadyClaimedForEngine;
        uint256 finalRewards = calculatedRewards > remainingRewardsAllowed ? remainingRewardsAllowed : calculatedRewards;
        return finalRewards;
    }
    
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
        Account storage account = userAccounts[user];
        return (
            account.isRegistered,
            account.ref,
            account.tRefs,
            account.tRefRewards,
            account.cEngine,
            account.engineStartTime,
            account.lastClaimTime,
            account.tClaimed
        );
    }
    
    function getUserEngineRewardsClaimed(address user, uint256 engineId) external view returns (uint256) {
        require(engineId >= 1 && engineId < engineCount, "Invalid engine");
        require(engines[engineId].isActive, "not active");
        return userAccounts[user].tRewardsClaimedPerEngine[engineId];
    }
    
    function getUserEngineCapStatus(address user, uint256 engineId) external view returns (
        uint256 maxRewards,
        uint256 claimedRewards,
        uint256 remainingRewards,
        bool isCapReached,
        uint256 capPercentage
    ) {
        if (engineId < 1 || engineId > engineCount) { revert InvalidEngine(engineId); }
        if (!engines[engineId].isActive) { revert EngineNotActive(engineId); }

        Engine storage engine = engines[engineId];
        uint256 cumulativeCost = getCumulativeCost(engineId);
        capPercentage = engine.rewardCapPct;
        maxRewards = (cumulativeCost * capPercentage) / 100;
        claimedRewards = userAccounts[user].tRewardsClaimedPerEngine[engineId];
        
        if (claimedRewards >= maxRewards) {
            remainingRewards = 0;
            isCapReached = true;
        } else {
            remainingRewards = maxRewards - claimedRewards;
            isCapReached = false;
        }
    }
    
    function getUserRewardStatus(address user) external view returns (
        uint256[] memory engineIds,
        uint256[] memory daysRewarded,
        uint256[] memory maxDays,
        uint256[] memory rewardsClaimed,
        uint256[] memory maxRewardsAllowed,
        bool[] memory isTimeCapReached,
        bool[] memory isRewardCapReached
    ) {
        uint256 engineRange = engineCount - 1;
        engineIds = new uint256[](engineRange);
        daysRewarded = new uint256[](engineRange);
        maxDays = new uint256[](engineRange);
        rewardsClaimed = new uint256[](engineRange);
        maxRewardsAllowed = new uint256[](engineRange);
        isTimeCapReached = new bool[](engineRange);
        isRewardCapReached = new bool[](engineRange);
        
        Account storage account = userAccounts[user];
        
        for (uint256 i = 1; i < engineCount; i++) {
            uint256 index = i - 1;
            engineIds[index] = i;
            daysRewarded[index] = account.tDaysRewarded[i];
            maxDays[index] = engines[i].rewardCapDays;
            rewardsClaimed[index] = account.tRewardsClaimedPerEngine[i];
            uint256 cumulativeCost = getCumulativeCost(i);
            maxRewardsAllowed[index] = (cumulativeCost * engines[i].rewardCapPct) / 100;
            isTimeCapReached[index] = daysRewarded[index] >= maxDays[index];
            isRewardCapReached[index] = rewardsClaimed[index] >= maxRewardsAllowed[index];
        }
    }
    
    function getUserEngineRewardedDays(address user, uint256 engineId) external view returns (uint256) {
        if (engineId < 1 || engineId > engineCount) { revert InvalidEngine(engineId); }
        if (!engines[engineId].isActive) { revert EngineNotActive(engineId); }
        return userAccounts[user].tDaysRewarded[engineId];
    }
    
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
        Account storage account = userAccounts[user];
        if (targetEngine <= account.cEngine) {
            return (false, 0, "must be higher");
        }
        if (isBlacklisted[user]) {
            return (false, 0, "blacklisted");
        }
        uint256 upgradeCost;
        if (account.cEngine == 0) {
            upgradeCost = getCumulativeCost(targetEngine);
        } else {
            upgradeCost = calculateUpgradeCost(account.cEngine, targetEngine);
        }
        return (true, upgradeCost, "Can purchase");
    }
    
    function getUserEngineOptions(address user) external view returns (
        bool hasEngine,
        uint256 currentEngineId,
        uint256[] memory availableEngines,
        uint256[] memory purchaseCosts
    ) {
        Account storage account = userAccounts[user];
        hasEngine = account.cEngine > 0;
        currentEngineId = account.cEngine;
        
        if (!account.isRegistered || isBlacklisted[user]) {
            availableEngines = new uint256[](0);
            purchaseCosts = new uint256[](0);
            return (hasEngine, currentEngineId, availableEngines, purchaseCosts);
        }
        
        uint256 availableCount = 0;
        for (uint256 i = account.cEngine + 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                availableCount++;
            }
        }
        
        availableEngines = new uint256[](availableCount);
        purchaseCosts = new uint256[](availableCount);
        
        uint256 index = 0;
        for (uint256 i = account.cEngine + 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                availableEngines[index] = i;
                if (account.cEngine == 0) {
                    purchaseCosts[index] = getCumulativeCost(i);
                } else {
                    purchaseCosts[index] = calculateUpgradeCost(account.cEngine, i);
                }
                index++;
            }
        }
    }
    
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
        Account storage account = userAccounts[user];
        currentEngine = account.cEngine;
        engineStartTime = account.engineStartTime;
        lastClaimTime = account.lastClaimTime;
        
        if (currentEngine > 0) {
            daysRewarded = account.tDaysRewarded[currentEngine];
            Engine storage engine = engines[currentEngine];
            remainingDays = engine.rewardCapDays > daysRewarded ? 
                engine.rewardCapDays - daysRewarded : 0;
            rewardsClaimed = account.tRewardsClaimedPerEngine[currentEngine];
            uint256 cumulativeCost = getCumulativeCost(currentEngine);
            maxRewardsAllowed = (cumulativeCost * engines[currentEngine].rewardCapPct) / 100;
        }
        
        pendingRewards = 0;
        for (uint256 i = 0; i < account.pending.length; i++) {
            if (!account.pending[i].completed) {
                pendingRewards += account.pending[i].amount;
            }
        }
        
        currentRewards = calcPending(user);
        totalClaimable = pendingRewards + currentRewards;
    }
    
    function getUserRewardsHistory(address user) external view returns (Rewards[] memory) {
        return userAccounts[user].pending;
    }
    
    function getPendingRewardsCount(address user) external view returns (uint256) {
        uint256 count = 0;
        Rewards[] storage userRewards = userAccounts[user].pending;
        for (uint256 i = 0; i < userRewards.length; i++) {
            if (!userRewards[i].completed) {
                count++;
            }
        }
        return count;
    }
    
    function getTotalPendingRewards(address user) external view returns (uint256) {
        uint256 total = 0;
        Rewards[] storage userRewards = userAccounts[user].pending;
        for (uint256 i = 0; i < userRewards.length; i++) {
            if (!userRewards[i].completed) {
                total += userRewards[i].amount;
            }
        }
        return total;
    }
    
    function getEngine(uint256 _engineId) external view returns (Engine memory) {
        if(_engineId < 1 || _engineId > engineCount) { revert InvalidEngine(_engineId); }
        if (!engines[_engineId].isActive) { revert EngineNotActive(_engineId); }
        return engines[_engineId];
    }
    
    function getActiveEngines() external view returns (uint256[] memory engineIds, Engine[] memory activeEngines) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                activeCount++;
            }
        }
        
        engineIds = new uint256[](activeCount);
        activeEngines = new Engine[](activeCount);
        
        uint256 index = 0;
        for (uint256 i = 1; i < engineCount; i++) {
            if (engines[i].isActive) {
                engineIds[index] = i;
                activeEngines[index] = engines[i];
                index++;
            }
        }
    }
    
    function getStats() external view returns (
        uint256,
        uint256,
        uint256,
        uint256,
        uint256
    ) {
        return (totalUsers, totalUsdcCollected, totalAvax0Distributed, totalReferralRewards, totalEngineReferralCommissions);
    }
    
    function getReferralChain(address user) external view returns (
        address[] memory referrers,
        uint256[] memory referrerEngines,
        uint256[] memory maxLevels
    ) {
        referrers = new address[](MAX_REFERRAL_LEVELS);
        referrerEngines = new uint256[](MAX_REFERRAL_LEVELS);
        maxLevels = new uint256[](MAX_REFERRAL_LEVELS);
        
        address currentReferrer = userAccounts[user].ref;
        uint256 count = 0;
        
        for (uint256 i = 0; i < MAX_REFERRAL_LEVELS && currentReferrer != address(0); i++) {
            referrers[i] = currentReferrer;
            referrerEngines[i] = userAccounts[currentReferrer].cEngine;
            if (referrerEngines[i] > 0) {
                maxLevels[i] = this.getEngine(referrerEngines[i]).refLvls;
            } else {
                maxLevels[i] = 0;
            }
            currentReferrer = userAccounts[currentReferrer].ref;
            count++;
        }
        
        assembly {
            mstore(referrers, count)
            mstore(referrerEngines, count)
            mstore(maxLevels, count)
        }
    }
    
    function calculateEngineCommissions(address buyer, uint256 amount) external view returns (
        address[] memory referrers,
        uint256[] memory levels,
        uint256[] memory commissions,
        uint256 totalCommission
    ) {
        address[] memory tempReferrers = new address[](MAX_REFERRAL_LEVELS);
        uint256[] memory tempLevels = new uint256[](MAX_REFERRAL_LEVELS);
        uint256[] memory tempCommissions = new uint256[](MAX_REFERRAL_LEVELS);
        
        address currentReferrer = userAccounts[buyer].ref;
        uint256 count = 0;
        uint256 total = 0;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS; level++) {
            if (currentReferrer == address(0) || 
                !userAccounts[currentReferrer].isRegistered || 
                isBlacklisted[currentReferrer]) {
                break;
            }
            
            uint256 referrerEngine = userAccounts[currentReferrer].cEngine;
            if (referrerEngine == 0) {
                currentReferrer = userAccounts[currentReferrer].ref;
                continue;
            }
            
            uint256 maxLevelsForEngine = engines[referrerEngine].refLvls;
            if (level > maxLevelsForEngine) {
                currentReferrer = userAccounts[currentReferrer].ref;
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
            
            currentReferrer = userAccounts[currentReferrer].ref;
        }
        
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
    
    function getDirectReferrals(address user) external view returns (address[] memory) {
        return directReferrals[user];
    }
    
    function getDirectReferralCount(address user) external view returns (uint256) {
        return directReferrals[user].length;
    }
    
    function getReferredUsersOnLevel(address user, uint256 level) external view returns (address[] memory) {
        require(level > 0 && level <= MAX_REFERRAL_LEVELS, "Invalid level");
        
        if (level == 1) {
            return directReferrals[user];
        }
        
        address[] memory previousLevel = this.getReferredUsersOnLevel(user, level - 1);
        uint256 totalCount = 0;
        for (uint256 i = 0; i < previousLevel.length; i++) {
            totalCount += directReferrals[previousLevel[i]].length;
        }
        
        address[] memory result = new address[](totalCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < previousLevel.length; i++) {
            address[] memory userReferrals = directReferrals[previousLevel[i]];
            for (uint256 j = 0; j < userReferrals.length; j++) {
                result[currentIndex] = userReferrals[j];
                currentIndex++;
            }
        }
        
        return result;
    }
    
    function getAllReferredUsers(address user, uint256 maxLevel) external view returns (
        address[] memory allUsers,
        uint256[] memory userLevels
    ) {
        require(maxLevel > 0 && maxLevel <= MAX_REFERRAL_LEVELS, ">maxLvl");
        
        uint256 totalUsersCount = 0;
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            totalUsersCount += levelUsers.length;
        }
        
        allUsers = new address[](totalUsersCount);
        userLevels = new uint256[](totalUsersCount);
        uint256 currentIndex = 0;
        
        for (uint256 level = 1; level <= maxLevel; level++) {
            address[] memory levelUsers = this.getReferredUsersOnLevel(user, level);
            for (uint256 i = 0; i < levelUsers.length; i++) {
                allUsers[currentIndex] = levelUsers[i];
                userLevels[currentIndex] = level;
                currentIndex++;
            }
        }
    }
    
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
    
    function _isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }
    
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
    
    function getSecurityStatus() external view returns (
        bool isPaused,
        address contractOwner,
        uint256 totalBlacklisted
    ) {
        uint256 blacklistedCount = 0;
        for (uint256 i = 0; i < usersList.length; i++) {
            if (isBlacklisted[usersList[i]]) {
                blacklistedCount++;
            }
        }
        
        return (paused(), owner(), blacklistedCount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) { revert ZeroAddress(); }
        if (newOwner == owner()) { revert SelfReferencing(); }
        if (isBlacklisted[newOwner]) { revert Blacklisted(newOwner); }

        address oldOwner = owner();
        emit OwnerTransfer(oldOwner, newOwner);
        
        super.transferOwnership(newOwner);
    }
    
    function emergencyTransferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) { revert ZeroAddress(); }
        if (newOwner == owner()) { revert SelfReferencing(); }        
        
        if (isBlacklisted[newOwner]) {
            isBlacklisted[newOwner] = false;
            emit UserBlacklisted(newOwner, false, msg.sender);
        }
        
        address oldOwner = owner();
        emit OwnerTransfer(oldOwner, newOwner);
        
        super.transferOwnership(newOwner);
    }

    function recoverToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(this), "own tokens");
        require(to != address(0), "to: 0 addr");
        require(amount > 0, "amt");
        IERC20(token).safeTransfer(to, amount);
        emit TokensWithdrawn(token, to, amount);        
    }

    function recoverFunds(uint256 amount) external onlyOwner {
        require(amount > 0, "amt");
        require(amount <= address(this).balance, "funds");        
        payable(owner()).transfer(amount);        
    }
    
    function _distributeUSDC(uint256 _amt) internal {
        for (uint256 i = 0; i < sysPools.length; i++) {
            uint256 amt = (_amt * usdcPcts[i]) / BASIS_POINTS;
            if (amt > 0) {
                IERC20(usdcToken).safeTransfer(sysPools[i], amt);
            }
        }
    }

    function _distributeAVAX(uint256 _amt) internal {
        for (uint256 i = 0; i < sysPools.length; i++) {
            uint256 amt = (_amt * avaxPcts[i]) / BASIS_POINTS;
            if (amt > 0) {
                payable(sysPools[i]).transfer(amt);
            }
        }
    }
    
    function _processEngineReferralCommissions(address buyer, uint256 amount) internal returns (uint256) {
        address currentReferrer = userAccounts[buyer].ref;
        uint256 totalCommissionsPaid = 0;
        
        for (uint256 level = 1; level <= MAX_REFERRAL_LEVELS; level++) {
            if (currentReferrer == address(0) || 
                !userAccounts[currentReferrer].isRegistered || 
                isBlacklisted[currentReferrer]) {
                break;
            }
            
            uint256 referrerEngine = userAccounts[currentReferrer].cEngine;
            if (referrerEngine == 0) {
                currentReferrer = userAccounts[currentReferrer].ref;
                continue;
            }
            
            uint256 maxLevelsForEngine = engines[referrerEngine].refLvls;
            if (level > maxLevelsForEngine) {
                currentReferrer = userAccounts[currentReferrer].ref;
                continue;
            }
            
            uint256 commissionRate = referralCommissionRates[level - 1];
            if (commissionRate == 0) {
                currentReferrer = userAccounts[currentReferrer].ref;
                continue;
            }
            
            uint256 commission = (amount * commissionRate) / BASIS_POINTS;
            if (commission > 0) {
                payable(currentReferrer).transfer(commission);
                userAccounts[currentReferrer].tRefRewards += commission;
                totalEngineReferralCommissions += commission;
                totalCommissionsPaid += commission;
                emit EngineReferralCommissionPaid(currentReferrer, buyer, level, commission, userAccounts[buyer].cEngine);
            }
            
            currentReferrer = userAccounts[currentReferrer].ref;
        }
        
        return totalCommissionsPaid;
    }
    
    function _initRefLvlPcts() internal {        
        referralCommissionRates = [800, 400, 300, 250, 250, 150, 100, 100, 100, 100];                
    }
}