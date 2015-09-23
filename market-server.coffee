async = require 'async'

start = (ready) ->
	config = require './server-config.json'

	getLogger = (name, level) ->
		log4js = require 'log4js'
		log4js.configure
			appenders: [
				{
					type: 'console'
				}
				{
					type: 'file'
					filename: 'logs/' + config.logger.filename
					category: name
				}
			]

		logger = log4js.getLogger(name)
		logger.setLevel level
		return logger
	logger = getLogger 'market-web', config.logger.level

	conn = {}
	models = {}

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

		async.each required_directories, createDirectory, callback
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
				instructions: Number
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
				items:
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
		mongoose.connect database_url
		conn.once 'error', (err) ->
			callback err
			throw err
		conn.once 'open', callback
	startWebApp = (callback) ->
		express = require 'express'
		app = express()
		
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
				if username.substring 0, 1 is '#'
					models.users.findOne {
						bankid: username.substring 1
					}, (err, found_user) ->
						if err?
							logger.error err
							callback(err)
						else
							user = found_user
							callback()
				else
					models.users.findOne {
						username_lower
					}, (err, found_user) ->
						if err?
							logger.error err
							loginFail()
							callback(err)
						else
							if found_user
								user = found_user
								callback()
							else
								loginFail()
								callback('failed to log in')
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
								callback()
							else
								loginFail()
								callback('failed to login')

			async.series [
				getUser
				verifyPassword
			]

		passport.serializeUser (user, done) ->
			done null, user.id

		passport.deserializeUser (id, done) ->
			models.users.findOne {
				id: id
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

		app.post '/api/signin', passport.authenticate 'local', 
			successRedirect: '/#/profile'
			failureRedirect: '/signin'
			failureFlash: no

		app.post '/api/createaccount', (req, res) ->
			respond = (status) ->
				if status.success
					logger.info req.ip + ' created a new account'
					res.send
						success: yes
				else
					res.send
						success: no
						message: status.message
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
							respond
								success: no
								message: 'Could not verify captcha'
							callback 'Could not verify captcha'
			createAccount = (callback) ->
				hashed_password = ''

				hashPassword = (callback) ->
					passwordHasher req.body['password']
						.hash (err, hash) ->
							if err?
								callback(err)
							else
								hashed_password = hash
								callback()
				addAccount = (callback) ->


				async.series [
					hashPassword
				], callback

			async.series [
				verifyCaptcha
				createAccount
			]

	async.series [
		createDirectories
		connectToDatabase
		startWebApp
	], ready

module.exports.start = start

start()