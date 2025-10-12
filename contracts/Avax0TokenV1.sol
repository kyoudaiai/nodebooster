// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Avax0TokenV1
 * @dev Basic upgradeable ERC20 token for avax0 platform on Avalanche C-Chain - Version 1
 * @notice This contract implements the basic utility token avax0 for the ecosystem (without transfer fees)
 * 
 * Features:
 * - Upgradeable using UUPS pattern
 * - Pausable for emergency stops
 * - Burnable tokens
 * - Owner-controlled minting
 * - Basic ERC20 functionality
 */
contract Avax0TokenV1 is 
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
    
    // Events
    event MinterUpdated(address account, bool isMinter);
    
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
     * @dev Transfer function (standard ERC20 without fees)
     * @param to Address to transfer tokens to
     * @param amount Amount of tokens to transfer
     * @return bool Success status
     */
    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }
    
    /**
     * @dev TransferFrom function (standard ERC20 without fees)
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
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
        return "1.0.0";
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