# Minecraft Market
Online market with virtual currency designed for use as a Minecraft server economy
### Keep in mind this project is still in development. There will be bugs and missing features. There may also be security issues.

# How to install
## Requirements
- node.js
- mongodb

## Installation
1) Create a Mongo Database with the following collections
- items
- quicklinks
- shops
- transactions
- users

2) Clone the repository, navigate to it
```sh
$ git clone https://github.com/nicolaschan/market.git
$ cd market
```

3) Edit the config.json to fit your needs, the most important thing is the database URL

4) Start the app
```sh
$ node index.js
```

