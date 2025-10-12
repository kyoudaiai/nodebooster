// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title NodeBoosterStaking
 * @dev Staking contract for NodeBooster ecosystem on Avalanche C-Chain
 * @notice Users can stake NodeBooster tokens to earn rewards and boost their node performance
 * 
 * Features:
 * - Multiple staking pools with different reward rates
 * - Flexible lock periods
 * - Emergency withdraw functionality
 * - Upgradeable architecture
 * - Auto-compounding rewards
 */
contract NodeBoosterStaking is 
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;
    
    /// @notice Staking pool information
    struct PoolInfo {
        uint256 allocPoint;        // How many allocation points assigned to this pool
        uint256 lastRewardBlock;   // Last block number where rewards were distributed
        uint256 accRewardPerShare; // Accumulated rewards per share, times 1e12
        uint256 totalStaked;       // Total amount staked in this pool
        uint256 lockPeriod;        // Lock period in seconds
        uint256 minStakeAmount;    // Minimum stake amount
        bool active;               // Pool status
    }
    
    /// @notice User staking information
    struct UserInfo {
        uint256 amount;           // Amount of tokens staked
        uint256 rewardDebt;       // Reward debt for accounting
        uint256 lockEndTime;      // When the lock period ends
        uint256 lastStakeTime;    // Last time user staked
        uint256 totalRewardsClaimed; // Total rewards claimed by user
    }
    
    /// @notice NodeBooster token contract
    IERC20 public nodeBoosterToken;
    
    /// @notice Reward token (can be same as staking token or different)
    IERC20 public rewardToken;
    
    /// @notice Reward tokens per block
    uint256 public rewardPerBlock;
    
    /// @notice Start block for rewards
    uint256 public startBlock;
    
    /// @notice End block for rewards
    uint256 public endBlock;
    
    /// @notice Total allocation points across all pools
    uint256 public totalAllocPoint;
    
    /// @notice Pool information
    PoolInfo[] public poolInfo;
    
    /// @notice User information for each pool
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    
    /// @notice Emergency withdraw status
    bool public emergencyWithdrawEnabled;
    
    /// @notice Performance fee rate (in basis points, 100 = 1%)
    uint256 public performanceFeeRate;
    
    /// @notice Maximum performance fee rate (1000 = 10%)
    uint256 public constant MAX_PERFORMANCE_FEE_RATE = 1000;
    
    /// @notice Fee collector address
    address public feeCollector;
    
    // Events
    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 indexed pid, uint256 amount);
    event PoolAdded(uint256 indexed pid, uint256 allocPoint, uint256 lockPeriod);
    event PoolUpdated(uint256 indexed pid, uint256 allocPoint, bool active);
    event RewardPerBlockUpdated(uint256 oldRate, uint256 newRate);
    event PerformanceFeeRateUpdated(uint256 oldRate, uint256 newRate);
    event FeeCollectorUpdated(address oldCollector, address newCollector);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the staking contract
     * @param _nodeBoosterToken NodeBooster token address
     * @param _rewardToken Reward token address
     * @param _rewardPerBlock Rewards per block
     * @param _startBlock Start block for rewards
     * @param _endBlock End block for rewards
     * @param _feeCollector Fee collector address
     */
    function initialize(
        address _nodeBoosterToken,
        address _rewardToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _endBlock,
        address _feeCollector
    ) public initializer {
        require(_nodeBoosterToken != address(0), "NodeBoosterStaking: invalid token address");
        require(_rewardToken != address(0), "NodeBoosterStaking: invalid reward token address");
        require(_feeCollector != address(0), "NodeBoosterStaking: invalid fee collector");
        require(_startBlock < _endBlock, "NodeBoosterStaking: invalid block range");
        
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        nodeBoosterToken = IERC20(_nodeBoosterToken);
        rewardToken = IERC20(_rewardToken);
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        endBlock = _endBlock;
        feeCollector = _feeCollector;
        performanceFeeRate = 300; // 3% default
    }
    
    /**
     * @dev Add a new staking pool
     * @param _allocPoint Allocation points for this pool
     * @param _lockPeriod Lock period in seconds
     * @param _minStakeAmount Minimum stake amount
     */
    function addPool(
        uint256 _allocPoint,
        uint256 _lockPeriod,
        uint256 _minStakeAmount
    ) external onlyOwner {
        massUpdatePools();
        
        uint256 lastRewardBlock = block.number > startBlock ? block.number : startBlock;
        totalAllocPoint += _allocPoint;
        
        poolInfo.push(PoolInfo({
            allocPoint: _allocPoint,
            lastRewardBlock: lastRewardBlock,
            accRewardPerShare: 0,
            totalStaked: 0,
            lockPeriod: _lockPeriod,
            minStakeAmount: _minStakeAmount,
            active: true
        }));
        
        emit PoolAdded(poolInfo.length - 1, _allocPoint, _lockPeriod);
    }
    
    /**
     * @dev Update pool allocation points
     * @param _pid Pool ID
     * @param _allocPoint New allocation points
     * @param _active Pool status
     */
    function updatePool(uint256 _pid, uint256 _allocPoint, bool _active) external onlyOwner {
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        
        massUpdatePools();
        
        totalAllocPoint = totalAllocPoint - poolInfo[_pid].allocPoint + _allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        poolInfo[_pid].active = _active;
        
        emit PoolUpdated(_pid, _allocPoint, _active);
    }
    
    /**
     * @dev Update reward per block
     * @param _rewardPerBlock New reward per block
     */
    function updateRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        massUpdatePools();
        
        uint256 oldRate = rewardPerBlock;
        rewardPerBlock = _rewardPerBlock;
        
        emit RewardPerBlockUpdated(oldRate, _rewardPerBlock);
    }
    
    /**
     * @dev Stake tokens in a pool
     * @param _pid Pool ID
     * @param _amount Amount to stake
     */
    function stake(uint256 _pid, uint256 _amount) external whenNotPaused nonReentrant {
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        require(_amount > 0, "NodeBoosterStaking: amount must be greater than 0");
        
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        
        require(pool.active, "NodeBoosterStaking: pool is not active");
        require(_amount >= pool.minStakeAmount, "NodeBoosterStaking: amount below minimum");
        
        updatePool(_pid);
        
        // Claim pending rewards
        if (user.amount > 0) {
            uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
            if (pending > 0) {
                _claimRewards(msg.sender, pending);
            }
        }
        
        // Transfer tokens from user
        nodeBoosterToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        // Update user info
        user.amount += _amount;
        user.lockEndTime = block.timestamp + pool.lockPeriod;
        user.lastStakeTime = block.timestamp;
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;
        
        // Update pool info
        pool.totalStaked += _amount;
        
        emit Deposit(msg.sender, _pid, _amount);
    }
    
    /**
     * @dev Withdraw staked tokens
     * @param _pid Pool ID
     * @param _amount Amount to withdraw
     */
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        
        require(user.amount >= _amount, "NodeBoosterStaking: insufficient balance");
        require(block.timestamp >= user.lockEndTime, "NodeBoosterStaking: tokens are still locked");
        
        updatePool(_pid);
        
        // Claim pending rewards
        uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
        if (pending > 0) {
            _claimRewards(msg.sender, pending);
        }
        
        // Update user info
        user.amount -= _amount;
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;
        
        // Update pool info
        pool.totalStaked -= _amount;
        
        // Transfer tokens to user
        nodeBoosterToken.safeTransfer(msg.sender, _amount);
        
        emit Withdraw(msg.sender, _pid, _amount);
    }
    
    /**
     * @dev Emergency withdraw without rewards
     * @param _pid Pool ID
     */
    function emergencyWithdraw(uint256 _pid) external nonReentrant {
        require(emergencyWithdrawEnabled, "NodeBoosterStaking: emergency withdraw not enabled");
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        
        uint256 amount = user.amount;
        require(amount > 0, "NodeBoosterStaking: no tokens to withdraw");
        
        // Reset user info
        user.amount = 0;
        user.rewardDebt = 0;
        user.lockEndTime = 0;
        
        // Update pool info
        pool.totalStaked -= amount;
        
        // Transfer tokens to user
        nodeBoosterToken.safeTransfer(msg.sender, amount);
        
        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }
    
    /**
     * @dev Claim pending rewards
     * @param _pid Pool ID
     */
    function claimRewards(uint256 _pid) external nonReentrant {
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        
        updatePool(_pid);
        
        uint256 pending = (user.amount * pool.accRewardPerShare / 1e12) - user.rewardDebt;
        require(pending > 0, "NodeBoosterStaking: no rewards to claim");
        
        user.rewardDebt = user.amount * pool.accRewardPerShare / 1e12;
        
        _claimRewards(msg.sender, pending);
        
        emit RewardsClaimed(msg.sender, _pid, pending);
    }
    
    /**
     * @dev Internal function to handle reward claims with fee
     * @param _user User address
     * @param _amount Reward amount
     */
    function _claimRewards(address _user, uint256 _amount) internal {
        if (performanceFeeRate > 0) {
            uint256 fee = (_amount * performanceFeeRate) / 10000;
            uint256 userReward = _amount - fee;
            
            userInfo[0][_user].totalRewardsClaimed += userReward;
            
            rewardToken.safeTransfer(_user, userReward);
            rewardToken.safeTransfer(feeCollector, fee);
        } else {
            userInfo[0][_user].totalRewardsClaimed += _amount;
            rewardToken.safeTransfer(_user, _amount);
        }
    }
    
    /**
     * @dev Update reward variables for all pools
     */
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }
    
    /**
     * @dev Update reward variables for a specific pool
     * @param _pid Pool ID
     */
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        
        if (pool.totalStaked == 0 || pool.allocPoint == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 reward = (multiplier * rewardPerBlock * pool.allocPoint) / totalAllocPoint;
        
        pool.accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        pool.lastRewardBlock = block.number;
    }
    
    /**
     * @dev Get multiplier for reward calculation
     * @param _from From block
     * @param _to To block
     * @return multiplier Block multiplier
     */
    function getMultiplier(uint256 _from, uint256 _to) public view returns (uint256) {
        if (_to <= endBlock) {
            return _to - _from;
        } else if (_from >= endBlock) {
            return 0;
        } else {
            return endBlock - _from;
        }
    }
    
    /**
     * @dev Get pending rewards for a user
     * @param _pid Pool ID
     * @param _user User address
     * @return pending Pending reward amount
     */
    function pendingRewards(uint256 _pid, address _user) external view returns (uint256 pending) {
        require(_pid < poolInfo.length, "NodeBoosterStaking: invalid pool ID");
        
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        
        uint256 accRewardPerShare = pool.accRewardPerShare;
        
        if (block.number > pool.lastRewardBlock && pool.totalStaked != 0) {
            uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
            uint256 reward = (multiplier * rewardPerBlock * pool.allocPoint) / totalAllocPoint;
            accRewardPerShare += (reward * 1e12) / pool.totalStaked;
        }
        
        pending = (user.amount * accRewardPerShare / 1e12) - user.rewardDebt;
        
        // Account for performance fee
        if (performanceFeeRate > 0) {
            uint256 fee = (pending * performanceFeeRate) / 10000;
            pending -= fee;
        }
    }
    
    /**
     * @dev Get pool count
     * @return count Number of pools
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }
    
    /**
     * @dev Set performance fee rate
     * @param _performanceFeeRate New performance fee rate
     */
    function setPerformanceFeeRate(uint256 _performanceFeeRate) external onlyOwner {
        require(_performanceFeeRate <= MAX_PERFORMANCE_FEE_RATE, "NodeBoosterStaking: fee rate too high");
        
        uint256 oldRate = performanceFeeRate;
        performanceFeeRate = _performanceFeeRate;
        
        emit PerformanceFeeRateUpdated(oldRate, _performanceFeeRate);
    }
    
    /**
     * @dev Set fee collector address
     * @param _feeCollector New fee collector address
     */
    function setFeeCollector(address _feeCollector) external onlyOwner {
        require(_feeCollector != address(0), "NodeBoosterStaking: invalid fee collector");
        
        address oldCollector = feeCollector;
        feeCollector = _feeCollector;
        
        emit FeeCollectorUpdated(oldCollector, _feeCollector);
    }
    
    /**
     * @dev Enable/disable emergency withdraw
     * @param _enabled Emergency withdraw status
     */
    function setEmergencyWithdrawEnabled(bool _enabled) external onlyOwner {
        emergencyWithdrawEnabled = _enabled;
    }
    
    /**
     * @dev Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency function to recover tokens
     * @param _token Token address
     * @param _amount Amount to recover
     */
    function recoverToken(address _token, uint256 _amount) external onlyOwner {
        require(_token != address(nodeBoosterToken), "NodeBoosterStaking: cannot recover staking token");
        IERC20(_token).safeTransfer(owner(), _amount);
    }
    
    /**
     * @dev Get contract version
     * @return version Contract version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
    
    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}