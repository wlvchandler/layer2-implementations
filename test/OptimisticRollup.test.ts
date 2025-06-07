import {expect} from "chai";
import {ethers} from "hardhat";
import { HashZero } from "@ethersproject/constants";
import {OptimisticRollup} from "../typechain-types";
import {SignerWithAddress} from "@nomicfoundation/hardhat-ethers/signers";

describe("OptimisticRollup", function() {
    let rollup: OptimisticRollup;
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    // get signers & deploy contract
    this.beforeEach(async function() {
        [owner, user1, user2] = await ethers.getSigners();
        const rollup_factory = await ethers.getContractFactory("OptimisticRollup");
        rollup = await rollup_factory.deploy();
        await rollup.waitForDeployment();
    });

    describe("Deployment", function() {
        it ("Should init with correct genesis state", async function(){
            const [stateRoot, blockNum] = await rollup.getCurrentState();
            expect(blockNum).to.equal(0);
            expect(stateRoot).to.not.equal(HashZero); //instead of '0x00...00'

            const totalLocked = await rollup.totalValueLocked();
            expect(totalLocked).to.equal(0);
        });

        it ("Should have zero balances initially", async function(){
            const user1bal = await rollup.getBalance(user1.address);
            const user2bal = await rollup.getBalance(user2.address);
            expect(user1bal).to.equal(0);
            expect(user2bal).to.equal(0);
        });
    });

    describe("Deposits", function() {
        it ("Should allow deposits of eth", async function(){
            const amt = ethers.parseEther("1.0");
            await expect(rollup.connect(user1).deposit({value: amt})).to.emit(rollup, "Deposit").withArgs(user1.address, amt);
            
            const l2bal = await rollup.getBalance(user1.address);
            expect(l2bal).to.equal(amt);

            const tvl = await rollup.totalValueLocked();
            expect (tvl).to.equal(amt);
        });

        it ("Should reject deposits of 0 eth", async function(){
            await expect(rollup.connect(user1).deposit({ value: 0 })).to.be.revertedWith("Error: No ETH to be deposited");
        });

        it ("Should handle multiple deposits from 1 user", async function(){
            const deposit1 = ethers.parseEther("1.0");
            const deposit2 = ethers.parseEther("0.5");
            
            await rollup.connect(user1).deposit({ value: deposit1 });
            await rollup.connect(user1).deposit({ value: deposit2 });
            
            const l2Balance = await rollup.getBalance(user1.address);
            expect(l2Balance).to.equal(deposit1 + deposit2);
            
            const totalLocked = await rollup.totalValueLocked();
            expect(totalLocked).to.equal(deposit1 + deposit2);            
        });

        it ("Should handle deposits from multiple users", async function(){
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

        it ("Should lock ETH in the contract", async function(){
            const depositAmount = ethers.parseEther("1.0");
            const contractAddress = await rollup.getAddress();
            
            const initialBalance = await ethers.provider.getBalance(contractAddress);
            expect(initialBalance).to.equal(0);
            
            await rollup.connect(user1).deposit({ value: depositAmount });
            const finalBalance = await ethers.provider.getBalance(contractAddress);
            expect(finalBalance).to.equal(depositAmount);            
        });
    });
    describe ("Account Structure", function(){
        it("Should track nonces correctly", async function () {
            const depositAmount = ethers.parseEther("1.0");
            await rollup.connect(user1).deposit({ value: depositAmount });
            const account = await rollup.accounts(user1.address);
            expect(account.balance).to.equal(depositAmount);
            expect(account.nonce).to.equal(0); // Should start at 0
        });
    });
});