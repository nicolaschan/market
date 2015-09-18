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

		passport = require 'passport'
		BasicStrategy = require 'passport-http'
			.BasicStrategy

		passport.use new BasicStrategy (username, password, done) ->
			if username.valueOf() is 'username' and password.valueOf() is 'password'
				return done null, true
			else
				return done null, false

	async.series [
		createDirectories
		connectToDatabase
		startWebApp
	], ready

module.exports.start = start

start()