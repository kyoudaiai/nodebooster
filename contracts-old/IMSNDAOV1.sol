// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";


import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

error TransferFeeNotPaid(uint256 totalFee, uint256 sent);

contract IMSNDAOV1 is Initializable, OwnableUpgradeable, ERC1155Upgradeable, ERC2981Upgradeable
{    
    using SafeMath for uint;    
    using SafeERC20 for IERC20;
    
    uint256 public constant IMSNDAO = 0;
    string private _baseUri;
    string private _contractURI;

    string public name;
    string public symbol;

    IERC20 public _token; 
    address private _tokenWallet; 

    address private _royaltyReceiver;
    uint256 private _royaltyPercentage;
    address payable public masterDAOWallet;

    bool chargeTransferFee;
    uint256 private _transferFee;

    bool _lockingIsActive;
    uint public lockedVSNDAOAmount;
    uint public _feeToRedeemTokens;
    uint public lockPeriod;

    address[] public stakers;
    mapping(address => UserBalance) public stakedBalances;
    mapping(address => bool) public hasStaked;
    mapping(address => bool) public isStaking;    
    mapping(address => bool) public isRedeemed;

    
    struct controller {
        uint controller;
        address payable wallet;
    }

    struct UserBalance {
      address wallet;
      uint balance;
      uint startTime;
      uint releaseTime;   
    }

    mapping(uint256 => mapping(address => uint256)) private _balances;

    
        
    // constructor() ERC1155("https://nft-collections.scalenovelty.com/airdrop/{id}.json") 
    function initialize() external initializer 
    {
        __Ownable_init();
        __ERC1155_init("https://ipfs.filebase.io/ipfs/QmNapc4WR5NHM6xiCeH9nrvWJbFMHTtabCiaFhhPcT7y4z/");
        __ERC2981_init();
        _mint(msg.sender, IMSNDAO, 1*1e6, "");     

        _baseUri = "https://ipfs.filebase.io/ipfs/QmNapc4WR5NHM6xiCeH9nrvWJbFMHTtabCiaFhhPcT7y4z/";
        _contractURI = "https://ipfs.filebase.io/ipfs/QmNapc4WR5NHM6xiCeH9nrvWJbFMHTtabCiaFhhPcT7y4z/collection.json";  

        name = "I AM SNDAO";
        symbol = "IMSNDAO";

        _royaltyPercentage = 500;
        chargeTransferFee = true;
        _lockingIsActive = false;
        _transferFee = 0.002 ether;

        lockedVSNDAOAmount = 1000;
        _feeToRedeemTokens = 0.002 ether;

        lockPeriod = 2592000; // 30 days lock period

        masterDAOWallet = payable(msg.sender);
        _royaltyReceiver = msg.sender;

    }  

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Upgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId) || interfaceId == type(ERC2981Upgradeable).interfaceId;
    }  

    function royaltyInfo(uint256 tokenId, uint256 salePrice) public view override returns (address receiver, uint256 royaltyAmount) {
        return (_royaltyReceiver, salePrice.mul(_royaltyPercentage).div(10000));
    }
        
    function setToken(IERC20 token) public onlyOwner { _token = token; }
    function setTokenWallet(address wallet) public onlyOwner { _tokenWallet = wallet; }
    function setURI(string memory newuri) public onlyOwner { _setURI(newuri); }
    function setBaseURI(string memory newURI) external onlyOwner { _baseUri = newURI; }
    function setContractURI(string memory newURI) external onlyOwner { _contractURI = newURI; }
    function setRoyaltyReceiver(address receiver) public onlyOwner { _royaltyReceiver = receiver; }
    function setRoyaltyPercentage(uint256 percentage) public onlyOwner { _royaltyPercentage = percentage; }
    function setMasterDAOWallet(address payable _wallet) public onlyOwner { masterDAOWallet = _wallet; }    
    function setTransferFee(uint256 fee) public onlyOwner { _transferFee = fee; }
    function setRedeemFee(uint256 fee) public onlyOwner { _feeToRedeemTokens = fee; }


    
    function airdrop(uint tokenId, address[] calldata recipients ) public onlyOwner {
        for (uint i = 0; i < recipients.length; i++) {
            _safeTransferFrom(msg.sender, recipients[i], tokenId, 1, "");
            _stakeTokens(recipients[i], lockedVSNDAOAmount);

        }
    }
   
    function uri(uint256 tokenId) public view override returns (string memory) { return string(abi.encodePacked(_baseUri, Strings.toString(tokenId), ".json")); }
    function contractURI() public view returns (string memory) { return _contractURI; }




    // minting new tokens
    function mint(address account, uint256 id, uint256 amount, bytes memory data) public onlyOwner {
        _mint(account, id, amount, data);
    }

    function burn(
        address account,
        uint256 id,
        uint256 value
    ) public virtual {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "ERC1155: caller is not owner nor approved"
        );

        _burn(account, id, value);
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory values
    ) public virtual {
        require(
            account == _msgSender() || isApprovedForAll(account, _msgSender()),
            "ERC1155: caller is not owner nor approved"
        );

        _burnBatch(account, ids, values);
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
    
    receive() external payable {}    
    fallback() external payable {}

    function token() public view returns(IERC20) { return _token; }

    function _stakeTokens(address beneficiary, uint _amount) internal onlyOwner {        
        require(_amount > 0, "amount cannot be 0");
        
        stakedBalances[beneficiary].wallet = beneficiary;
        stakedBalances[beneficiary].balance += _amount;
        stakedBalances[beneficiary].startTime = block.timestamp;
        stakedBalances[beneficiary].releaseTime = (block.timestamp + lockPeriod);
        if(!hasStaked[beneficiary]) {
            stakers.push(beneficiary);
        }
        isStaking[beneficiary] = true;
        hasStaked[beneficiary] = true;
    }
    
    // Unstaking Tokens (Withdraw)
    function redeem() public payable {
        require(stakedBalances[msg.sender].balance > 0, "stake balance cannot be 0");
        if (_lockingIsActive == true) { require(stakedBalances[msg.sender].releaseTime <= block.timestamp, "Still in Locking Period"); }        
        require(msg.value >= _feeToRedeemTokens, "Please send redemption fee to redeem Your tokens.");
        token().safeTransfer(stakedBalances[msg.sender].wallet,( stakedBalances[msg.sender].balance * 1e18));
        stakedBalances[msg.sender].balance = 0;        
        isStaking[msg.sender] = false;
        _forwardFunds();
    }

    function _forwardFunds() internal {        
        uint _funds = msg.value;
        masterDAOWallet.transfer(_funds);
    }


}