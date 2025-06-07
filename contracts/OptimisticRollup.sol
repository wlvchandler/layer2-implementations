// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract OptimisticRollup {
    string constant ENCODING = "GENESIS";

    bytes32 public currentStateRoot; // current state of all l2 accounts
    uint256 public rollupBlockNumber;
    uint256 public totalValueLocked;

    // L2 account structure
    struct Account {
        uint256 balance; // l2 eth balance
        uint256 nonce; // tx counter
    }

    mapping(address => Account) public accounts;
    
    event Deposit(address indexed user, uint256 amount);

    constructor() { 
        currentStateRoot = keccak256(abi.encode(ENCODING));
        rollupBlockNumber = 0;
    }

    function deposit() external payable {
        require(msg.value > 0, "Error: No ETH to be deposited");

        // credit user's L2 balance & track total locked funds
        accounts[msg.sender].balance += msg.value;
        totalValueLocked += msg.value;

        emit Deposit(msg.sender, msg.value);
    }

    function getCurrentState() external view returns (bytes32 stateRoot, uint256 blockNum) {
        return (currentStateRoot, rollupBlockNumber);
    }

    function getBalance(address user) external view returns (uint256) {
        return accounts[user].balance;
    }
}
