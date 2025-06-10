// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./TransactionLib.sol";
import "./MerkleLib.sol";

library StateLib {
    using TransactionLib for TransactionLib.Transaction;
    using MerkleLib for bytes32[];

    struct StateProof {
        address account;
        TransactionLib.Account accountData;
        MerkleLib.MerkleProof merkleProof;
        uint256 accountIndex;
    }
    
    struct StateTransition {
        bytes32 preStateRoot;
        bytes32 postStateRoot;
        TransactionLib.Transaction[] transactions;
        address[] affectedAccounts;
        TransactionLib.Account[] preAccountStates;
        TransactionLib.Account[] postAccountStates;
    }

    function computeStateRoot(address[] memory accounts, TransactionLib.Account[] memory accountData) internal pure returns (bytes32) {
        require(accounts.length == accountData.length, "Array length mismatch");
        require(accounts.length > 0, "Empty state");
        
        for (uint256 i = 1; i < accounts.length; i++) {
            require(accounts[i] > accounts[i-1], "Accounts not sorted");
        }
        
        // make account leaves for merkle tree
        bytes32[] memory leaves = new bytes32[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            leaves[i] = hashAccount(accounts[i], accountData[i]);
        }
        
        return MerkleLib.computeRoot(leaves);
    }

    function applyTransaction(TransactionLib.Transaction memory txn, mapping(address => TransactionLib.Account) storage state) 
        internal returns (TransactionLib.TransactionResult) 
    {
        TransactionLib.Account memory fromAccount = state[txn.from];
        TransactionLib.Account memory toAccount = state[txn.to];
        
        (
            TransactionLib.Account memory newFromAccount,
            TransactionLib.Account memory newToAccount,
            TransactionLib.TransactionResult result
        ) = TransactionLib.execute(txn, fromAccount, toAccount);
        
        if (result == TransactionLib.TransactionResult.SUCCESS) {
            state[txn.from] = newFromAccount;
            state[txn.to] = newToAccount;
        }
        
        return result;
    }

    function applyTransactionBatch(TransactionLib.Transaction[] memory transactions, mapping(address => TransactionLib.Account) storage state) 
        internal returns (uint256 successCount, uint256 failureCount) 
    {
        successCount = 0;
        failureCount = 0;
        
        for (uint256 i = 0; i < transactions.length; i++) {
            TransactionLib.TransactionResult result = applyTransaction(transactions[i], state);
            if (result == TransactionLib.TransactionResult.SUCCESS) {
                successCount++;
            } else {
                failureCount++;
            }
        }
    }

    function hashAccount(address account,TransactionLib.Account memory accountData) internal pure returns (bytes32) {
        return keccak256(abi.encode(account, accountData.balance, accountData.nonce));
    }


}