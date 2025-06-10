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

    function generateAccountProof(address targetAccount,address[] memory accounts,TransactionLib.Account[] memory accountData,bytes32 expectedStateRoot) 
        internal pure returns (StateProof memory) 
    {
        require(accounts.length == accountData.length, "Array length mismatch");
        
        // find target index
        uint256 accountIndex = type(uint256).max;
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == targetAccount) {
                accountIndex = i;
                break;
            }
        }
        require(accountIndex != type(uint256).max, "Account not found");
        
        // create leaves
        bytes32[] memory leaves = new bytes32[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            leaves[i] = hashAccount(accounts[i], accountData[i]);
        }
        
        // verify state root matches
        bytes32 computedRoot = MerkleLib.computeRoot(leaves);
        require(computedRoot == expectedStateRoot, "State root mismatch");
        
        MerkleLib.MerkleProof memory merkleProof = MerkleLib.generateProof(leaves, accountIndex);
        return StateProof({
            account: targetAccount,
            accountData: accountData[accountIndex],
            merkleProof: merkleProof,
            accountIndex: accountIndex
        });
    }
    
    function verifyAccountProof(StateProof memory proof, bytes32 stateRoot) internal pure returns (bool) {
        bytes32 accountLeaf = hashAccount(proof.account, proof.accountData);
        return MerkleLib.verifyProof(accountLeaf, stateRoot, proof.merkleProof);
    }
    
    function verifyStateTransition(StateTransition memory transition) internal pure returns (bool) {
        require(
            transition.affectedAccounts.length == transition.preAccountStates.length &&
            transition.preAccountStates.length == transition.postAccountStates.length,
            "Array length mismatch"
        );
        
        // create working state from pre-state
        // mapping(address => TransactionLib.Account) storage tempState;
        // note: can't create storage mappings in pure functions so this needs to be implemented differently in an actual contract...
        
        // for now, verify the transaction logic directly
        for (uint256 i = 0; i < transition.transactions.length; i++) {
            TransactionLib.Transaction memory txn = transition.transactions[i];
            
            // Find affected accounts
            (uint256 fromIndex, uint256 toIndex) = findAccountIndices(txn.from,txn.to,transition.affectedAccounts);
            
            if (fromIndex == type(uint256).max || toIndex == type(uint256).max) {
                return false; // accct not found in affected list
            }
            
            // verify transaction execution
            (
                TransactionLib.Account memory newFromAccount,
                TransactionLib.Account memory newToAccount,
                TransactionLib.TransactionResult result
            ) = TransactionLib.execute(txn, transition.preAccountStates[fromIndex],transition.preAccountStates[toIndex]);
            
            if (result != TransactionLib.TransactionResult.SUCCESS) {
                return false;
            }
            
            // update accounts for next transaction
            transition.preAccountStates[fromIndex] = newFromAccount;
            transition.preAccountStates[toIndex] = newToAccount;
        }
        
        // final states must match claimed post states
        for (uint256 i = 0; i < transition.affectedAccounts.length; i++) {
            if (transition.preAccountStates[i].balance != transition.postAccountStates[i].balance 
                || transition.preAccountStates[i].nonce != transition.postAccountStates[i].nonce) {
                return false;
            }
        }
        
        return true;
    }

    function hashAccount(address account,TransactionLib.Account memory accountData) internal pure returns (bytes32) {
        return keccak256(abi.encode(account, accountData.balance, accountData.nonce));
    }

    function findAccountIndices(address from, address to, address[] memory affectedAccounts) internal pure returns (uint256 fromIndex, uint256 toIndex) {
        fromIndex = type(uint256).max;
        toIndex = type(uint256).max;
        for (uint256 i = 0; i < affectedAccounts.length; i++) {
            if (affectedAccounts[i] == from) fromIndex = i;
            if (affectedAccounts[i] == to)   toIndex = i;
        }
    }

    function sortAccounts(address[] memory accounts, TransactionLib.Account[] memory accountData) 
        internal pure returns (address[] memory sortedAccounts, TransactionLib.Account[] memory sortedAccountData) 
    {
        require(accounts.length == accountData.length, "Array length mismatch");
        sortedAccounts = new address[](accounts.length);
        sortedAccountData = new TransactionLib.Account[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            sortedAccounts[i] = accounts[i];
            sortedAccountData[i] = accountData[i];
        }
        
        // sort by address //todo: do something better than bubble sort lol
        for (uint256 i = 0; i < sortedAccounts.length; i++) {
            for (uint256 j = 0; j < sortedAccounts.length - i - 1; j++) {
                if (sortedAccounts[j] > sortedAccounts[j + 1]) {
                    // swap accounts & their data
                    address tempAccount = sortedAccounts[j];
                    sortedAccounts[j] = sortedAccounts[j + 1];
                    sortedAccounts[j + 1] = tempAccount;
                    
                    TransactionLib.Account memory tempData = sortedAccountData[j];
                    sortedAccountData[j] = sortedAccountData[j + 1];
                    sortedAccountData[j + 1] = tempData;
                }
            }
        }
    }

    function isAccountsSorted(address[] memory accounts) internal pure returns (bool) {
        for (uint256 i = 1; i < accounts.length; i++) {
            if (accounts[i] <= accounts[i - 1]) return false;
        }
        return true;
    }

    function getAffectedAccounts(TransactionLib.Transaction[] memory transactions) internal pure returns (address[] memory uniqueAccounts) {
        // collect all accounts (w/ duplicates)
        address[] memory allAccounts = new address[](transactions.length * 2);
        for (uint256 i = 0; i < transactions.length; i++) {
            allAccounts[i * 2] = transactions[i].from;
            allAccounts[i * 2 + 1] = transactions[i].to;
        }
        
        // remove duplicates (simple approach)
        address[] memory tempUnique = new address[](allAccounts.length);
        uint256 uniqueCount = 0;
        
        for (uint256 i = 0; i < allAccounts.length; i++) {
            bool isDuplicate = false;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (tempUnique[j] == allAccounts[i]) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                tempUnique[uniqueCount] = allAccounts[i];
                uniqueCount++;
            }
        }
        
        // create final array with correct size
        uniqueAccounts = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            uniqueAccounts[i] = tempUnique[i];
        }
    }

    function calculateFeesCollected(TransactionLib.Transaction[] memory transactions) internal pure returns (uint256 totalFees) {
        totalFees = 0;
        for (uint256 i = 0; i < transactions.length; i++) totalFees += transactions[i].fee;
    }

}