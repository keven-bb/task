## Test #1

### 题目
 - 统计某个 ERC20 token 下各个地址的持币情况，并且每分钟更新一次到数据库

### 思路

#### 思路1：全量更新
1. 从`token`部署的区块开始遍历
2. 筛选出 `Transfer` 事件
3. 收集事件中出现的地址（from, to）
4. 将所有地址入库
5. 遍历所有入库的地址，使用`ERC20`接口`balanceOf`查询用户余额

#### 思路2：增量更新
1. 从上次遍历到的区块开始，遍历到最近更新的区块
2. 筛选出`Transfer`事件
3. 收集事件中出现的地址（from, to）
4. 使用`ERC20`接口`balanceOf`查询用户余额
5. 更新地址余额
6. 休息1分钟，从第1步开始

#### 效率
- 并发请求事件数据速度很快，ms级别返回，响应速度取决于块中事件数量，即响应包的大小
- 并发请求地址余额则很慢，因为无法聚合请求，每次只能请求一个地址的余额，`UNI`上现有`Holder`数量约`20万`, 交互过的地址约`10`倍，即需要`200万`个请求，才能得到所有地址的余额

#### 问题与解决
1. infura 提供的节点，最多返回`10000`条数据，超出则返回异常
   
    `UNI`的交易方法每次大概消耗`40000 gas`。
   
    `mainnet`上每个块的`gas limit`为`12481675 gas`。
   
   即每个块最多能包含`200`多笔交易，为了不触发节点异常，极端条件下每个请求最多遍历`50`个块。
   
    每个块不可能全部由同一`token`的交易填满，经测试。
   
    在`UNI`交易最频繁的区块中，可以遍历`100`个块，每次最多返回不超过`8000`个块
   
2. `mysql`请求包限制(`max_allowed_packet`)
   
    为了增加每次提交请求的效率，需要尽可能提高请求包的大小，因此会先将结果收集起来，达到一定数量后再提交给`mysql`。
   
   而`mysql`的默认请求包大小限制为 `4M`,
   
   每条数据包含两个字段，分别是`1字节`的`id`和`40字节`的`address`，每次可提交的数据不超过`10万`条，因此大概可收到`2000`个区块的记录再提交。
   
3. 多请求并发
   
   请求->入库->请求->入库->...
   
   逐个请求速度太慢，且由于以上限制，每次请求的数据数量有限。
   
   利用NodeJS的异步请求，可以有效提高效率。
   
   举例如下：
   
    目标：遍历1万个块
   - 划分`任务块`，每`2000`个块为一个`任务块`，共有`5`个任务块
   - 划分`任务`，每`100`个块为一个任务，每个`任务块`可划分为`20`个任务
   - 将`20`个任务同时请求，等待`20`个任务完成
   - 将`20`个任务的结果聚合入库
   - 再遍历下一个任务块
   
4. 请求异常
    
    高频并发请求服务器会出现`SERVER_ERROR`，由于都是读请求，所以每个请求重试`3`次（可配置），全部失败的话，请抛出异常，停止任务

### Test #2

### 题目
- 统计某个地址下在`UNISWAP`上持有`UNI`的成本（USD）

### 思路
1. 遍历 `uniswap` 下的 `factory` 合约的 `PairCreated` 事件
2. 筛选出与`UNI`相关的交易对 => `UNI` 交易对集合
3. 遍历`UNI`交易对集合下相关的`Swap`事件，得到事件发生的`txHash`
4. 根据`txHash`获得`Transaction`和`TransactionReceipt`
5. 过滤掉`Transaction`中`to`值不为`uniswap router`的交易
6. 解析`Transaction`的`data`值，可得到具体调用的`swap`方法，比如`SwapExactTokensForTokens`
7. 根据`swap`方法的不同，从`Transaction`的`data`和`TransactionReceipt`的`Swap`事件参数，获得用于计算的数据
8. 判断`swap`操作是换入还是换出，计算得到本次交易中`hold`和`cost`值（换入为正值，换出为负值）
9. 聚合所有`Swap`事件的结果，将所有`hold`和`cost`合并计算可以得到该地址在`uniswap`中交易的成本

### 使用说明

环境：
- nodejs v12.14.0
- mysql v5.7
- docker

使用前置：
- 启用mysql：`docker run --name bybit-task -e MYSQL_ROOT_PASSWORD=secret -e MYSQL_DATABASE=bybit -p 3306:3306 -d --rm mysql:5.7`
- 安装依赖：`yarn`
- 迁移表结构：`yarn db-migrate up`

使用命令：
- `yarn update $token $from`
    - 说明：从`from`块开始更新`token`的交互地址
    - 参数：
      - `$token`：`token` 地址
      - `$from`：`from` 开始遍历的块
    - 例子：
        - 从第`12110391`个区块开始更新`UNI`上的地址余额
          
            `yarn update 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984 12110391`

- `yarn monitor $token`
    - 说明：增量更新，每分钟更新一次（可配置）
    - 参数：
        - `$token`: `token`地址，必须之前执行过增量更新
    - 例子：
        - 每分钟更新一次`UNI`上的地址余额
          
            `yarn monitor 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`

- `yarn cost ${client} ${token}`
    - 说明：查看某地址下指定token的持有量及成本
    - 参数：
        - `$client`: 用户地址
        - `$token`: `token`地址
    - 例子：
        - 查看地址(0x690524A31Ce96Bea837F32e43c7492f3031450a8)的持有量及成本

          `yarn cost 0x690524A31Ce96Bea837F32e43c7492f3031450a8 0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`
    
- `yarn test`
    - 说明：执行单元测试


