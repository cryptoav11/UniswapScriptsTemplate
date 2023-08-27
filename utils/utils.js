const {Trade: RouterTrade, MixedRouteTrade} = require("@uniswap/router-sdk");
const {Trade: V3Trade, Pool, nearestUsableTick, TickMath, TICK_SPACINGS} = require("@uniswap/v3-sdk");
const { computePairAddress, Pair, Trade: V2Trade, Route: RouteV2 } = require('@uniswap/v2-sdk')
const hardhat = require("hardhat");
const JSBI = require("jsbi");
const IUniswapV3Pool = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json')
const {Percent, Ether, Token, CurrencyAmount} = require("@uniswap/sdk-core");
const erc20Abi = require("../abis/erc20.json");

const ETHER = Ether.onChain(1)
const WETH = new Token(1, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'WETH', 'Wrapped Ether')
const USDC = new Token(1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6, 'USDC', 'USD Coin')
const UNI = new Token(1, '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 18, 'UNI', 'Uni Token')

const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'

const V2_ABI = [
    {
        constant: true,
        inputs: [],
        name: 'getReserves',
        outputs: [
            {internalType: 'uint112', name: 'reserve0', type: 'uint112'},
            {internalType: 'uint112', name: 'reserve1', type: 'uint112'},
            {internalType: 'uint32', name: 'blockTimestampLast', type: 'uint32'},
        ],
        payable: false,
        stateMutability: 'view',
        type: 'function',
    },
]

const getPair = async (tokenA, tokenB, provider) => {
    const pairAddress = computePairAddress({ factoryAddress: V2_FACTORY, tokenA, tokenB })
    const contract = new hardhat.ethers.Contract(pairAddress, V2_ABI, provider)
    const { reserve0, reserve1 } = await contract.getReserves()
    const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    return new Pair(CurrencyAmount.fromRawAmount(token0, reserve0), CurrencyAmount.fromRawAmount(token1, reserve1))
}

const buildTrade = (trades) => {
    return new RouterTrade({
        v2Routes: trades
            .filter((trade) => trade instanceof V2Trade)
            .map((trade) => ({
                routev2: trade.route,
                inputAmount: trade.inputAmount,
                outputAmount: trade.outputAmount,
            })),
        v3Routes: trades
            .filter((trade) => trade instanceof V3Trade)
            .map((trade) => ({
                routev3: trade.route,
                inputAmount: trade.inputAmount,
                outputAmount: trade.outputAmount,
            })),
        mixedRoutes: trades
            .filter((trade) => trade instanceof MixedRouteTrade)
            .map((trade) => ({
                mixedRoute: trade.route,
                inputAmount: trade.inputAmount,
                outputAmount: trade.outputAmount,
            })),
        tradeType: trades[0].tradeType,
    })
}

const getPool = async (tokenA, tokenB, feeAmount, provider) => {
    const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    const poolAddress = Pool.getAddress(token0, token1, feeAmount)
    const contract = new hardhat.ethers.Contract(poolAddress, IUniswapV3Pool.abi, provider)
    let liquidity = await contract.liquidity()
    let { sqrtPriceX96, tick } = await contract.slot0()
    liquidity = JSBI.BigInt(liquidity.toString())
    sqrtPriceX96 = JSBI.BigInt(sqrtPriceX96.toString())
    return new Pool(token0, token1, feeAmount, sqrtPriceX96, liquidity, tick, [
        {
            index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
            liquidityNet: liquidity,
            liquidityGross: liquidity,
        },
        {
            index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
            liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt('-1')),
            liquidityGross: liquidity,
        },
    ])
}

const swapOptions = (options, recipient) => {
    return Object.assign(
        {
            slippageTolerance: new Percent(5, 100),
            recipient: recipient,
        },
        options
    )
}

const logBalances = async (recipient, provider) => {
    const wethContract = new hardhat.ethers.Contract(WETH.address, erc20Abi, provider)
    const usdcContract = new hardhat.ethers.Contract(USDC.address, erc20Abi, provider)
    const uniContract = new hardhat.ethers.Contract(UNI.address, erc20Abi, provider)

    const ethBalance = await provider.getBalance(recipient)
    const wethBalance = await wethContract.balanceOf(recipient)
    const usdcBalance = await usdcContract.balanceOf(recipient)
    const uniBalance = await uniContract.balanceOf(recipient)

    console.log('ethBalance', hardhat.ethers.utils.formatUnits(ethBalance, 18))
    console.log('wethBalance', hardhat.ethers.utils.formatUnits(wethBalance, 18))
    console.log('usdcBalance', hardhat.ethers.utils.formatUnits(usdcBalance, 6))
    console.log('uniBalance', hardhat.ethers.utils.formatUnits(uniBalance, 18))
}

module.exports = { buildTrade, getPool, swapOptions, logBalances, getPair }
