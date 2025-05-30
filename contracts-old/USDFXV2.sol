//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";






contract USDFXV2 is Initializable, OwnableUpgradeable, ERC20Upgradeable, ERC20BurnableUpgradeable, ERC20PausableUpgradeable 
{        
    uint256 public constant INTEREST_PERIOD = 360 days;    
    uint256 public constant INTEREST_RATE = 20;

    // define mapping of user struct
    // define mapping of user interest struct

    struct User {
        uint256 stakedBalance;
        uint256 lastDepositTime; // purchaseDate        
        uint256 lastClaimDate;
        uint256 totalDeposits;
        uint256 totalWithdrawals;        
        uint256 totalInterestClaimed;
    }

    mapping(address => User) public users; 

    
    function isEligibleForInterest(address _user) public view returns (bool) {
        return users[_user].stakedBalance > 0 && block.timestamp > users[_user].lastDepositTime + INTEREST_PERIOD;
    }


    function calcInterestAmount(address _user, uint256 _withdrawAmount) public returns (uint256 interestAmount) {                
        // set the _amount to _withdrawAmount if it's smaller than the stakedBalance
        uint256 _amount = _withdrawAmount < users[_user].stakedBalance ? _withdrawAmount : users[_user].stakedBalance;
        
        // calculate and return the interest amount
        interestAmount = (_amount * INTEREST_RATE) / 100;        

        users[_user].lastClaimDate = block.timestamp;
        users[_user].stakedBalance -= _amount;
        
    }

    // function to claim the stakedBalance over 12 months plus interest amount
    function claimInterest(address _user) external returns (uint256 interestAmount) {
        require(isEligibleForInterest(_user), "User is not eligible for interest");

        // while block.timestamp is unix a unix timestamp in milliseconds
        // and users[_user].lastClaimDate is a unix timestamp in milliseconds
        // find the number of months elapsed since users[_user].lastClaimDate until block.timestamp
        
    

        uint256 monthsElapsedTotal = (block.timestamp - users[_user].lastDepositTime) / (30 days);        
        uint256 monthsElapsedFromLastClaim = (block.timestamp - users[_user].lastClaimDate) / (30 days);    
        uint256 totalInterestMonths = INTEREST_PERIOD / (30 days);

     
        uint256 _amount = users[_user].stakedBalance / (totalInterestMonths - (monthsElapsedTotal - monthsElapsedFromLastClaim));
        


        

        // calculate and return the interest amount
        interestAmount = calcInterestAmount(_user, _amount);

        users[_user].lastClaimDate = block.timestamp;
        users[_user].stakedBalance = 0;
        users[_user].totalInterestClaimed += interestAmount;
    }




    function initialize() external initializer 
    {
        __Ownable_init();
        __ERC20_init("USDFX", "USDFX");
        __ERC20Burnable_init();
        __ERC20Pausable_init();                
        _mint(msg.sender, (100 * 1e6 * 1e6));
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(address to, uint amount) external onlyOwner{
        _mint(to, amount);
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

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        ERC20PausableUpgradeable._beforeTokenTransfer(from, to, amount);
    }
    
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function balanceOf(address account) public view virtual override returns (uint256) {        
        return super.balanceOf(account) + users[account].stakedBalance;        
    }



}
