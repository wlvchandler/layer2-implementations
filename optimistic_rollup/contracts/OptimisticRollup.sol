// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

 import "@openzeppelin/contracts/security/ReentrancyGuard.sol"; 
contract OptimisticRollup is ReentrancyGuard {
    string constant ENCODING = "GENESIS";
    uint256 public constant OPERATOR_BOND = 1 ether;
    uint256 public constant CHALLENGE_PERIOD = 50400; // ~7d @ 12s blocks

    bytes32 public currentStateRoot; // current state of all l2 accounts
    uint256 public rollupBlockNumber;
    uint256 public totalValueLocked;

    struct RollupBlock {
        bytes32 stateRoot; // post state root after batch execution
        bytes32 txRoot; // merkle root of txs in this batch
        uint256 blockNumber; // L1 block num when submitted
        uint256 timestamp; 
        address operator; // address that submitted
        bool challenged;
        bool finalized;
    }

    // L2 account structure
    struct Account {
        uint256 balance; // l2 eth balance
        uint256 nonce; // tx counter
    }

    struct WithdrawalRequest {
        address user;
        uint256 amount;
        uint256 rollupBlock;
        bool processed;
    }

    mapping(address => Account) public accounts;
    mapping (uint256 => RollupBlock) public rollup_blocks;
    mapping(address => uint256) public operator_bonds;
    mapping(bytes32 => WithdrawalRequest) public withdrawal_requests;

    // --- Events
    event Deposit(address indexed user, uint256 amount);
    event RollupBlockSubmitted(uint256 indexed blockNumber, bytes32 stateRoot, bytes32 txRoot, address operator);
    event Challenge(uint256 indexed blockNumber, address challenger);
    event BlockFinalized(uint256 indexed blockNumber);
    event WithdrawalRequested(address indexed user, uint256 amount, bytes32 requestId);
    event WithdrawalProcessed(address indexed user, uint256 amount);

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

    function submitRollupBlock(bytes32 newStateRoot, bytes32 txRoot, bytes[] calldata txs) external payable {
        require(msg.value >= OPERATOR_BOND, "Insufficient bond");
        require(newStateRoot != bytes32(0), "Invalid state root");
        require(txRoot != bytes32(0), "Invalid tx root");
        require(verifyTxRoot(txRoot, txs),"Invalid tx root");

        rollupBlockNumber++;
        rollup_blocks[rollupBlockNumber] = RollupBlock({
            stateRoot: newStateRoot,
            txRoot: txRoot,
            blockNumber: block.number,
            timestamp: block.timestamp,
            operator: msg.sender,
            challenged: false,
            finalized: false
        });
        operator_bonds[msg.sender] += msg.value;
        currentStateRoot = newStateRoot;
        emit RollupBlockSubmitted(rollupBlockNumber, newStateRoot, txRoot, msg.sender);
    }

    //TODO: this should build proper merkle tree instead of hashing all txs together
    function verifyTxRoot(bytes32 txRoot, bytes[] calldata txs) internal pure returns(bool) {
        bytes32 computedRoot = keccak256(abi.encode(txs));
        return computedRoot == txRoot;
    }

    // TODO: actually verify the fraud proof. for now just assumes any challenge is valid lol
    function challengeBlock(uint256 blockNum, bytes calldata proof) external {
        proof; // prevent compiler warn

        RollupBlock storage rollupBlock = rollup_blocks[blockNum];
        require(rollupBlock.operator != address(0), "Block does not exist");
        require(!rollupBlock.finalized, "Block already finalized");
        require(!rollupBlock.challenged, "Block already challenged");
        
        rollupBlock.challenged = true;

        // slash operator bond
        uint256 slashedAmount = operator_bonds[rollupBlock.operator];
        operator_bonds[rollupBlock.operator] = 0;

        // reward challenger with portion of slashed funds
        uint256 challengerReward = slashedAmount / 2;
        payable(msg.sender).transfer(challengerReward);

        emit Challenge(blockNum, msg.sender);
    }

    function finalizeBlock(uint256 blockNum) external {
        RollupBlock storage rollupBlock = rollup_blocks[blockNum];
        require(rollupBlock.operator != address(0), "Block does not exist");
        require(!rollupBlock.finalized, "Block already finalized");
        require(!rollupBlock.challenged, "Block was challenged");
        require(block.number > rollupBlock.blockNumber + CHALLENGE_PERIOD, "Challenge period not expired");

        rollupBlock.finalized = true;

        // return operator bond
        uint256 bondAmount = operator_bonds[rollupBlock.operator];
        operator_bonds[rollupBlock.operator] = 0;
        payable(rollupBlock.operator).transfer(bondAmount);

        emit BlockFinalized(blockNum);
    }

    function requestWithdrawal(uint256 amount) external {
        require(accounts[msg.sender].balance >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be positive");

        bytes32 requestID = keccak256(abi.encode(msg.sender, amount, rollupBlockNumber, block.timestamp));
        withdrawal_requests[requestID] = WithdrawalRequest({
            user: msg.sender,
            amount: amount,
            rollupBlock: rollupBlockNumber,
            processed: false
        });

        // deduct from L2 balance immediately
        accounts[msg.sender].balance -= amount;
        emit WithdrawalRequested(msg.sender, amount, requestID);
    }

    function processWithdrawal(bytes32 requestID) external nonReentrant {
        WithdrawalRequest storage request = withdrawal_requests[requestID];
        require(request.user != address(0), "Invalid withdrawal request");
        require(!request.processed, "Withdrawal already processed");
        require(request.user == msg.sender, "Not your withdrawal");
        require(rollup_blocks[request.rollupBlock].finalized, "Rollup block not finalized");
        
        request.processed = true;
        totalValueLocked -= request.amount;

        payable(request.user).transfer(request.amount);
        emit WithdrawalProcessed(request.user, request.amount);
    }

    function getCurrentState() external view returns (bytes32 stateRoot, uint256 blockNum) {
        return (currentStateRoot, rollupBlockNumber);
    }

    function getBalance(address user) external view returns (uint256) {
        return accounts[user].balance;
    }

    function getRollupBlock(uint256 blockNum) external view returns (RollupBlock memory) {
        return rollup_blocks[blockNum];
    }
    
    function getOperatorBond(address operator) external view returns (uint256) {
        return operator_bonds[operator];
    }

    function getWithdrawalRequest(bytes32 requestId) external view returns (WithdrawalRequest memory) {
        return withdrawal_requests[requestId];
    }

    function canFinalizeOrChallenge(uint256 blockNum, bool finalize) internal view returns (bool) {
        RollupBlock storage rollupBlock = rollup_blocks[blockNum];
        bool valid_block_number = finalize ? block.number > rollupBlock.blockNumber + CHALLENGE_PERIOD : block.number <= rollupBlock.blockNumber + CHALLENGE_PERIOD;
        return (
            rollupBlock.operator != address(0) &&
            !rollupBlock.finalized &&
            !rollupBlock.challenged &&
            valid_block_number
        );
    }
    
    function canFinalize(uint256 blockNum) external view returns (bool) {
        return canFinalizeOrChallenge(blockNum, true);
    }

    function canChallenge(uint256 blockNum) external view returns (bool) {
        return canFinalizeOrChallenge(blockNum, false);
    }

    function canProcessWithdrawal(bytes32 requestID) external view returns (bool) {
        WithdrawalRequest storage request = withdrawal_requests[requestID];
        return(request.user != address(0) && !request.processed && rollup_blocks[request.rollupBlock].finalized);
    }
}
