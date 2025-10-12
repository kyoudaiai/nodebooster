// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// ERC20 token ownable - Updated for OpenZeppelin v5.x
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title ERC20Token
 * @dev Mock ERC20 token for testing purposes on Avalanche C-Chain
 * @notice This contract implements a basic ERC20 token with mint and burn functionality
 */
contract ERC20Token is ERC20, ERC20Burnable, Ownable {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _mint(msg.sender, (initialSupply * 10 ** decimals()));
    }

    /**
     * @dev Mint tokens to a specific address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint (in wei)
     */
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @dev Returns the number of decimals used to get its user representation
     * @return uint8 Number of decimals (18)
     */
    function decimals() public view virtual override returns (uint8) {
        return 18;
    }
}
