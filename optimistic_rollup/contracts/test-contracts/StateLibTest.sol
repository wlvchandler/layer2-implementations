// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../lib/StateLib.sol";
import "../lib/TransactionLib.sol";
import "../lib/MerkleLib.sol";

contract StateLibTest {
    
    // Storage state for testing transaction application
    mapping(address => TransactionLib.Account) public testState;
    
    function computeStateRoot( address[] memory accounts, TransactionLib.Account[] memory accountData) external pure returns (bytes32) {
        return StateLib.computeStateRoot(accounts, accountData);
    }
    
    function hashAccount(address account,TransactionLib.Account memory accountData) external pure returns (bytes32) {
        return StateLib.hashAccount(account, accountData);
    }
    
    function applyTransaction(TransactionLib.Transaction memory txn) external returns (TransactionLib.TransactionResult) {
        return StateLib.applyTransaction(txn, testState);
    }
    
    function applyTransactionBatch(TransactionLib.Transaction[] memory transactions) external returns (uint256 successCount, uint256 failureCount) {
        return StateLib.applyTransactionBatch(transactions, testState);
    }
    
    function generateAccountProof(address targetAccount, address[] memory accounts, TransactionLib.Account[] memory accountData, bytes32 expectedStateRoot) 
        external pure returns (StateLib.StateProof memory) 
    {
        return StateLib.generateAccountProof(targetAccount, accounts, accountData, expectedStateRoot);
    }
    
    function verifyAccountProof(StateLib.StateProof memory proof,bytes32 stateRoot) external pure returns (bool) {
        return StateLib.verifyAccountProof(proof, stateRoot);
    }
    
    function verifyStateTransition(StateLib.StateTransition memory transition) external pure returns (bool) {
        return StateLib.verifyStateTransition(transition);
    }
    
    function findAccountIndices(address from, address to,address[] memory affectedAccounts) external pure returns (uint256 fromIndex, uint256 toIndex) {
        return StateLib.findAccountIndices(from, to, affectedAccounts);
    }
    
    function sortAccounts(address[] memory accounts,TransactionLib.Account[] memory accountData) external pure returns (address[] memory sortedAccounts, TransactionLib.Account[] memory sortedAccountData) {
        return StateLib.sortAccounts(accounts, accountData);
    }
    
    function isAccountsSorted(address[] memory accounts) external pure returns (bool) {
        return StateLib.isAccountsSorted(accounts);
    }
    
    function getAffectedAccounts(TransactionLib.Transaction[] memory transactions) external pure returns (address[] memory) {
        return StateLib.getAffectedAccounts(transactions);
    }
    
    function calculateFeesCollected(TransactionLib.Transaction[] memory transactions) external pure returns (uint256) {
        return StateLib.calculateFeesCollected(transactions);
    }
    

    // Helper functions 

    function setTestAccount(address account, uint256 balance, uint256 nonce) external {
        testState[account] = TransactionLib.Account({balance: balance,nonce: nonce});
    }
    
    function getTestAccount(address account) external view returns (TransactionLib.Account memory) {
        return testState[account];
    }
    
    function clearTestState(address[] memory accounts) external {
        for (uint256 i = 0; i < accounts.length; i++) {
            delete testState[accounts[i]];
        }
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
        return TransactionLib.Account({balance: balance, nonce: nonce});
    }
}