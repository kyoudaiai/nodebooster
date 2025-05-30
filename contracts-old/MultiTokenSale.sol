// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// USDFX Multi Token SWAP
// Created and reviewed by 
// Nov 2022
// https://tokens.ninja
// info@tokens.ninja

abstract contract Context {
    constructor () { }
    function _msgSender() internal view returns (address payable) {
        return payable(msg.sender);
    }
    function _msgData() internal view returns (bytes memory) {
        this;
        return msg.data;
    }
}
abstract contract ReentrancyGuard {
    bool private _notEntered;

    constructor () {
        _notEntered = true;
    }

    modifier nonReentrant() {
        require(_notEntered, "ReentrancyGuard: reentrant call");
        _notEntered = false;
        _;
        _notEntered = true;
    }
}
interface IERC20 {
    function totalSupply() external view returns (uint);
    function balanceOf(address account) external view returns (uint);
    function transfer(address recipient, uint amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint);
    function approve(address spender, uint amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed owner, address indexed spender, uint value);
}
library Math {
    function max(uint a, uint b) internal pure returns (uint) {
        return a >= b ? a : b;
    }
    function min(uint a, uint b) internal pure returns (uint) {
        return a < b ? a : b;
    }
    function average(uint a, uint b) internal pure returns (uint) {
        // (a + b) / 2 can overflow, so we distribute
        return (a / 2) + (b / 2) + ((a % 2 + b % 2) / 2);
    }
}
library SafeMath {
    function add(uint a, uint b) internal pure returns (uint) {
        uint c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }
    function sub(uint a, uint b) internal pure returns (uint) {
        return sub(a, b, "SafeMath: subtraction overflow");
    }
    function sub(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b <= a, errorMessage);
        uint c = a - b;

        return c;
    }
    function mul(uint a, uint b) internal pure returns (uint) {
        if (a == 0) {
            return 0;
        }
        uint c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");
        return c;
    }
    function div(uint a, uint b) internal pure returns (uint) {
        return div(a, b, "SafeMath: division by zero");
    }
    function div(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b > 0, errorMessage);
        uint c = a / b;
        return c;
    }
    function mod(uint a, uint b) internal pure returns (uint) {
        return mod(a, b, "SafeMath: modulo by zero");
    }
    function mod(uint a, uint b, string memory errorMessage) internal pure returns (uint) {
        require(b != 0, errorMessage);
        return a % b;
    }
}

library SafeERC20 {
    using SafeMath for uint;
    using Address for address;

    function safeTransfer(IERC20 token, address to, uint value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    function safeApprove(IERC20 token, address spender, uint value) internal {
        require((value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    function safeIncreaseAllowance(IERC20 token, address spender, uint value) internal {
        uint newAllowance = token.allowance(address(this), spender).add(value);
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    function safeDecreaseAllowance(IERC20 token, address spender, uint value) internal {
        uint newAllowance = token.allowance(address(this), spender).sub(value, "SafeERC20: decreased allowance below zero");
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    function callOptionalReturn(IERC20 token, bytes memory data) private {
        require(address(token).isContract(), "SafeERC20: call to non-contract");

        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");

        if (returndata.length > 0) { // Return data is optional
            // solhint-disable-next-line max-line-length
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}
library Address {
    function isContract(address account) internal view returns (bool) {
        // According to EIP-1052, 0x0 is the value returned for not-yet created accounts
        // and 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470 is returned
        // for accounts without code, i.e. `keccak256('')`
        bytes32 codehash;
        bytes32 accountHash = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;
        // solhint-disable-next-line no-inline-assembly
        assembly { codehash := extcodehash(account) }
        return (codehash != accountHash && codehash != 0x0);
    }
    function toPayable(address account) internal pure returns (address payable) {
        return payable(account);
    }
    function sendValue(address payable recipient, uint amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");
        recipient.transfer(amount);
    }
}

contract MultiTokenSale is Context, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    string  public name = "USDFX SWAP";
    string  public symbol = "USDFX";
    string  public standard = "USDFX-SWAP v1.0";

    IERC20 public _token;
    uint8 public tokenDecimals = 6;
    uint8 public nativeDecimals = 18;

    uint16 percisionPoints = 10_000;

    bool private _paused;
    
    address private _owner;
    address payable private _wallet;    
    address private _tokenWallet;
    
    uint public nativeRate;
    uint private _weiRaised;

    uint public totalSupportedTokens = 0;
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
    
    event TokensPurchased(address indexed purchaser, address indexed beneficiary, address inputCurrency, uint value, uint amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address account);
    event Unpaused(address account);


    modifier onlyOwner() {
        require(isOwner(), "Ownable: caller is not the owner");
        _;
    }
    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }   
    modifier whenPaused() {
        require(_paused, "Pausable: not paused");
        _;
    }
    function tokenSupported(address _token) public returns (bool) {
        if(supportedToken[_token].enabled != true) { return false; }
        return true;
    }
    function owner() public view returns (address) {
        return _owner;
    }  
    function isOwner() public view returns (bool) {
        return _msgSender() == _owner;
    }
    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }
    function transferOwnership(address newOwner) public onlyOwner {
        _transferOwnership(newOwner);
    }
    function _transferOwnership(address newOwner) internal {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
    function pause() public onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }
    function unpause() public onlyOwner whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }    
    function changeToken(address tokenAddress) public onlyOwner { _token = IERC20(tokenAddress);}    
    function changeTokenDecimals(uint8 decimals) public onlyOwner { tokenDecimals = decimals;}
    function changeNativeRate(uint rate) public onlyOwner { nativeRate = rate; }
    function changeTokenWallet(address tokenWallet) public onlyOwner { _tokenWallet = tokenWallet; }
    function changePaymentWallet(address payable wallet) public onlyOwner { _wallet = wallet; }

    function addSupportedToken(bool _enabled, address _tokenAddress, string memory _symbol, uint8 _decimals, address _payoutWallet, uint _rate, uint _raisedWei) public onlyOwner returns (bool) {
        require(_decimals >= tokenDecimals, "Token0 decimals: must be gte to token1 Decimals");
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
    


    constructor (uint _nativeRate, address payable wallet, address tokenWallet, IERC20 token) payable {
        require(_nativeRate > 0, "rate is 0");
        require(wallet != address(0), "Tokensale: wallet is the zero address");        
        require(address(token) != address(0), "Crowdsale: token is the zero address");
        require(tokenWallet != address(0), "AllowanceCrowdsale: token wallet is the zero address");

        _owner = msg.sender;
        _paused = false;
        nativeRate = _nativeRate;
        _wallet = wallet;                
        _token = token;
        _tokenWallet = tokenWallet;                

        emit OwnershipTransferred(address(0), _owner);
    }

    receive () external payable {
        swapExactTokensForETH(_msgSender());
    }


    function token() public view returns (IERC20) {
        return _token;
    }
    function wallet() public view returns (address payable) {
        return _wallet;
    }
    function rate() public view returns (uint) {
        // TODO if _token exists return it's _rate else return BNB rate.
        return nativeRate;
    }
    function tokenRate(address _token) public returns (uint){ require(tokenSupported(_token), "token0: not supported"); return supportedToken[_token].rate; }

    function weiRaised() public view returns (uint) {
        return _weiRaised;
    }
    function paused() public view returns (bool) {
        return _paused;
    }


    function swapExactTokensForETH(address beneficiary) public nonReentrant payable {
        uint weiAmount = msg.value;
        _preValidatePurchase(beneficiary, weiAmount);

        // calculate token amount to be transferred and locked
        uint totalTokens = _getTokenAmount(weiAmount);
        
        // update state
        _weiRaised = _weiRaised.add(weiAmount);

        _deliverTokens(beneficiary, totalTokens);
        
        emit TokensPurchased(_msgSender(), beneficiary, address(0), weiAmount, totalTokens);

        // _forwardFunds();        
    }

     function swapExactTokensForTokens(address _token, uint _amount, address beneficiary) public nonReentrant  {
        require(tokenSupported(_token), "token0: not supported");
        require(_amount > 0, "input: can't be 0");                
        require(IERC20(_token).allowance(msg.sender, address(this)) >= _amount, "Token0 allowance");
         
        uint tokenAmount = _getTokenAmountFromToken(_token, _amount);

         
        require(remainingTokens() >= tokenAmount, "Token1 Balance");
                
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);       
        _deliverTokens(beneficiary, tokenAmount);        
        supportedToken[_token].weiRaised += _amount;
         
        emit TokensPurchased(_msgSender(), beneficiary, _token, _amount, tokenAmount);     
    }

    function _preValidatePurchase(address beneficiary, uint weiAmount) whenNotPaused internal view {
        require(beneficiary != address(0), "TokenSale: beneficiary is the zero address");
        require(weiAmount != 0, "Tokensale: weiAmount is 0");
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
    }
    
    function _deliverTokens(address beneficiary, uint tokenAmount) internal virtual {
        token().safeTransferFrom(_tokenWallet, beneficiary, tokenAmount);
    }

    function _getTokenAmount(uint weiAmount) public view returns (uint) {                               
        return ( ((weiAmount * nativeRate) / percisionPoints) / (10 ** (nativeDecimals - tokenDecimals)) );
    }
    
    function _getTokenAmountFromToken(address _token, uint _tokenAmount) public returns (uint) {
        require(tokenSupported(_token), "token: not supported");
        return ( ((_tokenAmount * supportedToken[_token].rate) / percisionPoints) / (10 ** (supportedToken[_token].decimals - tokenDecimals)) );       
    }
    
    function _forwardFunds() internal {        
        _wallet.transfer(msg.value);        
    }
    
    /**
     * @return the address of the wallet that will hold the tokens.
     */
    function tokenWallet() public view returns (address) {
        return _tokenWallet;
    }

    /**
     * @dev Checks the amount of tokens left in the allowance.
     * @return Amount of tokens left in the allowance
     */
    function remainingTokens() public view returns (uint) {
        return Math.min(token().balanceOf(_tokenWallet), token().allowance(_tokenWallet, address(this)));
    }

    function transferTokens(address _token, address _account, uint _amount) external onlyOwner returns (bool) {
        uint256 contractTokenBalance = IERC20(_token).balanceOf(address(this));
        require(_amount <= contractTokenBalance, "Token0: insufficient token balance");
        IERC20(_token).transfer(_account, _amount);        
        return true;
    }
    function transferFunds(address payable wallet, uint amount) onlyOwner public returns (bool) {
        require(wallet !=address(0), "zero address");
        require(amount > 0 && amount <= address(this).balance, "amount is 0 or gt balance");
        payable(wallet).transfer(amount);
        return true;
    }
    

}