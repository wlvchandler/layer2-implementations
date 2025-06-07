// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

 import "@openzeppelin/contracts/security/ReentrancyGuard.sol"; 
contract OptimisticRollup is ReentrancyGuard {
    string constant ENCODING = "GENESIS";
    uint256 public constant OPERATOR_BOND = 1 ether;

    bytes32 public currentStateRoot; // current state of all l2 accounts
    uint256 public rollupBlockNumber;
    uint256 public totalValueLocked;

    struct RollupBlock {
        bytes32 stateRoot; // post state root after batch execution
        bytes32 txRoot; // merkle root of txs in this batch
        uint256 blockNumber; // L1 block num when submitted
        uint256 timestamp; 
        address operator; // address that submitted
        bool finalized;
    }

    // L2 account structure
    struct Account {
        uint256 balance; // l2 eth balance
        uint256 nonce; // tx counter
    }

    mapping(address => Account) public accounts;
    mapping (uint256 => RollupBlock) public rollup_blocks;
    
    event Deposit(address indexed user, uint256 amount);

    constructor() { 
        currentStateRoot = keccak256(abi.encode(ENCODING));
        rollupBlockNumber = 0;
    }

    // note: nonreentrant prevents deposit function from being called multiple times in a single tx
    function deposit() external payable nonReentrant {
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
