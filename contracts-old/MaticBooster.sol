// SPDX-License-Identifier: Unlicensed

interface MIBRoyalty {
    function send(uint _amt) external payable;
}

pragma solidity ^0.8.28;

contract MIB {
    address private owner;
    MIBRoyalty private royaltyAddr;
    uint private defaultRefer;
    address private feeReceiver;
    uint private constant maxLayers = 10;
    uint[3] private royaltyPercent = [20, 30, 50];
    uint[3] private royaltyLvl = [8, 9, 10];
    uint private constant royaltyMaxPercent = 250;
    uint private constant royaltyDistTime = 72 hours;
    uint private constant directRequired = 5;
    uint[10] private levels = [6 ether, 9 ether, 18 ether, 36 ether, 72 ether,144 ether, 288 ether, 576 ether, 1152 ether,2304 ether];
    uint[10] private percents = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

    struct User {
        address account;
        uint id;
        uint referrer;
        uint upline;
        uint start;
        uint level;
        uint directTeam;
        uint totalMatrixTeam;
        uint totalIncome;
        uint totalDeposit;
        uint royaltyIncome;
        uint referralIncome;
        uint levelIncome;
        uint[10] income;
    }

    struct Income {
        uint id;
        uint layer;
        uint amount;
        uint time;
    }

    struct Activity {
        uint id;
        uint level;
    }
    
    uint public startTime;
    uint public totalUsers;
    uint[3] public royalty;
    uint[] public globalUsers;
    mapping (uint => uint[]) public royaltyUsers;
    uint public royaltyLastDist;
    mapping (uint => User) public userInfo;
    mapping (uint => Income[]) public incomeInfo;
    Activity[] public activity; 
    mapping (uint => mapping (uint => uint[])) public teams;
    mapping (uint => uint[]) public directTeam;
    mapping (uint => uint) public matrixDirect;
    mapping(address => uint) public id;

    constructor(address _feeReceiver, address _royalty, address _owner) {
        defaultRefer = 10975;
        feeReceiver = _feeReceiver;
        owner = _owner;
        royaltyLastDist = block.timestamp;
        startTime = block.timestamp;
        royaltyAddr = MIBRoyalty(_royalty);
    }

    receive() external payable {}

    function register(uint _ref, address _newAcc) external payable {
        bool isSuper;
        if(msg.sender == owner && (block.timestamp - startTime) < 3 hours) isSuper = true;
        require(id[_newAcc] == 0, "Already Registered");
        require(userInfo[_ref].start > 0 || _ref == defaultRefer, "Invalid Referrer");

        uint newId = defaultRefer + ((totalUsers + 1) * 3); 
        id[_newAcc] = newId;
        User storage user = userInfo[newId];
        user.id = newId;

        uint _inAmt = levels[0] + ((levels[0] * percents[0]) / 100);
        if(!isSuper) require(msg.value == _inAmt, "invalid value");

        user.referrer = _ref;
        user.account = _newAcc;

        if(user.referrer != defaultRefer) {
            userInfo[user.referrer].directTeam += 1;
            directTeam[user.referrer].push(user.id);
            if(!isSuper) {
                payable(userInfo[user.referrer].account).transfer(levels[user.level]);
                incomeInfo[user.referrer].push(Income(user.id, 1, levels[user.level], block.timestamp));
                userInfo[user.referrer].totalIncome += levels[user.level];
                userInfo[user.referrer].referralIncome += levels[user.level];
                userInfo[user.referrer].income[user.level] += levels[user.level];
            }
        } 

        globalUsers.push(user.id);
        if(totalUsers > 0 && user.referrer != defaultRefer) _placeInMatrix(user.id, user.referrer);
        user.start = block.timestamp;
        totalUsers += 1;

        user.level += 1;
        user.totalDeposit += levels[0];
        uint royaltyAmt = (levels[0] * 2)/100;
        for(uint i=0; i<royalty.length; i++) {
            if(!isSuper) royalty[i] += (royaltyAmt * royaltyPercent[i])/100;
        }

        if(!isSuper) payable(address(royaltyAddr)).transfer(royaltyAmt);
        if(!isSuper) payable(feeReceiver).transfer(address(this).balance);
        activity.push(Activity(user.id, user.level));
    }

    function upgrade(uint _id, uint _lvls) external payable {
        bool isSuper;
        if(msg.sender == owner && (block.timestamp - startTime) < 3 hours) isSuper = true;
        User storage user = userInfo[_id];
        require(user.referrer != 0, "Register First");
        require(user.level + _lvls <= levels.length, "Maximum Level");

        uint initialLvl = user.level;
        uint totalAmount = 0;
        uint adminCharge = 0;

        for(uint i=initialLvl; i<initialLvl+_lvls; i++) {
            totalAmount += levels[i];
            adminCharge += (levels[i] * percents[i]) / 100; 
        }

        uint amount = totalAmount + adminCharge;
        if(!isSuper) require(msg.value == amount , "Invalid POL Value");

        for(uint i=initialLvl; i<initialLvl+_lvls; i++) {
            if(user.level > 0 && !isSuper) _distUpgrading(_id, i);
            user.level += 1;
            if(user.level == royaltyLvl[0]) royaltyUsers[0].push(_id);
            if(user.level == royaltyLvl[1]) royaltyUsers[1].push(_id);
            if(user.level == royaltyLvl[2]) royaltyUsers[2].push(_id);
        }

        user.totalDeposit += totalAmount;
        uint royaltyAmt = (totalAmount *2) /100;
        for(uint i=0; i<royalty.length; i++) {
            if(!isSuper) royalty[i] += (royaltyAmt * royaltyPercent[i])/100;
        }
        
        
        if(!isSuper) payable(address(royaltyAddr)).transfer(royaltyAmt);
        if(!isSuper) payable(feeReceiver).transfer(address(this).balance);
        activity.push(Activity(user.id, user.level));
    }

    function _distUpgrading(uint _user, uint _level) private {
        uint upline = userInfo[_user].upline;
        for(uint i=0; i<maxLayers; i++) {
            if(i < _level - 1) {
                upline = userInfo[upline].upline;
            } else {
                if(upline == 0 || upline == defaultRefer) break;
                if(i < _level) {
                    upline = userInfo[upline].upline;
                } else {
                    if(userInfo[upline].level > _level && userInfo[upline].directTeam >= directRequired) {
                        payable(userInfo[upline].account).transfer(levels[_level]);
                        userInfo[upline].totalIncome += levels[_level];
                        userInfo[upline].levelIncome += levels[_level];
                        userInfo[upline].income[_level] += levels[_level];
                        incomeInfo[upline].push(Income(_user, i+1, levels[_level], block.timestamp));
                        break;
                    }
                    upline = userInfo[upline].upline;
                }
            }
        }
    }

    function _placeInMatrix(uint _user, uint _ref) private {
        bool isFound;
        uint upline;

        if(matrixDirect[_ref] < 5) {
            userInfo[_user].upline = _ref;
            matrixDirect[_ref] += 1;
            upline = _ref;
        } else {
            for(uint i=0; i<maxLayers; i++) {
                if(isFound) break;
                if(teams[_ref][i+1].length < 5 ** (i+5)) {
                    for(uint j=0; j<teams[_ref][i].length; j++) {
                        if(isFound) break;
                        uint temp = teams[_ref][i][j];
                        if(matrixDirect[temp] < 5) {
                            userInfo[_user].upline = temp;
                            matrixDirect[temp] += 1;
                            upline = temp;
                            isFound = true;
                        } 
                    }
                }
            }
        }

        for(uint i=0; i<maxLayers; i++) {
            if(upline == 0 || upline == defaultRefer) break;
            userInfo[upline].totalMatrixTeam += 1;
            teams[upline][i].push(_user);
            upline = userInfo[upline].upline;
        }
    }

    function distributeRoyalty() external {
        require(block.timestamp - royaltyLastDist >= royaltyDistTime, "Timestep not completed");

        for(uint i=0; i<royalty.length; i++) {
            uint[] memory players = getRoyaltyUsers(i);
            if(players.length > 0) royaltyAddr.send(royalty[i]);
            uint toDist = players.length > 0 ? royalty[i]/players.length : 0;
            for(uint j=0; j<players.length; j++) {
                payable (userInfo[players[j]].account).transfer(toDist);
                userInfo[players[j]].royaltyIncome += toDist;
                incomeInfo[players[j]].push(Income(10975, 0, toDist, block.timestamp));
            }
            if(players.length > 0) royalty[i] = 0;
        }

        royaltyLastDist = block.timestamp;
    }

    function getRoyaltyUsers(uint _royalty) public view returns(uint[] memory) {
        uint length;

        for(uint i=0; i<royaltyUsers[_royalty].length; i++) {
            uint curId = royaltyUsers[_royalty][i];
            if(userInfo[curId].level == royaltyLvl[_royalty] && userInfo[curId].royaltyIncome < (userInfo[curId].totalDeposit * royaltyMaxPercent)/100 && userInfo[curId].directTeam >= directRequired) {
                length += 1;
            } 
        }

        uint[] memory _users = new uint[](length);
        uint taken = 0;

        for(uint i=0; i<royaltyUsers[_royalty].length; i++) {
            uint curId = royaltyUsers[_royalty][i];
            if(userInfo[curId].level == royaltyLvl[_royalty] && userInfo[curId].royaltyIncome < (userInfo[curId].totalDeposit * royaltyMaxPercent)/100 && userInfo[curId].directTeam >= directRequired) {
                _users[taken] = curId;
                taken += 1;
            }
        }

        return _users;
    }

    function getMatrixUsers(uint _user, uint _layer) external view returns(User[] memory) {
        User[] memory users = new User[](teams[_user][_layer].length);

        for(uint i=0; i<teams[_user][_layer].length; i++) {
            users[i] = userInfo[teams[_user][_layer][i]];
        }

        return users;
    }

    function getIncome(uint _user) external view returns(Income[] memory) {
        return incomeInfo[_user];
    }

    function getMatrixDirect(uint _user) external view returns(uint[5] memory _directs) {
        for(uint i=0; i<teams[_user][0].length; i++) {
            _directs[i] = teams[_user][0][i];
        }
    }

    function getDirectTeamUsers(uint _user) external view returns(User[] memory) {
        User[] memory users = new User[](directTeam[_user].length);

        for(uint i=0; i<directTeam[_user].length; i++) {
            users[i] = userInfo[directTeam[_user][i]];
        }

        return users;
    }

    function getLevels() external view returns(uint[10] memory, uint[10] memory) {
        return (levels, percents);
    }

    function getRoyaltyTime() external view returns(uint) {
        return royaltyLastDist + royaltyDistTime;
    }

    function getRecentActivities(uint _num) external view returns(Activity[] memory) {
        Activity[] memory _activity = new Activity[](activity.length > _num ? _num : activity.length);

        if(activity.length > _num) {
            uint taken = 0;
            for(uint i=activity.length; i>activity.length - _num; i--) {
                _activity[taken] = activity[i-1];
                taken += 1;
            }
        } else {
            _activity = activity;
        }


        return _activity;
    }

    function getLevelIncome(uint _id) external view returns(uint[10] memory) {
        return userInfo[_id].income;
    }

    function transferOwnershipToZeroAddress() external {
        require(msg.sender == owner, "Not Authorized");
        owner = address(0);
    }
}