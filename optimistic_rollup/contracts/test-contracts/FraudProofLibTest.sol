// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../lib/FraudProofLib.sol";
import "../lib/TransactionLib.sol";
import "../lib/MerkleLib.sol";
import "../lib/StateLib.sol";

contract FraudProofLibTest {
    
    function verifyFraudProof(FraudProofLib.FraudProof memory proof) external pure returns (FraudProofLib.FraudResult memory) {
        return FraudProofLib.verifyFraudProof(proof);
    }
    
    function verifyTransactionInclusion(FraudProofLib.FraudProof memory proof) external pure returns (bool) {
        return FraudProofLib.verifyTransactionInclusion(proof);
    }
    
    function verifyPreStateProofs(FraudProofLib.FraudProof memory proof) external pure returns (bool) {
        return FraudProofLib.verifyPreStateProofs(proof);
    }
    
    function verifyPostStateProofs(FraudProofLib.FraudProof memory proof, TransactionLib.Account memory correctFromAccount, TransactionLib.Account memory correctToAccount) external pure returns (bool) {
        return FraudProofLib.verifyPostStateProofs(proof, correctFromAccount, correctToAccount);
    }
    
    function computeCorrectPostState(FraudProofLib.FraudProof memory proof, TransactionLib.Account memory correctFromAccount, TransactionLib.Account memory correctToAccount) external pure returns (bytes32) {
        return FraudProofLib.computeCorrectPostState(proof, correctFromAccount, correctToAccount);
    }
    
    function createFraudProof(
        TransactionLib.Transaction memory transaction,
        uint256 transactionIndex,
        bytes32 transactionRoot,
        bytes32 preStateRoot,
        bytes32 claimedPostStateRoot,
        StateLib.StateProof memory fromAccountProof,
        StateLib.StateProof memory toAccountProof,
        StateLib.StateProof memory claimedFromAccountProof,
        StateLib.StateProof memory claimedToAccountProof,
        MerkleLib.MerkleProof memory transactionMerkleProof
    ) external pure returns (FraudProofLib.FraudProof memory) {
        return FraudProofLib.createFraudProof(
            transaction,
            transactionIndex,
            transactionRoot,
            preStateRoot,
            claimedPostStateRoot,
            fromAccountProof,
            toAccountProof,
            claimedFromAccountProof,
            claimedToAccountProof,
            transactionMerkleProof
        );
    }
    
    function verifyTransactionExecution(
        TransactionLib.Transaction memory transaction,
        TransactionLib.Account memory preFromAccount,
        TransactionLib.Account memory preToAccount,
        TransactionLib.Account memory claimedFromAccount,
        TransactionLib.Account memory claimedToAccount
    ) external pure returns (bool isValid, string memory reason) {
        return FraudProofLib.verifyTransactionExecution(transaction,preFromAccount, preToAccount,claimedFromAccount,claimedToAccount);
    }

    // TODO: fix this    
    // function verifyBatchExecution(
    //     TransactionLib.Transaction[] memory transactions,
    //     bytes32 preStateRoot,
    //     bytes32 claimedPostStateRoot,
    //     address[] memory affectedAccounts,
    //     TransactionLib.Account[] memory preAccountStates,
    //     TransactionLib.Account[] memory claimedPostAccountStates
    // ) external pure returns (bool isValid, uint256 firstFraudIndex) {
    //     return FraudProofLib.verifyBatchExecution(
    //         transactions,
    //         preStateRoot,
    //         claimedPostStateRoot,
    //         affectedAccounts,
    //         preAccountStates,
    //         claimedPostAccountStates
    //     );
    // }
    
    function getFraudTypeDescription(FraudProofLib.FraudType fraudType) external pure returns (string memory) {
        return FraudProofLib.getFraudTypeDescription(fraudType);
    }
    

    function createTransaction(address from, address to, uint256 amount, uint256 nonce, uint256 fee) external pure returns (TransactionLib.Transaction memory) {
        return TransactionLib.Transaction({
            from: from,
            to: to,
            amount: amount,
            nonce: nonce,
            fee: fee,
            signature: new bytes(0)
        });
    }
    
    function createAccount(uint256 balance, uint256 nonce) external pure returns (TransactionLib.Account memory) {
        return TransactionLib.Account({balance: balance,nonce: nonce});
    }
    
    function createStateProof(
        address account,
        TransactionLib.Account memory accountData,
        bytes32[] memory proof,
        uint256 index,
        uint256 accountIndex
    ) external pure returns (StateLib.StateProof memory) {
        return StateLib.StateProof({
            account: account,
            accountData: accountData,
            merkleProof: MerkleLib.MerkleProof({proof: proof,index: index}),
            accountIndex: accountIndex
        });
    }
    
    function createMerkleProof(bytes32[] memory proof,uint256 index) external pure returns (MerkleLib.MerkleProof memory) {
        return MerkleLib.MerkleProof({proof: proof,index: index});
    }
    
    // integrated helpers
    function setupCompleteScenario(
        address user1,
        address user2,
        uint256 user1Balance,
        uint256 user2Balance,
        uint256 transferAmount,
        uint256 fee
    ) external pure returns (
        bytes32 preStateRoot,
        bytes32 correctPostStateRoot,
        TransactionLib.Transaction memory transaction,
        StateLib.StateProof memory user1PreProof,
        StateLib.StateProof memory user2PreProof
    ) {
        // create & sort accounts
        address[] memory accounts = new address[](2);
        TransactionLib.Account[] memory accountData = new TransactionLib.Account[](2);
        if (user1 < user2) {
            accounts[0] = user1;
            accounts[1] = user2;
            accountData[0] = TransactionLib.Account(user1Balance, 0);
            accountData[1] = TransactionLib.Account(user2Balance, 0);
        } else {
            accounts[0] = user2;
            accounts[1] = user1;
            accountData[0] = TransactionLib.Account(user2Balance, 0);
            accountData[1] = TransactionLib.Account(user1Balance, 0);
        }
        
        // Compute pre-state root
        preStateRoot = StateLib.computeStateRoot(accounts, accountData);
        
        // Create transaction
        transaction = TransactionLib.Transaction({
            from: user1,
            to: user2,
            amount: transferAmount,
            nonce: 0,
            fee: fee,
            signature: new bytes(0)
        });
        
        // Generate proofs for pre-state
        user1PreProof = StateLib.generateAccountProof(user1, accounts, accountData, preStateRoot);
        user2PreProof = StateLib.generateAccountProof(user2, accounts, accountData, preStateRoot);
        
        // execute, get correct post-state
        (
            TransactionLib.Account memory newuser1Account,
            TransactionLib.Account memory newuser2Account,
        ) = TransactionLib.execute(transaction, user1PreProof.accountData, user2PreProof.accountData);
        
        // post-state
        TransactionLib.Account[] memory postAccountData = new TransactionLib.Account[](2);
        if (user1 < user2) {
            postAccountData[0] = newuser1Account;
            postAccountData[1] = newuser2Account;
        } else {
            postAccountData[0] = newuser2Account;
            postAccountData[1] = newuser1Account;
        }
        
        correctPostStateRoot = StateLib.computeStateRoot(accounts, postAccountData);
    }
}