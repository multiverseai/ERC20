import '@nomiclabs/hardhat-waffle' // Installs the plugin for Waffle-based tests

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: '0.8.4',
  settings: {
    optimizer: {
      enabled: true,
      runs: 1000,
    },
  },
}
