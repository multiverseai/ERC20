import { expect, use } from 'chai'
import { waffleChai } from '@ethereum-waffle/chai'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Contract, errors } from 'ethers'

// Expectations for ethers types (e.g. BigNumber)
use(waffleChai)

const initialSupply = 100000000000

describe('MultiverseToken', function () {
  let reserve: SignerWithAddress
  let reserve2: SignerWithAddress
  let signer1: SignerWithAddress
  let signer2: SignerWithAddress
  let reserveAddr: string
  let reserveAddr2: string
  let addr1: string
  let addr2: string
  let depository: string
  let token: Contract

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    ;[reserve, reserve2, signer1, signer2] = signers
    ;[reserveAddr, reserveAddr2, addr1, addr2, depository] = await Promise.all(
      signers.map((signer) => signer.getAddress())
    )

    const MultiverseToken = await ethers.getContractFactory('MultiverseToken')
    token = await MultiverseToken.deploy(
      'Hadron',
      'AI',
      initialSupply,
      reserveAddr
    )
    await token.deployed()
  })

  it('has expected initial state', async () => {
    expect(await token.name()).to.equal('Hadron')
    expect(await token.symbol()).to.equal('AI')
    expect(await token.decimals()).to.equal(18)
    expect(await token.totalSupply()).to.equal(initialSupply)
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply)
    expect(await token.balanceOf(addr1)).to.equal(0)
  })

  it('can transfer funds', async () => {
    await expect(() =>
      token.connect(reserve).transfer(addr1, 123)
    ).to.changeTokenBalances(token, [reserve, signer1], [-123, 123])
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 123)
    expect(await token.balanceOf(addr1)).to.equal(123)

    await expect(() =>
      token.connect(signer1).transfer(addr2, 120)
    ).to.changeTokenBalances(token, [signer1, signer2], [-120, 120])
    expect(await token.balanceOf(addr1)).to.equal(3)
    expect(await token.balanceOf(addr2)).to.equal(120)
  })

  it('disallows transfers to 0', async () => {
    await expect(() =>
      token.connect(reserve).transfer(addr1, 123)
    ).to.changeTokenBalances(token, [reserve, signer1], [-123, 123])
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 123)
    expect(await token.balanceOf(addr1)).to.equal(123)

    let error: any
    try {
      await token.connect(signer1).transfer(ethers.constants.AddressZero, 123)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('transfer to the zero address')
    expect(await token.balanceOf(addr1)).to.equal(123)
  })

  it('can reset reserve', async () => {
    const events = await token.queryFilter(token.filters.ReserveChanged())
    expect(events).to.have.length(1)
    expect(events[0].eventSignature).to.eql('ReserveChanged(address,address)')
    expect(events[0].args[0]).to.eql(ethers.constants.AddressZero)
    expect(events[0].args[1]).to.eql(reserveAddr)

    expect(await token.getReserve()).to.eql(reserveAddr)

    await expect(() =>
      token.connect(reserve).transfer(addr1, 123)
    ).to.changeTokenBalances(token, [reserve, signer1], [-123, 123])
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 123)
    expect(await token.balanceOf(addr1)).to.equal(123)

    await expect(token.connect(reserve).setReserve(reserveAddr2))
      .to.emit(token, 'ReserveChanged')
      .withArgs(reserveAddr, reserveAddr2)
    expect(await token.getReserve()).to.eql(reserveAddr2)
    expect(await token.balanceOf(reserveAddr)).to.equal(0)
    expect(await token.balanceOf(reserveAddr2)).to.equal(initialSupply - 123)
    expect(await token.balanceOf(addr1)).to.equal(123)

    // Original reserve can no longer burn
    let error: any
    try {
      await token.connect(reserve).burn(123)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('operation is reserved')

    // Also, the reserve can no longer set the reserve
    error = null
    try {
      await expect(token.connect(reserve).setReserve(reserveAddr)).to.not.emit(
        token,
        'ReserveChanged'
      )
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('operation is reserved')
    expect(await token.totalSupply()).to.equal(initialSupply)

    // reserve2 can burn
    await token.connect(reserve2).burn(456)
    expect(await token.totalSupply()).to.equal(initialSupply - 456)
    expect(await token.balanceOf(addr1)).to.equal(123)
    expect(await token.balanceOf(reserveAddr)).to.equal(0)
    expect(await token.balanceOf(reserveAddr2)).to.equal(
      initialSupply - 123 - 456
    )
  })

  it('can delegate transfers', async () => {
    await token.connect(reserve).approve(addr1, 123)
    expect(await token.allowance(reserveAddr, addr1)).to.equal(123)
    await token.connect(signer1).transferFrom(reserveAddr, addr2, 120)

    // signer1 is only approved for 3 more. Subsequent request should fail.
    let error: any
    try {
      await token.connect(signer1).transferFrom(reserveAddr, addr2, 4)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('transfer amount exceeds allowance')

    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 120)
    expect(await token.balanceOf(addr1)).to.equal(0)
    expect(await token.balanceOf(addr2)).to.equal(120)
    expect(await token.allowance(reserveAddr, addr1)).to.equal(3)
  })

  it('cannot transfer with insufficient funds', async () => {
    let error: any
    try {
      await token.connect(signer1).transfer(addr2, 123)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('transfer amount exceeds balance')
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply)
    expect(await token.balanceOf(addr1)).to.equal(0)
    expect(await token.balanceOf(addr2)).to.equal(0)
  })

  it('only allows reserve to burn', async () => {
    let error: any
    try {
      await token.connect(signer1).burn(789)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('operation is reserved')
    expect(await token.totalSupply()).to.equal(initialSupply)

    await token.connect(reserve).burn(456)
    expect(await token.totalSupply()).to.equal(initialSupply - 456)
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 456)
  })

  it('avoids underflow', async () => {
    let error: any
    try {
      await token.connect(reserve).burn(2 ** 256)
    } catch (e) {
      error = e
    }
    expect(error?.code).to.eql(errors.NUMERIC_FAULT)
    expect(await token.totalSupply()).to.equal(initialSupply)
  })

  it('does not accept ETH', async () => {
    // Sending to a normal address works.
    await signer1.sendTransaction({
      to: addr2,
      value: 1,
    })

    // Sending to the Contract results in a rejection
    let error: any
    try {
      await signer1.sendTransaction({
        to: token.address,
        value: 1,
      })
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('Transaction reverted')
    expect(error?.message).to.contain('no fallback nor receive function')
  })

  it('manual deposits', async () => {
    await expect(token.connect(reserve).deposit(depository, 1234, addr1))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAddr, depository, 1234)
      .and.to.emit(token, 'Deposit')
      .withArgs(reserveAddr, depository, 1234, addr1)

    await expect(token.connect(reserve).deposit(depository, 6543, addr2))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAddr, depository, 6543)
      .and.to.emit(token, 'Deposit')
      .withArgs(reserveAddr, depository, 6543, addr2)

    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 7777)
    expect(await token.balanceOf(addr1)).to.equal(0)
    expect(await token.balanceOf(addr2)).to.equal(0)
    expect(await token.balanceOf(depository)).to.equal(7777)
  })

  it('Depositor transfers', async () => {
    const response = await token
      .connect(reserve)
      .createDepositor('Hadron Multiverse Depositor', depository)
    const receipt = await response.wait()
    expect(receipt.events).to.have.length(1)
    expect(receipt.events[0].event).to.eql('DepositorCreated')
    expect(receipt.events[0].args).to.have.length(2)
    expect(receipt.events[0].args[1]).to.eql(depository)

    const depositorAddr = receipt.events[0].args[0]
    expect(await token.getDepository(depositorAddr)).to.eql(depository)

    const depositor = (await ethers.getContractFactory('Depositor')).attach(
      depositorAddr
    )

    await expect(depositor.connect(reserve).transfer(addr2, 1234))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAddr, depository, 1234)
      .to.emit(token, 'Deposit')
      .withArgs(reserveAddr, depository, 1234, addr2)

    await expect(depositor.connect(reserve).transfer(addr1, 6543))
      .to.emit(token, 'Transfer')
      .withArgs(reserveAddr, depository, 6543)
      .to.emit(token, 'Deposit')
      .withArgs(reserveAddr, depository, 6543, addr1)

    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply - 7777)
    expect(await token.balanceOf(addr1)).to.equal(0)
    expect(await token.balanceOf(addr2)).to.equal(0)
    expect(await token.balanceOf(depository)).to.equal(7777)

    // Verify Depositor's ERC20 methods.
    expect(await depositor.balanceOf(reserveAddr)).to.equal(
      initialSupply - 7777
    )
    expect(await depositor.balanceOf(addr1)).to.equal(0)
    expect(await depositor.balanceOf(addr2)).to.equal(0)
    expect(await depositor.balanceOf(depository)).to.equal(7777)
    expect(await depositor.name()).to.eql('Hadron Multiverse Depositor')
    expect(await depositor.symbol()).to.eql('AI')
    expect(await depositor.decimals()).to.eql(18)
    expect(await depositor.totalSupply()).to.equal(initialSupply)

    // Verify unsupported methods

    let error: any
    try {
      await depositor.connect(reserve).approve(addr1, 1234)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('approve() is not supported')

    error = undefined
    try {
      await depositor.connect(reserve).transferFrom(addr1, addr2, 1234)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('transferFrom() is not supported')
  })

  it('disallows Depositor to zero address', async () => {
    let error: any
    try {
      await token
        .connect(reserve)
        .createDepositor(
          'Hadron Multiverse Depositor',
          ethers.constants.AddressZero
        )
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('cannot deposit to zero address')
  })

  it('disallows createDepositor from non-reserve', async () => {
    let error: any
    try {
      await token
        .connect(signer1)
        .createDepositor('Hadron Multiverse Depositor', depository)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain('operation is reserved')
  })

  it('disallows depositFrom() from non-Depositors', async () => {
    let error: any
    try {
      await token.connect(reserve).depositFrom(reserveAddr, addr1, 1234)
    } catch (e) {
      error = e
    }
    expect(error?.message).to.contain(
      'depositFrom() can only be called by Depositors created by this contract'
    )
    expect(await token.balanceOf(reserveAddr)).to.equal(initialSupply)
    expect(await token.balanceOf(addr1)).to.equal(0)
    expect(await token.balanceOf(addr2)).to.equal(0)
    expect(await token.balanceOf(depository)).to.equal(0)
  })
})
