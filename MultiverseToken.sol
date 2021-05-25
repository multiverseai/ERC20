// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/Context.sol";

/**
 * ERC20 token for the Multiverse.
 */
contract MultiverseToken is ERC20 {
    address private reserve;
    mapping (address => address) private depositors;

    /**
     * @dev Constructor that initializes the initial token supply under the care of the "reserve" account.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address reserveAddr
    ) ERC20(name, symbol) {
        reserve = reserveAddr;
        emit ReserveChanged(address(0), reserve);
        _mint(reserve, initialSupply);
    }

    modifier reserved() {
        require(_msgSender() == reserve, "operation is reserved");
        _;
    }

    /**
     * @dev Decreases the money supply.
     */
    function burn(uint256 value) reserved external {
        _burn(reserve, value);
    }

    /**
     * @dev Emitted when the `reserve` is changed from one account (`from`) to
     * another (`to`).
     */
    event ReserveChanged(address indexed from, address indexed to);

    /**
     * @dev Transfers the role of the reserve to a new account (e.g. key rotation).
     *      Note that allowances are NOT transferred.
     */
    function setReserve(address newReserve) reserved external {
        transfer(newReserve, balanceOf(reserve));
        reserve = newReserve;
        emit ReserveChanged(_msgSender(), newReserve);
    }

    /**
     * @dev Gets the current reserve.
     */
    function getReserve() external view returns (address) {
        return reserve;
    }

    /** @dev Emitted when a Deposit is made to a `depository` destined for a depository-managed `account`. */
    event Deposit(address indexed from, address indexed depository, uint256 value, address indexed account);

    /**
     * @dev Transfers `value` tokens from the `msg.sender` to the `depository`, destined for
     * the specified `account`. This emits an ERC20 `Transfer()` event to the depository, and a corresponding
     * `Deposit()` event that indicates the `account` address, to be managed off-chain by the depository.
     */
    function deposit(address depository, uint256 value, address account) external returns (bool) {
      return _deposit(_msgSender(), depository, value, account);
    }

    /**
     * @dev A _deposit() is essentially a transfer to a `depository` that emits a special `Deposit()`
     * event reporting the destination `account`, which is managed off-chain by the depository.
     */
    function _deposit(address from, address depository, uint256 value, address account) internal returns (bool) {
      emit Deposit(from, depository, value, account);
      _transfer(from, depository, value);
      return true;
    }

    /**
     * @dev Emitted when a Depositor is created.
     */
    event DepositorCreated(address depositor, address indexed depository);

    /**
     * @dev Deploys a new Depositor ERC20 contract that deposits to a specified `depository`
     * in response to the `transfer(account, value)` operation, essentially converting it
     * to `deposit(despository, value, account)` on behalf of the sender. Only the reserve
     * can call this method.
     */
    function createDepositor(string memory name, address depository) reserved external returns (address) {
        require(depository != address(0), "cannot deposit to zero address");
        Depositor depositor = new Depositor(this, name);

        address depositorAddress = address(depositor);
        depositors[depositorAddress] = depository;

        emit DepositorCreated(depositorAddress, depository);
        return depositorAddress;
    }

    /** @dev Returns the depository for the specified Depositor address. */
    function getDepository(address depositor) external view returns (address) {
        return depositors[depositor];
    }

    /**
     * @dev Transfers `value` tokens from the `from` address to the calling Depositor's depository,
     * emiting a `Deposit()` event that indicates the destination `account`. Only Depositors created
     * via `createDepositor()` can call this method.
     */
    function depositFrom(address from, address account, uint256 value) external returns (bool) {
      address depository = depositors[_msgSender()];
      require(depository != address(0), "depositFrom() can only be called by Depositors created by this contract");

      return _deposit(from, depository, value, account);
    }
}

/**
 * Depositor is a ERC20 proxy for the MultiverseToken whose only supported transaction is
 * `transfer()`, which is converted to a `MultiverseToken.depositFrom()` call with the
 * `depository` associated via `MultiverseToken.createDepositor()`.
 */
contract Depositor is Context, IERC20, IERC20Metadata {
    MultiverseToken private _multiverseToken;
    string private _name;

    constructor(MultiverseToken multiverseToken_, string memory name_) {
        _multiverseToken = multiverseToken_;
        _name = name_;
    }

    /**
     * @dev The Despositor fulfills the ERC20 `transfer` operation by transferring
     * the specified `value` from the `msg.sender` to the Depositor's `depository`,
     * destined for specified `account`.
     */
    function transfer(address account, uint256 value) public virtual override returns (bool) {
        return _multiverseToken.depositFrom(_msgSender(), account, value);
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _multiverseToken.symbol();
    }

    function decimals() public view virtual override returns (uint8) {
        return _multiverseToken.decimals();
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _multiverseToken.totalSupply();
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return _multiverseToken.balanceOf(account);
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _multiverseToken.allowance(owner, spender);
    }

    function approve(address, uint256) public virtual override returns (bool) {
        require(false, "approve() is not supported. call the MultiverseToken directly");
        return false;
    }

    function transferFrom(address, address, uint256) public virtual override returns (bool) {
        require(false, "transferFrom() is not supported. call the MultiverseToken directly");
        return false;
    }
}
