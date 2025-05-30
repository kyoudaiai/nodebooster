//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20SnapshotUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";

contract SNDAOV1 is Initializable, OwnableUpgradeable, ERC20Upgradeable, ERC20BurnableUpgradeable, ERC20PermitUpgradeable, ERC20SnapshotUpgradeable, ERC20VotesUpgradeable, ERC20CappedUpgradeable {

    function initialize() external initializer 
    {
        __Ownable_init();
        __ERC20_init("Scale Novelty DAO", "SNDAO");
        __ERC20Burnable_init();
        __ERC20Permit_init("SNDAO");        
        __ERC20Capped_init((1 * 1e6 * 1e18));

        _mint(msg.sender, (100 * 1e3 * 1e18));
    }

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }
    
    function _mint(address account, uint256 amount) internal override(ERC20Upgradeable, ERC20VotesUpgradeable, ERC20CappedUpgradeable) {
        require(ERC20Upgradeable.totalSupply() + amount <= cap(), "ERC20Capped: cap exceeded");
        super._mint(account, amount);
    }

    function snapshot() external onlyOwner returns (uint256) {
        return _snapshot();
    }
    
    function _burn(address account, uint256 amount) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._burn(account, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20Upgradeable, ERC20SnapshotUpgradeable) {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._afterTokenTransfer(from, to, amount);
    }

    function moveTokens(address _token, address _account) external onlyOwner returns (bool) {
        uint256 contractTokenBalance = IERC20Upgradeable(_token).balanceOf(address(this));
        IERC20Upgradeable(_token).transfer(_account, contractTokenBalance);        
        return true;
    }
    function moveFunds(address payable wallet, uint amount) onlyOwner public returns (bool) {
        require(wallet !=address(0), "0 address");
        require(amount > 0, "amount is 0");
        payable(wallet).transfer(amount);
        return true; 
    }   



}
