async = require 'async'
config = require './config/manager-config.json'

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
logger = getLogger 'service-manager', config.logger.level

cluster = require 'cluster'

if cluster.isMaster
	cluster.fork()
	cluster.on 'exit', (worker, code, signal) ->
		setTimeout (-> cluster.fork()), 1000
else
	domain = require 'domain'
	d = domain.create()
	d.on 'error', (err) ->
		logger = getLogger 'service-manager', config.logger.level
		logger.fatal err
		cluster.worker.disconnect()
	d.run ->
		startTime = Date.now()

		server = null

		setOnDeath = (callback) ->
			on_death = require 'death'
			on_death (signal, err) ->
				logger.info 'Exited on ' + new Date(Date.now())
			callback()
		startServer = (callback) ->
			logger.info 'Starting server...'
			if config['run server']
				server = require './modules/market-server'
				server.start callback
			else
				callback()
		stopServer = (callback) ->
			logger.info 'Stopping server...'
			server.stop (err) ->
				delete require.cache[require.resolve './modules/market-server']
				server = null
				logger.info 'Server stopped'
				callback()
		startServices = (callback) ->
			logger.info 'Starting services...'
			async.series [
				startServer
			], callback
		setStdin = (callback) ->
			processCommand = (chunk) ->
				unless chunk?
					return null

				chunk = chunk.substring 0, chunk.length - 1

				pieces = chunk.split ' '
				command = pieces[0]
				args = pieces[1..]

				switch command
					when 'restart', 'r'
						logger.info 'Restarting server...'
						stopServer (err) ->
							unless err?
								startServer()
							else
								logger.error err
					when 'stop'
						stopServer (err) ->
							if err?
								logger.error err
					when 'start'
						startServer()
					when 'status'
						if server?
							logger.info 'Server is running'
						else
							logger.info 'Server is not running'
					when 'help'
						logger.info 'Commands:'
						logger.info ' stop - stops server'
						logger.info ' start - starts server'
						logger.info ' restart - restarts server'
						logger.info ' status - outputs server status'
						logger.info ' help - displays this text'
					else
						logger.info 'Unknown command: ' + command

			process.stdin.setEncoding 'utf8'
			process.stdin.on 'readable', ->
				processCommand process.stdin.read()

			callback()
		done = (err) ->
			unless err?
				getElapsedTime = ->
					(Date.now() - startTime) / 1000
				logger.info 'Service startup done! (' + getElapsedTime() + ' sec.)'
			else
				logger.error err
				cluster.worker.disconnect()

		async.series [
			setOnDeath
			setStdin
			startServices
		], done