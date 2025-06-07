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
    
    constructor() { 
        currentStateRoot = keccak256(abi.encode(ENCODING));
        rollupBlockNumber = 0;
    }

    function getCurrentState() external view returns (bytes32 stateRoot, uint256 blockNum) {
        return (currentStateRoot, rollupBlockNumber);
    }

    function getBalance(address user) external view returns (uint256) {
        return accounts[user].balance;
    }
}
