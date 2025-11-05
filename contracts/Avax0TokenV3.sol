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
    
    /// @notice Structure to represent a time lock with gradual release
    struct TimeLock {
        uint256 amount;                    // Amount of tokens locked
        uint256 releaseTime;              // Timestamp when lock expires and gradual release begins
        bool released;                    // Whether the lock has been fully released
        GradualReleaseConfig gradualConfig; // Gradual release configuration for this lock
        uint256 releasedAmount;           // Amount already released during gradual period
    }
    
    /// @notice Mapping of user address to their time locks (multiple locks per address)
    mapping(address => TimeLock[]) private _timeLocks;
    
    /// @notice Total locked amount per address (excluding gradually released amounts)
    mapping(address => uint256) private _totalLockedAmount;
    
    /// @notice Default gradual release configuration
    GradualReleaseConfig public defaultGradualReleaseConfig;
    
    // Events
    event MinterUpdated(address account, bool isMinter);
    event TokensLocked(address indexed account, uint256 amount, uint256 releaseTime, uint256 lockId);
    event TokensUnlocked(address indexed account, uint256 amount, uint256 lockId);
    event TokensGraduallyReleased(address indexed account, uint256 amount, uint256 lockId, uint256 totalReleased);
    event LockExtended(address indexed account, uint256 lockId, uint256 newReleaseTime);
    event GradualReleaseConfigUpdated(uint256 duration, uint256 interval, bool enabled);
    
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
        
        emit GradualReleaseConfigUpdated(_duration, _interval, true);
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
        GradualReleaseConfig memory emptyConfig = GradualReleaseConfig(0, 0, false);
        this.mintWithLock(to, amount, releaseTime, emptyConfig);
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
        GradualReleaseConfig memory emptyConfig = GradualReleaseConfig(0, 0, false);
        this.createTimeLock(account, amount, releaseTime, emptyConfig);
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
        
        _timeLocks[account].push(TimeLock({
            amount: amount,
            releaseTime: releaseTime,
            released: false,
            gradualConfig: gradualConfig,
            releasedAmount: 0
        }));
        
        _totalLockedAmount[account] += amount;
        
        uint256 lockId = _timeLocks[account].length - 1;
        emit TokensLocked(account, amount, releaseTime, lockId);
    }
    
    /**
     * @dev Calculate available amount for gradual release
     * @param lock The time lock to calculate for
     * @param currentTime Current timestamp
     * @return availableAmount Amount available for release now
     * @return nextReleaseTime Time when next amount will be available
     */
    function _calculateGradualRelease(TimeLock storage lock, uint256 currentTime) 
        internal 
        view 
        returns (uint256 availableAmount, uint256 nextReleaseTime) 
    {
        // If lock hasn't expired yet, nothing is available
        if (currentTime < lock.releaseTime) {
            return (0, lock.releaseTime);
        }
        
        // If gradual release is disabled, release everything immediately
        if (!lock.gradualConfig.enabled) {
            return (lock.amount - lock.releasedAmount, 0);
        }
        
        uint256 timeSinceRelease = currentTime - lock.releaseTime;
        uint256 totalDuration = lock.gradualConfig.duration;
        uint256 interval = lock.gradualConfig.interval;
        
        // If gradual release period is over, release everything
        if (timeSinceRelease >= totalDuration) {
            return (lock.amount - lock.releasedAmount, 0);
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
        availableAmount = shouldBeReleased > lock.releasedAmount ? shouldBeReleased - lock.releasedAmount : 0;
        
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
        TimeLock[] storage locks = _timeLocks[account];
        uint256 currentTime = block.timestamp;
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (locks[i].released) continue;
            
            (uint256 availableAmount, ) = _calculateGradualRelease(locks[i], currentTime);
            
            if (availableAmount > 0) {
                locks[i].releasedAmount += availableAmount;
                _totalLockedAmount[account] -= availableAmount;
                totalReleased += availableAmount;
                
                emit TokensGraduallyReleased(account, availableAmount, i, locks[i].releasedAmount);
                
                // Mark as fully released if all tokens are released
                if (locks[i].releasedAmount >= locks[i].amount) {
                    locks[i].released = true;
                    emit TokensUnlocked(account, locks[i].amount, i);
                }
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
        if (lockId >= _timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = _timeLocks[account][lockId];
        require(!lock.released, "Avax0: lock already released");
        
        uint256 currentTime = block.timestamp;
        (uint256 availableAmount, ) = _calculateGradualRelease(lock, currentTime);
        
        require(availableAmount > 0, "Avax0: no tokens available for release yet");
        
        lock.releasedAmount += availableAmount;
        _totalLockedAmount[account] -= availableAmount;
        
        emit TokensGraduallyReleased(account, availableAmount, lockId, lock.releasedAmount);
        
        // Mark as fully released if all tokens are released
        if (lock.releasedAmount >= lock.amount) {
            lock.released = true;
            emit TokensUnlocked(account, lock.amount, lockId);
        }
    }
    
    /**
     * @dev Extend the release time of a specific lock
     * @param account Address of the lock owner
     * @param lockId ID of the lock to extend
     * @param newReleaseTime New release timestamp
     */
    function extendLock(address account, uint256 lockId, uint256 newReleaseTime) external onlyOwner {
        if (lockId >= _timeLocks[account].length) revert LockNotFound(account, lockId);
        if (newReleaseTime <= block.timestamp) revert InvalidReleaseTime(newReleaseTime);
        
        TimeLock storage lock = _timeLocks[account][lockId];
        require(!lock.released, "Avax0: cannot extend released lock");
        require(newReleaseTime > lock.releaseTime, "Avax0: new release time must be later");
        
        lock.releaseTime = newReleaseTime;
        emit LockExtended(account, lockId, newReleaseTime);
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
        return _totalLockedAmount[account];
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
        currentlyLocked = _totalLockedAmount[account];
        availableNow = totalBalance >= currentlyLocked ? totalBalance - currentlyLocked : 0;
        
        TimeLock[] storage locks = _timeLocks[account];
        uint256 currentTime = block.timestamp;
        uint256 totalPending = 0;
        uint256 earliestNextRelease = type(uint256).max;
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (locks[i].released) continue;
            
            (uint256 available, uint256 nextRelease) = _calculateGradualRelease(locks[i], currentTime);
            totalPending += available;
            
            if (nextRelease > 0 && nextRelease < earliestNextRelease) {
                earliestNextRelease = nextRelease;
            }
        }
        
        pendingRelease = totalPending;
        nextReleaseTime = earliestNextRelease == type(uint256).max ? 0 : earliestNextRelease;
    }
    
    /**
     * @dev Get all time locks for an address
     * @param account Address to get locks for
     * @return locks Array of TimeLock structures
     */
    function getTimeLocks(address account) external view returns (TimeLock[] memory) {
        return _timeLocks[account];
    }
    
    /**
     * @dev Get number of time locks for an address
     * @param account Address to check
     * @return count Number of locks
     */
    function getTimeLockCount(address account) external view returns (uint256) {
        return _timeLocks[account].length;
    }
    
    /**
     * @dev Get specific time lock details
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @return lock TimeLock structure
     */
    function getTimeLock(address account, uint256 lockId) external view returns (TimeLock memory lock) {
        if (lockId >= _timeLocks[account].length) revert LockNotFound(account, lockId);
        return _timeLocks[account][lockId];
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
        if (lockId >= _timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = _timeLocks[account][lockId];
        (availableNow, nextReleaseTime) = _calculateGradualRelease(lock, block.timestamp);
        
        return (availableNow, nextReleaseTime, lock.releasedAmount, lock.amount);
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
        return "3.0.0";
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
     * This function helps migrate existing time locks to include gradual release config
     */
    function migrateV2Locks() external onlyOwner {
        // This function can be called after upgrade to ensure all existing locks
        // have proper gradual release configuration
        // Implementation depends on specific migration needs
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
    
    /**
     * @dev V2 compatibility - total locked amount
     * @param account Address to check
     * @return Total locked amount
     */
    function totalLockedAmount(address account) external view returns (uint256) {
        return _totalLockedAmount[account];
    }
    
    /**
     * @dev V2 compatibility - time locks array access
     * @param account Address to check
     * @param index Lock index
     * @return amount Lock amount
     * @return releaseTime Release time
     * @return released Whether released
     */
    function timeLocks(address account, uint256 index) external view returns (uint256 amount, uint256 releaseTime, bool released) {
        if (index >= _timeLocks[account].length) revert LockNotFound(account, index);
        TimeLock storage lock = _timeLocks[account][index];
        return (lock.amount, lock.releaseTime, lock.released);
    }
}