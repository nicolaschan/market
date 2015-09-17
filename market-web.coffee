start = (ready) ->
	config = require './config.json'

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

	server_properties = {}

	loadServerConfig = ->
		request = require 'request'
		request.get config.hostname, (err, res, body) ->
			if not err?
				JSON.parse body


	express = require 'express'
	app = express()

	bodyParser = require 'body-parser'

	app.use bodyParser.json
		limit: '5mb'
	app.use bodyParser.json
		limit: '5mb'
		extended: true

	flash = require 'connect-flash'
	app.use flash()

	app.use '/static', express.static 'webcontent'

	app.get '/signin', (req, res) ->
		if not signed_in
			res.render 'signin.jade',
				message: req.flash 'error'
		else
			res.redirect '/'
	app.get '/', (req, res) ->
		if signed_in
			res.render 'index.jade'
		else
			res.redirect '/signin'
		res.render 'index.jade'
	app.get '/jade/:name', (req, res) ->
		if signed_in
			res.render req.params.name,
				title: market_title
				bankid: req.user.bankid
		else
			res.redirect '/signin'

module.exports.start = start