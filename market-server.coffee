start = (ready) ->
  async = require 'async'
  config = require './config.json'

  getLogger = (name, level) ->
    log4js = require 'log4js'
    path = require 'path'
    log4js.configure
      appenders: [
        {
          type: 'console'
        }
        {
          type: 'file'
          filename: 'logs' + path.sep + config.logger.filename
          category: name
        }
      ]

    logger = log4js.getLogger(name)
    logger.setLevel level
    return logger
  logger = getLogger 'market-server', config.logger.level

  conn = {}
  models = {}

  utilities =
    checkIsAdmin: (bankid) ->
      admins = config.admins
      if ((admins.indexOf bankid) > -1)
        return yes
      return no
    checkMoneySource: (bankid) ->
      sources = config.money_source
      if ((sources.indexOf bankid) > -1)
        return yes
      return no
    checkMoneyVoid: (bankid) ->
      voids = config.money_void
      if ((voids.indexOf bankid) > -1)
        return yes
      return no
    displayUser: (username, bankid) ->
      username + ' (#' + bankid + ')'
    isValidUsernameFormat: (username) ->
      min_length = 3
      max_length = 16
      unless /^[a-zA-Z0-9_]*$/g.test(username)
        return no
      unless username.length >= min_length and username.length <= max_length
        return no
      return yes
    isValidBankIdFormat: (bankid) ->
      min_length = 3
      max_length = 16
      unless /^[a-zA-Z0-9_]*$/g.test(bankid)
        return no
      unless bankid.length >= min_length and bankid.length <= max_length
        return no
      return yes
    isValidTaglineFormat: (tagline) ->
      min_length = 0
      max_length = 32
      unless tagline.length >= min_length and tagline.length <= max_length
        return no
      return yes
    isValidItemData: (item) ->
      if (item.name?.length > 32)
        return no
      if (item.description?.length > 140)
        return no
      if (item.instructions?.length > 140)
        return no
      return yes
    calculateTax: (amount) -> Math.ceil(parseFloat(amount) * config.tax.rate * 100) / 100
    calculateTotal: (amount) -> amount + utilities.calculateTax amount
    getShortId: ->
      shortid = require 'shortid'
      return shortid.generate()

  createDirectories = (callback) ->
    fs = require 'fs-extra'

    required_directories = [
      'user-content/item-images'    
    ]

    createDirectory = (directory, callback) ->
      fs.ensureDir directory, (err) ->
        if err?
          logger.error err
        callback()

    async.each required_directories, createDirectory, ->
      logger.info 'Created required directories'
      callback()
  connectToDatabase = (callback) ->
    mongoose = require 'mongoose'
    Schema = mongoose.Schema
    conn = mongoose.connection

    schemas = {};

    setSchemas = ->
      schemas.items = new Schema {
        id: String
        owner: String
        name: String
        price: Number
        quantity: Number
        instructions: String
        image: String
        forSale: Boolean
        quicklink: String
      }, {
        collection: 'items'
      }
      schemas.transactions = new Schema {
        from: String
        to: String
        date: Date
        amount: Number
        memo: String
        generated: Boolean
      }, {
        collection: 'transactions'
      }
      schemas.users = new Schema {
        id: String
        username: String
        username_lower: String
        bankid: String
        password: String
        balance: Number
        tagline: String
        trusted: Boolean
        taxExempt: Boolean
      }, {
        collection: 'users'
      }
      schemas.quicklinks = new Schema {
        link: String
        item: String
        payment:
          to: String
          amount: Number
          memo: String
      }, {
        collection: 'quicklinks'
      }
      schemas.receipts = new Schema {
        id: String
        proof: String
        buyer: String
        seller: String
        recipient: String
        date: Date
        item:
          name: String
          quantity: Number
          description: String
          instructions: String
      }, {
        collection: 'receipts'
      }
    setSchemas()

    setModels = ->
      models.users = mongoose.model 'user', schemas.users
      models.items = mongoose.model 'items', schemas.items
      models.transactions = mongoose.model 'transactions', schemas.transactions
      models.quicklinks = mongoose.model 'quicklinks', schemas.quicklinks
      models.receipts = mongoose.model 'receipts', schemas.receipts
    setModels()

    database_url = 'mongodb://' + config.mongodb.host + ':' + config.mongodb.port + '/' + config.mongodb.database
    logger.debug 'Connecting to database ' + database_url
  
    
    mongoose.connect database_url
    conn.once 'error', (err) ->
      logger.error 'Error connecting to database'
      callback err
    conn.once 'open', ->
      logger.info 'Successfully connected to database'
      callback()
  addUtilities = (callback) ->
    utilities.idToUser = (id, callback) ->
      models.users.findOne {
        _id: id
      }
        .exec (err, user) ->
          callback user
    utilities.nameToUser = (name, callback) ->
      if ((name.charAt 0) is '#')
        # specified by bankid
        models.users.findOne {
          bankid: name.toLowerCase().substring 1
        }
          .exec (err, user) ->
            callback user
      else
        # specified by username
        models.users.findOne {
          username_lower: name.toLowerCase()
        }
          .exec (err, user) ->
            callback user
    utilities.isUsernameAvailable = (username, callback) ->
      models.users.findOne {
        username_lower: username.toLowerCase()
      }
        .lean()
        .exec (err, user) ->
          if user?
            callback no
          else
            callback yes
    utilities.hasEnoughFunds = (user, amount) ->
      if ((user.balance / 100) >= amount)
        return yes
      return no
    utilities.sendMoney = (from, to, amount, memo, generated, callback) ->
      getFrom = (callback) ->
        utilities.nameToUser from, (user) ->
          from = user
          callback()
      getTo = (callback) ->
        utilities.nameToUser to, (user) ->
          to = user
          if to?
            callback()
          else
            callback 'Could not find recipient'
      transferMoney = (callback) ->
        unless amount > 0
          if amount is 0
            return callback()
          return callback 'Must send at least $0'
        unless ((utilities.hasEnoughFunds from, utilities.calculateTotal(amount)) or (from.taxExempt and (utilities.hasEnoughFunds from, amount)))
          return callback 'Not enough funds'

        adjustBalance = (user, change, callback) ->
          user.balance = user.balance + (change * 100)
          user.save callback
        makePayment = (from, to, amount, memo, generated, callback) ->
          async.parallel [
            (callback) ->
              adjustBalance from, -1 * amount, callback
            (callback) ->
              adjustBalance to, amount, callback
            (callback) ->
              transaction = new models.transactions {
                from: from._id
                to: to._id
                amount: amount
                memo: memo
                date: Date.now()
                generated: generated
              }
              transaction.save callback
          ], callback
        async.parallel [
          (callback) ->
            makePayment from, to, amount, memo, generated, callback
          (callback) ->
            unless from.taxExempt
              makePayment from, utilities.tax_recipient, utilities.calculateTax(amount), memo, yes, callback
            else
              callback()
        ], callback

      async.series [
        getFrom
        getTo
        transferMoney
      ], callback
    utilities.buyItem = (item, quantity, buyer, callback) ->
      convertItem = (callback) ->
        models.items.findOne {
          _id: item
          forSale: yes
          quantity: {
            $gt: 0
          }
        }
          .exec (err, data) ->
            unless data?
              return callback 'Could not find item'
            item = data
            callback()
      convertUser = (callback) ->
        utilities.idToUser buyer, (user) ->
          unless user?
            return callback 'Could not find user'
          buyer = user
          callback()
      itemOwner = null
      getItemOwner = (callback) ->
        utilities.idToUser item.owner, (user) ->
          unless user?
            return callback 'Could not find user'
          itemOwner = user
          callback()
      makePayment = (callback) ->
        utilities.sendMoney '#' + buyer.bankid, '#' + itemOwner.bankid, item.price * quantity, 'Purchase of ' + item.name, yes, (err) ->
          if err?
            callback err
          else
            callback()
      decreaseItemQuantity = (callback) ->
        item.quantity = item.quantity - quantity
        item.save callback
      addReceipt = (callback) ->
        receipt = new models.receipts {
          proof: utilities.getShortId()
          buyer: buyer._id
          seller: itemOwner._id
          date: Date.now()
          item: {
            name: item.name
            quantity: quantity
            description: if item.description? then item.description else ''
            instructions: if item.instructions? then item.instructions else ''
          }
        }
        receipt.save callback

      async.series [
        convertItem
        convertUser
        getItemOwner
        makePayment
        decreaseItemQuantity
        addReceipt
      ], callback
    utilities.addItem = (owner, item, callback) ->
      quicklink = null
      image = null
      item_document = null

      getRandomImage = ->
          prefix = '/static/img/items/'
          images = ['black', 'blue', 'cyan', 'gray', 'green', 'lightgray', 'magenta', 'pink', 'purple', 'red', 'yellow']
          suffix = '.jpg'

          random = require 'random-to'
          return prefix + images[random.from0upto(images.length)] + suffix

      generateQuicklink = (callback) ->
        quicklink_id_number_file = __dirname + '/quicklink_id_number.json'
        fs = require 'fs'
        confirmExists = (callback) ->
          fs.exists quicklink_id_number_file, (exists) ->
            unless exists
              fs.writeFile quicklink_id_number_file, 0, 'utf-8', callback
            else
              callback()
        readFile = (callback) ->
          fs.readFile quicklink_id_number_file, 'utf-8', (err, data) ->
            if err?
              return callback err

            id_generator = require './id_generator'
            id = id_generator.generate(parseInt(data), {
              min_length: 3
            })

            fs.writeFile quicklink_id_number_file, parseInt(data) + 1, 'utf-8', (err) ->
              if err?
                return callback err
              quicklink = id
              callback()

        async.series [
          confirmExists
          readFile
        ], callback
      saveItem = (callback) ->
        item_document = new models.items {
          owner: owner
          name: item.name
          description: item.description
          price: item.price
          quantity: item.quantity
          instructions: item.instructions
          image: getRandomImage()
          forSale: item.forSale
          quicklink: quicklink
        }
        item_document.save callback
      setImageURL = (callback) ->
        if ((item.image?) and (item.image isnt ''))
          utilities.saveImage item.image, item_document._id, (err) ->
            unless err?
              item_document.image = 'user-content/item-images?id=' + item_document._id
              item_document.save callback
            else
              callback err
        else
          callback()
      saveQuicklink = (callback) ->
        quicklink_document = new models.quicklinks {
          link: quicklink
          item: item_document._id
        }
        quicklink_document.save callback

      async.series [
        generateQuicklink
        saveItem
        setImageURL
        saveQuicklink
      ], callback
    utilities.saveImage = (image, name, callback) ->
      fs = require 'fs'
      unless image?.split(':')[1]?.split('/')[1]?.split(';')[0]?
        return callback 'Could not save image'
      filetype = image.split(':')[1].split('/')[0]
      extension = image.split(':')[1].split('/')[1].split(';')[0]
      if ((filetype is 'image') and (extension is 'png' or extension is 'jpeg'))
        fs.writeFile __dirname + '/user-content/item-images/' + name, image.split(',')[1], 'base64', (err) ->
          callback err
    utilities.verifyPassword = (user, password, callback) ->
      passwordHasher = require 'password-hash-and-salt'

      passwordHasher password
        .verifyAgainst user.password, (err, verified) ->
          if verified
            callback yes
          else
            callback no
    utilities.deleteUser = (user, callback) ->
      convertUser = (callback) ->
        utilities.idToUser user, (data) ->
          if data?
            user = data
            callback()
          else
            callback 'Could not find user'
      deleteItems = (callback) ->
        models.items.find {
          owner: user._id
        }
          .remove (err) ->
            callback err
      deleteUser = (callback) ->
        user.remove (err) ->
          callback err

      async.series [
        convertUser
        deleteItems
        deleteUser
      ], callback
    addTaxRecipient = (callback) ->
      models.users.findOne {
        bankid: config.tax.recipient
      }
        .exec (err, user) ->
          if user?
            utilities.tax_recipient = user
          else
            logger.warn 'Tax recipient user could not be found'
          callback()

    async.parallel [
      addTaxRecipient
    ], (err) ->
      unless err?
        logger.debug 'Utilities added'
      callback err
  startWebApp = (callback) ->
    express = require 'express'
    app = express()
    
    passwordHasher = require 'password-hash-and-salt'

    configureExpress = (callback) ->
      session = require 'express-session'
      app.use session
        secret: 'keyboard cat'
        resave: yes
        saveUninitialized: no

      passport = require 'passport'
      LocalStrategy = require 'passport-local'
        .Strategy

      passport.use new LocalStrategy {
        passReqToCallback: yes
      }, (req, username, password, done) ->
        username = username.toLowerCase()

        user = {}

        loginFail = ->
          logger.info username + ' failed to log in'
          done null, false,
            message: 'Incorrect username or password'

        getUser = (callback) ->
          utilities.nameToUser username, (found_user) ->
            if found_user?
              user = found_user
              callback()
            else
              loginFail()
              callback 'failed to log in'
        verifyPassword = (callback) ->
          passwordHasher password
            .verifyAgainst user.password, (err, verified) ->
              if err?
                logger.error err
                loginFail()
                callback(err)
              else
                if verified
                  logger.info username + ' successfully logged in'
                  done null, user
                else
                  loginFail()
                callback()

        async.series [
          getUser
          verifyPassword
        ]

      passport.serializeUser (user, done) ->
        done null, user._id

      passport.deserializeUser (id, done) ->
        models.users.findOne {
          _id: id
        }, (err, user) ->
          done err, user

      app.use passport.initialize()
      app.use passport.session()

      bodyParser = require 'body-parser'
      app.use bodyParser.json
        limit: '5mb'
      app.use bodyParser.urlencoded
        limit: '5mb'
        extended: yes

      flash = require 'connect-flash'
      app.use flash()

      fieldSelector = require './field-selector'

      session = require 'express-session'
      app.use session
        secret: 'keyboard cat'
        resave: true
        saveUninitialized: false

      app.use '/static', express.static 'webcontent'

      app.get '/user-content/item-images', (req, res) ->
        res.sendFile __dirname + '/user-content/item-images/' + req.query.id
      app.get '/api/config', (req, res) ->
        res.set 'Content-Type', 'text/json'
        res.send fieldSelector.selectWithQueryString(req.query.fields,
          title: config.page_text.title
          footer: config.page_text.footer
          captcha_site_key: config.captcha.site_key
        )
      app.post '/api/admin/edit-user', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless (utilities.checkIsAdmin req.user.bankid)
          return res.send
            success: no
            message: 'Insufficient privileges'

        utilities.idToUser req.body.user._id, (user) ->
          unless user?
            return res.send
              success: no
              message: 'Could not find user'
          if req.body.user.username?
            user.username = req.body.user.username
            user.username_lower = req.body.user.username.toLowerCase()
          if req.body.user.balance?
            user.balance = (req.body.user.balance * 100)
          if req.body.user.tagline?
            user.tagline = req.body.user.tagline
          if req.body.user.bankid?
            user.bankid = req.body.user.bankid
          if req.body.user.trusted?
            user.trusted = req.body.user.trusted
          if req.body.user.taxExempt?
            user.taxExempt = req.body.user.taxExempt

          updatePassword = (callback) ->
            if req.body.user.password?
              passwordHasher req.body.user.password
                .hash (err, hash) ->
                  unless err?
                    user.password = hash
                  callback err
            else
              callback()
          saveUser = (callback) ->
            user.save (err) ->
              callback err

          async.series [
            updatePassword
            saveUser
          ], (err) ->
            if err?
                res.send
                  success: no
                  message: err
              else
                res.send
                  success: yes
      app.get '/api/math/calculate-tax', (req, res) ->
        res.set 'Content-Type', 'text/json'
        tax = utilities.calculateTax(parseFloat(req.query.amount))
        res.send tax.toString()
      app.post '/api/signin', passport.authenticate 'local', 
        successRedirect: '/#/profile'
        failureRedirect: '/signin'
        failureFlash: yes
      app.post '/api/createaccount', (req, res) ->
        respond = (status) ->
          if status.success
            logger.info req.ip + ' created a new account'
            res.redirect '/signin'
          else
            req.flash 'message', status.message
            res.redirect '/createaccount'
        verifyCaptcha = (callback) ->
          unless config.captcha.enabled
            callback()
          else
            request = require 'request'
            recaptcha_response = req.body['g-recaptcha-response']

            request.post 'https://www.google.com/recaptcha/api/siteverify', {
              form:
                secret: config.captcha.secret_key
                response: recaptcha_response
            }, (err, res, body) ->
              body = JSON.parse body
              if body.success
                callback()
              else
                callback 'Could not verify captcha'
        createAccount = (callback) ->
          logger.trace 'Creating an account...'
          hashPassword = (callback) ->
            passwordHasher req.body['password']
              .hash (err, hash) ->
                if err?
                  callback(err)
                else
                  logger.trace 'Hashed password'
                  callback(null, hash)
          createUser = (credentials, callback) ->
            verifyCredentials = (credentials, callback) ->
              logger.trace 'Verifying credentials...'
              bankid = credentials.bankid
              username = credentials.username

              unless (utilities.isValidBankIdFormat bankid)
                return callback 'Invalid Bank ID'

              unless (utilities.isValidUsernameFormat username)
                return callback 'Invalid username'

              logger.trace 'Credentials meet requirements, now checking if available...'

              models.users.findOne {
                $or: [{
                  username_lower: username.toLowerCase()
                }, {
                  bankid: bankid
                }]
              }
                .lean()
                .count (err, count) ->
                  logger.trace 'Count obtained and is ' + count
                  if count > 0
                    logger.trace 'Username or Bank ID is taken'
                    return callback 'Username or Bank ID is taken'
                  else
                    logger.trace 'Credentials verified'
                    callback()
            saveUser = (credentials, callback) ->
              logger.trace 'Saving user to database...'
              user = new models.users {
                username: credentials.username
                username_lower: credentials.username.toLowerCase()
                password: credentials.password_hash
                bankid: credentials.bankid
                balance: 0
                tagline: config.default_tagline
                trusted: no
                taxExempt: no
              }

              user.save (err) ->
                if err?
                  logger.error 'Error saving to database: ' + err
                  return callback err
                else
                  logger.trace 'User saved to database'
                  return callback()

            verifyCredentials credentials, (err) ->
              if err?
                return respond
                  success: no
                  message: err
              else
                saveUser credentials, (err) ->
                  if err?
                    return respond
                      success: no
                      message: err
                  else
                    logger.debug 'Account created for ' + credentials.username
                    callback()

          async.waterfall [
            hashPassword
            (hash, callback) ->
              createUser {
                username: req.body.username.trim()
                password_hash: hash
                bankid: req.body.bankid.toLowerCase().trim()
              }, callback
          ], callback

        async.series [
          verifyCaptcha
          createAccount
        ], (err) ->
          if err?
            return respond
              success: no
              message: err
          return respond
            success: yes
      app.post '/api/send', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if req.user?
          utilities.sendMoney '#' + req.user.bankid, req.body.to, req.body.amount, req.body.memo, no, (err) ->
            if err?
              res.send
                success: no
                message: err
            else
              res.send
                success: yes
                message: 'Sent $' + req.body.amount + ' to ' + req.body.to
        else
          res.send
            success: no
            message: 'Not signed in'
      app.post '/api/buy', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'

        utilities.buyItem req.body.item, req.body.quantity, req.user._id, (err) ->
          if err?
            res.send
              success: no
              message: err
          else
            res.send
              success: yes
              message: 'Item purchased, view receipt on the "Receipts" page'
      app.post '/api/account/username', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if req.user?
          unless (utilities.isValidUsernameFormat req.body.username)
            return res.send
              success: no
              message: 'Invalid username'
          utilities.isUsernameAvailable req.body.username, (result) ->
            if (result or (req.body.username.toLowerCase() is req.user.username_lower))
              models.users.findOne {
                _id: req.user._id
              }
                .exec (err, user) ->
                  if user?
                    user.username = req.body.username
                    user.username_lower = req.body.username.toLowerCase()
                    user.save ->
                      res.send
                        success: yes
                  else
                    res.send
                      success: no
                      message: 'Could not find user in database'
            else
              res.send
                success: no
                message: 'Username not available'

        else
          res.send
            success: no
            message: 'Not signed in'
      app.post '/api/account/password', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if req.user?
          models.users.findOne {
            _id: req.user._id
          }
            .exec (err, user) ->
              if user?
                passwordHasher req.body.password
                  .hash (err, hash) ->
                    if err?
                      res.send
                        success: no
                        message: 'Error hashing password'
                    else
                      logger.trace 'Hashed password'
                      user.password = hash
                      user.save ->
                        res.send
                          success: yes
              else
                res.send
                  success: no
                  message: 'Could not find user in database'
        else
          res.send
            success: no
            message: 'Not signed in'
      app.post '/api/account/tagline', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'

        unless utilities.isValidTaglineFormat req.body.tagline
          return res.send
            success: no
            message: 'Invalid tagline'

        utilities.idToUser req.user._id, (user) ->
          user.tagline = req.body.tagline
          user.save ->
            return res.send
              success: yes
      app.post '/api/item/add', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'

        unless (utilities.isValidItemData req.body.item)
          return res.send
            success: no
            message: 'Invalid field(s)'

        utilities.addItem req.user._id, req.body.item, (err) ->
          if err?
            res.send
              success: no
              message: err
          else
            res.send
              success: yes
      app.post '/api/item/edit', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'

        unless (utilities.isValidItemData req.body.item)
          return res.send
            success: no
            message: 'Invalid field(s)'

        models.items.findOne {
          _id: req.body.item._id
          owner: req.user._id
        }
          .exec (err, item) ->
            unless item?
              return res.send
                success: no
                message: 'Could not find item'
            item.name = req.body.item.name
            item.description = req.body.item.description
            item.price = req.body.item.price
            item.quantity = req.body.item.quantity
            item.instructions = req.body.item.instructions
            item.forSale = req.body.item.forSale
            saveImage = (callback) ->
              if (req.body.item.image? and (req.body.item.image isnt ''))
                utilities.saveImage req.body.item.image, item._id, (err) ->
                  unless err?
                    item.image = '/user-content/item-images/?id=' + item._id
                  callback()
              else
                callback()
            saveItem = (callback) ->
              item.save ->
                res.send
                  success: yes
            async.series [
              saveImage
              saveItem
            ]
      app.post '/api/item/delete', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'

        models.items.findOne {
          _id: req.body.item._id
          owner: req.user._id
        }
          .exec (err, item) ->
            unless item?
              return res.send
                success: no
                message: 'Could not find item'
            item.remove ->
              res.send
                success: yes
      app.post '/api/delete-user', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send
            success: no
            message: 'Not signed in'
        unless ((req.body.id is req.user._id) or (utilities.checkIsAdmin req.user.bankid))
          return res.send
            success: no
            message: 'Insufficient privileges'

        utilities.deleteUser req.body.id, (err) ->
          if err?
            res.send
              success: no
              message: err
          else
            res.send
              success: yes
      app.get '/api/admin/logs', (req, res) ->
        if (req.user? and (utilities.checkIsAdmin req.user.bankid))
          unless req.query.lines?
            res.sendFile __dirname + '/logs/' + config.logger.filename
          else
            lines = []
            LineByLineReader = require 'line-by-line'
            lr = new LineByLineReader 'logs/' + config.logger.filename

            lr.on 'line', (line) ->
              lines.push line

            lr.on 'end', ->
              res.set 'Content-Type', 'text/json'
              lines.reverse()
              res.send lines.slice 0, parseInt(req.query.lines)
        else
          res.set 'Content-Type', 'text/json'
          res.send null
      app.get '/api/buy', (req, res) ->
        res.set 'Content-Type', 'text/json'

        limit = if req.query.limit? then parseInt(req.query.limit) else null
        skip = if req.query.skip? then parseInt(req.query.skip) else 0

        models.items.find {
          forSale: yes
          quantity: {
            $gt: 0
          }
        }
          .skip skip
          .limit limit
          .lean()
          .exec (err, data) ->
            if data?
              convertIdToUsername = (item, callback) ->
                utilities.idToUser item.owner, (user) ->
                  if user?
                    item.owner = user.username
                  else
                    item.owner = config.user_not_found
                  callback()

              async.each data, convertIdToUsername, ->
                res.send data
            else
              res.send []
      app.get '/api/items', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if req.user?
          limit = if req.query.limit? then parseInt(req.query.limit) else null
          skip = if req.query.skip? then parseInt(req.query.skip) else 0

          models.items.find {
            owner: req.user._id
          }
            .skip skip
            .limit limit
            .lean()
            .exec (err, data) ->
              if data?
                res.send data
              else
                res.send []
        else
          res.send null
      app.get '/api/user', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if req.user?
          taxRate = config.tax.rate
          if req.user.taxExempt
            taxRate = 0

          res.send fieldSelector.selectWithQueryString(req.query.fields,
            id: req.user._id
            username: req.user.username
            bankid: req.user.bankid
            balance: req.user.balance / 100
            tagline: req.user.tagline
            taxRate: taxRate
            isAdmin: utilities.checkIsAdmin(req.user.bankid)
            trusted: req.user.trusted
            taxExempt: req.user.taxExempt
            isMoneySource: utilities.checkMoneySource(req.user.bankid)
            isMoneyVoid: utilities.checkMoneyVoid(req.user.bankid)
          )
        else
          res.send null
      app.get '/api/users', (req, res) ->
        res.set 'Content-Type', 'text/json'
        limit = if req.query.limit? then parseInt(req.query.limit) else null
        skip = if req.query.skip? then parseInt(req.query.skip) else 0

        models.users.find {}
          .sort
            balance: -1
          .skip skip
          .limit limit
          .select '_id username bankid tagline balance trusted taxExempt'
          .lean()
          .exec (err, data) ->
            if data?
              for user in data
                user.balance = user.balance / 100
              res.send data
            else
              res.send []
      app.get '/api/receipts', (req, res) ->
        res.set 'Content-Type', 'text/json'

        unless req.user?
          return res.send null
        limit = if req.query.limit? then parseInt(req.query.limit) else null
        skip = if req.query.skip? then parseInt(req.query.skip) else 0

        models.receipts.find {
          $or: [{
            buyer: req.user._id
          }, {
            seller: req.user._id
          }]
        }
          .sort
            date: -1
          .skip skip
          .limit limit
          .lean()
          .exec (err, data) ->
            if data?
              convertIdToUsername = (receipt, callback) ->
                convertDate = (callback) ->
                  receipt.date = new Date(receipt.date).toString()
                  callback()
                convertBuyer = (callback) ->
                  utilities.idToUser receipt.buyer, (user) ->
                    if user?
                      receipt.buyer = 
                        username: user.username
                        bankid: user.bankid
                    else
                      receipt.buyer = 
                        username: config.user_not_found
                        bankid: config.user_not_found
                    callback()
                convertSeller = (callback) ->
                  utilities.idToUser receipt.seller, (user) ->
                    if user?
                      receipt.seller = 
                        username: user.username
                        bankid: user.bankid
                    else
                      receipt.seller = 
                        username: config.user_not_found
                        bankid: config.user_not_found
                    callback()
                async.parallel [
                  convertDate
                  convertBuyer
                  convertSeller
                ], callback
              async.each data, convertIdToUsername, ->
                res.send data
            else
              res.send []
      app.get '/api/transactions', (req, res) ->
        res.set 'Content-Type', 'text/json'
        
        unless req.user?
          return res.send null
        limit = if req.query.limit? then parseInt(req.query.limit) else null
        skip = if req.query.skip? then parseInt(req.query.skip) else 0

        models.transactions.find {
          $or: [{
            to: req.user._id
          }, {
            from: req.user._id
          }]
        }
          .sort
            date: -1
          .skip skip
          .limit limit
          .lean()
          .exec (err, data) ->
            if data?
              convertIdToUsername = (transaction, callback) ->
                transaction.date = new Date(transaction.date).toString()
                convertTo = (callback) ->
                  utilities.idToUser transaction.to, (user) ->
                    transaction.to = 
                      username: user.username
                      bankid: user.bankid
                    callback()
                convertFrom = (callback) ->
                  utilities.idToUser transaction.from, (user) ->
                    if user?
                      transaction.from =
                        username: user.username
                        bankid: user.bankid
                    else
                      transaction.from = 
                        username: config.user_not_found
                        bankid: config.user_not_found
                    callback()
                async.parallel [
                  convertTo
                  convertFrom
                ], callback
              async.each data, convertIdToUsername, ->
                res.send data
            else
              res.send []
      app.get '/api/quicklink', (req, res) ->
        res.set 'Content-Type', 'text/json'

        if ((req.query.link.charAt 0) is '@')
          req.query.link = req.query.link.substring 1

        getItemByQuicklink = (link, callback) ->
          models.quicklinks.findOne {
            link: req.query.link
          }
            .lean()
            .exec (err, quicklink) ->
              if quicklink?
                callback null, quicklink.item
              else
                callback 'Cannot find quicklink'
        convertToItem = (item_id, callback) ->
          models.items.findOne {
            _id: item_id
            forSale: yes
          }
            .lean()
            .exec (err, item) ->
              if item?
                callback null, item
              else
                callback 'Cannot find item'
        convertIdToUsername = (item, callback) ->
          unless item?
            return callback null, item
          utilities.idToUser item.owner, (user) ->
            if user?
              item.owner = user.username
            else
              item.owner = config.user_not_found
            callback null, item

        async.waterfall [
          (callback) ->
            getItemByQuicklink req.query.link, callback
          convertToItem
          convertIdToUsername
        ], (err, result) ->
          res.send
            item: result
      app.get '/signin', (req, res) ->
        unless req.user?
          res.render 'signin.jade',
            message: req.flash 'error'
            title: config.page_text.title
            footer: config.page_text.footer
        else
          res.redirect '/'
      app.get '/signout', (req, res) ->
        if req.user?
          logger.info utilities.displayUser(req.user.username, req.user.bankid) + ' signed out from ' + req.ip
          req.logout()
        res.redirect '/signin'
      app.get '/createaccount', (req, res) ->
        unless req.user?
          captchadisplay = if config.captcha.enabled then 'inline' else 'none'
          captchakey = if config.captcha.site_key then config.captcha.site_key else 'none'

          res.render 'createaccount.jade',
            message: req.flash 'message'
            username: req.flash 'username'
            bankid: req.flash 'bankid'
            captchadisplay: captchadisplay
            captchakey: captchakey
            title: config.page_text.title
            footer: config.page_text.footer
        else
          res.redirect '/'
      app.get '/', (req, res) ->
        if req.user?
          res.render 'index.jade',
            title: config.page_text.title
            bankid: req.user.bankid
        else
          res.redirect '/signin'
      app.get '/jade/:name', (req, res) ->
        if req.user?
          res.render req.params.name,
            title: config.page_text.title
            bankid: req.user.bankid
        else
          res.redirect '/signin'
      
      callback()
    startWebServer = (callback) ->

      logReadyMessage = (port, protocol) ->
        logger.info 'Server listening on port ' + port + ' (' + protocol + ')'

      startHttpServer = (callback) ->
        http = require 'http'
        http_server = http.createServer app
        http_server.listen config.port.http, ->
          logReadyMessage(config.port.http, 'http')
          callback()

      if config.https.enabled
        fs = require 'fs'

        https_options =
          key: fs.readFileSync config.https.key
          cert: fs.readFileSync config.https.cert
          ciphers: 'HIGH'

        startHttpsServer = (callback) ->
          https = require 'https'
          https_server = https.createServer https_options, app
          https_server.listen config.port.https, ->
            logReadyMessage(config.port.https, 'https')
            callback()

        startHttpolyglotServer = (callback) ->
          httpolyglot = require 'httpolyglot'
          httpolyglot_server = httpolyglot.createServer https_options, app
          httpolyglot_server.listen config.port.https, ->
            logReadyMessage(config.port.http, 'http')
            logReadyMessage(config.port.https, 'https')
            callback()

        if config.port.http is config.port.https
          async.parallel [
            startHttpolyglotServer
          ], callback
        else
          async.parallel [
            startHttpServer
            startHttpServer
          ], callback
      else
        async.parallel [
          startHttpServer
        ], callback

    async.series [
      configureExpress
      startWebServer
    ], callback  

  async.series [
    createDirectories
    connectToDatabase
    addUtilities
    startWebApp
  ], ready

module.exports.start = start