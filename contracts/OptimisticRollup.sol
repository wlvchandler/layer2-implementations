// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract OptimisticRollup {
    bytes32 public currentStateRoot; // current state of all l2 accounts
    uint256 public rollupBlockNumber;
    
    constructor() {
        currentStateRoot = keccak256(abi.encode("GENESIS"));
        rollupBlockNumber = 0;
    }

    function getCurrentState() external view returns (bytes32 stateRoot, uint256 blockNum) {
        return (currentStateRoot, rollupBlockNumber);
    }
}
