import { expect } from "chai";
import { ethers } from "hardhat";

describe("StateLib", function () {
    let contract: any;
    let user1: any, user2: any, user3: any;

    beforeEach(async function () {
        [user1, user2, user3] = await ethers.getSigners();
        const factory = await ethers.getContractFactory("StateLibTest");
        contract = await factory.deploy();
        await contract.waitForDeployment();
    });

    function makeAccount(balance: bigint, nonce: bigint) {
        return { balance, nonce };
    }

    function makeTx(from: string, to: string, amount: bigint, nonce: bigint, fee: bigint) {
        return { from, to, amount, nonce, fee, signature: "0x" };
    }

    describe("state root computation", function () {
        it("handles single account", async function () {
            const accounts = [user1.address];
            const accountData = [makeAccount(ethers.parseEther("10"), 0n)];

            const stateRoot = await contract.computeStateRoot(accounts, accountData);
            expect(stateRoot).to.be.properHex(64);
        });

        it("handles multiple accounts", async function () {
            const accounts = [user1.address, user2.address, user3.address].sort();
            const accountData = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 1n),
                makeAccount(ethers.parseEther("15"), 2n)
            ];

            const stateRoot = await contract.computeStateRoot(accounts, accountData);
            expect(stateRoot).to.be.properHex(64);
        });

        it("gives different roots for different states", async function () {
            const accounts = [user1.address, user2.address].sort();

            const accountData1 = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 0n)
            ];

            const accountData2 = [
                makeAccount(ethers.parseEther("8"), 0n),
                makeAccount(ethers.parseEther("7"), 0n)
            ];

            const root1 = await contract.computeStateRoot(accounts, accountData1);
            const root2 = await contract.computeStateRoot(accounts, accountData2);
            expect(root1).to.not.equal(root2);
        });

        it("rejects unsorted accounts", async function () {
            const accounts = [user2.address, user1.address]; // unsorted
            const accountData = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 0n)
            ];

            await expect(contract.computeStateRoot(accounts, accountData)).to.be.revertedWith("Accounts not sorted");
        });

        it("rejects mismatched arrays", async function () {
            const accounts = [user1.address];
            const accountData = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 0n)
            ];

            await expect(contract.computeStateRoot(accounts, accountData)).to.be.revertedWith("Array length mismatch");
        });

        it("rejects empty state", async function () {
            await expect(contract.computeStateRoot([], []))
                .to.be.revertedWith("Empty state");
        });
    });

    describe("account hashing", function () {
        it("hashes consistently", async function () {
            const accountData = makeAccount(ethers.parseEther("10"), 5n);
            const hash1 = await contract.hashAccount(user1.address, accountData);
            const hash2 = await contract.hashAccount(user1.address, accountData);
            expect(hash1).to.equal(hash2);
        });

        it("different accounts give different hashes", async function () {
            const accountData = makeAccount(ethers.parseEther("10"), 5n);

            const hash1 = await contract.hashAccount(user1.address, accountData);
            const hash2 = await contract.hashAccount(user2.address, accountData);
            expect(hash1).to.not.equal(hash2);
        });

        it("different balances give different hashes", async function () {
            const accountData1 = makeAccount(ethers.parseEther("10"), 5n);
            const accountData2 = makeAccount(ethers.parseEther("11"), 5n);
            const hash1 = await contract.hashAccount(user1.address, accountData1);
            const hash2 = await contract.hashAccount(user1.address, accountData2);
            expect(hash1).to.not.equal(hash2);
        });
    });

    describe("transaction application", function () {
        beforeEach(async function () {
            // setup initial state
            await contract.setTestAccount(user1.address, ethers.parseEther("10"), 0);
            await contract.setTestAccount(user2.address, ethers.parseEther("5"), 0);
        });

        afterEach(async function () {
            await contract.clearTestState([user1.address, user2.address, user3.address]);
        });

        it("applies valid transactions", async function () {
            const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

            const result = await contract.applyTransaction(tx);
            expect(result).to.equal(0); // success

            const user1Account = await contract.getTestAccount(user1.address);
            const user2Account = await contract.getTestAccount(user2.address);

            expect(user1Account.balance).to.equal(ethers.parseEther("7.9")); // 10 - 2 - 0.1
            expect(user1Account.nonce).to.equal(1n);
            expect(user2Account.balance).to.equal(ethers.parseEther("7")); // 5 + 2
            expect(user2Account.nonce).to.equal(0n);
        });

        it("rejects insufficient balance", async function () {
            const tx = makeTx(user1.address, user2.address, ethers.parseEther("15"), 0n, ethers.parseEther("0.1"));

            const result = await contract.applyTransaction(tx);
            expect(result).to.equal(1); // INSUFFICIENT_BALANCE

            const user1Account = await contract.getTestAccount(user1.address);
            expect(user1Account.balance).to.equal(ethers.parseEther("10"));
            expect(user1Account.nonce).to.equal(0n);
        });

        it("rejects wrong nonce", async function () {
            const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 5n, ethers.parseEther("0.1"));

            const result = await contract.applyTransaction(tx);
            expect(result).to.equal(2); // INVALID_NONCE

            const user1Account = await contract.getTestAccount(user1.address);
            expect(user1Account.balance).to.equal(ethers.parseEther("10"));
            expect(user1Account.nonce).to.equal(0n);
        });

        it("applies transaction batches", async function () {
            const transactions = [
                makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.05")),
                makeTx(user1.address, user2.address, ethers.parseEther("2"), 1n, ethers.parseEther("0.05"))
            ];

            const [successCount, failureCount] = await contract.applyTransactionBatch(transactions);

            expect(successCount).to.equal(2);
            expect(failureCount).to.equal(0);

            const user1Account = await contract.getTestAccount(user1.address);
            const user2Account = await contract.getTestAccount(user2.address);

            expect(user1Account.balance).to.equal(ethers.parseEther("6.9")); // 10 - 1 - 2 - 0.05 - 0.05
            expect(user1Account.nonce).to.equal(2n);
            expect(user2Account.balance).to.equal(ethers.parseEther("8")); // 5 + 1 + 2
        });
    });

    describe("account proofs", function () {
        it("generates and verifies proofs", async function () {
            const accounts = [user1.address, user2.address].sort();
            const accountData = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 1n)
            ];

            // sort data to match sorted accounts
            const sortedData = accounts[0] === user1.address ? accountData : [accountData[1], accountData[0]];

            const stateRoot = await contract.computeStateRoot(accounts, sortedData);

            const proof = await contract.generateAccountProof(user1.address, accounts, sortedData, stateRoot);

            expect(proof.account).to.equal(user1.address);
            expect(proof.accountData.balance).to.equal(ethers.parseEther("10"));
            expect(proof.accountData.nonce).to.equal(0n);

            const isValid = await contract.verifyAccountProof(proof, stateRoot);
            expect(isValid).to.be.true;
        });

        it("rejects wrong state root", async function () {
            const accounts = [user1.address];
            const accountData = [makeAccount(ethers.parseEther("10"), 0n)];
            const stateRoot = await contract.computeStateRoot(accounts, accountData);
            const proof = await contract.generateAccountProof(user1.address, accounts, accountData, stateRoot);
            const wrongStateRoot = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
            const isValid = await contract.verifyAccountProof(proof, wrongStateRoot);
            expect(isValid).to.be.false;
        });

        it("rejects non-existent accounts", async function () {
            const accounts = [user1.address];
            const accountData = [makeAccount(ethers.parseEther("10"), 0n)];
            const stateRoot = await contract.computeStateRoot(accounts, accountData);
            await expect(contract.generateAccountProof(user2.address, accounts, accountData, stateRoot)).to.be.revertedWith("Account not found");
        });
    });

    describe("account sorting", function () {
        it("sorts accounts correctly", async function () {
            const accounts = [user3.address, user1.address, user2.address];
            const accountData = [
                makeAccount(ethers.parseEther("15"), 2n),
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 1n)
            ];

            const [sortedAccounts, sortedAccountData] = await contract.sortAccounts(accounts, accountData);

            expect(await contract.isAccountsSorted(sortedAccounts)).to.be.true;

            // check data moved with accounts
            for (let i = 0; i < sortedAccounts.length; i++) {
                if (sortedAccounts[i] === user1.address) {
                    expect(sortedAccountData[i].balance).to.equal(ethers.parseEther("10"));
                    expect(sortedAccountData[i].nonce).to.equal(0n);
                } else if (sortedAccounts[i] === user2.address) {
                    expect(sortedAccountData[i].balance).to.equal(ethers.parseEther("5"));
                    expect(sortedAccountData[i].nonce).to.equal(1n);
                } else if (sortedAccounts[i] === user3.address) {
                    expect(sortedAccountData[i].balance).to.equal(ethers.parseEther("15"));
                    expect(sortedAccountData[i].nonce).to.equal(2n);
                }
            }
        });

        it("detects unsorted accounts", async function () {
            const sortedAccounts = [user1.address, user2.address, user3.address].sort();
            const unsortedAccounts = [user2.address, user1.address, user3.address];

            expect(await contract.isAccountsSorted(sortedAccounts)).to.be.true;
            expect(await contract.isAccountsSorted(unsortedAccounts)).to.be.false;
        });
    });

    describe("helper functions", function () {
        it("finds affected accounts", async function () {
            const transactions = [
                makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")),
                makeTx(user2.address, user3.address, ethers.parseEther("0.5"), 0n, ethers.parseEther("0.01")),
                makeTx(user1.address, user3.address, ethers.parseEther("2"), 1n, ethers.parseEther("0.01"))
            ];

            const affectedAccounts = await contract.getAffectedAccounts(transactions);

            expect(affectedAccounts.length).to.equal(3);
            expect(affectedAccounts).to.include(user1.address);
            expect(affectedAccounts).to.include(user2.address);
            expect(affectedAccounts).to.include(user3.address);
        });

        it("calculates total fees", async function () {
            const transactions = [
                makeTx(user1.address, user2.address, ethers.parseEther("1"), 0n, ethers.parseEther("0.01")),
                makeTx(user2.address, user3.address, ethers.parseEther("0.5"), 0n, ethers.parseEther("0.02")),
                makeTx(user1.address, user3.address, ethers.parseEther("2"), 1n, ethers.parseEther("0.03"))
            ];

            const totalFees = await contract.calculateFeesCollected(transactions);
            expect(totalFees).to.equal(ethers.parseEther("0.06")); // 0.01 + 0.02 + 0.03
        });

        it("finds account indices", async function () {
            const affectedAccounts = [user1.address, user2.address, user3.address];

            const [fromIndex, toIndex] = await contract.findAccountIndices(
                user1.address,
                user3.address,
                affectedAccounts
            );

            expect(fromIndex).to.equal(0);
            expect(toIndex).to.equal(2);
        });

        it("returns max uint for missing accounts", async function () {
            const affectedAccounts = [user1.address, user2.address];

            const [fromIndex, toIndex] = await contract.findAccountIndices(
                user3.address, // not in array
                user1.address,
                affectedAccounts
            );

            expect(fromIndex).to.equal(ethers.MaxUint256);
            expect(toIndex).to.equal(0);
        });
    });

    describe("integration", function () {
        it("does complete state management flow", async function () {
            // create initial state
            const accounts = [user1.address, user2.address].sort();
            const initialData = [
                makeAccount(ethers.parseEther("10"), 0n),
                makeAccount(ethers.parseEther("5"), 0n)
            ];

            // sort data to match sorted accounts
            const sortedData = accounts[0] === user1.address ? initialData : [initialData[1], initialData[0]];

            const initialStateRoot = await contract.computeStateRoot(accounts, sortedData);

            // generate proof for user1's initial balance
            const user1Proof = await contract.generateAccountProof(user1.address, accounts, sortedData, initialStateRoot);

            // verify the proof
            const isValidProof = await contract.verifyAccountProof(user1Proof, initialStateRoot);
            expect(isValidProof).to.be.true;

            // create transaction
            const tx = makeTx(user1.address, user2.address, ethers.parseEther("2"), 0n, ethers.parseEther("0.1"));

            // demonstrate state transition logic
            const affectedAccounts = await contract.getAffectedAccounts([tx]);
            expect(affectedAccounts.length).to.equal(2);
            expect(affectedAccounts).to.include(user1.address);
            expect(affectedAccounts).to.include(user2.address);

            // calculate fees
            const totalFees = await contract.calculateFeesCollected([tx]);
            expect(totalFees).to.equal(ethers.parseEther("0.1"));
        });
    });
});