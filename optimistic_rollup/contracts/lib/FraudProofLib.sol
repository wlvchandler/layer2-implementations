// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./TransactionLib.sol";
import "./MerkleLib.sol";
import "./StateLib.sol";

library FraudProofLib {
    using TransactionLib for TransactionLib.Transaction;
    using MerkleLib for bytes32[];
    using StateLib for StateLib.StateProof;
    
    enum FraudType {
        INVALID_STATE_TRANSITION,
        INVALID_TRANSACTION,
        INVALID_PRE_STATE,
        INVALID_POST_STATE,
        INCORRECT_EXECUTION
    }
    
    struct FraudProof {
        // tx being challenged
        TransactionLib.Transaction transaction;
        
        StateLib.StateProof fromAccountProof;
        StateLib.StateProof toAccountProof;
        
        bytes32 claimedPostStateRoot;
        StateLib.StateProof claimedFromAccountProof;
        StateLib.StateProof claimedToAccountProof;
        bytes32 preStateRoot;
        
        uint256 transactionIndex;  // position in batch
        bytes32 transactionRoot;   // merkle root of batch
        MerkleLib.MerkleProof transactionMerkleProof;  // proof transaction is in batch
    }
    
    struct FraudResult {
        bool isFraud;
        FraudType fraudType;
        bytes32 correctPostStateRoot;
        string reason;
    }
    
    function verifyFraudProof(FraudProof memory proof) internal pure returns (FraudResult memory) {
        if (!verifyTransactionInclusion(proof)) {
            return FraudResult({
                isFraud: false,
                fraudType: FraudType.INVALID_TRANSACTION,
                correctPostStateRoot: bytes32(0),
                reason: "Transaction not in claimed batch"
            });
        }
        
        if (!verifyPreStateProofs(proof)) {
            return FraudResult({
                isFraud: true,
                fraudType: FraudType.INVALID_PRE_STATE,
                correctPostStateRoot: bytes32(0),
                reason: "Invalid pre-state proofs"
            });
        }
        
        // execute transaction, compute correct post-state
        (
            TransactionLib.Account memory correctFromAccount,
            TransactionLib.Account memory correctToAccount,
            TransactionLib.TransactionResult result
        ) = TransactionLib.execute(proof.transaction,proof.fromAccountProof.accountData, proof.toAccountProof.accountData);
        
        bytes32 correctPostStateRoot = computeCorrectPostState(proof, correctFromAccount, correctToAccount);
        
        // Compare with claimed post-state
        if (correctPostStateRoot != proof.claimedPostStateRoot) {
            return FraudResult({
                isFraud: true,
                fraudType: FraudType.INVALID_STATE_TRANSITION,
                correctPostStateRoot: correctPostStateRoot,
                reason: "Operator computed incorrect post-state"
            });
        }
        
        if (!verifyPostStateProofs(proof, correctFromAccount, correctToAccount)) {
            return FraudResult({
                isFraud: true,
                fraudType: FraudType.INVALID_POST_STATE,
                correctPostStateRoot: correctPostStateRoot,
                reason: "Claimed post-state proofs don't match computed state"
            });
        }
        
        if (result != TransactionLib.TransactionResult.SUCCESS) {
            return FraudResult({
                isFraud: true,
                fraudType: FraudType.INVALID_TRANSACTION,
                correctPostStateRoot: proof.preStateRoot, // State should be unchanged
                reason: "Transaction should have failed but was included"
            });
        }
        
        return FraudResult({
            isFraud: false,
            fraudType: FraudType.INVALID_STATE_TRANSITION,
            correctPostStateRoot: correctPostStateRoot,
            reason: "No fraud detected"
        });
    }
    
    function verifyTransactionInclusion(FraudProof memory proof) internal pure returns (bool) {
        bytes32 transactionLeaf = TransactionLib.getMerkleLeaf(proof.transaction);
        return MerkleLib.verifyProof(transactionLeaf,proof.transactionRoot,proof.transactionMerkleProof);
    }
    
    function verifyPreStateProofs(FraudProof memory proof) internal pure returns (bool) {
        // Verify from account proof
        bool fromValid = StateLib.verifyAccountProof(proof.fromAccountProof,proof.preStateRoot);
        bool toValid = StateLib.verifyAccountProof(proof.toAccountProof, proof.preStateRoot);
        
        // accounts must match transaction
        bool accountsMatch = (proof.fromAccountProof.account == proof.transaction.from && proof.toAccountProof.account == proof.transaction.to);
        return fromValid && toValid && accountsMatch;
    }
    
    function verifyPostStateProofs(FraudProof memory proof, TransactionLib.Account memory correctFromAccount,TransactionLib.Account memory correctToAccount) internal pure returns (bool) {
        // check claimed from account matches computed
        bool fromMatches = (
            proof.claimedFromAccountProof.accountData.balance == correctFromAccount.balance &&
            proof.claimedFromAccountProof.accountData.nonce == correctFromAccount.nonce
        );
        
        // check claimed to account matches computed
        bool toMatches = (
            proof.claimedToAccountProof.accountData.balance == correctToAccount.balance &&
            proof.claimedToAccountProof.accountData.nonce == correctToAccount.nonce
        );
        
        // verify proofs are valid against claimed post-state root
        bool fromProofValid = StateLib.verifyAccountProof(
            proof.claimedFromAccountProof,
            proof.claimedPostStateRoot
        );
        
        bool toProofValid = StateLib.verifyAccountProof(
            proof.claimedToAccountProof,
            proof.claimedPostStateRoot
        );
        
        return fromMatches && toMatches && fromProofValid && toProofValid;
    }
    
    function computeCorrectPostState(FraudProof memory proof, TransactionLib.Account memory correctFromAccount, TransactionLib.Account memory correctToAccount) internal pure returns (bytes32) {
        // create arrays with updated accounts
        address[] memory accounts = new address[](2);
        TransactionLib.Account[] memory accountData = new TransactionLib.Account[](2);
        
        // sorting by account for deterministic ordering
        if (proof.transaction.from < proof.transaction.to) {
            accounts[0] = proof.transaction.from;
            accounts[1] = proof.transaction.to;
            accountData[0] = correctFromAccount;
            accountData[1] = correctToAccount;
        } else {
            accounts[0] = proof.transaction.to;
            accounts[1] = proof.transaction.from;
            accountData[0] = correctToAccount;
            accountData[1] = correctFromAccount;
        }
        
        return StateLib.computeStateRoot(accounts, accountData);
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
    ) internal pure returns (FraudProof memory) {
        return FraudProof({
            transaction: transaction,
            fromAccountProof: fromAccountProof,
            toAccountProof: toAccountProof,
            claimedPostStateRoot: claimedPostStateRoot,
            claimedFromAccountProof: claimedFromAccountProof,
            claimedToAccountProof: claimedToAccountProof,
            preStateRoot: preStateRoot,
            transactionIndex: transactionIndex,
            transactionRoot: transactionRoot,
            transactionMerkleProof: transactionMerkleProof
        });
    }
    
    function verifyTransactionExecution(
        TransactionLib.Transaction memory transaction,
        TransactionLib.Account memory preFromAccount,
        TransactionLib.Account memory preToAccount,
        TransactionLib.Account memory claimedFromAccount,
        TransactionLib.Account memory claimedToAccount
    ) internal pure returns (bool isValid, string memory reason) {
        (
            TransactionLib.Account memory correctFromAccount,
            TransactionLib.Account memory correctToAccount,
            TransactionLib.TransactionResult result
        ) = TransactionLib.execute(transaction, preFromAccount, preToAccount);
        
        if (result != TransactionLib.TransactionResult.SUCCESS) {
            return (false, "Transaction should have failed");
        }
        
        bool fromCorrect = (correctFromAccount.balance == claimedFromAccount.balance && correctFromAccount.nonce == claimedFromAccount.nonce);
        bool toCorrect = (correctToAccount.balance == claimedToAccount.balance &&correctToAccount.nonce == claimedToAccount.nonce);
        
        if (!fromCorrect) {
            return (false, "From account state incorrect");
        }
        
        if (!toCorrect) {
            return (false, "To account state incorrect");
        }
        
        return (true, "Transaction execution correct");
    }
    
    function verifyBatchExecution(
        TransactionLib.Transaction[] memory transactions, 
        //bytes32 preStateRoot, bytes32 claimedPostStateRoot, 
        address[] memory affectedAccounts, TransactionLib.Account[] memory preAccountStates, 
        TransactionLib.Account[] memory claimedPostAccountStates
    ) internal pure returns (bool isValid, uint256 firstFraudIndex) {
        require(
            affectedAccounts.length == preAccountStates.length &&
            preAccountStates.length == claimedPostAccountStates.length,
            "Array length mismatch"
        );
        
        // Create working state
        //mapping(address => TransactionLib.Account) storage workingState;
        // Note: This would need to be implemented differently in practice
        // since we can't create storage mappings in pure functions
        
        // For now, verify each transaction individually
        TransactionLib.Account[] memory currentState = new TransactionLib.Account[](preAccountStates.length);
        for (uint256 i = 0; i < preAccountStates.length; i++) {
            currentState[i] = preAccountStates[i];
        }
        
        for (uint256 i = 0; i < transactions.length; i++) {
            TransactionLib.Transaction memory txn = transactions[i];
            
            // find affected accounts
            (uint256 fromIndex, uint256 toIndex) = StateLib.findAccountIndices(txn.from,txn.to,affectedAccounts);
            
            if (fromIndex == type(uint256).max || toIndex == type(uint256).max) {
                return (false, i); // account not found
            }
            
            // execute transaction
            (
                TransactionLib.Account memory newFromAccount,
                TransactionLib.Account memory newToAccount,
                TransactionLib.TransactionResult result
            ) = TransactionLib.execute(txn, currentState[fromIndex], currentState[toIndex]);
            
            if (result != TransactionLib.TransactionResult.SUCCESS) {
                return (false, i); // Transaction should have failed
            }
            
            currentState[fromIndex] = newFromAccount;
            currentState[toIndex] = newToAccount;
        }
        
        // verify final state matches claimed state
        for (uint256 i = 0; i < affectedAccounts.length; i++) {
            if (currentState[i].balance != claimedPostAccountStates[i].balance ||currentState[i].nonce != claimedPostAccountStates[i].nonce) {
                return (false, type(uint256).max); // Final state mismatch
            }
        }
        
        return (true, 0);
    }
    
    function getFraudTypeDescription(FraudType fraudType) internal pure returns (string memory) {
        if (fraudType == FraudType.INVALID_STATE_TRANSITION) {
            return "Invalid state transition computation";
        } else if (fraudType == FraudType.INVALID_TRANSACTION) {
            return "Invalid transaction included in batch";
        } else if (fraudType == FraudType.INVALID_PRE_STATE) {
            return "Invalid pre-state proof provided";
        } else if (fraudType == FraudType.INVALID_POST_STATE) {
            return "Invalid post-state proof provided";
        } else if (fraudType == FraudType.INCORRECT_EXECUTION) {
            return "Transaction executed incorrectly";
        } else {
            return "Unknown fraud type";
        }
    }
}