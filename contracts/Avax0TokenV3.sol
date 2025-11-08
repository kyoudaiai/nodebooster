// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Custom errors
error InsufficientUnlockedBalance(address account, uint256 requested, uint256 available);
error InsufficientGraduallyReleasedBalance(address account, uint256 requested, uint256 availableNow, uint256 totalAvailable, uint256 nextReleaseTime);
error InvalidLockAmount(uint256 amount);
error InvalidReleaseTime(uint256 releaseTime);
error InvalidGradualReleaseConfig(uint256 duration, uint256 interval);
error LockNotFound(address account, uint256 lockId);
error InvalidLockModification(string reason);
error InvalidCleanupThreshold(uint256 threshold);
error ZeroAddress();

/**
 * @title Avax0TokenV3
 * @dev Upgradeable ERC20 token with time lock and gradual release functionality - Version 3
 * @notice This contract implements a utility token with time-locked transfer restrictions and gradual release periods
 * 
 * Features:
 * - Upgradeable using UUPS pattern
 * - Pausable for emergency stops
 * - Burnable tokens
 * - Owner-controlled minting
 * - Time lock functionality for address balances
 * - Multiple locks per address support
 * - Gradual release periods after lock expiration
 * - Configurable release intervals and durations
 * - Basic ERC20 functionality
 */
contract Avax0TokenV3 is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    /// @notice Maximum total supply of tokens (100M tokens)
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;
    
    /// @notice Mapping of addresses that can mint tokens
    mapping(address => bool) public minters;
    
    /// @notice Gradual release configuration
    struct GradualReleaseConfig {
        uint256 duration;    // Total duration for gradual release (e.g., 30 days)
        uint256 interval;    // Release interval (e.g., 1 day)
        bool enabled;        // Whether gradual release is enabled for this config
    }
    
    /// @notice Structure to represent a time lock (V2 compatible)
    struct TimeLock {
        uint256 amount;      // Amount of tokens locked
        uint256 releaseTime; // Timestamp when tokens are released
        bool released;       // Whether the lock has been released
    }
    
    /// @notice Mapping of user address to their time locks (multiple locks per address)
    mapping(address => TimeLock[]) public timeLocks;
    
    /// @notice Total locked amount per address (excluding gradually released amounts)
    mapping(address => uint256) public totalLockedAmount;
    
    /// @notice V3: Gradual release configuration per lock (account -> lockId -> config)
    mapping(address => mapping(uint256 => GradualReleaseConfig)) private _gradualReleaseConfigs;
    
    /// @notice V3: Amount already released during gradual period (account -> lockId -> amount)
    mapping(address => mapping(uint256 => uint256)) private _releasedAmounts;
    
    /// @notice Default gradual release configuration
    GradualReleaseConfig public defaultGradualReleaseConfig;
    
    /// @notice Auto cleanup settings
    bool public autoCleanupEnabled;
    uint256 public cleanupThreshold; // Number of completed locks before auto cleanup
    mapping(address => uint256) private _completedLockCount;
    
    // Events
    event MinterUpdated(address account, bool isMinter);
    event TokensLocked(address indexed account, uint256 amount, uint256 releaseTime, uint256 lockId);
    event TokensUnlocked(address indexed account, uint256 amount, uint256 lockId);
    event TokensGraduallyReleased(address indexed account, uint256 amount, uint256 lockId, uint256 totalReleased);
    event LockExtended(address indexed account, uint256 lockId, uint256 newReleaseTime);
    event GradualReleaseConfigUpdated(uint256 duration, uint256 interval, bool enabled);
    event LockModified(address indexed account, uint256 lockId, uint256 newAmount, uint256 newReleaseTime, GradualReleaseConfig newConfig);
    event AutoCleanupConfigured(bool enabled, uint256 threshold);
    event LocksCleanedUp(address indexed account, uint256 removedCount, uint256 remainingCount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the contract (V2 initialization)
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) public initializer {
        require(_initialSupply <= MAX_SUPPLY, "Avax0: initial supply exceeds maximum");
        
        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        // Owner is initially a minter
        minters[msg.sender] = true;
        
        if (_initialSupply > 0) {
            _mint(msg.sender, _initialSupply);
        }
        
        emit MinterUpdated(msg.sender, true);
    }
    
    /**
     * @dev Initialize V3 features (called during upgrade)
     * @param _duration Default gradual release duration (in seconds)
     * @param _interval Default gradual release interval (in seconds)
     */
    function initializeV3(uint256 _duration, uint256 _interval) public reinitializer(3) {
        if (_duration == 0 || _interval == 0 || _interval > _duration) {
            revert InvalidGradualReleaseConfig(_duration, _interval);
        }
        
        defaultGradualReleaseConfig = GradualReleaseConfig({
            duration: _duration,
            interval: _interval,
            enabled: true
        });
        
        // Initialize auto cleanup settings
        autoCleanupEnabled = true;
        cleanupThreshold = 5; // Default: cleanup after 5 completed locks
        
        emit GradualReleaseConfigUpdated(_duration, _interval, true);
        emit AutoCleanupConfigured(true, 5);
    }
    
    /**
     * @dev Set default gradual release configuration
     * @param _duration Duration for gradual release (in seconds)
     * @param _interval Release interval (in seconds)
     * @param _enabled Whether gradual release is enabled
     */
    function setDefaultGradualReleaseConfig(uint256 _duration, uint256 _interval, bool _enabled) external onlyOwner {
        if (_enabled && (_duration == 0 || _interval == 0 || _interval > _duration)) {
            revert InvalidGradualReleaseConfig(_duration, _interval);
        }
        
        defaultGradualReleaseConfig = GradualReleaseConfig({
            duration: _duration,
            interval: _interval,
            enabled: _enabled
        });
        
        emit GradualReleaseConfigUpdated(_duration, _interval, _enabled);
    }
    
    /**
     * @dev Configure auto cleanup settings for released locks
     * @param _enabled Whether auto cleanup is enabled
     * @param _threshold Number of completed locks before triggering cleanup
     */
    function configureAutoCleanup(bool _enabled, uint256 _threshold) external onlyOwner {
        if (_enabled && _threshold == 0) {
            revert InvalidCleanupThreshold(_threshold);
        }
        
        autoCleanupEnabled = _enabled;
        cleanupThreshold = _threshold;
        
        emit AutoCleanupConfigured(_enabled, _threshold);
    }
    
    /**
     * @dev Manually clean up released locks for an account
     * @param account Address to clean up locks for
     * @return removedCount Number of locks removed
     */
    function cleanupReleasedLocks(address account) external onlyOwner returns (uint256 removedCount) {
        return _performCleanup(account);
    }
    
    /**
     * @dev Internal function to perform lock cleanup
     * @param account Address to clean up locks for
     * @return removedCount Number of locks removed
     */
    function _performCleanup(address account) internal returns (uint256 removedCount) {
        TimeLock[] storage locks = timeLocks[account];
        if (locks.length == 0) return 0;
        
        uint256 originalLength = locks.length;
        uint256 writeIndex = 0;
        
        // Compact array by moving non-released locks to the front
        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].released) {
                if (writeIndex != i) {
                    locks[writeIndex] = locks[i];
                    // Move associated data
                    _gradualReleaseConfigs[account][writeIndex] = _gradualReleaseConfigs[account][i];
                    _releasedAmounts[account][writeIndex] = _releasedAmounts[account][i];
                    
                    // Clear old data
                    delete _gradualReleaseConfigs[account][i];
                    delete _releasedAmounts[account][i];
                }
                writeIndex++;
            }
        }
        
        // Remove excess elements
        while (locks.length > writeIndex) {
            locks.pop();
        }
        
        removedCount = originalLength - writeIndex;
        
        if (removedCount > 0) {
            // Reset completed lock count
            _completedLockCount[account] = 0;
            
            emit LocksCleanedUp(account, removedCount, writeIndex);
        }
        
        return removedCount;
    }
    
    /**
     * @dev Get the number of completed locks for an account
     * @param account Address to check
     * @return count Number of completed locks waiting for cleanup
     */
    function getCompletedLockCount(address account) external view returns (uint256) {
        return _completedLockCount[account];
    }
    
    /**
     * @dev Get auto cleanup configuration
     * @return enabled Whether auto cleanup is enabled
     * @return threshold Number of completed locks before cleanup triggers
     */
    function getAutoCleanupConfig() external view returns (bool enabled, uint256 threshold) {
        return (autoCleanupEnabled, cleanupThreshold);
    }
    
    /**
     * @dev Mint tokens to specified address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) public whenNotPaused {
        require(minters[msg.sender], "Avax0: caller is not a minter");
        require(to != address(0), "Avax0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Avax0: minting would exceed max supply");
        
        _mint(to, amount);
    }
    
    /**
     * @dev Mint tokens with time lock and optional custom gradual release config
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param releaseTime Timestamp when tokens will start unlocking
     * @param gradualConfig Custom gradual release configuration (zero values = use default)
     */
    function mintWithLock(
        address to, 
        uint256 amount, 
        uint256 releaseTime,
        GradualReleaseConfig memory gradualConfig
    ) external whenNotPaused {
        require(minters[msg.sender], "Avax0: caller is not a minter");
        require(to != address(0), "Avax0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Avax0: minting would exceed max supply");
        require(releaseTime > block.timestamp, "Avax0: release time must be in future");
        require(amount > 0, "Avax0: amount must be greater than zero");
        
        _mint(to, amount);
        _createTimeLock(to, amount, releaseTime, gradualConfig);
    }
    
    /**
     * @dev Mint tokens with time lock using default gradual release config
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param releaseTime Timestamp when tokens will start unlocking
     */
    function mintWithLock(address to, uint256 amount, uint256 releaseTime) external whenNotPaused {
        require(minters[msg.sender], "Avax0: caller is not a minter");
        require(to != address(0), "Avax0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Avax0: minting would exceed max supply");
        require(releaseTime > block.timestamp, "Avax0: release time must be in future");
        require(amount > 0, "Avax0: amount must be greater than zero");
        
        // Use explicit struct initialization to avoid potential issues
        GradualReleaseConfig memory emptyConfig;
        emptyConfig.duration = 0;
        emptyConfig.interval = 0;
        emptyConfig.enabled = false;
        
        _mint(to, amount);
        _createTimeLock(to, amount, releaseTime, emptyConfig);
    }
    
    /**
     * @dev Batch mint tokens to multiple addresses
     * @param recipients Array of addresses to mint tokens to
     * @param amounts Array of amounts to mint to each address
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external whenNotPaused {
        require(minters[msg.sender], "Avax0: caller is not a minter");
        require(recipients.length == amounts.length, "Avax0: arrays length mismatch");
        require(recipients.length > 0, "Avax0: empty arrays");
        
        uint256 totalMintAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalMintAmount += amounts[i];
        }
        
        require(totalSupply() + totalMintAmount <= MAX_SUPPLY, "Avax0: batch minting would exceed max supply");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Avax0: mint to zero address");
            _mint(recipients[i], amounts[i]);
        }
    }
    
    /**
     * @dev Create a time lock for an address with custom gradual release config
     * @param account Address to lock tokens for
     * @param amount Amount of tokens to lock
     * @param releaseTime Timestamp when gradual release will begin
     * @param gradualConfig Custom gradual release configuration
     */
    function createTimeLock(
        address account, 
        uint256 amount, 
        uint256 releaseTime,
        GradualReleaseConfig memory gradualConfig
    ) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidLockAmount(amount);
        if (releaseTime <= block.timestamp) revert InvalidReleaseTime(releaseTime);
        
        uint256 availableBalance = getAvailableBalance(account);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(account, amount, availableBalance);
        }
        
        _createTimeLock(account, amount, releaseTime, gradualConfig);
    }
    
    /**
     * @dev Create a time lock for an address using default gradual release config
     * @param account Address to lock tokens for
     * @param amount Amount of tokens to lock
     * @param releaseTime Timestamp when gradual release will begin
     */
    function createTimeLock(address account, uint256 amount, uint256 releaseTime) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidLockAmount(amount);
        if (releaseTime <= block.timestamp) revert InvalidReleaseTime(releaseTime);
        
        uint256 availableBalance = getAvailableBalance(account);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(account, amount, availableBalance);
        }
        
        // Use explicit struct initialization to avoid potential issues
        GradualReleaseConfig memory emptyConfig;
        emptyConfig.duration = 0;
        emptyConfig.interval = 0;
        emptyConfig.enabled = false;
        
        _createTimeLock(account, amount, releaseTime, emptyConfig);
    }
    
    /**
     * @dev Internal function to create a time lock
     * @param account Address to lock tokens for
     * @param amount Amount of tokens to lock
     * @param releaseTime Timestamp when gradual release will begin
     * @param gradualConfig Gradual release configuration
     */
    function _createTimeLock(
        address account, 
        uint256 amount, 
        uint256 releaseTime,
        GradualReleaseConfig memory gradualConfig
    ) internal {
        // If gradual release is explicitly disabled, keep it disabled
        if (!gradualConfig.enabled) {
            // Set dummy values to avoid division by zero, but keep enabled = false
            if (gradualConfig.duration == 0) gradualConfig.duration = 1;
            if (gradualConfig.interval == 0) gradualConfig.interval = 1;
        } else if (gradualConfig.duration == 0 || gradualConfig.interval == 0) {
            // Use default config for incomplete enabled configs
            gradualConfig = defaultGradualReleaseConfig;
        }
        
        timeLocks[account].push(TimeLock({
            amount: amount,
            releaseTime: releaseTime,
            released: false
        }));
        
        uint256 lockId = timeLocks[account].length - 1;
        
        // Store V3 gradual release config separately
        _gradualReleaseConfigs[account][lockId] = gradualConfig;
        _releasedAmounts[account][lockId] = 0;
        
        totalLockedAmount[account] += amount;
        emit TokensLocked(account, amount, releaseTime, lockId);
    }
    
    /**
     * @dev Calculate available amount for gradual release
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @param currentTime Current timestamp
     * @return availableAmount Amount available for release now
     * @return nextReleaseTime Time when next amount will be available
     */
    function _calculateGradualRelease(address account, uint256 lockId, uint256 currentTime) 
        internal 
        view 
        returns (uint256 availableAmount, uint256 nextReleaseTime) 
    {
        TimeLock storage lock = timeLocks[account][lockId];
        GradualReleaseConfig memory gradualConfig = _gradualReleaseConfigs[account][lockId];
        uint256 releasedAmount = _releasedAmounts[account][lockId];
        
        // If lock hasn't expired yet, nothing is available
        if (currentTime < lock.releaseTime) {
            return (0, lock.releaseTime);
        }
        
        // If gradual release is disabled, release everything immediately
        if (!gradualConfig.enabled) {
            return (lock.amount - releasedAmount, 0);
        }
        
        uint256 timeSinceRelease = currentTime - lock.releaseTime;
        uint256 totalDuration = gradualConfig.duration;
        uint256 interval = gradualConfig.interval;
        
        // If gradual release period is over, release everything
        if (timeSinceRelease >= totalDuration) {
            return (lock.amount - releasedAmount, 0);
        }
        
        // Calculate how many intervals have passed
        uint256 intervalsPassed = timeSinceRelease / interval;
        uint256 totalIntervals = (totalDuration + interval - 1) / interval; // Round up
        
        // Calculate amount that should be released by now
        uint256 shouldBeReleased = (lock.amount * (intervalsPassed + 1)) / totalIntervals;
        
        // Don't exceed total amount
        if (shouldBeReleased > lock.amount) {
            shouldBeReleased = lock.amount;
        }
        
        // Calculate available amount (total that should be released minus already released)
        availableAmount = shouldBeReleased > releasedAmount ? shouldBeReleased - releasedAmount : 0;
        
        // Calculate next release time
        nextReleaseTime = lock.releaseTime + ((intervalsPassed + 1) * interval);
        
        return (availableAmount, nextReleaseTime);
    }
    
    /**
     * @dev Process gradual release for an account
     * @param account Address to process releases for
     * @return totalReleased Total amount released
     */
    function _processGradualReleases(address account) internal returns (uint256 totalReleased) {
        TimeLock[] storage locks = timeLocks[account];
        uint256 currentTime = block.timestamp;
        uint256 newlyCompleted = 0;
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (locks[i].released) continue;
            
            (uint256 availableAmount, ) = _calculateGradualRelease(account, i, currentTime);
            
            if (availableAmount > 0) {
                _releasedAmounts[account][i] += availableAmount;
                totalLockedAmount[account] -= availableAmount;
                totalReleased += availableAmount;
                
                emit TokensGraduallyReleased(account, availableAmount, i, _releasedAmounts[account][i]);
                
                // Mark as fully released if all tokens are released
                if (_releasedAmounts[account][i] >= locks[i].amount) {
                    locks[i].released = true;
                    newlyCompleted++;
                    emit TokensUnlocked(account, locks[i].amount, i);
                }
            }
        }
        
        // Update completed count and check for auto cleanup
        if (newlyCompleted > 0) {
            _completedLockCount[account] += newlyCompleted;
            
            // Auto cleanup if enabled and threshold reached
            if (autoCleanupEnabled && _completedLockCount[account] >= cleanupThreshold) {
                _performCleanup(account);
            }
        }
        
        return totalReleased;
    }
    
    /**
     * @dev Release available gradual releases for an address
     * @param account Address to release for
     * @return releasedAmount Total amount released
     */
    function releaseGradualUnlocks(address account) external returns (uint256 releasedAmount) {
        return _processGradualReleases(account);
    }
    
    /**
     * @dev Release expired time locks for an address (V2 compatibility)
     * @param account Address to release locks for
     * @return releasedAmount Total amount of tokens released
     */
    function releaseExpiredLocks(address account) external returns (uint256 releasedAmount) {
        return _processGradualReleases(account);
    }
    
    /**
     * @dev Release a specific time lock
     * @param account Address to release lock for
     * @param lockId ID of the lock to release
     */
    function releaseSpecificLock(address account, uint256 lockId) external {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        require(!lock.released, "Avax0: lock already released");
        
        uint256 currentTime = block.timestamp;
        (uint256 availableAmount, ) = _calculateGradualRelease(account, lockId, currentTime);
        
        require(availableAmount > 0, "Avax0: no tokens available for release yet");
        
        _releasedAmounts[account][lockId] += availableAmount;
        totalLockedAmount[account] -= availableAmount;
        
        emit TokensGraduallyReleased(account, availableAmount, lockId, _releasedAmounts[account][lockId]);
        
        // Mark as fully released if all tokens are released
        if (_releasedAmounts[account][lockId] >= lock.amount) {
            lock.released = true;
            
            // Increment completed lock count and check for auto cleanup
            _completedLockCount[account]++;
            
            emit TokensUnlocked(account, lock.amount, lockId);
            
            // Auto cleanup if enabled and threshold reached
            if (autoCleanupEnabled && _completedLockCount[account] >= cleanupThreshold) {
                _performCleanup(account);
            }
        }
    }
    
    /**
     * @dev Extend the release time of a specific lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to extend
     * @param newReleaseTime New release timestamp
     */
    function extendLock(address account, uint256 lockId, uint256 newReleaseTime) external onlyOwner {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        if (newReleaseTime <= block.timestamp) revert InvalidReleaseTime(newReleaseTime);
        
        TimeLock storage lock = timeLocks[account][lockId];
        require(!lock.released, "Avax0: cannot extend released lock");
        require(newReleaseTime > lock.releaseTime, "Avax0: new release time must be later");
        
        lock.releaseTime = newReleaseTime;
        emit LockExtended(account, lockId, newReleaseTime);
    }
    
    /**
     * @dev Modify an existing time lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to modify
     * @param newAmount New amount for the lock (0 to keep current)
     * @param newReleaseTime New release timestamp (0 to keep current)
     * @param newGradualConfig New gradual release configuration
     * @param updateConfig Whether to update the gradual release config
     */
    function modifyLock(
        address account, 
        uint256 lockId, 
        uint256 newAmount,
        uint256 newReleaseTime,
        GradualReleaseConfig memory newGradualConfig,
        bool updateConfig
    ) external onlyOwner {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        if (lock.released) revert InvalidLockModification("Cannot modify released lock");
        
        uint256 currentReleased = _releasedAmounts[account][lockId];
        
        // Handle amount modification
        if (newAmount > 0) {
            if (newAmount < currentReleased) {
                revert InvalidLockModification("New amount cannot be less than already released");
            }
            
            // Calculate balance changes
            uint256 oldAmount = lock.amount;
            uint256 amountDiff;
            
            if (newAmount > oldAmount) {
                // Increasing lock amount - check available balance
                amountDiff = newAmount - oldAmount;
                uint256 availableBalance = getAvailableBalance(account);
                if (amountDiff > availableBalance) {
                    revert InsufficientUnlockedBalance(account, amountDiff, availableBalance);
                }
                totalLockedAmount[account] += amountDiff;
            } else if (newAmount < oldAmount) {
                // Decreasing lock amount
                amountDiff = oldAmount - newAmount;
                totalLockedAmount[account] -= amountDiff;
            }
            
            lock.amount = newAmount;
        }
        
        // Handle release time modification
        if (newReleaseTime > 0) {
            if (newReleaseTime <= block.timestamp) {
                revert InvalidReleaseTime(newReleaseTime);
            }
            lock.releaseTime = newReleaseTime;
        }
        
        // Handle gradual release config modification
        if (updateConfig) {
            if (newGradualConfig.enabled && 
                (newGradualConfig.duration == 0 || newGradualConfig.interval == 0 || 
                 newGradualConfig.interval > newGradualConfig.duration)) {
                revert InvalidGradualReleaseConfig(newGradualConfig.duration, newGradualConfig.interval);
            }
            _gradualReleaseConfigs[account][lockId] = newGradualConfig;
        }
        
        emit LockModified(
            account, 
            lockId, 
            lock.amount, 
            lock.releaseTime, 
            _gradualReleaseConfigs[account][lockId]
        );
    }
    
    /**
     * @dev Modify only the amount of an existing lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to modify
     * @param newAmount New amount for the lock
     */
    function modifyLockAmount(address account, uint256 lockId, uint256 newAmount) external onlyOwner {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        if (lock.released) revert InvalidLockModification("Cannot modify released lock");
        
        uint256 currentReleased = _releasedAmounts[account][lockId];
        if (newAmount < currentReleased) {
            revert InvalidLockModification("New amount cannot be less than already released");
        }
        
        uint256 oldAmount = lock.amount;
        if (newAmount > oldAmount) {
            // Increasing lock amount - check available balance
            uint256 amountDiff = newAmount - oldAmount;
            uint256 availableBalance = getAvailableBalance(account);
            if (amountDiff > availableBalance) {
                revert InsufficientUnlockedBalance(account, amountDiff, availableBalance);
            }
            totalLockedAmount[account] += amountDiff;
        } else if (newAmount < oldAmount) {
            // Decreasing lock amount
            uint256 amountDiff = oldAmount - newAmount;
            totalLockedAmount[account] -= amountDiff;
        }
        
        lock.amount = newAmount;
        
        emit LockModified(
            account, 
            lockId, 
            lock.amount, 
            lock.releaseTime, 
            _gradualReleaseConfigs[account][lockId]
        );
    }
    
    /**
     * @dev Modify only the release time of an existing lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to modify
     * @param newReleaseTime New release timestamp
     */
    function modifyLockReleaseTime(address account, uint256 lockId, uint256 newReleaseTime) external onlyOwner {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        if (newReleaseTime <= block.timestamp) revert InvalidReleaseTime(newReleaseTime);
        
        TimeLock storage lock = timeLocks[account][lockId];
        if (lock.released) revert InvalidLockModification("Cannot modify released lock");
        
        lock.releaseTime = newReleaseTime;
        
        emit LockModified(
            account, 
            lockId, 
            lock.amount, 
            lock.releaseTime, 
            _gradualReleaseConfigs[account][lockId]
        );
    }
    
    /**
     * @dev Modify only the gradual release configuration of an existing lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to modify
     * @param newGradualConfig New gradual release configuration
     */
    function modifyLockGradualConfig(
        address account, 
        uint256 lockId, 
        GradualReleaseConfig memory newGradualConfig
    ) external onlyOwner {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        if (lock.released) revert InvalidLockModification("Cannot modify released lock");
        
        if (newGradualConfig.enabled && 
            (newGradualConfig.duration == 0 || newGradualConfig.interval == 0 || 
             newGradualConfig.interval > newGradualConfig.duration)) {
            revert InvalidGradualReleaseConfig(newGradualConfig.duration, newGradualConfig.interval);
        }
        
        _gradualReleaseConfigs[account][lockId] = newGradualConfig;
        
        emit LockModified(
            account, 
            lockId, 
            lock.amount, 
            lock.releaseTime, 
            _gradualReleaseConfigs[account][lockId]
        );
    }
    
    /**
     * @dev Get available (unlocked) balance for an address
     * @param account Address to check
     * @return balance Available balance
     */
    function getAvailableBalance(address account) public view returns (uint256) {
        uint256 totalBalance = balanceOf(account);
        uint256 lockedAmount = getLockedAmount(account);
        
        return totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
    }
    
    /**
     * @dev Get available balance with gradual release processing
     * @param account Address to check
     * @return balance Available balance after processing gradual releases
     */
    function getAvailableBalanceWithProcessing(address account) public returns (uint256) {
        // Process gradual releases first
        _processGradualReleases(account);
        
        uint256 totalBalance = balanceOf(account);
        uint256 lockedAmount = getLockedAmount(account);
        
        return totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
    }
    
    /**
     * @dev Get currently locked amount for an address
     * @param account Address to check
     * @return amount Current locked amount
     */
    function getLockedAmount(address account) public view returns (uint256) {
        return totalLockedAmount[account];
    }
    
    /**
     * @dev Get detailed balance information including gradual release status
     * @param account Address to check
     * @return totalBalance Total token balance
     * @return currentlyLocked Currently locked amount
     * @return availableNow Amount available for transfer right now
     * @return pendingRelease Amount that will be released over time
     * @return nextReleaseTime When next gradual release will occur
     */
    function getDetailedBalance(address account) 
        external 
        view 
        returns (
            uint256 totalBalance,
            uint256 currentlyLocked,
            uint256 availableNow,
            uint256 pendingRelease,
            uint256 nextReleaseTime
        ) 
    {
        totalBalance = balanceOf(account);
        currentlyLocked = totalLockedAmount[account];
        availableNow = totalBalance >= currentlyLocked ? totalBalance - currentlyLocked : 0;
        
        TimeLock[] storage locks = timeLocks[account];
        uint256 currentTime = block.timestamp;
        uint256 totalPending = 0;
        uint256 earliestNextRelease = type(uint256).max;
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (locks[i].released) continue;
            
            (uint256 available, uint256 nextRelease) = _calculateGradualRelease(account, i, currentTime);
            totalPending += available;
            
            if (nextRelease > 0 && nextRelease < earliestNextRelease) {
                earliestNextRelease = nextRelease;
            }
        }
        
        pendingRelease = totalPending;
        nextReleaseTime = earliestNextRelease == type(uint256).max ? 0 : earliestNextRelease;
    }
    
    /**
     * @dev Get all time locks for an address with V3 extended info
     * @param account Address to get locks for
     * @return locks Array of basic TimeLock structures
     * @return configs Array of gradual release configurations
     * @return releasedAmounts Array of released amounts
     */
    function getTimeLocksV3(address account) 
        external 
        view 
        returns (
            TimeLock[] memory locks, 
            GradualReleaseConfig[] memory configs, 
            uint256[] memory releasedAmounts
        ) 
    {
        locks = timeLocks[account];
        uint256 length = locks.length;
        
        configs = new GradualReleaseConfig[](length);
        releasedAmounts = new uint256[](length);
        
        for (uint256 i = 0; i < length; i++) {
            configs[i] = _gradualReleaseConfigs[account][i];
            releasedAmounts[i] = _releasedAmounts[account][i];
        }
    }
    
    /**
     * @dev Get all time locks for an address (V2 compatibility)
     * @param account Address to get locks for
     * @return locks Array of TimeLock structures
     */
    function getTimeLocks(address account) external view returns (TimeLock[] memory) {
        return timeLocks[account];
    }
    
    /**
     * @dev Get specific time lock details with V3 info
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @return lock TimeLock structure
     * @return config Gradual release configuration
     * @return releasedAmount Amount already released
     */
    function getTimeLockV3(address account, uint256 lockId) 
        external 
        view 
        returns (
            TimeLock memory lock, 
            GradualReleaseConfig memory config, 
            uint256 releasedAmount
        ) 
    {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        lock = timeLocks[account][lockId];
        config = _gradualReleaseConfigs[account][lockId];
        releasedAmount = _releasedAmounts[account][lockId];
    }
    
    /**
     * @dev Get number of time locks for an address
     * @param account Address to check
     * @return count Number of locks
     */
    function getTimeLockCount(address account) external view returns (uint256) {
        return timeLocks[account].length;
    }
    
    /**
     * @dev Get specific time lock details (V2 compatibility)
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @return lock TimeLock structure
     */
    function getTimeLock(address account, uint256 lockId) external view returns (TimeLock memory lock) {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        return timeLocks[account][lockId];
    }
    
    /**
     * @dev Get gradual release status for a specific lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @return availableNow Amount available for release now
     * @return nextReleaseTime When next release will occur
     * @return totalReleased Amount already released
     * @return totalAmount Total lock amount
     */
    function getGradualReleaseStatus(address account, uint256 lockId) 
        external 
        view 
        returns (
            uint256 availableNow,
            uint256 nextReleaseTime,
            uint256 totalReleased,
            uint256 totalAmount
        ) 
    {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        (availableNow, nextReleaseTime) = _calculateGradualRelease(account, lockId, block.timestamp);
        
        return (availableNow, nextReleaseTime, _releasedAmounts[account][lockId], lock.amount);
    }
    
    /**
     * @dev Transfer function with gradual release check
     * @param to Address to transfer tokens to
     * @param amount Amount of tokens to transfer
     * @return success Success status
     */
    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        
        // Process gradual releases first
        _processGradualReleases(owner);
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            // Get detailed info for better error message
            (, , , uint256 pendingRelease, uint256 nextReleaseTime) = this.getDetailedBalance(owner);
            revert InsufficientGraduallyReleasedBalance(owner, amount, availableBalance, availableBalance + pendingRelease, nextReleaseTime);
        }
        
        _transfer(owner, to, amount);
        return true;
    }
    
    /**
     * @dev TransferFrom function with gradual release check
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        
        // Process gradual releases first
        _processGradualReleases(from);
        
        // Check if from address has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(from);
        if (amount > availableBalance) {
            // Get detailed info for better error message
            (, , , uint256 pendingRelease, uint256 nextReleaseTime) = this.getDetailedBalance(from);
            revert InsufficientGraduallyReleasedBalance(from, amount, availableBalance, availableBalance + pendingRelease, nextReleaseTime);
        }
        
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }
    
    /**
     * @dev Burn function with gradual release check
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) public virtual override {
        address owner = _msgSender();
        
        // Process gradual releases first
        _processGradualReleases(owner);
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            // Get detailed info for better error message
            (, , , uint256 pendingRelease, uint256 nextReleaseTime) = this.getDetailedBalance(owner);
            revert InsufficientGraduallyReleasedBalance(owner, amount, availableBalance, availableBalance + pendingRelease, nextReleaseTime);
        }
        
        _burn(owner, amount);
    }
    
    /**
     * @dev BurnFrom function with gradual release check
     */
    function burnFrom(address account, uint256 amount) public virtual override {
        // Process gradual releases first
        _processGradualReleases(account);
        
        // Check if account has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(account);
        if (amount > availableBalance) {
            // Get detailed info for better error message
            (, , , uint256 pendingRelease, uint256 nextReleaseTime) = this.getDetailedBalance(account);
            revert InsufficientGraduallyReleasedBalance(account, amount, availableBalance, availableBalance + pendingRelease, nextReleaseTime);
        }
        
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
    
    /**
     * @dev Set minter status for an address
     * @param account Address to set minter status for
     * @param isMinter Minter status
     */
    function setMinter(address account, bool isMinter) external onlyOwner {
        require(account != address(0), "Avax0: cannot set minter for zero address");
        
        minters[account] = isMinter;
        emit MinterUpdated(account, isMinter);
    }
    
    /**
     * @dev Pause contract functions
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract functions
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Emergency function to recover accidentally sent tokens
     * @param token Token address to recover
     * @param amount Amount to recover
     */
    function recoverToken(address token, uint256 amount) external onlyOwner {
        require(token != address(this), "Avax0: cannot recover own tokens");
        IERC20(token).transfer(owner(), amount);
    }
    
    /**
     * @dev Get contract version
     * @return version Contract version string
     */
    function version() external pure returns (string memory) {
        return "3.0.3";
    }
    
    /**
     * @dev Required by UUPSUpgradeable
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Override decimals to return 18
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }
    
    /**
     * @dev Migration function for V2 to V3 upgrade
     * Initialize gradual release configs for existing locks
     * @param accounts Array of accounts to migrate
     * @param useDefaultConfig Whether to use default gradual release config for existing locks
     */
    function migrateV2Locks(address[] calldata accounts, bool useDefaultConfig) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            address account = accounts[i];
            uint256 lockCount = timeLocks[account].length;
            
            for (uint256 j = 0; j < lockCount; j++) {
                // Only initialize if not already set (in case of multiple migrations)
                if (!_gradualReleaseConfigs[account][j].enabled && useDefaultConfig) {
                    _gradualReleaseConfigs[account][j] = defaultGradualReleaseConfig;
                }
                // _releasedAmounts defaults to 0, which is correct for existing locks
            }
        }
    }
    
    // Backward compatibility: maintain old function signatures
    
    /**
     * @dev V2 compatibility - get available balance with auto release
     * @param account Address to check
     * @return Available balance after processing releases
     */
    function getAvailableBalanceWithAutoRelease(address account) external returns (uint256) {
        return getAvailableBalanceWithProcessing(account);
    }
    
    /**
     * @dev V2 compatibility - auto release expired locks
     * @param account Address to process
     * @return Amount released
     */
    function _autoReleaseExpiredLocks(address account) internal returns (uint256) {
        return _processGradualReleases(account);
    }
    
}