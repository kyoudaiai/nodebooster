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
error InvalidLockAmount(uint256 amount);
error InvalidReleaseTime(uint256 releaseTime);
error LockNotFound(address account, uint256 lockId);
error ZeroAddress();
error VestingActive();
error InvalidVestingEndDate(uint256 endDate);

/**
 * @title Avax0TokenV2_1
 * @dev Upgradeable ERC20 token with time lock functionality and global vesting - Version 2.1
 * @notice This contract implements a utility token with time-locked transfer restrictions and global vesting
 * 
 * Features:
 * - All features from V2.0
 * - Global vesting system (affects all addresses except excluded)
 * - Vesting can be enabled/disabled by owner
 * - Vesting end date can be changed by owner
 * - Exclusion list for vesting bypass
 * - Upgrade-safe storage layout
 */
contract Avax0TokenV2_1 is 
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
    
    /// @notice Structure to represent a time lock
    struct TimeLock {
        uint256 amount;      // Amount of tokens locked
        uint256 releaseTime; // Timestamp when tokens are released
        bool released;       // Whether the lock has been released
    }
    
    /// @notice Mapping of user address to their time locks (multiple locks per address)
    mapping(address => TimeLock[]) public timeLocks;
    
    /// @notice Total locked amount per address
    mapping(address => uint256) public totalLockedAmount;
    
    // ===== NEW V2.1 STORAGE VARIABLES (Added at the end to maintain upgrade safety) =====
    
    /// @notice Global vesting enabled flag
    bool public vestingEnabled;
    
    /// @notice Global vesting end timestamp
    uint256 public vestingEndDate;
    
    /// @notice Mapping of addresses excluded from global vesting
    mapping(address => bool) public vestingExcluded;
    
    // ===== STORAGE GAP FOR FUTURE UPGRADES =====
    uint256[47] private __gap; // 50 - 3 (new variables) = 47 slots reserved for future upgrades
    
    // Events
    event MinterUpdated(address account, bool isMinter);
    event TokensLocked(address indexed account, uint256 amount, uint256 releaseTime, uint256 lockId);
    event TokensUnlocked(address indexed account, uint256 amount, uint256 lockId);
    event LockExtended(address indexed account, uint256 lockId, uint256 newReleaseTime);
    
    // New V2.1 Events
    event VestingStatusChanged(bool enabled);
    event VestingEndDateChanged(uint256 newEndDate);
    event VestingExclusionChanged(address indexed account, bool excluded);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the contract - V2.1 compatible
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
        
        // V2.1 initialization
        vestingEnabled = false;
        vestingEndDate = 0;
        // Owner is excluded from vesting by default
        vestingExcluded[msg.sender] = true;
        
        emit MinterUpdated(msg.sender, true);
        emit VestingExclusionChanged(msg.sender, true);
    }
    
    /**
     * @dev Initialize V2.1 features for upgrades from V2.0
     * @param _vestingEndDate Initial vesting end date (0 to disable)
     * @param _vestingEnabled Whether vesting is initially enabled
     */
    function initializeV2_1(
        uint256 _vestingEndDate,
        bool _vestingEnabled
    ) external onlyOwner {
        require(vestingEndDate == 0, "Avax0: V2.1 already initialized");
        
        if (_vestingEnabled && _vestingEndDate <= block.timestamp) {
            revert InvalidVestingEndDate(_vestingEndDate);
        }
        
        vestingEnabled = _vestingEnabled;
        vestingEndDate = _vestingEndDate;
        // Owner is excluded from vesting by default
        vestingExcluded[owner()] = true;
        
        emit VestingStatusChanged(_vestingEnabled);
        if (_vestingEndDate > 0) {
            emit VestingEndDateChanged(_vestingEndDate);
        }
        emit VestingExclusionChanged(owner(), true);
    }
    
    // ===== GLOBAL VESTING FUNCTIONS =====
    
    /**
     * @dev Enable or disable global vesting
     * @param _enabled Whether vesting should be enabled
     */
    function setVestingEnabled(bool _enabled) external onlyOwner {
        if (_enabled && vestingEndDate <= block.timestamp && vestingEndDate > 0) {
            revert InvalidVestingEndDate(vestingEndDate);
        }
        
        vestingEnabled = _enabled;
        emit VestingStatusChanged(_enabled);
    }
    
    /**
     * @dev Set global vesting end date
     * @param _endDate New vesting end timestamp
     */
    function setVestingEndDate(uint256 _endDate) external onlyOwner {
        if (_endDate > 0 && _endDate <= block.timestamp) {
            revert InvalidVestingEndDate(_endDate);
        }
        
        vestingEndDate = _endDate;
        emit VestingEndDateChanged(_endDate);
    }
    
    /**
     * @dev Add or remove address from vesting exclusion list
     * @param account Address to update exclusion status for
     * @param excluded Whether the address should be excluded from vesting
     */
    function setVestingExclusion(address account, bool excluded) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        
        vestingExcluded[account] = excluded;
        emit VestingExclusionChanged(account, excluded);
    }
    
    /**
     * @dev Batch update vesting exclusions
     * @param accounts Array of addresses to update
     * @param excluded Array of exclusion statuses
     */
    function batchSetVestingExclusion(address[] calldata accounts, bool[] calldata excluded) external onlyOwner {
        require(accounts.length == excluded.length, "Avax0: arrays length mismatch");
        require(accounts.length > 0, "Avax0: empty arrays");
        
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) revert ZeroAddress();
            vestingExcluded[accounts[i]] = excluded[i];
            emit VestingExclusionChanged(accounts[i], excluded[i]);
        }
    }
    
    /**
     * @dev Check if an address is subject to global vesting
     * @param account Address to check
     * @return Whether the address is subject to vesting
     */
    function isSubjectToVesting(address account) public view returns (bool) {
        if (!vestingEnabled) return false;
        if (vestingEndDate > 0 && block.timestamp >= vestingEndDate) return false;
        if (vestingExcluded[account]) return false;
        return true;
    }
    
    // ===== INHERITED FUNCTIONS WITH VESTING CHECKS =====
    
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
     * @dev Mint tokens with time lock
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param releaseTime Timestamp when tokens will be unlocked
     */
    function mintWithLock(address to, uint256 amount, uint256 releaseTime) external whenNotPaused {
        require(minters[msg.sender], "Avax0: caller is not a minter");
        require(to != address(0), "Avax0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Avax0: minting would exceed max supply");
        require(releaseTime > block.timestamp, "Avax0: release time must be in future");
        require(amount > 0, "Avax0: amount must be greater than zero");
        
        _mint(to, amount);
        _createTimeLock(to, amount, releaseTime);
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
     * @dev Create a time lock for an address
     * @param account Address to lock tokens for
     * @param amount Amount of tokens to lock
     * @param releaseTime Timestamp when tokens will be unlocked
     */
    function createTimeLock(address account, uint256 amount, uint256 releaseTime) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidLockAmount(amount);
        if (releaseTime <= block.timestamp) revert InvalidReleaseTime(releaseTime);
        
        uint256 availableBalance = getAvailableBalance(account);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(account, amount, availableBalance);
        }
        
        _createTimeLock(account, amount, releaseTime);
    }
    
    /**
     * @dev Internal function to create a time lock
     * @param account Address to lock tokens for
     * @param amount Amount of tokens to lock
     * @param releaseTime Timestamp when tokens will be unlocked
     */
    function _createTimeLock(address account, uint256 amount, uint256 releaseTime) internal {
        timeLocks[account].push(TimeLock({
            amount: amount,
            releaseTime: releaseTime,
            released: false
        }));
        
        totalLockedAmount[account] += amount;
        
        uint256 lockId = timeLocks[account].length - 1;
        emit TokensLocked(account, amount, releaseTime, lockId);
    }
    
    /**
     * @dev Internal function to automatically release expired locks
     * @param account Address to release locks for
     * @return releasedAmount Total amount of tokens released
     */
    function _autoReleaseExpiredLocks(address account) internal returns (uint256 releasedAmount) {
        TimeLock[] storage locks = timeLocks[account];
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].released && block.timestamp >= locks[i].releaseTime) {
                locks[i].released = true;
                releasedAmount += locks[i].amount;
                totalLockedAmount[account] -= locks[i].amount;
                
                emit TokensUnlocked(account, locks[i].amount, i);
            }
        }
        
        return releasedAmount;
    }
    
    /**
     * @dev Release expired time locks for an address
     * @param account Address to release locks for
     * @return releasedAmount Total amount of tokens released
     */
    function releaseExpiredLocks(address account) external returns (uint256 releasedAmount) {
        return _autoReleaseExpiredLocks(account);
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
        require(block.timestamp >= lock.releaseTime, "Avax0: lock not yet expired");
        
        lock.released = true;
        totalLockedAmount[account] -= lock.amount;
        
        emit TokensUnlocked(account, lock.amount, lockId);
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
     * @dev Get available (unlocked) balance for an address with vesting consideration
     * @param account Address to check
     * @return Available balance considering time locks and global vesting
     */
    function getAvailableBalance(address account) public view returns (uint256) {
        uint256 totalBalance = balanceOf(account);
        uint256 lockedAmount = getLockedAmount(account);
        uint256 unlockedBalance = totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
        
        // Apply global vesting if applicable
        if (isSubjectToVesting(account)) {
            return 0; // All tokens are locked during vesting period
        }
        
        return unlockedBalance;
    }
    
    /**
     * @dev Get available (unlocked) balance for an address with automatic lock release and vesting consideration
     * @param account Address to check
     * @return Available balance after releasing expired locks and considering vesting
     */
    function getAvailableBalanceWithAutoRelease(address account) public returns (uint256) {
        // Automatically release expired locks first
        _autoReleaseExpiredLocks(account);
        
        uint256 totalBalance = balanceOf(account);
        uint256 lockedAmount = getLockedAmount(account);
        uint256 unlockedBalance = totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
        
        // Apply global vesting if applicable
        if (isSubjectToVesting(account)) {
            return 0; // All tokens are locked during vesting period
        }
        
        return unlockedBalance;
    }
    
    /**
     * @dev Get currently locked amount for an address (excluding expired locks)
     * @param account Address to check
     * @return Current locked amount
     */
    function getLockedAmount(address account) public view returns (uint256) {
        TimeLock[] storage locks = timeLocks[account];
        uint256 currentLocked = 0;
        
        for (uint256 i = 0; i < locks.length; i++) {
            if (!locks[i].released && block.timestamp < locks[i].releaseTime) {
                currentLocked += locks[i].amount;
            }
        }
        
        return currentLocked;
    }
    
    /**
     * @dev Get all time locks for an address
     * @param account Address to get locks for
     * @return Array of TimeLock structures
     */
    function getTimeLocks(address account) external view returns (TimeLock[] memory) {
        return timeLocks[account];
    }
    
    /**
     * @dev Get number of time locks for an address
     * @param account Address to check
     * @return Number of locks
     */
    function getTimeLockCount(address account) external view returns (uint256) {
        return timeLocks[account].length;
    }
    
    /**
     * @dev Get specific time lock details
     * @param account Address of the lock owner
     * @param lockId ID of the lock
     * @return amount Amount locked
     * @return releaseTime Release timestamp
     * @return released Whether the lock is released
     */
    function getTimeLock(address account, uint256 lockId) external view returns (uint256 amount, uint256 releaseTime, bool released) {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        return (lock.amount, lock.releaseTime, lock.released);
    }
    
    /**
     * @dev Transfer function with time lock check, vesting check, and automatic lock release
     * @param to Address to transfer tokens to
     * @param amount Amount of tokens to transfer
     * @return bool Success status
     */
    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        
        // Check global vesting for sender
        if (isSubjectToVesting(owner)) {
            revert VestingActive();
        }
        
        // Automatically release expired locks first
        _autoReleaseExpiredLocks(owner);
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(owner, amount, availableBalance);
        }
        
        _transfer(owner, to, amount);
        return true;
    }
    
    /**
     * @dev TransferFrom function with time lock check, vesting check, and automatic lock release
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        
        // Check global vesting for sender
        if (isSubjectToVesting(from)) {
            revert VestingActive();
        }
        
        // Automatically release expired locks first
        _autoReleaseExpiredLocks(from);
        
        // Check if from address has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(from);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(from, amount, availableBalance);
        }
        
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }
    
    /**
     * @dev Burn function with time lock check, vesting check, and automatic lock release
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) public virtual override {
        address owner = _msgSender();
        
        // Check global vesting
        if (isSubjectToVesting(owner)) {
            revert VestingActive();
        }
        
        // Automatically release expired locks first
        _autoReleaseExpiredLocks(owner);
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(owner, amount, availableBalance);
        }
        
        _burn(owner, amount);
    }
    
    /**
     * @dev BurnFrom function with time lock check, vesting check, and automatic lock release
     */
    function burnFrom(address account, uint256 amount) public virtual override {
        // Check global vesting
        if (isSubjectToVesting(account)) {
            revert VestingActive();
        }
        
        // Automatically release expired locks first
        _autoReleaseExpiredLocks(account);
        
        // Check if account has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(account);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(account, amount, availableBalance);
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
        return "2.1.0";
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
    
    // ===== V2.1 VIEW FUNCTIONS =====
    
    /**
     * @dev Get global vesting status
     * @return enabled Whether vesting is enabled
     * @return endDate Vesting end timestamp
     * @return remainingTime Remaining time in seconds (0 if expired or disabled)
     */
    function getVestingStatus() external view returns (bool enabled, uint256 endDate, uint256 remainingTime) {
        enabled = vestingEnabled;
        endDate = vestingEndDate;
        
        if (enabled && endDate > block.timestamp) {
            remainingTime = endDate - block.timestamp;
        } else {
            remainingTime = 0;
        }
    }
    
    /**
     * @dev Check if address can transfer tokens (considering vesting)
     * @param account Address to check
     * @return Whether the address can transfer tokens
     */
    function canTransfer(address account) external view returns (bool) {
        return !isSubjectToVesting(account);
    }
}