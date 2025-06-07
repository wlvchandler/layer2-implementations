import {expect} from "chai";
import {ethers} from "hardhat";
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
        it ("Should init with correct genesis state", async function(){});
        it ("Should have zero balances initially", async function(){});
    });

    describe("Deposits", function() {
        it ("Should reject deposits of 0 eth", async function(){});
        it ("Should handle multiple deposits from 1 user", async function(){});
        it ("Should handle deposits from multiple users", async function(){});
        it ("Should lock ETH in the contract", async function(){});
    });
    describe ("Account Structure", function(){});
});