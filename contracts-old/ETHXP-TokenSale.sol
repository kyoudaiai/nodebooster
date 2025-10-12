// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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

contract TokenSale is Context, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    IERC20 private _token;
    bool private _paused;
    
    address private _owner;
    address payable private _wallet;    
    address private _tokenWallet;
    address payable private _defaultReferrer;

    uint private _rate;
    uint private _refRate = 1000; // 10% referral bonus
    uint private _refFee = 200; // 2% referral fee

    uint private _weiRaised;
    
    
    struct User {
      address wallet;
      uint totalRefBonus;
    }

    mapping(address => User) public users;
    
    event TokensPurchased(address indexed purchaser, address indexed beneficiary, uint value, uint amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ReferralBonusPaid(address indexed user, uint amount);
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
    function changeRate(uint rate) public onlyOwner { _rate = rate; }
    function changeTokenWallet(address tokenWallet) public onlyOwner { _tokenWallet = tokenWallet; }
    function changePaymentWallet(address payable wallet) public onlyOwner { _wallet = wallet; }
    function changeRefRate(uint refRate) public onlyOwner { _refRate = refRate; }
    function changeDefaultReferrer(address payable referrer) public onlyOwner { _defaultReferrer = referrer; }

    constructor (uint rate, address payable wallet, address tokenWallet, IERC20 token) payable {
        require(rate > 0, "Crowdsale: rate is 0");
        require(wallet != address(0), "Tokensale: wallet is the zero address");        
        require(address(token) != address(0), "Crowdsale: token is the zero address");
        require(tokenWallet != address(0), "AllowanceCrowdsale: token wallet is the zero address");

        _owner = msg.sender;
        _paused = false;
        _rate = rate;
        _wallet = wallet;
        
        _token = token;
        _tokenWallet = tokenWallet;
        emit OwnershipTransferred(address(0), _owner);
    }

    receive () external payable {
        buyTokens(_msgSender(), _defaultReferrer);
    }

    function token() public view returns (IERC20) {
        return _token;
    }
    function wallet() public view returns (address payable) {
        return _wallet;
    }
    function rate() public view returns (uint) {
        return _rate;
    }
    function weiRaised() public view returns (uint) {
        return _weiRaised;
    }
    function paused() public view returns (bool) {
        return _paused;
    }

    function buyTokens(address beneficiary, address referrer) public nonReentrant payable {
        uint weiAmount = msg.value;
        _preValidatePurchase(beneficiary, weiAmount);

        // calculate token amount to be transferred and locked
        uint totalTokens = _getTokenAmount(weiAmount);
        
        // update state
        _weiRaised = _weiRaised.add(weiAmount);

        _processPurchase(beneficiary, totalTokens);
        _updatePurchasingState(beneficiary, weiAmount);
        
        uint referralAmount = 0;
        if (referrer != address(0) && referrer != beneficiary) {
            // If a referrer is provided, transfer the referral bonus
            referralAmount = (weiAmount * _refRate) / 10000; // 10% referral bonus            
            referralAmount -= (weiAmount * _refFee) / 10000; // 2% referral fee

            User storage user = users[referrer];
            user.totalRefBonus += referralAmount;            
        } else {
            // If no referrer, use default referrer
            referrer = _defaultReferrer;
            referralAmount = (weiAmount * _refRate) / 10000; // 10% referral bonus
            User storage user = users[referrer];
            user.totalRefBonus += referralAmount;
        }

        
        // Transfer referral bonus to referrer
        if (referralAmount > 0) {
            payable(referrer).transfer(referralAmount);
            emit ReferralBonusPaid(referrer, referralAmount);
        }
        
        _wallet.transfer((weiAmount - referralAmount)); // Transfer remaining amount to the wallet
        
        
        _postValidatePurchase(beneficiary, weiAmount);

        emit TokensPurchased(_msgSender(), beneficiary, weiAmount, totalTokens);
    }

    function _preValidatePurchase(address beneficiary, uint weiAmount) whenNotPaused internal view {
        require(beneficiary != address(0), "TokenSale: beneficiary is the zero address");
        require(weiAmount != 0, "Crowdsale: weiAmount is 0");
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
    }

    function _postValidatePurchase(address beneficiary, uint weiAmount) internal view {

    }

    
    function _deliverTokens(address beneficiary, uint tokenAmount) internal virtual {
        token().safeTransferFrom(_tokenWallet, beneficiary, tokenAmount);
    }


    function _processPurchase(address beneficiary, uint tokenAmount) internal {
        _deliverTokens(beneficiary, tokenAmount);
    }

  
    function _updatePurchasingState(address beneficiary, uint weiAmount) internal {
        // solhint-disable-previous-line no-empty-blocks
    }


    function _getTokenAmount(uint weiAmount) internal view returns (uint) {
        return weiAmount.mul(_rate);
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

    function moveTokens(address _tokenAddress, address _account, uint _amount) external onlyOwner returns (bool) {
        require(_account != address(0), "0 address");
        require(_amount > 0, "amount is 0");
        require(IERC20(_tokenAddress).balanceOf(address(this)) >= _amount, "Not enough tokens in contract");

        IERC20(_tokenAddress).transfer(_account, _amount);
        return true;                
    }
    function moveFunds(address payable wallet, uint amount) onlyOwner public returns (bool) {
        require(wallet !=address(0), "0 address");
        require(amount > 0, "amount is 0");
        payable(wallet).transfer(amount);
        return true; 
    }
}