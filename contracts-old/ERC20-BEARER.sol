//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";


contract StakeBearer is Ownable{

    string  public name = "USDFX StakeBearer";
    string  public symbol = "USDFX";
    string  public standard = "USDFX-STAKEBEARER-v1.0";

    address private _owner;
    address payable private _wallet;    
    address private _tokenWallet;

    // native coin rate.
    uint public bnbRate;
    uint private _weiRaised;

    // interest details.
    uint256 public constant INTEREST_PERIOD = 360 days;    
    uint256 public constant INTEREST_RATE = 20_00;

    // TODO defin input tokens and rates

    uint256 public totalSupportedTokens = 0;
    address[] public supportedTokensList;

    mapping(address => Token_Sale) public supportedToken;
        
    struct Token_Sale {
        bool            enabled;        
        address         tokenAddress;        
        string          symbol;
        uint8           decimals;
        address     	payoutWallet;
        uint    		rate;                
        uint 		    weiRaised;
    }
    
     

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

    event TokenAdded(address indexed tokenAddress, string symbol, uint8 decimals, uint rate);
    event TokenRemoved(address indexed tokenAddress, string symbol, uint8 decimals, uint rate);
    event TokenPurchased(address indexed purchaser, address indexed beneficiary, address indexed tokenAddress, uint256 value, uint256 amount);   


    function changeBNBRate(uint rate) public onlyOwner { bnbRate = rate; }
    function changeTokenWallet(address tokenWallet) public onlyOwner { _tokenWallet = tokenWallet; }
    function changePaymentWallet(address payable wallet) public onlyOwner { _wallet = wallet; }

    function addSupportedToken(bool _enabled, address _tokenAddress, string memory _symbol, uint8 _decimals, address _payoutWallet, uint _rate, uint _raisedWei) public onlyOwner returns (bool) {
        supportedToken[_tokenAddress] = Token_Sale(_enabled, _tokenAddress, _symbol, _decimals, _payoutWallet, _rate, _raisedWei);
        totalSupportedTokens += 1;
        supportedTokensList.push(_tokenAddress);
        return true;
    }
    function delSupportedToken(address _tokenAddress) public onlyOwner returns (bool) {
        supportedToken[_tokenAddress].enabled = false;
        totalSupportedTokens -= 1;
        return true;
    }
    function tokenSupported(address _token) public view returns (bool) {
        if(supportedToken[_token].enabled != true) { return false; }
        return true;
    }    
    function tokenRate(address _token) public view returns (uint){ require(tokenSupported(_token), "token0: not supported"); return supportedToken[_token].rate; }



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
    // TODO ADD access restrictions. Only owner can call this function or msg sender with token value check approve and pull
    function deposit(uint256 _amountTokens, address _user) public {
        require(_amountTokens > 0, "Amount must be greater than 0");
        require(_user != address(0), "User address cannot be 0x0");
        // require(balanceOf(msg.sender) >= _amount, "Insufficient balance");

        // _transfer(msg.sender, address(this), _amount);

        _stakedBalances[_user].stakedBalance += _amountTokens;
        _stakedBalances[_user].lastDepositTime = block.timestamp;
        _stakedBalances[msg.sender].lastClaimDate = block.timestamp;
        
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

contract TokenThatGivesInterest is ERC20Pausable, Ownable  {

   
    
    function getStakeBearerAddress() public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked("USDFX StakeBearer"));
        return address(uint160(uint256(keccak256(abi.encodePacked(
            hex"ff",
            address(this),
            salt,
            keccak256(abi.encodePacked(
                type(StakeBearer).creationCode
            ))
        )))));
    }


    // function to deploy StakeBearer contract with salt "USDFX StakeBearer"
    function deployStakeBearer() public onlyOwner returns (address) {
        bytes32 salt = keccak256(abi.encodePacked("USDFX StakeBearer"));
        StakeBearer _stakeBearer = new StakeBearer{salt: salt}();
        return address(_stakeBearer);
    }


    address public _stakeBearer = (getStakeBearerAddress());


    constructor() ERC20("USDFX", "USDFX")
    {                        
        _mint(msg.sender, (100 * 1e6 * 1e6));


        uint _testAmount = (100 * 1e3);
        // _stakedBalances[msg.sender].stakedBalance = _testAmount + ((_testAmount * INTEREST_RATE) / 10000);
        // _stakedBalances[msg.sender].lastDepositTime = 1664575200;     
        // _stakedBalances[msg.sender].lastClaimDate = 1664575200;
        // _stakedBalances[msg.sender].purhcasedAmount = _testAmount;
        // // _stakedBalances[msg.sender].totalInterest = calcInterestAmount(_testAmount);
        // _stakedBalances[msg.sender].totalPayoutPeriods = 12;
        // _stakedBalances[msg.sender].payOutAmount = ((_testAmount * INTEREST_RATE) / 10000) / 12;        

    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    // function balanceOf(address account) public view virtual override returns (uint256) {        
    //     return super.balanceOf(account) + _stakedBalances[account].stakedBalance;        
    // }

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

    




}
