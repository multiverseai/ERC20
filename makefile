all: build

build: contracts/MultiverseToken.sol
	npx hardhat compile

test: build
	npx hardhat test
