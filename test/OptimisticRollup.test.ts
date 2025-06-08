import { expect } from "chai";
import { ethers } from "hardhat";
import { HashZero } from "@ethersproject/constants";
import { OptimisticRollup } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Signer } from "ethers";

describe("OptimisticRollup", function () {
    let rollup: OptimisticRollup;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let operator: SignerWithAddress;
    let challenger: SignerWithAddress;

    // get signers & deploy contract
    this.beforeEach(async function () {
        [owner, user1, user2, operator, challenger] = await ethers.getSigners();
        const rollup_factory = await ethers.getContractFactory("OptimisticRollup");
        rollup = await rollup_factory.deploy();
        await rollup.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should init with correct genesis state", async function () {
            const [stateRoot, blockNum] = await rollup.getCurrentState();
            expect(blockNum).to.equal(0);
            expect(stateRoot).to.not.equal(HashZero); //instead of '0x00...00'

            const totalLocked = await rollup.totalValueLocked();
            expect(totalLocked).to.equal(0);
        });

        it("Should have zero balances initially", async function () {
            const user1bal = await rollup.getBalance(user1.address);
            const user2bal = await rollup.getBalance(user2.address);
            expect(user1bal).to.equal(0);
            expect(user2bal).to.equal(0);
        });
    });

    describe("Deposits", function () {
        it("Should allow deposits of eth", async function () {
            const amt = ethers.parseEther("1.0");
            await expect(rollup.connect(user1).deposit({ value: amt })).to.emit(rollup, "Deposit").withArgs(user1.address, amt);

            const l2bal = await rollup.getBalance(user1.address);
            expect(l2bal).to.equal(amt);

            const tvl = await rollup.totalValueLocked();
            expect(tvl).to.equal(amt);
        });

        it("Should reject deposits of 0 eth", async function () {
            await expect(rollup.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Error: No ETH to be deposited");
        });

        it("Should handle multiple deposits from 1 user", async function () {
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("0.5");

            await rollup.connect(user1).deposit({ value: deposit1 });
            await rollup.connect(user1).deposit({ value: deposit2 });

            const l2Balance = await rollup.getBalance(user1.address);
            expect(l2Balance).to.equal(deposit1 + deposit2);

            const totalLocked = await rollup.totalValueLocked();
            expect(totalLocked).to.equal(deposit1 + deposit2);
        });

        it("Should handle deposits from multiple users", async function () {
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("2.0");

            await rollup.connect(user1).deposit({ value: deposit1 });
            await rollup.connect(user2).deposit({ value: deposit2 });

            const balance1 = await rollup.getBalance(user1.address);
            const balance2 = await rollup.getBalance(user2.address);

            expect(balance1).to.equal(deposit1);
            expect(balance2).to.equal(deposit2);

            const totalLocked = await rollup.totalValueLocked();
            expect(totalLocked).to.equal(deposit1 + deposit2);
        });

        it("Should lock ETH in the contract", async function () {
            const depositAmount = ethers.parseEther("1.0");
            const contractAddress = await rollup.getAddress();

            const initialBalance = await ethers.provider.getBalance(contractAddress);
            expect(initialBalance).to.equal(0);

            await rollup.connect(user1).deposit({ value: depositAmount });
            const finalBalance = await ethers.provider.getBalance(contractAddress);
            expect(finalBalance).to.equal(depositAmount);
        });
    });

    describe("Account Structure", function () {
        it("Should track nonces correctly", async function () {
            const depositAmount = ethers.parseEther("1.0");
            await rollup.connect(user1).deposit({ value: depositAmount });
            const account = await rollup.accounts(user1.address);
            expect(account.balance).to.equal(depositAmount);
            expect(account.nonce).to.equal(0); // Should start at 0
        });
    });

    describe("Batch Submission", function () {
        const operatorBond = ethers.parseEther("1.0");

        beforeEach(async function () {
            await rollup.connect(user1).deposit({ value: ethers.parseEther("5.0") });
            await rollup.connect(user2).deposit({ value: ethers.parseEther("3.0") });
        });

        it("Should allow operators to submit valid batches", async function () {
            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [
                ethers.toUtf8Bytes("tx1"),
                ethers.toUtf8Bytes("tx2")
            ];
            const txRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await expect(rollup.connect(operator).submitRollupBlock(newStateRoot, txRoot, transactions, { value: operatorBond }))
                .to.emit(rollup, "RollupBlockSubmitted")
                .withArgs(1, newStateRoot, txRoot, operator.address);

            const [currentStateRoot, blockNum] = await rollup.getCurrentState();
            expect(currentStateRoot).to.equal(newStateRoot);
            expect(blockNum).to.equal(1);

            const rollupBlock = await rollup.getRollupBlock(1);
            expect(rollupBlock.stateRoot).to.equal(newStateRoot);
            expect(rollupBlock.txRoot).to.equal(txRoot);
            expect(rollupBlock.operator).to.equal(operator.address);
            expect(rollupBlock.finalized).to.be.false;
            expect(rollupBlock.challenged).to.be.false;
        });

        it("Should reject submissions without sufficient bond", async function () {
            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const txRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await expect(rollup.connect(operator).submitRollupBlock(newStateRoot, txRoot, transactions, { value: ethers.parseEther("0.5") }))
                .to.be.revertedWith("Insufficient bond");
        });

        it("Should reject invalid state roots", async function () {
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const txRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await expect(rollup.connect(operator).submitRollupBlock(HashZero, txRoot, transactions, { value: operatorBond }))
                .to.be.revertedWith("Invalid state root");
        });

        it("Should reject invalid transaction roots", async function () {
            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const wrongtxRoot = ethers.keccak256(ethers.toUtf8Bytes("wrong"));

            await expect(rollup.connect(operator).submitRollupBlock(newStateRoot, wrongtxRoot, transactions, { value: operatorBond }))
                .to.be.revertedWith("Invalid tx root");
        });

        it("Should track operator bonds correctly", async function () {
            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const txRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await rollup.connect(operator).submitRollupBlock(newStateRoot, txRoot, transactions, { value: operatorBond });

            const bond = await rollup.getOperatorBond(operator.address);
            expect(bond).to.equal(operatorBond);
        });

        it("Should handle multiple batch submissions", async function () {
            const newStateRoot1 = ethers.keccak256(ethers.toUtf8Bytes("new-state-1"));
            const newStateRoot2 = ethers.keccak256(ethers.toUtf8Bytes("new-state-2"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const txRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await rollup.connect(operator).submitRollupBlock(newStateRoot1, txRoot, transactions, { value: operatorBond });
            await rollup.connect(operator).submitRollupBlock(newStateRoot2, txRoot, transactions, { value: operatorBond });

            const [currentStateRoot, blockNum] = await rollup.getCurrentState();
            expect(currentStateRoot).to.equal(newStateRoot2);
            expect(blockNum).to.equal(2);

            const bond = await rollup.getOperatorBond(operator.address);
            expect(bond).to.equal(operatorBond * 2n);
        });
    });

    describe("Challenge System", function () {
        const operatorBond = ethers.parseEther("1.0");
        let blockNum: number;

        beforeEach(async function () {
            await rollup.connect(user1).deposit({ value: ethers.parseEther("5.0") });

            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const transactionRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await rollup.connect(operator).submitRollupBlock(newStateRoot, transactionRoot, transactions, { value: operatorBond });
            blockNum = 1;
        });

        it("Should allow challenges during challenge period", async function () {
            const fraudProof = ethers.toUtf8Bytes("fraud-proof-data");

            expect(await rollup.canChallenge(blockNum)).to.be.true;

            await expect(rollup.connect(challenger).challengeBlock(blockNum, fraudProof))
                .to.emit(rollup, "Challenge")
                .withArgs(blockNum, challenger.address);

            const rollupBlock = await rollup.getRollupBlock(blockNum);
            expect(rollupBlock.challenged).to.be.true;
            expect(rollupBlock.finalized).to.be.false;
        });

        it("Should slash operator bond on valid challenge", async function () {
            const fraudProof = ethers.toUtf8Bytes("fraud-proof-data");
            const challengerInitialBalance = await ethers.provider.getBalance(challenger.address);

            await rollup.connect(challenger).challengeBlock(blockNum, fraudProof);

            // Operator bond should be slashed
            const operatorBond = await rollup.getOperatorBond(operator.address);
            expect(operatorBond).to.equal(0);

            // Challenger should receive reward (50% of slashed amount)
            const challengerFinalBalance = await ethers.provider.getBalance(challenger.address);
            const expectedReward = ethers.parseEther("0.5"); // 50% of 1 ETH

            // Account for gas costs in the check
            expect(challengerFinalBalance).to.be.gt(challengerInitialBalance + expectedReward - ethers.parseEther("0.01"));
        });

        it("Should reject challenges on already challenged blocks", async function () {
            const fraudProof = ethers.toUtf8Bytes("fraud-proof-data");

            await rollup.connect(challenger).challengeBlock(blockNum, fraudProof);

            await expect(rollup.connect(challenger).challengeBlock(blockNum, fraudProof)).to.be.revertedWith("Block already challenged");
        });

        it("Should reject challenges on non-existent blocks", async function () {
            const fraudProof = ethers.toUtf8Bytes("fraud-proof-data");

            await expect(rollup.connect(challenger).challengeBlock(999, fraudProof))
                .to.be.revertedWith("Block does not exist");
        });
    });

    describe("Finalization System", function () {
        const operatorBond = ethers.parseEther("1.0");
        let blockNum: number;

        beforeEach(async function () {
            await rollup.connect(user1).deposit({ value: ethers.parseEther("5.0") });

            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const transactionRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await rollup.connect(operator).submitRollupBlock(newStateRoot, transactionRoot, transactions, { value: operatorBond });
            blockNum = 1;
        });

        it("Should reject finalization during challenge period", async function () {
            expect(await rollup.canFinalize(blockNum)).to.be.false;

            await expect(rollup.finalizeBlock(blockNum)).to.be.revertedWith("Challenge period not expired");
        });

        it("Should allow finalization after challenge period", async function () {
            // fast forward past challenge period
            await ethers.provider.send("hardhat_mine", ["0xc4e1"]); // mine 50400 blocks

            expect(await rollup.canFinalize(blockNum)).to.be.true;
            await expect(rollup.finalizeBlock(blockNum)).to.emit(rollup, "BlockFinalized").withArgs(blockNum);

            const rollupBlock = await rollup.getRollupBlock(blockNum);
            expect(rollupBlock.finalized).to.be.true;
        });

        it("Should return operator bond on finalization", async function () {
            const operatorInitialBalance = await ethers.provider.getBalance(operator.address);

            // Fast forward past challenge period
            await ethers.provider.send("hardhat_mine", ["0xc4e0"]);

            await rollup.finalizeBlock(blockNum);

            // Operator bond should be returned
            const operatorBondAfter = await rollup.getOperatorBond(operator.address);
            expect(operatorBondAfter).to.equal(0);
            const operatorFinalBalance = await ethers.provider.getBalance(operator.address);
            expect(operatorFinalBalance).to.be.gt(operatorInitialBalance + operatorBond - ethers.parseEther("0.01"));
        });

        it("Should reject finalization of challenged blocks", async function () {
            const fraudProof = ethers.toUtf8Bytes("fraud-proof-data");

            await rollup.connect(challenger).challengeBlock(blockNum, fraudProof);

            // Fast forward past challenge period
            await ethers.provider.send("hardhat_mine", ["0xc4e0"]);

            await expect(rollup.finalizeBlock(blockNum))
                .to.be.revertedWith("Block was challenged");
        });

        it("Should reject double finalization", async function () {
            // Fast forward past challenge period
            await ethers.provider.send("hardhat_mine", ["0xc4e0"]);

            await rollup.finalizeBlock(blockNum);

            await expect(rollup.finalizeBlock(blockNum))
                .to.be.revertedWith("Block already finalized");
        });
    });

    describe("View Functions", function () {
        it("Should correctly report challenge and finalization status", async function () {
            const operatorBond = ethers.parseEther("1.0");
            await rollup.connect(user1).deposit({ value: ethers.parseEther("5.0") });

            const newStateRoot = ethers.keccak256(ethers.toUtf8Bytes("new-state"));
            const transactions = [ethers.toUtf8Bytes("tx1")];
            const transactionRoot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes[]"], [transactions]));

            await rollup.connect(operator).submitRollupBlock(newStateRoot, transactionRoot, transactions, { value: operatorBond });

            // Initially can challenge, cannot finalize
            expect(await rollup.canChallenge(1)).to.be.true;
            expect(await rollup.canFinalize(1)).to.be.false;

            // After challenge period
            await ethers.provider.send("hardhat_mine", ["0xc4e1"]);

            expect(await rollup.canChallenge(1)).to.be.false;
            expect(await rollup.canFinalize(1)).to.be.true;
        });
    });

});