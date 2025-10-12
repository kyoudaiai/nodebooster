// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

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
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint);
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
interface iMultiTokenSwap {
    function swapExactTokensForETH(address _outputToken, address beneficiary) external payable;
    function swapExactTokensForTokens(address _inputToken, address _outputToken, uint _amount, address beneficiary) external;
}

contract NativeToTokenHandler {
    // this contract have only 1 purpose, to convert native currency to token
    // it have configuration of the supported token
    // the receive function will call the swapExactTokensForETH function of the MultiTokenSwap contract
    // the MultiTokenSwap contract will transfer the token to the beneficiary

    address private _owner;
    address private _defaultToken;
    address private _swapContract;
    

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);    
    event SwapContractChanged(address indexed previousContract, address indexed newContract);
    event DefaultTokenChanged(address indexed previousToken, address indexed newToken);

    modifier onlyOwner() {
        require(msg.sender == _owner, "not owner");
        _;
    }

    // constructor
    constructor (address payable owner, address defaultToken, address swapContract) payable {
        require(owner != address(0), "owner is the zero address");
        require(defaultToken != address(0), "defaultToken is the zero address");
        require(swapContract != address(0), "swapContract is the zero address");
        
        _owner = owner;
        _defaultToken = defaultToken;
        _swapContract = swapContract;                
    }
    

    receive () external payable {        
        iMultiTokenSwap(_swapContract).swapExactTokensForETH{value: msg.value}(_defaultToken, msg.sender);        
    }

    function moveTokens(address _token, address _account) external onlyOwner returns (bool) {
        uint256 contractTokenBalance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(_account, contractTokenBalance);        
        return true;
    }
    function withdrawFunds(address payable wallet, uint amount) onlyOwner public returns (bool) {
        require(wallet !=address(0), "zero address");
        require(amount > 0, "amount is 0");
        payable(wallet).transfer(amount);
        return true;
    }
}

contract MultiTokenSwap is Context, ReentrancyGuard {
    using SafeMath for uint;
    using SafeERC20 for IERC20;

    string  public name = "MultiTokenSwap";
    string  public symbol = "SWAP";
    string  public standard = "MultiTokenSwap v2.0";

    bool    private _paused = false;

    address private _defaultToken;
    address private _owner;
    address payable private _defaultPayoutWallet;    
    address private _tokenWallet;        
        
    uint    public totalSupportedTokens = 0;

    uint    public ratesPercision = 10000;

    struct TokenInfo {
        bool            isSupported;        
        address         tokenAddress;        
        string          symbol;
        uint8           decimals;
        address         tokenWallet;
        address     	payoutWallet;                 
        uint 		    bnbRate;        
    }
        
    mapping(address => TokenInfo) public supportedTokens;
    mapping(address => mapping(address => uint256)) public conversionRates;
    
    event NewTokenAdded(address indexed tokenAddress, string symbol, uint8 decimals, uint bnbRate);
    event TokenChanged(address indexed tokenAddress);
    event TokenRemoved(address indexed tokenAddress);
    event NewConversionAdded(address indexed _from, address indexed _to, uint _rate);
    event TokensConverted(address indexed purchaser, address indexed beneficiary, address inputCurrency, address outputCurrency, uint value, uint amount);
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
    modifier TokenSupported(address _token) {
        require(supportedTokens[_token].isSupported, "Input token not supported");
        _;
    }
    modifier hasConversionRate(address _inputToken, address _outputToken) {
        require(conversionRates[_inputToken][_outputToken] > 0, "no Conversion rate available");
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
    function changeBNBRate(uint _rate) public onlyOwner { defaultToken().bnbRate = _rate; }
    function changeDefaultWallet(address payable wallet) public onlyOwner { _defaultPayoutWallet = wallet; }

    function isTokenSupported(address _token) public view returns (bool) {
        return supportedTokens[_token].isSupported;        
    }
    function getSupportedTokenInfo(address _token) public view returns (TokenInfo memory) {
        return supportedTokens[_token];        
    }      
    function addSupportedToken(TokenInfo memory _newToken) external onlyOwner returns (bool) {
        require(_newToken.tokenAddress != address(0), "Invalid input token address");                
        require(_newToken.tokenWallet != address(0), "Invalid token wallet address");
        require(_newToken.payoutWallet != address(0), "Invalid payout wallet address");
        require(_newToken.bnbRate > 0, "Invalid BNB rate");

        bool _tokenIsAlreadySupported = supportedTokens[_newToken.tokenAddress].isSupported;

        supportedTokens[_newToken.tokenAddress] = _newToken;
        supportedTokens[_newToken.tokenAddress].isSupported = true;
        
        totalSupportedTokens = totalSupportedTokens.add(1);

        if (_tokenIsAlreadySupported) { emit TokenChanged(_newToken.tokenAddress); } 
        else { emit NewTokenAdded(_newToken.tokenAddress, _newToken.symbol, _newToken.decimals, _newToken.bnbRate); }
        
        return true;
    }
    // deploy NativeToTokenHandler
    function deployNativeToTokenHandler(address _token) public onlyOwner returns (address) {        
        require(_token != address(0), "_token is the zero address");        
        require(supportedTokens[_token].isSupported, "Token not supported");
        // require(supportedTokens[_token].handler == address(0), "Handler already deployed");

        bytes32 salt = keccak256(abi.encodePacked(_token));
        NativeToTokenHandler nativeToTokenHandler = new NativeToTokenHandler{ salt: salt }(payable(_owner), _token, address(this));
        
        return address(nativeToTokenHandler);
    }

    function getTokenHandlerAddress(address _token) public view returns (address) {        
        bytes32 salt = keccak256(abi.encodePacked(_token));   
        bytes memory _bytecode = type(NativeToTokenHandler).creationCode;             

        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff), 
                address(this), 
                salt, 
                keccak256(
                    abi.encodePacked( 
                        _bytecode,
                        abi.encode(
                            payable(_owner), 
                            _token,
                            address(this)                            
                        )
                    )
                )
            )
        );    

        return address(uint160(uint256(hash)));
    }
    
    
    function removeSupportedToken(address _token) external onlyOwner returns (bool) {
        require(_token != address(0), "Invalid input token address");        
        require(supportedTokens[_token].isSupported, "Token not supported");        
        delete supportedTokens[_token];

        emit TokenRemoved(_token);

        return true;
    }

    function setConversionRate(address _inputToken, address _outputToken, uint256 _rate) external onlyOwner returns (bool) {
        require(_inputToken != address(0), "Invalid input token address");        
        require(_outputToken != address(0), "Invalid output token address");        
        require(_rate > 0, "Invalid conversion rate");        
        conversionRates[_inputToken][_outputToken] = _rate;

        emit NewConversionAdded(_inputToken, _outputToken, _rate);

        return true;
    }
    


    constructor (address payable defaultPayoutWallet, address defaultTokenAddress) payable {        
        require(defaultPayoutWallet != address(0), "SWAP: wallet is the zero address");        
        require(address(defaultTokenAddress) != address(0), "SWAP: token is the zero address");        
        
        _owner = msg.sender;                
        _defaultPayoutWallet = defaultPayoutWallet;                
        _defaultToken = defaultTokenAddress;
                        
        emit OwnershipTransferred(address(0), _owner);
    }

    receive () external payable {
        swapExactTokensForETH(_defaultToken, _msgSender());
    }

    function defaultToken() internal view returns (TokenInfo storage _tokenInfo) {        
        return supportedTokens[_defaultToken];
    }    
    function setDefaultToken(address _token) public onlyOwner TokenSupported(_token) {          
        _defaultToken = _token;
    }
    
   
    function paused() public view returns (bool) {
        return _paused;
    }

    function _preValidatePurchase(address beneficiary, uint weiAmount) whenNotPaused internal view {
        require(beneficiary != address(0), "SWAP: beneficiary is the zero address");
        require(weiAmount != 0, "SWAP: wei amount is 0");
        this; // silence state mutability warning without generating bytecode - see https://github.com/ethereum/solidity/issues/2691
    }
    function _deliverTokens(address _token, address beneficiary, uint tokenAmount) internal virtual {
        IERC20(_token).safeTransferFrom(supportedTokens[_token].tokenWallet, beneficiary, tokenAmount);
    }    
    function rate() public view returns (uint) { return defaultToken().bnbRate; }
    function nativeRate(address _outputToken) public view returns (uint) { return supportedTokens[_outputToken].bnbRate; }
    function _getTokenAmount(address _outputToken, uint weiAmount) internal view TokenSupported(_outputToken) returns (uint) {
        uint outputDecimals = IERC20(_outputToken).decimals();
        return weiAmount.mul(supportedTokens[_outputToken].bnbRate/ 10000).mul(10**outputDecimals).div(10**18);
    }
    function _forwardFunds() internal {        
        _defaultPayoutWallet.transfer(msg.value);        
    }    
    function getConversionRate(address _inputTokenAddress, address _outputTokenAddress) public view TokenSupported(_inputTokenAddress) TokenSupported(_outputTokenAddress) returns (uint256) {        
        require(conversionRates[_inputTokenAddress][_outputTokenAddress] > 0, "no conversion rate available.");
        return conversionRates[_inputTokenAddress][_outputTokenAddress];
    }
    function _getConversionAmount(address _inputTokenAddress, address _outputTokenAddress, uint256 _amount) public view TokenSupported(_inputTokenAddress) TokenSupported(_outputTokenAddress) returns (uint256) {
        require(_amount > 0, "Input amount must be greater than 0");
        require(conversionRates[_inputTokenAddress][_outputTokenAddress] > 0, "no conversion rate available.");        

        uint _inputDecimals = supportedTokens[_inputTokenAddress].decimals;
        uint _outputDecimals = supportedTokens[_outputTokenAddress].decimals;
        
        uint conversionRate = getConversionRate(_inputTokenAddress, _outputTokenAddress);
        uint convertedAmount = _amount.mul(conversionRate).mul(10**_outputDecimals).div(10**_inputDecimals).div(ratesPercision);

        return convertedAmount;
    }                
    function remainingTokens(address _outputToken) public view returns (uint) {    
        return Math.min(
            IERC20(_outputToken).balanceOf(supportedTokens[_outputToken].tokenWallet), 
            IERC20(_outputToken).allowance(supportedTokens[_outputToken].tokenWallet, address(this))
        );
    }

    function swapExactTokensForETH(address _outputToken, address beneficiary) public nonReentrant TokenSupported(_outputToken) payable returns (bool) {
        uint weiAmount = msg.value;
        _preValidatePurchase(beneficiary, weiAmount);

        uint totalTokens = _getTokenAmount(_outputToken, weiAmount);
                        
        _deliverTokens(_outputToken, beneficiary, totalTokens);
        
        emit TokensConverted(_msgSender(), beneficiary, address(0), _outputToken, weiAmount, totalTokens);

        _forwardFunds();   

        return true;     
    }

    function swapExactTokensForTokens(address _inputToken, address _outputToken, uint _amount, address beneficiary) public nonReentrant TokenSupported(_inputToken) TokenSupported(_outputToken) hasConversionRate(_inputToken, _outputToken) {        
        require(_amount > 0, "input: can't be 0");                         
        require(IERC20(_inputToken).allowance(msg.sender, address(this)) >= _amount, "Token0 allowance");
         
        uint _convertedAmount = _getConversionAmount(_inputToken, _outputToken, _amount);
         
        require(remainingTokens(_outputToken) >= _convertedAmount, "insufficient Output Token Balance");
                
        IERC20(_inputToken).safeTransferFrom(msg.sender, supportedTokens[_inputToken].payoutWallet, _amount);       
        _deliverTokens(_outputToken, beneficiary, _convertedAmount);                
         
        emit TokensConverted(_msgSender(), beneficiary, _inputToken, _outputToken, _amount, _convertedAmount);     
    }

    function moveTokens(address _token, address _account) external onlyOwner returns (bool) {
        uint256 contractTokenBalance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(_account, contractTokenBalance);        
        return true;
    }
    function withdrawFunds(address payable wallet, uint amount) onlyOwner public returns (bool) {
        require(wallet !=address(0), "zero address");
        require(amount > 0, "amount is 0");
        payable(wallet).transfer(amount);
        return true;
    }

    // END    
}