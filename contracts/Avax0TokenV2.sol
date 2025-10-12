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
 * @title Avax0TokenV2
 * @dev Upgradeable ERC20 token for avax0 platform on Avalanche C-Chain - Version 2
 * @notice This contract implements the main utility token avax0 for the ecosystem with transfer fees
 * 
 * Features:
 * - Upgradeable using UUPS pattern
 * - Pausable for emergency stops
 * - Burnable tokens
 * - Owner-controlled minting
 * - Transfer fees for ecosystem sustainability
 * - Staking rewards integration ready
 */
contract Avax0TokenV2 is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    /// @notice Maximum total supply of tokens (100M tokens)
    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;
    
    /// @notice Mapping of addresses that can mint tokens (MUST be first for V1 compatibility)
    mapping(address => bool) public minters;
    
    /// @notice Transfer fee rate (in basis points, 100 = 1%)
    uint256 public transferFeeRate;
    
    /// @notice Maximum transfer fee rate (500 = 5%)
    uint256 public constant MAX_TRANSFER_FEE_RATE = 500;
    
    /// @notice Treasury address for collecting fees
    address public treasury;
    
    /// @notice Mapping of addresses exempt from transfer fees
    mapping(address => bool) public feeExempt;
    
    // Events
    event TransferFeeRateUpdated(uint256 oldRate, uint256 newRate);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event FeeExemptionUpdated(address account, bool exempt);
    event MinterUpdated(address account, bool isMinter);
    event FeeCollected(address from, address to, uint256 amount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     * @param _treasury Treasury address for fee collection
     * @param _transferFeeRate Initial transfer fee rate (in basis points)
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _treasury,
        uint256 _transferFeeRate
    ) public initializer {
        require(_treasury != address(0), "Avax0: treasury cannot be zero address");
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Avax0: fee rate too high");
        require(_initialSupply <= MAX_SUPPLY, "Avax0: initial supply exceeds maximum");
        
        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __Ownable_init(msg.sender);
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        treasury = _treasury;
        transferFeeRate = _transferFeeRate;
        
        // Exempt owner and treasury from fees
        feeExempt[msg.sender] = true;
        feeExempt[_treasury] = true;
        feeExempt[address(this)] = true;
        
        // Owner is initially a minter
        minters[msg.sender] = true;
        
        if (_initialSupply > 0) {
            _mint(msg.sender, _initialSupply);
        }
        
        emit FeeExemptionUpdated(msg.sender, true);
        emit FeeExemptionUpdated(_treasury, true);
        emit FeeExemptionUpdated(address(this), true);
        emit MinterUpdated(msg.sender, true);
    }
    
    /**
     * @dev Initialize V2 features (for upgrades from V1)
     * @param _treasury Treasury address for fee collection
     * @param _transferFeeRate Initial transfer fee rate (in basis points)
     */
    function initializeV2(
        address _treasury,
        uint256 _transferFeeRate
    ) public onlyOwner {
        require(_treasury != address(0), "Avax0: treasury cannot be zero address");
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Avax0: fee rate too high");
        require(treasury == address(0), "Avax0: V2 already initialized");
        
        // Initialize V2-specific state variables only
        treasury = _treasury;
        transferFeeRate = _transferFeeRate;
        
        // Set fee exemptions for key addresses
        feeExempt[owner()] = true;
        feeExempt[_treasury] = true;
        feeExempt[address(this)] = true;
        
        // Note: Do NOT modify minters mapping - it should be preserved from V1
        
        emit FeeExemptionUpdated(owner(), true);
        emit FeeExemptionUpdated(_treasury, true);
        emit FeeExemptionUpdated(address(this), true);
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
     * @dev Transfer function with fee mechanism
     * @param to Address to transfer tokens to
     * @param amount Amount of tokens to transfer
     * @return bool Success status
     */
    function transfer(address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address owner = _msgSender();
        _transferWithFee(owner, to, amount);
        return true;
    }
    
    /**
     * @dev TransferFrom function with fee mechanism
     */
    function transferFrom(address from, address to, uint256 amount) public virtual override whenNotPaused returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transferWithFee(from, to, amount);
        return true;
    }
    
    /**
     * @dev Internal transfer function with fee calculation
     * @param from Address to transfer from
     * @param to Address to transfer to
     * @param amount Amount to transfer
     */
    function _transferWithFee(address from, address to, uint256 amount) internal {
        require(from != address(0), "Avax0: transfer from zero address");
        require(to != address(0), "Avax0: transfer to zero address");
        
        // If either sender or receiver is fee exempt, no fee is charged
        if (feeExempt[from] || feeExempt[to] || transferFeeRate == 0) {
            _transfer(from, to, amount);
            return;
        }
        
        // Calculate fee
        uint256 fee = (amount * transferFeeRate) / 10000;
        uint256 transferAmount = amount - fee;
        
        // Transfer tokens
        _transfer(from, to, transferAmount);
        
        // Transfer fee to treasury
        if (fee > 0) {
            _transfer(from, treasury, fee);
            emit FeeCollected(from, to, fee);
        }
    }
    
    /**
     * @dev Set transfer fee rate
     * @param _transferFeeRate New transfer fee rate in basis points
     */
    function setTransferFeeRate(uint256 _transferFeeRate) external onlyOwner {
        require(_transferFeeRate <= MAX_TRANSFER_FEE_RATE, "Avax0: fee rate too high");
        
        uint256 oldRate = transferFeeRate;
        transferFeeRate = _transferFeeRate;
        
        emit TransferFeeRateUpdated(oldRate, _transferFeeRate);
    }
    
    /**
     * @dev Set treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Avax0: treasury cannot be zero address");
        
        address oldTreasury = treasury;
        treasury = _treasury;
        
        // Update fee exemption
        feeExempt[oldTreasury] = false;
        feeExempt[_treasury] = true;
        
        emit TreasuryUpdated(oldTreasury, _treasury);
        emit FeeExemptionUpdated(oldTreasury, false);
        emit FeeExemptionUpdated(_treasury, true);
    }
    
    /**
     * @dev Set fee exemption status for an address
     * @param account Address to set exemption for
     * @param exempt Exemption status
     */
    function setFeeExempt(address account, bool exempt) external onlyOwner {
        require(account != address(0), "Avax0: cannot set exemption for zero address");
        
        feeExempt[account] = exempt;
        emit FeeExemptionUpdated(account, exempt);
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
        require(amount <= IERC20(token).balanceOf(address(this)), "Avax0: insufficient tokens");        
        IERC20(token).transfer(owner(), amount);
    }
    
    /**
     * @dev Calculate transfer fee for a given amount
     * @param amount Amount to calculate fee for
     * @return fee Fee amount
     */
    function calculateTransferFee(uint256 amount) external view returns (uint256 fee) {
        if (transferFeeRate == 0) {
            return 0;
        }
        return (amount * transferFeeRate) / 10000;
    }
    
    /**
     * @dev Get contract version
     * @return version Contract version string
     */
    function version() external pure returns (string memory) {
        return "2.0.0";
    }

    /**
     * @dev Emergency function to recover accidentally sent tokens
     * @param amount Amount of tokens to recover
     */
    function recoverFunds(uint256 amount) external onlyOwner {
        require(amount > 0, "Avax0: invalid amount");
        require(amount <= address(this).balance, "Avax0: insufficient funds");
        payable(owner()).transfer(amount);
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