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

		setOnDeath = (callback) ->
			on_death = require 'death'
			on_death (signal, err) ->
				logger.info 'Exited on ' + new Date(Date.now())
				process.exit()
			callback()
		startServer = (callback) ->
			if config['run server']
				server = require './modules/market-server'
				server.start callback
			else
				callback()
		startServices = (callback) ->
			logger.info 'Starting services...'
			async.series [
				startServer
			], callback
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
			startServices
		], done