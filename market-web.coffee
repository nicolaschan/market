async = require 'async'

start = (ready) ->
	config = require './web-config.json'

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

	server_config = {}

	loadServerConfig = (callback) ->
		request = require 'request'
		request.get config.market_server_host, (err, res, body) ->
			if err?
				logger.error err
				callback err
			else
				server_config = JSON.parse body
				callback()

	startWebApp = (callback) ->
		express = require 'express'
		app = express()

		configureExpress = (callback) ->
			bodyParser = require 'body-parser'

			app.use bodyParser.json
				limit: '5mb'
			app.use bodyParser.json
				limit: '5mb'
				extended: true

			session = require 'express-session'
			app.use session
				secret: 'keyboard cat'
				resave: true
				saveUninitialized: false

			flash = require 'connect-flash'
			app.use flash()

			app.use '/static', express.static 'webcontent'

			app.get '/signin', (req, res) ->
				unless req.user?
					res.render 'signin.jade',
						message: req.flash 'error'
						title: config.market_title
						footer: config.market_footer
				else
					res.redirect '/'
			app.get '/createaccount', (req, res) ->
				unless req.user?
					captchadisplay = if config.captcha_site_key then 'inline' else 'none'
					captchakey = if config.captcha_site_key then config.captcha_site_key else 'none'

					res.render 'createaccount.jade',
						message: req.flash 'message'
						username: req.flash 'username'
						bankid: req.flash 'bankid'
						captchadisplay: captchadisplay
						captchakey: captchakey
						title: config.market_title
						footer: config.market_footer
				else
					res.redirect '/'
			app.get '/', (req, res) ->
				if req.user?
					res.render 'index.jade'
				else
					res.redirect '/signin'
				res.render 'index.jade'
			app.get '/jade/:name', (req, res) ->
				if req.user?
					res.render req.params.name,
						title: server_config.market_title
						bankid: req.user.bankid
				else
					res.redirect '/signin'
			callback()
		startWebServer = (callback) ->

			startHttpServer = (callback) ->
				http = require 'http'
				http_server = http.createServer app
				http_server.listen config.port.http, ->
					logger.debug 'App listening on port ' + config.port.https + ' (http)'
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
						logger.debug 'App listening on port ' + config.port.https + ' (https)'
						callback()

				startHttpolyglotServer = (callback) ->
					httpolyglot = require 'httpolyglot'
					httpolyglot_server = httpolyglot.createServer https_options, app
					httpolyglot_server.listen config.port.https, ->
						logger.debug 'App listening on port ' + config.port.https + ' (http and https)'
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
			->
				logger.info 'Web server ready'
		], callback

	async.series [
		loadServerConfig
		startWebApp
	], ready

module.exports.start = start

start()