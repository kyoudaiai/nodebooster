//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract INTERESTERC20 is ERC20Pausable, Ownable  {

    uint256 public constant INTEREST_PERIOD = 360 days;    
    uint256 public constant INTEREST_RATE = 20_00;

    struct stakedBalances {
        uint256 stakedBalance;
        uint256 lastDepositTime; // purchaseDate        
        uint256 lastClaimDate;
        uint256 purhcasedAmount;
        uint256 totalPayoutPeriods;
        uint256 payOutAmount;
        uint256 totalWithdrawals;        
        uint256 totalInterest;        

    }
    
    mapping(address => stakedBalances) public _stakedBalances; 

    // lock contract address
        // lock contract amount
        // lock contract start date
        // lock contract end date
        // lock contract interest rate
        // lock contract interest amount
        // lock contract interest paid
        // lock contract interest paid date

    // when user buy @0.85 we deploy a salted contract that locks the tokens for 12 months
    // the contract is deployed with the user address as the salt
    // the contract is deployed with the user address as the owner
    
    // balanceOf is this contract balance + lockContract balance if it exists.




    constructor() ERC20("USDFX", "USDFX")
    {                        
        _mint(msg.sender, (100 * 1e6 * 1e6));


        uint _testAmount = (100 * 1e3);
        _stakedBalances[msg.sender].stakedBalance = _testAmount + ((_testAmount * INTEREST_RATE) / 10000);
        _stakedBalances[msg.sender].lastDepositTime = 1664575200;     
        _stakedBalances[msg.sender].lastClaimDate = 1664575200;
        _stakedBalances[msg.sender].purhcasedAmount = _testAmount;
        // _stakedBalances[msg.sender].totalInterest = calcInterestAmount(_testAmount);
        _stakedBalances[msg.sender].totalPayoutPeriods = 12;
        _stakedBalances[msg.sender].payOutAmount = ((_testAmount * INTEREST_RATE) / 10000) / 12;        

    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function balanceOf(address account) public view virtual override returns (uint256) {        
        return super.balanceOf(account) + _stakedBalances[account].stakedBalance;        
    }

    function mint(address to, uint amount) external onlyOwner{
        _mint(to, amount);
    }

    function burn(uint256 amount) public virtual {
        _burn(_msgSender(), amount);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }


    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    function isEligibleForInterest(address _user) public view returns (bool) {
        return _stakedBalances[_user].stakedBalance > 0 && block.timestamp > _stakedBalances[_user].lastDepositTime + INTEREST_PERIOD;
    }

    function calcInterestAmount(uint256 _amount) public pure returns (uint256) {                
        // set the _amount to _withdrawAmount if it's smaller than the stakedBalance
        // uint256 _amount = _withdrawAmount < _stakedBalances[_user].stakedBalance ? _withdrawAmount : _stakedBalances[_user].stakedBalance;
        
        // calculate and return the interest amount
        return (_amount * INTEREST_RATE) / 10000;                
    }

    function moElapsedTotal() public view returns (uint256 _moElapsedTotal) {
        _moElapsedTotal = (block.timestamp - _stakedBalances[msg.sender].lastDepositTime) / (30 days);        
    }
    function moElapsedFromLastClaim() public view returns (uint256 _moElapsedFromLastClaim) {
        _moElapsedFromLastClaim = ((block.timestamp - _stakedBalances[msg.sender].lastClaimDate) / (30 days));
    }
    function moToBePaid() public view returns (uint256 _moToBePaid) {
        uint256 totalInterestMonths =  _stakedBalances[msg.sender].totalPayoutPeriods;

        _moToBePaid =  ( totalInterestMonths - (totalInterestMonths - (moElapsedTotal() - moElapsedFromLastClaim())));        
    }

    function calcEligiblePayout(address _user) public view returns (uint256) {     
        uint256 moElapsedTotal = (block.timestamp - _stakedBalances[_user].lastDepositTime) / (30 days);        
        uint256 moElapsedFromLastClaim = ((block.timestamp - _stakedBalances[_user].lastClaimDate) / (30 days));    
        uint256 totalInterestMonths =  _stakedBalances[_user].totalPayoutPeriods;
     
        uint256 _unclaimedPeriods = ( totalInterestMonths - (totalInterestMonths - (moElapsedTotal - moElapsedFromLastClaim)));

        uint _amount =  _stakedBalances[_user].payOutAmount * _unclaimedPeriods;        

        return _amount;

    }

    function deposit(uint256 _amountTokens, address _user) public onlyOwner {
        require(_amountTokens > 0, "Amount must be greater than 0");
        require(_user != address(0), "User address cannot be 0x0");
        // require(balanceOf(msg.sender) >= _amount, "Insufficient balance");

        // _transfer(msg.sender, address(this), _amount);

        _stakedBalances[_user].stakedBalance += _amountTokens;
        _stakedBalances[_user].lastDepositTime = block.timestamp;
        
        _stakedBalances[_user].purhcasedAmount += _amountTokens;
        _stakedBalances[_user].totalInterest += ((_amountTokens * INTEREST_RATE) / 10000);
        _stakedBalances[_user].totalPayoutPeriods = 12;
        _stakedBalances[_user].payOutAmount = (((_amountTokens * INTEREST_RATE) / 10000) / 12);        

    }


    function claim(address _user) external returns (uint256 _amount) {
        require(isEligibleForInterest(_user), "User is not eligible for interest");


        uint256 moElapsedTotal = (block.timestamp - _stakedBalances[_user].lastDepositTime) / (30 days);        
        uint256 moElapsedFromLastClaim = (block.timestamp - _stakedBalances[_user].lastClaimDate) / (30 days);    
        uint256 totalInterestMonths = INTEREST_PERIOD / (30 days);

     
        uint256 _periods = ( totalInterestMonths - (totalInterestMonths - (moElapsedTotal - moElapsedFromLastClaim)));
        _amount  = _stakedBalances[_user].payOutAmount * _periods;        
        

        // update the last claim date
        // _stakedBalances[_user].lastClaimDate = block.timestamp;        
        // _stakedBalances[_user].stakedBalance -= _amount;
        // _stakedBalances[_user].totalInterest += interestAmount;        
    }




}
