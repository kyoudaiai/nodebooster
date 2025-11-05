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

/**
 * @title Node0TokenV2
 * @dev Upgradeable ERC20 token with time lock functionality - Version 2
 * @notice This contract implements a utility token with time-locked transfer restrictions
 * 
 * Features:
 * - Upgradeable using UUPS pattern
 * - Pausable for emergency stops
 * - Burnable tokens
 * - Owner-controlled minting
 * - Time lock functionality for address balances
 * - Multiple locks per address support
 * - Basic ERC20 functionality
 */
contract Node0TokenV2 is 
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
    
    // Events
    event MinterUpdated(address account, bool isMinter);
    event TokensLocked(address indexed account, uint256 amount, uint256 releaseTime, uint256 lockId);
    event TokensUnlocked(address indexed account, uint256 amount, uint256 lockId);
    event LockExtended(address indexed account, uint256 lockId, uint256 newReleaseTime);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply
    ) public initializer {
        require(_initialSupply <= MAX_SUPPLY, "Node0: initial supply exceeds maximum");
        
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
     * @dev Mint tokens to specified address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) public whenNotPaused {
        require(minters[msg.sender], "Node0: caller is not a minter");
        require(to != address(0), "Node0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Node0: minting would exceed max supply");
        
        _mint(to, amount);
    }
    
    /**
     * @dev Mint tokens with time lock
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param releaseTime Timestamp when tokens will be unlocked
     */
    function mintWithLock(address to, uint256 amount, uint256 releaseTime) external whenNotPaused {
        require(minters[msg.sender], "Node0: caller is not a minter");
        require(to != address(0), "Node0: mint to zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Node0: minting would exceed max supply");
        require(releaseTime > block.timestamp, "Node0: release time must be in future");
        require(amount > 0, "Node0: amount must be greater than zero");
        
        _mint(to, amount);
        _createTimeLock(to, amount, releaseTime);
    }
    
    /**
     * @dev Batch mint tokens to multiple addresses
     * @param recipients Array of addresses to mint tokens to
     * @param amounts Array of amounts to mint to each address
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external whenNotPaused {
        require(minters[msg.sender], "Node0: caller is not a minter");
        require(recipients.length == amounts.length, "Node0: arrays length mismatch");
        require(recipients.length > 0, "Node0: empty arrays");
        
        uint256 totalMintAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalMintAmount += amounts[i];
        }
        
        require(totalSupply() + totalMintAmount <= MAX_SUPPLY, "Node0: batch minting would exceed max supply");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Node0: mint to zero address");
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
     * @dev Release expired time locks for an address
     * @param account Address to release locks for
     * @return releasedAmount Total amount of tokens released
     */
    function releaseExpiredLocks(address account) external returns (uint256 releasedAmount) {
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
     * @dev Release a specific time lock
     * @param account Address to release lock for
     * @param lockId ID of the lock to release
     */
    function releaseSpecificLock(address account, uint256 lockId) external {
        if (lockId >= timeLocks[account].length) revert LockNotFound(account, lockId);
        
        TimeLock storage lock = timeLocks[account][lockId];
        require(!lock.released, "Node0: lock already released");
        require(block.timestamp >= lock.releaseTime, "Node0: lock not yet expired");
        
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
        require(!lock.released, "Node0: cannot extend released lock");
        require(newReleaseTime > lock.releaseTime, "Node0: new release time must be later");
        
        lock.releaseTime = newReleaseTime;
        emit LockExtended(account, lockId, newReleaseTime);
    }
    
    /**
     * @dev Get available (unlocked) balance for an address
     * @param account Address to check
     * @return Available balance
     */
    function getAvailableBalance(address account) public view returns (uint256) {
        uint256 totalBalance = balanceOf(account);
        uint256 lockedAmount = getLockedAmount(account);
        
        return totalBalance >= lockedAmount ? totalBalance - lockedAmount : 0;
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
     * @dev Transfer function with time lock check
     * @param to Address to transfer tokens to
     * @param amount Amount of tokens to transfer
     * @return bool Success status
     */
    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(owner, amount, availableBalance);
        }
        
        _transfer(owner, to, amount);
        return true;
    }
    
    /**
     * @dev TransferFrom function with time lock check
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        
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
     * @dev Burn function with time lock check
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) public virtual override {
        address owner = _msgSender();
        
        // Check if sender has enough unlocked tokens
        uint256 availableBalance = getAvailableBalance(owner);
        if (amount > availableBalance) {
            revert InsufficientUnlockedBalance(owner, amount, availableBalance);
        }
        
        _burn(owner, amount);
    }
    
    /**
     * @dev BurnFrom function with time lock check
     */
    function burnFrom(address account, uint256 amount) public virtual override {
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
        require(account != address(0), "Node0: cannot set minter for zero address");
        
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
        require(token != address(this), "Node0: cannot recover own tokens");
        IERC20(token).transfer(owner(), amount);
    }
    
    /**
     * @dev Get contract version
     * @return version Contract version string
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
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
}